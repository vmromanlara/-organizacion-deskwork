-- DeskWork Ticketing Core / Fase Block 1.
-- TKT-011 — Siembra de las 9 categorías iniciales dentro de public.bootstrap_tenant.
-- Estrategia: Opción B del Final Spec Freeze v3 §2.5.
-- La función original permanece INTACTA: misma firma, mismos parámetros, mismo
-- orden de operaciones. La única ampliación funcional es crear las 9 categorías
-- base para el tenant recién creado, justo antes de la línea del audit log.
-- Operación idempotente: ON CONFLICT (tenant_id, slug) DO NOTHING.

create or replace function public.bootstrap_tenant(provisioning_token text, initial_display_name text)
returns public.tenants
language plpgsql
security definer
set search_path = public, auth
as $$
declare provision public.provisioning_tokens;
declare created_tenant public.tenants;
declare created_membership public.memberships;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'user already belongs to a tenant' using errcode = '42501';
  end if;
  select * into provision
  from public.provisioning_tokens
  where token_hash = encode(extensions.digest(provisioning_token, 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'invalid provisioning token' using errcode = '42501';
  end if;
  if provision.consumed_at is not null then
    raise exception 'provisioning token already consumed' using errcode = '42501';
  end if;
  if provision.expires_at <= now() then
    raise exception 'provisioning token expired' using errcode = '42501';
  end if;

  insert into public.profiles (id, display_name) values (auth.uid(), initial_display_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  insert into public.tenants (name, slug, timezone)
  values (provision.initial_tenant_name, provision.initial_tenant_slug, provision.initial_timezone)
  returning * into created_tenant;
  insert into public.memberships (tenant_id, user_id, functional_role, is_tenant_admin, status)
  values (created_tenant.id, auth.uid(), provision.initial_functional_role, provision.initial_is_tenant_admin, 'active')
  returning * into created_membership;
  if provision.initial_functional_role in ('technical_lead', 'director') then
    insert into public.membership_scope_grants (tenant_id, membership_id, scope, granted_by_membership_id)
    values (created_tenant.id, created_membership.id, 'institution', created_membership.id);
  end if;
  insert into public.teams (tenant_id, name, is_default) values (created_tenant.id, 'Soporte TI', true);

  -- TKT-011: Siembra de las 9 categorías base por tenant (Opción B).
  -- Idempotente vía UNIQUE (tenant_id, slug) → ON CONFLICT DO NOTHING.
  insert into public.ticket_categories (tenant_id, slug, label, display_order, is_active) values
    (created_tenant.id, 'computador', 'Computador', 10, true),
    (created_tenant.id, 'correo',     'Correo',     20, true),
    (created_tenant.id, 'internet',   'Internet / Conectividad', 30, true),
    (created_tenant.id, 'impresora',  'Impresora',  40, true),
    (created_tenant.id, 'telefonia',  'Telefonía',  50, true),
    (created_tenant.id, 'accesos',    'Accesos / Permisos', 60, true),
    (created_tenant.id, 'software',   'Software / Aplicaciones', 70, true),
    (created_tenant.id, 'cuenta',     'Cuenta / Usuario', 80, true),
    (created_tenant.id, 'otro',       'Otro',       90, true)
  on conflict (tenant_id, slug) do nothing;

  update public.provisioning_tokens
  set consumed_at = now(), consumed_by_user_id = auth.uid()
  where id = provision.id;
  perform public.write_audit_log(created_tenant.id, 'tenant.provisioned', 'tenant', created_tenant.id,
    null,
    jsonb_build_object(
      'provisioning_token_id', provision.id,
      'functional_role', provision.initial_functional_role,
      'tenant_admin_granted', provision.initial_is_tenant_admin
    ),
    'success', 'provisioning_token', provision.id, provision.issued_reason);
  return created_tenant;
end;
$$;

-- Los grants/revokes de la función original no cambian: se mantienen abajo para que
-- cualquier reasignación de permisos siga intacta.
revoke all on function public.bootstrap_tenant(text, text) from public;
grant execute on function public.bootstrap_tenant(text, text) to authenticated;
