# DESKWORK — CIERRE REAL DE FOUNDATION / FASE 3A

**Fecha:** 20 de agosto de 2026  
**Ruta canónica:** `C:\Users\cargi\Cóndor Group\0. Matriz\Cóndor HUBTEC-LAB\Frabric Lab\Proyectos\DeskWork`  
**Alcance:** Foundation: autenticación, autorización, tenant isolation, RLS, provisioning, auditoría y validación. Ticketing Core no se implementó.

## 1. Objetivo de cierre

Dejar Foundation operativa y verificable de extremo a extremo: identidad real de Supabase Auth, sesión persistente, rutas protegidas, autorización multi-tenant, RLS ejecutable, operaciones administrativas acotadas, provisioning y trazabilidad.

## 2. Baseline Git

- Repositorio Git inicializado en la ruta canónica.
- Baseline previo a Auth: `48411d3 DESKWORK — Foundation restored baseline before Auth`.
- No se hizo `reset`, `commit`, `push` ni modificación de historial durante el cierre.
- El working tree final queda **DIRTY de forma intencional**, con los cambios de Foundation aún sin commit: Auth, migraciones `20260820000300` a `20260820000600`, prueba funcional pgTAP y este informe.

## 3. Entorno validado

- Node.js `v24.19.0`; pnpm `11.19.0`.
- Dependencias instaladas con el lockfile del proyecto.
- Docker Desktop operativo.
- Supabase local operativo; la base fue reconstruida desde cero durante esta validación.
- Las claves locales no se incluyen en este informe.

## 4. Resumen de cambios de Foundation

- Cliente Supabase de navegador y cliente server-side con cookies.
- Registro, login, logout, restauración de sesión y consulta de usuario autenticado.
- Páginas `/login`, `/register` y `/app`.
- Middleware de protección para `/app`.
- Endpoint `GET /api/auth/me`, que obtiene al usuario desde la sesión del servidor.
- Corrección del modelo de scope: `is_tenant_admin` aporta permisos técnicos, pero no otorga por sí solo alcance institucional.
- Correcciones aditivas de migración para privilegios SQL y funciones criptográficas.

## 5. Auth de aplicación

**Resultado: PASS.**

La interfaz usa Supabase Auth con correo/contraseña. Se validó en navegador contra Supabase local una cuenta de prueba generada para la ejecución:

1. Registro exitoso.
2. Redirección autenticada a `/app`.
3. Identidad mostrada desde sesión server-side.
4. La cuenta de prueba se eliminó al finalizar; se verificó que no quedó usuario Auth ni perfil de aplicación.

## 6. Sesión

**Resultado: PASS.**

Después del registro autenticado, una recarga de `/app` conservó la sesión. El logout redirigió a `/login` y una apertura posterior de `/app` redirigió a `/login?next=%2Fapp`.

## 7. Protección de rutas

**Resultado: PASS.**

- `/app` sin sesión redirige a login con retorno seguro.
- `/app` con sesión se renderiza como recurso autenticado.
- El parámetro `next` se limita a rutas internas que comienzan con `/`.
- La API de identidad valida el usuario en servidor; la protección de recursos API específicos se añadirá junto a los módulos que los expongan.

## 8. Tenant, memberships, roles, scopes y permisos

**Resultado: PASS.**

- `tenant` es el límite de aislamiento de datos.
- `membership` enlaza identidad Auth, tenant, rol funcional, estado y área opcional.
- Los roles funcionales son independientes de la capacidad administrativa técnica.
- Los scopes (`institution`, `department`, `team`) delimitan el alcance de lectura y operación.
- `is_tenant_admin` habilita permisos técnicos previstos, pero exige scope institucional explícito para operaciones de administración de datos.
- La autorización se resuelve mediante permisos, pertenencia activa y scope, no solamente por nombre de rol.

## 9. RLS funcional

**Resultado: PASS.**

RLS está habilitado en las tablas públicas de Foundation. Las policies de lectura y actualización propia se apoyan en funciones de autorización; las mutaciones administrativas no se conceden como DML directo al cliente y se realizan mediante RPCs controladas.

La defensa tiene dos capas:

1. Privilegios SQL mínimos para `authenticated` y ninguno de datos para `anon`.
2. RLS, scopes y checks de autorización en cada ruta permitida.

