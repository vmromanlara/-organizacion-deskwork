# DESKWORK — Restauración de ruta centralizada

**Fecha:** 20 de agosto de 2026  
**Ruta canónica:** `C:\Users\cargi\Cóndor Group\0. Matriz\Cóndor HUBTEC-LAB\Frabric Lab\Proyectos\DeskWork`

## Resultado

La instalación de DeskWork quedó centralizada y operativa en la ruta canónica. `C:\DeskWork` ya no es una ruta de trabajo válida y no debe volver a utilizarse en comandos, enlaces ni documentación operativa nueva.

## Acciones realizadas

1. Se reconstruyó `node_modules` en la ruta canónica con `pnpm install --frozen-lockfile`.
2. Se verificó que `node_modules/next` apunta a la nueva ruta, no a `C:\DeskWork`.
3. Se inició Docker Desktop y Supabase local mediante la CLI local **2.115.0**.
4. Se aplicaron las migraciones Foundation a una base local limpia.
5. Se corrigió un error bloqueante de migración en `20260819000200_authorization_foundation.sql`: el regex de `authorization_permissions.code` no admitía el identificador válido `tenant_admin.grant.execute`.
6. Se actualizó la prueba pgTAP heredada para comprobar los nombres de política y función vigentes.

## Validación ejecutada

| Verificación | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 2 archivos, 4 pruebas |
| `pnpm build` | PASS |
| `/api/health/live` | PASS — HTTP 200 |
| `/api/health/ready` | EXPECTED 503 — no se configuraron credenciales Supabase |
| Migraciones en Supabase local | PASS — esquema Foundation creado |
| `pnpm test:db` | PASS — 10/10 pgTAP |

Las tablas locales confirmadas son: `tenants`, `profiles`, `areas`, `memberships`, `teams`, `team_memberships`, `audit_logs`, `authorization_permissions`, `functional_role_permissions`, `tenant_admin_permissions`, `membership_scope_grants` y `provisioning_tokens`.

## Límites actuales

- Esta restauración no implementa login, sesión, middleware ni cliente Supabase en la aplicación.
- La prueba pgTAP actual es estructural; no certifica aún los casos funcionales de RLS Tenant A/B, self, supervisor, provisioning y elevación de privilegios.
- Ticketing Core, Storage y Fase 3B permanecen sin implementar.
- La auditoría de Fase 3A previa es una fotografía histórica; su bloqueo por entorno/dependencias quedó resuelto por esta restauración, pero sus bloqueos funcionales de Auth y pruebas completas de autorización continúan vigentes.

## Próximo paso recomendado

Reabrir la validación de Foundation sobre el entorno ya restaurado: completar pruebas RLS funcionales y la capa mínima de Auth antes de autorizar Fase 3B.
