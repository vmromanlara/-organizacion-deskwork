-- RLS is evaluated only after PostgreSQL privileges. Grant the minimum surface
-- needed by the read/update policies; all organizational mutations remain RPC-only.

grant select on table public.tenants to authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.areas to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.teams to authenticated;
grant select on table public.team_memberships to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.membership_scope_grants to authenticated;

revoke insert, update, delete on table public.tenants from authenticated;
revoke insert, delete on table public.profiles from authenticated;
revoke insert, update, delete on table public.areas from authenticated;
revoke insert, update, delete on table public.memberships from authenticated;
revoke insert, update, delete on table public.teams from authenticated;
revoke insert, update, delete on table public.team_memberships from authenticated;
revoke insert, update, delete on table public.audit_logs from authenticated;
revoke insert, update, delete on table public.membership_scope_grants from authenticated;