## 10. Tenant A/B y cross-tenant isolation

**Resultado: PASS.**

La prueba pgTAP usa sujetos JWT distintos de Tenant A y Tenant B bajo el rol PostgreSQL `authenticated`. Verifica lectura propia, invisibilidad del tenant ajeno e intentos de mutación cruzada denegados. El resultado no proviene de consultas privilegiadas.

## 11. SELF

**Resultado: PASS.**

Un operador puede leer y actualizar únicamente su propio perfil. No puede leer ni actualizar el perfil de otro miembro ni elevar su membership directamente.

## 12. Supervisor

**Resultado: PASS.**

El supervisor puede leer miembros dentro de su department o team asignados. No puede leer otro tenant ni alterar roles funcionales mediante DML directo.

## 13. Tenant Admin

**Resultado: PASS.**

Un tenant admin con permiso técnico y scope `institution` explícito puede ejecutar las RPC administrativas de su tenant. No recibe scope ni acceso en otro tenant y las operaciones generan auditoría.

## 14. Provisioning

**Resultado: PASS.**

`bootstrap_tenant` acepta un token válido una única vez y crea el tenant/membership con los atributos contenidos en el token. Tokens inválidos, expirados o consumidos son denegados. El token no concede tenant admin implícitamente.

## 15. Privilege escalation

**Resultado: PASS.**

Las pruebas ejercitan y deniegan:

- Autoelevación por `UPDATE` directo de membership.
- Autoasignación de scope institucional.
- RPC administrativa de Tenant A sobre Tenant B.
- DML directo de roles y memberships.
- Reuso o falsificación de token de provisioning.

Además, se detectó y resolvió una brecha real: los grants por defecto dejaban `TRUNCATE`, `TRIGGER` y `REFERENCES` en roles de navegador. `TRUNCATE` no queda protegido por RLS. La migración `20260820000600_harden_table_privileges.sql` revoca todos los privilegios de tabla para `anon` y `authenticated` y restituye sólo los `SELECT` y el `UPDATE profiles` requeridos. Una comprobación final confirma cero tablas públicas con `TRUNCATE` para ambos roles.

## 16. SECURITY DEFINER

**Resultado: PASS.**

Se auditaron 25 funciones `SECURITY DEFINER`:

`assign_member_to_team`, `bootstrap_tenant`, `can_read_area`, `can_read_audit`, `can_read_membership`, `can_read_profile`, `can_read_team`, `can_read_team_membership`, `can_supervisor_read_membership`, `create_member_membership`, `create_organization_area`, `create_tenant_team`, `deactivate_member_membership`, `grant_membership_scope`, `has_permission`, `has_scope`, `has_tenant_admin_capacity`, `has_tenant_role`, `is_active_member`, `issue_provisioning_token`, `require_institution_permission`, `set_membership_functional_role`, `set_membership_tenant_admin_capacity`, `validate_membership_scope_grant` y `write_audit_log`.

Hallazgos finales:

- 25/25 tienen `search_path` fijado a `public` o `public, auth`.
- 0/25 tienen `EXECUTE` para `PUBLIC`.
- Las funciones expuestas a `authenticated` comprueban identidad, tenant, permiso y scope cuando corresponde.
- Las funciones auxiliares internas conservan acceso sólo del owner o de una función definer llamadora.
- La función de provisioning usa `extensions.gen_random_bytes` y `extensions.digest` calificados explícitamente, evitando dependencia implícita de `search_path`.

## 17. Migraciones

**Resultado: PASS.**

Migraciones aplicadas desde una base local vacía:

1. `20260819000100_foundation.sql`
2. `20260819000200_authorization_foundation.sql`
3. `20260820000300_tenant_admin_scope_correction.sql`
4. `20260820000400_authenticated_table_privileges.sql`
5. `20260820000500_provisioning_crypto_schema.sql`
6. `20260820000600_harden_table_privileges.sql`

`supabase db reset --local` completó correctamente y aplicó las seis en ese orden. No se editaron migraciones ya aplicadas: las correcciones se realizaron como migraciones aditivas.

## 18. Pruebas de base de datos

**Resultado: PASS.**

`pnpm test:db` sobre la base recién reconstruida: **42/42 pgTAP PASS** en dos archivos.

