-- Foundation / Fase 3A: PostgreSQL privileges are a second boundary to RLS.
-- RLS does not govern TRUNCATE, so remove Supabase's broad default table grants
-- before restoring only the read/update paths intentionally exposed to clients.

revoke all privileges on all tables in schema public from anon, authenticated;

grant select on public.tenants to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.areas to authenticated;
grant select on public.memberships to authenticated;
grant select on public.teams to authenticated;
grant select on public.team_memberships to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.membership_scope_grants to authenticated;
