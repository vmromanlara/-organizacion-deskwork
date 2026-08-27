-- DeskWork Ticketing Core / Fase Block 1.
-- TKT-001 — Schema de soporte de tickets.
-- Esta migration no define políticas RLS (commit 4) ni autoriza privilegios
-- a nivel de tabla (commit 4). Habilita RLS en cada tabla de modo defensivo
-- para que ningún acceso quede sin gating aunque la migration se ejecute sola.

-- Enums del dominio de tickets.
do $$ begin
  create type public.ticket_priority as enum ('P1', 'P2', 'P3', 'P4');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ticket_state as enum (
    'ABIERTO',
    'EN_PROCESO',
    'ESPERANDO_USUARIO',
    'ESCALADO',
    'RESUELTO',
    'CERRADO'
  );
exception when duplicate_object then null;
end $$;

-- Catálogo de categorías (los slugs son normalizados; el tenant define su propio conjunto).
create table if not exists public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(label) between 2 and 80),
  description text,
  is_active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists ticket_categories_tenant_active_idx
  on public.ticket_categories (tenant_id, is_active);
create index if not exists ticket_categories_tenant_order_idx
  on public.ticket_categories (tenant_id, display_order);

-- Tabla principal de tickets.
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete restrict,
  category_id uuid not null references public.ticket_categories(id) on delete restrict,
  priority public.ticket_priority not null default 'P3',
  state public.ticket_state not null default 'ABIERTO',
  title text not null check (char_length(title) between 5 and 200),
  description text not null check (char_length(description) between 10 and 5000),
  assigned_to uuid references auth.users(id) on delete set null,
  area_id uuid,
  team_id uuid,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  sla_status text not null default 'on_track'
    check (sla_status in ('on_track', 'at_risk', 'overdue', 'met')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Coherencia temporal: las marcas siguen el flujo FSM.
  check (first_response_at is null or first_response_at >= created_at),
  check (resolved_at is null or first_response_at is null or resolved_at >= first_response_at),
  check (closed_at is null or resolved_at is null or closed_at >= resolved_at),
  -- Coherencia estado/timestamps.
  check (state in ('RESUELTO', 'CERRADO') or resolved_at is null),
  check (state = 'CERRADO' or closed_at is null),
  -- FKs compuestas a Foundation (tenant_id + area_id/team_id).
  foreign key (tenant_id, area_id) references public.areas(tenant_id, id) on delete set null,
  foreign key (tenant_id, team_id) references public.teams(tenant_id, id) on delete set null
);

create index if not exists tickets_tenant_state_created_idx
  on public.tickets (tenant_id, state, created_at desc);
create index if not exists tickets_tenant_priority_state_idx
  on public.tickets (tenant_id, priority, state);
create index if not exists tickets_tenant_assignee_state_idx
  on public.tickets (tenant_id, assigned_to, state);
create index if not exists tickets_requester_state_idx
  on public.tickets (requester_id, state);
create index if not exists tickets_tenant_sla_status_idx
  on public.tickets (tenant_id, sla_status);
create index if not exists tickets_fulltext_idx
  on public.tickets using gin (to_tsvector('spanish', description));
create index if not exists tickets_created_at_idx
  on public.tickets (created_at);

-- Adjuntos: la metadata existe desde Bloque 1; el binario físico se materializa en TKT-014.
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_path text, -- NULL hasta TKT-014 (sin bucket físico).
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 200),
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text, -- NULL hasta TKT-014; en esa fase se vuelve NOT NULL.
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_idx
  on public.ticket_attachments (ticket_id);
create index if not exists ticket_attachments_tenant_created_idx
  on public.ticket_attachments (tenant_id, created_at);

-- Comentarios: is_internal sólo lo ven agentes/supervisores/lead/director del tenant.
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 10000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_comments_ticket_created_idx
  on public.ticket_comments (ticket_id, created_at);

-- Eventos: append-only. La inmutabilidad se enforce en RLS migration (sin INSERT/UPDATE/DELETE).
create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'created', 'state_changed', 'assigned', 'unassigned',
    'commented', 'attachment_added', 'priority_changed', 'sla_breached'
  )),
  from_state public.ticket_state,
  to_state public.ticket_state,
  from_priority public.ticket_priority,
  to_priority public.ticket_priority,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_events_ticket_created_idx
  on public.ticket_events (ticket_id, created_at);
create index if not exists ticket_events_tenant_type_created_idx
  on public.ticket_events (tenant_id, event_type, created_at);

-- Asignaciones: una fila por evento de asignación; solo una activa por ticket (unassigned_at IS NULL).
create table if not exists public.ticket_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

create index if not exists ticket_assignments_ticket_assigned_idx
  on public.ticket_assignments (ticket_id, assigned_at desc);
create index if not exists ticket_assignments_assignee_assigned_idx
  on public.ticket_assignments (assignee_id, assigned_at desc);
-- Solo una asignación activa por ticket (unassigned_at IS NULL).
create unique index if not exists ticket_assignments_one_active_per_ticket_idx
  on public.ticket_assignments (ticket_id)
  where unassigned_at is null;

-- Trigger updated_at: existe en Foundation para tablas previas; replicamos el patrón local
-- sólo donde la tabla no comparte una función global. Aquí no hay helper global, así que
-- usamos un trigger ligero por tabla.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ticket_categories_touch_updated_at on public.ticket_categories;
create trigger ticket_categories_touch_updated_at
  before update on public.ticket_categories
  for each row execute function public.touch_updated_at();

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

drop trigger if exists ticket_comments_touch_updated_at on public.ticket_comments;
create trigger ticket_comments_touch_updated_at
  before update on public.ticket_comments
  for each row execute function public.touch_updated_at();

-- Habilitación defensiva de RLS: ningún acceso mientras no haya políticas (commit 4).
alter table public.ticket_categories    enable row level security;
alter table public.tickets              enable row level security;
alter table public.ticket_attachments   enable row level security;
alter table public.ticket_comments      enable row level security;
alter table public.ticket_events        enable row level security;
alter table public.ticket_assignments   enable row level security;

comment on table public.ticket_categories is
  'Catálogo de categorías por tenant. TKT-011 siembra 9 categorías base por tenant en bootstrap_tenant.';
comment on table public.tickets is
  'Tickets de soporte. Estado controlado por FSM. sla_status es stub temporal (on_track) hasta TKT-008.';
comment on table public.ticket_attachments is
  'Metadata de adjuntos. storage_path y sha256 quedan NULL hasta TKT-014 (Storage real).';
comment on table public.ticket_events is
  'Auditoría inmutable del ciclo de vida del ticket. INSERT-only por RLS.';
comment on table public.ticket_assignments is
  'Asignaciones. Sólo una activa (unassigned_at IS NULL) por ticket, enforced por índice parcial.';