- `foundation_authorization.sql`: identidades Auth de prueba, Tenant A/B, SELF, supervisor, tenant admin, scopes, provisioning, denegaciones de escalación y grants SQL.
- `foundation_rls.sql`: invariantes estructurales de RLS, policies y autorización.

## 19. Calidad de código

| Comprobación | Resultado |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 4/4 pruebas |
| `pnpm build` | PASS |
| `pnpm test:db` | PASS — 42/42 pgTAP |
| `supabase db reset --local` | PASS |

## 20. Hallazgos corregidos durante el cierre

1. `useSearchParams` en login requería `Suspense` para el prerender de Next 16; corregido.
2. `bootstrap_tenant` e `issue_provisioning_token` dependían de resolución no explícita de `digest`; corregido con el esquema `extensions`.
3. Las policies RLS no eran alcanzables sin grants `SELECT` mínimos para `authenticated`; corregido.
4. Los grants de `TRUNCATE` no estaban revocados para roles de navegador; corregido y cubierto por pgTAP.
5. La capacidad de tenant admin podía confundirse con scope; se separó y se cubrió por pruebas.

## 21. Riesgos remanentes

- **MEDIUM — Convención de Next:** el build advierte que `middleware.ts` está deprecado a favor de `proxy`. Es compatible y funcional hoy, pero debe migrarse antes de adoptar una versión futura que elimine el soporte.
- **LOW — Vitest:** advierte que su configuración ESM en un paquete CommonJS requerirá ajuste antes de que el cargador nativo sea el predeterminado. Las pruebas actuales pasan.
- **MEDIUM — Producción:** SMTP, confirmación de correo, URLs de redirect, variables de entorno y observabilidad de Supabase deben configurarse y validarse en el entorno de despliegue; esta Fase 3A valida el entorno local.

No hay bloqueadores ni hallazgos HIGH abiertos para Foundation local.

## 22. Fuera de alcance y no implementado

No se implementó Ticketing Core ni Fase 3B:

- Tickets, estados, prioridad y SLA.
- Comentarios, adjuntos, eventos o historial de ticket.
- Notificaciones operativas.
- Dashboard, métricas y reporting de tickets.
- UI de operación administrativa más allá del acceso de Foundation.

## 23. Pendientes posteriores a Foundation

1. Revisar y aprobar este cierre.
2. Hacer commit de los cambios de Foundation cuando el usuario lo autorice.
3. Preparar configuración segura de producción para Supabase Auth.
4. Abrir Fase 3B sólo con autorización explícita y una especificación de Ticketing Core aprobada.

## 24. Definition of Done — Foundation

Foundation está terminada para auditoría local porque una identidad real puede registrarse, iniciar y cerrar sesión; los recursos protegidos no se exponen sin sesión; la base aísla tenants y scopes con privilegios SQL y RLS; las operaciones administrativas están mediadas y auditadas; provisioning está controlado; y todo ello se valida después de reconstruir la base desde cero.

## 25. Conclusión

**Foundation/Fase 3A está READY FOR AUDIT.**

La corrección de privilegios SQL quedó incorporada antes del cierre. No se autoriza ni inicia Fase 3B con este informe.

## 26. Estado final

```text
GIT BASELINE: PASS
ENVIRONMENT: PASS
AUTH: PASS
SESSION: PASS
PROTECTED ROUTES: PASS

TENANT MODEL: PASS
MEMBERSHIP MODEL: PASS
ROLE MODEL: PASS
SCOPE MODEL: PASS
PERMISSION MODEL: PASS
TENANT ADMIN: PASS

RLS FUNCTIONAL: PASS
TENANT A/B: PASS
CROSS-TENANT ISOLATION: PASS
SELF: PASS
SUPERVISOR: PASS
PROVISIONING: PASS
PRIVILEGE ESCALATION: PASS
SECURITY DEFINER: PASS

LINT: PASS
TYPECHECK: PASS
UNIT TESTS: PASS
BUILD: PASS
SUPABASE TESTS: PASS
MIGRATION REPRODUCIBILITY: PASS

BLOCKERS: 0
HIGH: 0
MEDIUM: 2
LOW: 1

FOUNDATION:
READY FOR AUDIT

RECOMMENDATION:
Revisar este informe y autorizar un commit de Foundation antes de abrir Fase 3B.

NEXT ACTION:
Revisar y aprobar el cierre de Fase 3A.
```
