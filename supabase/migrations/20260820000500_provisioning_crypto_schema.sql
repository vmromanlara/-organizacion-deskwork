-- Supabase installs pgcrypto in the extensions schema. SECURITY DEFINER
-- functions use a fixed search_path, so crypto calls must be schema-qualified.

create or replace function public.issue_provisioning_token(
  requested_tenant_name text,
  requested_tenant_slug text,
  requested_timezone text,
  requested_functional_role public.functional_role default 'operator',
  requested_tenant_admin boolean default false,
  requested_expires_at timestamptz default (now() + interval '24 hours'),
  issuer_user_id uuid default null,
  issuer_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare raw_token text;
begin
  if requested_expires_at <= now() then
    raise exception 'provisioning token expiry must be in the future';
  end if;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.provisioning_tokens (
    token_hash, initial_tenant_name, initial_tenant_slug, initial_timezone,
    initial_functional_role, initial_is_tenant_admin, expires_at, issued_by_user_id, issued_reason
  ) values (
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), requested_tenant_name, requested_tenant_slug, requested_timezone,
    requested_functional_role, requested_tenant_admin, requested_expires_at, issuer_user_id, issuer_reason
  );
  return raw_token;
end;
$$;

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

revoke all on function public.issue_provisioning_token(text, text, text, public.functional_role, boolean, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.bootstrap_tenant(text, text) from public;
grant execute on function public.bootstrap_tenant(text, text) to authenticated;
grant execute on function public.issue_provisioning_token(text, text, text, public.functional_role, boolean, timestamptz, uuid, text) to service_role;
