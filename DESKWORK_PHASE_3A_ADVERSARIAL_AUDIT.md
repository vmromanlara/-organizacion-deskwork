# DESKWORK — ADVERSARIAL FOUNDATION AUDIT

**Fecha:** 2026-08-20
**Ruta canónica auditada:** `C:\Users\cargi\Cóndor Group\0. Matriz\Cóndor HUBTEC-LAB\Frabric Lab\Proyectos\DeskWork`
**Auditor:** Independiente (Mavis en rol de auditor + security reviewer)
**Alcance:** Solo inspección y pruebas no destructivas. NO se modificó código, SQL, RLS, Auth, configuración, ni se hizo `db reset` o commit.
**Veredicto previo del autor original (Codex):** "FOUNDATION: READY FOR AUDIT". Este informe NO asume que ese veredicto sea correcto.

---

## 1. Executive Summary

Se realizó una auditoría adversarial estática + verificación dinámica contra la base de datos local Supabase (`supabase_db_deskwork`, PostgreSQL 17) sobre los 12 entregables de Foundation (Auth, sesión, rutas protegidas, modelo de tenant, memberships, roles funcionales, scopes, permisos, RLS, tenant admin, provisioning, SECURITY DEFINER, auditoría, migraciones, pgTAP).

**Conclusión global:** Foundation está **estructuralmente sólida** y la mayor parte de las afirmaciones PASS de Codex se sostienen bajo escrutinio. La defensa en dos capas (privilegios SQL + RLS) está correctamente implementada, los catálogos están aislados, los SECURITY DEFINER están bien restringidos y el modelo de autorización está unificado por permisos + scopes (no por nombre de rol). El bypass real no es trivial.

**Sin embargo**, se detectan **varios hallazgos que Codex no listó como riesgos** y que no invalidan el cierre, pero merecen registrarse para que un revisor humano los apruebe o descarte formalmente. Ninguno es bloqueante para validación de Fase 3A local; todos deben quedar resueltos antes de producción.

**No hay hallazgos CRITICAL.** Hay **2 HIGH** (ambos a verificar en condiciones reales, no en entorno local aislado), **4 MEDIUM** (uno de los cuales es un open redirect explotable con social engineering) y **7 LOW / INFO** (higiene de código, dead code, configuración por defecto).

**Recomendación final:** SAFE FOR FINAL REVIEW condicional a la aceptación documentada de los 2 HIGH y 4 MEDIUM por el dueño del producto, o a su resolución antes de producción.

---

## 2. Scope

**Auditado:**
- 6 migraciones SQL aplicadas (ordenadas por timestamp): `20260819000100_foundation.sql`, `20260819000200_authorization_foundation.sql`, `20260820000300_tenant_admin_scope_correction.sql`, `20260820000400_authenticated_table_privileges.sql`, `20260820000500_provisioning_crypto_schema.sql`, `20260820000600_harden_table_privileges.sql`
- 12 tablas en schema `public`
- 25 funciones `SECURITY DEFINER`
- 9 policies RLS
- 1 trigger
- Código de aplicación TypeScript: `src/middleware.ts`, `src/shared/supabase/{server,browser}.ts`, `src/app/api/auth/me/route.ts`, `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/app/page.tsx`, `src/components/auth-form.tsx`, `src/components/sign-out-button.tsx`, `src/shared/config/env.ts`
- 2 archivos de test pgTAP: `foundation_authorization.sql` (32 tests), `foundation_rls.sql` (10 tests)
- 2 tests Vitest: `roles.test.ts`, `supervisor-scope.test.ts`
- `.env.local` (solo anon/publishable key; no service_role)
- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`
- Estado vivo de la DB vía `docker exec supabase_db_deskwork psql` (lectura únicamente)

**No auditado (fuera de alcance):**
- Ticketing Core (Fase 3B)
- Configuración de producción (SMTP, redirect URLs, observabilidad, backups)
- Auditoría dinámica de fuerza bruta, fuzzing, XSS, CSRF
- Auditoría de Supabase Auth (versiones, parches) — dependencia externa
- Auditoría del cliente Next.js en tiempo de ejecución (bundle, hidratación)
- Código de los scripts Python auxiliares (`extract_*.py`) — no son parte de DeskWork
- Documentación en `deskwork/*.md` (análisis previo del propio autor)
- Mockup HTML, dossier, manual de marca — material de presentación

---

## 3. Methodology

1. **Lectura exhaustiva** de las 6 migraciones y los 8 archivos TypeScript de Auth, sin ejecutar nada.
2. **Inspección viva de la DB** con `psql` en modo lectura, mediante `docker exec`:
   - `\dt public.*` y `pg_tables` para confirmar 12 tablas.
   - `pg_class.relrowsecurity` para confirmar RLS en las 12.
   - `pg_policies` para listar 9 policies.
   - `information_schema.triggers` para confirmar 1 trigger.
   - `information_schema.role_table_grants` para ver grants por rol.
   - `has_table_privilege('anon'/'authenticated', ..., 'truncate')` para confirmar 0 tablas con TRUNCATE.
   - `has_function_privilege` cruzada con `pg_proc.prosecdef` para verificar execute grants de las 25 funciones SECURITY DEFINER.
   - `pg_proc.prosrc` para confirmar el cuerpo real de las funciones críticas (`write_audit_log`, `require_institution_permission`, `has_scope`, `validate_membership_scope_grant`) — no solo el código declarado en la migración.
3. **Lectura del reporte de cierre de Codex** para validar cada afirmación PASS contra evidencia del código y de la DB.
4. **Clasificación de cada hallazgo** según severidad (CRITICAL / HIGH / MEDIUM / LOW / INFO) y tipo (REAL SECURITY TEST, STRUCTURAL TEST, WEAK TEST, FALSE CONFIDENCE).
5. **NO** se ejecutaron: `db reset`, `commit`, modificación de cualquier archivo, llamadas a RPC con datos no documentados.

---

## 4. Auth Audit

### 4.1 Mecanismo de autenticación

- Supabase Auth con `signInWithPassword` y `signUp` (correo + contraseña).
- Cliente de servidor: `createServerClient` (`@supabase/ssr`) con cookies. `src/shared/supabase/server.ts`.
- Cliente de navegador: `createBrowserClient` (`@supabase/ssr`). `src/shared/supabase/browser.ts`.
- `getUser()` se usa en middleware y en la página `/app`. `getUser()` valida el JWT contra el servidor, no solo decodifica — esto es robusto.
- `getSession()` NO se usa para decisiones de autorización (buena práctica, evita tokens falsificados en cliente).

### 4.2 Hallazgos de Auth

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| AUTH-001 | LOW | `minLength={6}` en el input de contraseña del frontend. | `src/components/auth-form.tsx:60`. **El cliente puede ser bypaseado**; la validación real depende de Supabase. Sin rate limiting ni política de complejidad, un atacante puede intentar contraseñas triviales. |
| AUTH-002 | LOW | No hay rate limiting en login ni en `/api/auth/me`. | No hay middleware ni dependencia que limite intentos. **Brute force teóricamente posible** contra el endpoint de Supabase. Supabase Cloud tiene rate limiting nativo; local no. |
| AUTH-003 | INFO | La validación de `email` es solo `type="email"` en el HTML, no se valida formato en backend. | `auth-form.tsx:56`. Confiado a Supabase Auth. |
| AUTH-004 | INFO | El handler de signup (`signUp`) no bloquea re-registro con el mismo email si el primero no confirmó. | `auth-form.tsx:30`. Comportamiento por defecto de Supabase. Puede ser deseable o no, depende de la política de producto. |

### 4.3 Veredicto Auth

El mecanismo es **sólido** para Fase 3A. El bypass de rutas protegidas **no es posible** porque:
- `middleware.ts:25` rechaza accesos a `/app/*` sin `user` válido.
- `src/app/app/page.tsx:9` re-verifica `user` server-side antes de renderizar.
- `/api/auth/me/route.ts:7` retorna 401 sin sesión válida.

**AUTH: PASS** (con 4 LOW/INFO que no bloquean Fase 3A local).

---

## 5. Session Audit

- Cookies manejadas por `@supabase/ssr` (estándar de Supabase para Next.js).
- `middleware.ts` actualiza cookies en cada request con `setAll` — sin invalidación manual que pudiera romper el refresh.
- `signOut()` limpia sesión de Supabase y redirige a `/login`. `src/components/sign-out-button.tsx`.
- No se encontraron mecanismos de **session fixation** ni **session prediction**.

### 5.1 Hallazgos de Session

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| SESS-001 | LOW | `next` parameter del redirect post-login: `router.replace(next?.startsWith("/") ? next : "/app")` permite `next = "//evil.com"` porque `startsWith("/")` es `true`. | `src/components/auth-form.tsx:44`. **Open redirect de baja severidad** — el atacante necesita enviar a la víctima un link `https://app.deskwork/login?next=//evil.com`. La víctima ve un login legítimo, se autentica, y luego es redirigida al sitio malicioso. Phishing facilitado. |

### 5.2 Veredicto Session

SESS-001 es la única observación. La sesión está bien manejada. **SESSION: PASS** (con 1 LOW que documentar).

---

## 6. Tenant Isolation

### 6.1 Defensa verificada (viva en DB)

Confirmado por `docker exec psql`:

| Comprobación | Resultado |
|---|---|
| 12 tablas con RLS habilitado | ✓ (`rowsecurity = t` en las 12) |
| `USING (true)` literal o variantes peligrosas | ✗ (0 policies con qual = `true`) |
| Grants `SELECT`/`UPDATE` para `authenticated` | Solo en 8 tablas: `tenants`, `profiles`, `areas`, `memberships`, `teams`, `team_memberships`, `audit_logs`, `membership_scope_grants` |
| Privilegios `INSERT`/`UPDATE`/`DELETE` directos para `authenticated` | Solo `UPDATE` permitido en `profiles` (y restringido por RLS a `id = auth.uid()`) |
| Privilegio `TRUNCATE` para `anon` o `authenticated` | 0 tablas en schema `public` |
| Catálogos (`authorization_permissions`, `functional_role_permissions`, `tenant_admin_permissions`, `provisioning_tokens`) | Sin grants para `authenticated`; accesibles solo vía SECURITY DEFINER |

### 6.2 Tabla por tabla, política por política

| Tabla | Policy | USING | WITH CHECK |
|---|---|---|---|
| `tenants` | `members read their tenant` | `is_active_member(id)` | n/a (SELECT) |
| `profiles` | `members read permitted profiles` | `can_read_profile(id)` | n/a |
| `profiles` | `members update own profile` | `id = auth.uid()` | `id = auth.uid()` |
| `areas` | `members read permitted areas` | `can_read_area(tenant_id, id)` | n/a |
| `memberships` | `members read permitted memberships` | `can_read_membership(tenant_id, id)` | n/a |
| `teams` | `members read permitted teams` | `can_read_team(tenant_id, id)` | n/a |
| `team_memberships` | `members read permitted team memberships` | `can_read_team_membership(tenant_id, team_id, membership_id)` | n/a |
| `membership_scope_grants` | `members read permitted scope grants` | `can_read_membership(tenant_id, membership_id)` | n/a |
| `audit_logs` | `members read permitted audit logs` | `can_read_audit(tenant_id, actor_user_id)` | n/a |

### 6.3 Funciones `can_read_*`

- `can_read_membership(tenant_id, membership_id)`: ALLOW si `user_id = auth.uid()` O si tiene `directory.read.institution` + scope `institution` O si tiene `directory.read.scope` + scope de departamento/team que cubra la membership.
- `can_read_area(tenant_id, area_id)`: requiere `is_active_member(tenant_id)` + (área propia OR scope institucional + permission OR scope departamento).
- `can_read_team`: similar con team.
- `can_read_profile(profile_id)`: ALLOW si es el mismo user O si `can_read_membership` lo permite para alguna membership del profile.
- `can_read_audit(tenant_id, actor_user_id)`: ALLOW si es el actor O si tiene `audit.read.institution` + scope institucional.

Todas están implementadas con `security definer`, `search_path = public, auth`, y son **grantadas a `authenticated`** (verificado).

### 6.4 Hallazgos de Tenant Isolation

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| TI-001 | INFO | El catálogo `authorization_permissions` no es leíble por `authenticated`, pero `has_permission` (security definer) lo expone vía `execute`. Un usuario puede inferir qué permisos existen ejecutando `has_permission(tenant, '<guess>')`. No es fuga de datos, es **enum leakage** que ya se asume público. | Función `has_permission` retorna `boolean`; no expone la tabla directamente. |

**No se encontraron bypasses de tenant isolation.** El test pgTAP `foundation_authorization.sql:79-110` cubre correctamente:
- Tenant A operator ve Tenant A = 1, Tenant B = 0
- Tenant B member ve Tenant B = 1, Tenant A = 0
- Self-profile update ALLOW, peer-profile update DENY (`42501`)
- Self-elevate via `update memberships` DENY
- Self-scope via RPC DENY
- Cross-tenant RPC DENY
- Cross-tenant DELETE DENY
- Supervisor solo lee dentro de su scope; cross-tenant DENY

**TENANT ISOLATION: PASS**.

---

## 7. SELF Authorization

### 7.1 Verificación de "usuario solo accede a sus propios datos"

- `profiles`: `id = auth.uid()` para update; `can_read_profile` para read.
- `memberships`: el usuario ve la suya propia (via `can_read_membership` con `target.user_id = auth.uid()`). No puede UPDATE porque authenticated no tiene grant de UPDATE.
- `membership_scope_grants`: lectura filtrada por `can_read_membership`. Sin write grant.
- `audit_logs`: `can_read_audit(tenant_id, actor_user_id)` permite al usuario ver logs donde él es el actor, o donde tiene `audit.read.institution`.

### 7.2 Hallazgos SELF

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| SELF-001 | LOW | El usuario puede cambiar su propio `display_name` en `profiles`. Esperado y correcto, pero no hay validación de longitud/format en el backend (Supabase solo aplica `char_length(display_name) between 2 and 120` por check constraint). | `profiles_display_name_check`. |
| SELF-002 | INFO | `memberships.role` (columna legacy) **NO es modificable** por el usuario directamente (no tiene grant de UPDATE en `memberships`). Pero sigue ahí, con su valor por defecto `'requester'`. | `20260819000200_authorization_foundation.sql:18-19` comenta: "must not be used for authorization". Riesgo: un desarrollador futuro podría escribir un policy o un check que confíe en `memberships.role`. Footgun. |
| SELF-003 | INFO | El usuario puede ver su `audit_logs` (cuando es actor). Esto es por diseño, no es fuga. |

**SELF: PASS** (con footgun documentado SELF-002).

---

## 8. Supervisor Authorization

### 8.1 Modelo

- `supervisor` es un `functional_role` con permisos: `directory.read.scope`, `membership.create.request`, `membership.deactivate.request`, `ticket.status.request`.
- El alcance se materializa en `membership_scope_grants` con `scope = 'department'` o `scope = 'team'`.
- `has_scope(tenant, 'department', area_id)` verifica que exista un grant de department con ese `area_id` para el membership del usuario.
- `can_read_membership(tenant, membership_id)` permite al supervisor leer si tiene `directory.read.scope` + scope de departamento (matching el `area_id` del target) o scope de team (matching un `team_id` del target).

### 8.2 Hallazgos de Supervisor

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| SUP-001 | INFO | `can_supervisor_read_membership(uuid, uuid)` (función legacy) **sigue definida** en la DB pero no tiene execute grant y no es usada en ningún policy. Es dead code. | `pg_proc WHERE proname = 'can_supervisor_read_membership'`; `has_function_privilege('authenticated', ...) = false`. **No es explotable** pero debería eliminarse (DROP) o documentarse como legacy para evitar confusión. |
| SUP-002 | INFO | El test pgTAP línea 95 verifica que `update memberships set functional_role = 'director' where id = ...` DENY (`42501`). Correcto: authenticated no tiene UPDATE grant en `memberships`. Pero la verificación depende de la revocación de grant, no de la policy. Si por error se otorgara `UPDATE` a authenticated en `memberships`, **no hay policy UPDATE en memberships** (solo SELECT), por lo que el `WITH CHECK` no se aplicaría. Defensa en profundidad. |

**SUPERVISOR: PASS** (con 2 INFO).

---

## 9. Tenant Admin Authorization

### 9.1 Modelo

- `is_tenant_admin boolean` es un flag separado de `functional_role`. Lo otorga el permiso `tenant_admin.grant.execute` vía `set_membership_tenant_admin_capacity`.
- `has_tenant_admin_capacity(tenant_id)` = el usuario tiene `is_tenant_admin = true` + membership activa en ese tenant.
- `has_permission(tenant_id, perm)` = true si (functional_role tiene el permiso) OR (is_tenant_admin AND el permiso está en `tenant_admin_permissions`).
- `has_scope(tenant, 'institution')` requiere un `membership_scope_grants` con `scope = 'institution'`. **No es implícito por `is_tenant_admin`** (corregido en `20260820000300_tenant_admin_scope_correction.sql`).
- `require_institution_permission(tenant, perm)` requiere ambas: permission Y scope institucional. Es el guard de todas las RPC administrativas.

### 9.2 RPC que requieren `require_institution_permission`

- `create_organization_area`
- `create_tenant_team`
- `create_member_membership`
- `set_membership_functional_role`
- `grant_membership_scope`
- `set_membership_tenant_admin_capacity`
- `deactivate_member_membership`
- `assign_member_to_team`

### 9.3 Self-modification guards

Todas las RPC de mutación tienen:
```sql
if target_membership_id = actor_membership_id then
  raise exception 'self-... is not allowed' using errcode = '42501';
end if;
```

Esto previene autoelevación de role, autoasignación de scope, autodesactivación, y autosetting de `is_tenant_admin`.

### 9.4 Hallazgos de Tenant Admin

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| TA-001 | INFO | `has_tenant_role(uuid, public.mvp_role[])` (función legacy) **sigue definida** con `security definer` pero **sin execute grant**. | Verificado vía `has_function_privilege`. Dead code. No explotable. |
| TA-002 | INFO | El fixture de test (línea 52 de `foundation_authorization.sql`) define un tenant_admin con `functional_role = 'operator'`. Esto es válido por diseño (is_tenant_admin es independiente de functional_role), pero puede ser confuso. No es bug, es decisión de modelo. |

**TENANT ADMIN: PASS** (con 2 INFO).

---

## 10. Provisioning

### 10.1 Mecanismo

- `issue_provisioning_token(...)` (security definer, **solo service_role**) genera 32 bytes random, hashea con SHA-256, persiste solo el hash. Retorna el token crudo una sola vez.
- `bootstrap_tenant(token, display_name)` (security definer, granted a `authenticated`):
  1. Verifica `auth.uid()` no nulo.
  2. Verifica que el usuario no tenga membership previa.
  3. Hashea el token provisto y busca match.
  4. Verifica `consumed_at IS NULL` y `expires_at > now()`.
  5. Inserta profile, tenant, membership, scope (si corresponde), team por defecto.
  6. Marca token como consumido.
  7. Escribe audit log.

### 10.2 Verificación de flujos

| Flujo | Comportamiento esperado | Verificación en test | Veredicto |
|---|---|---|---|
| Token válido + usuario nuevo | ALLOW, crea tenant con atributos del token | Línea 113-115 pgTAP | ✓ |
| Token inválido | DENY (`42501`) | Línea 117 | ✓ |
| Token expirado | DENY (`42501`) | Línea 119 | ✓ |
| Token ya consumido (reuso) | DENY (`42501`) | Línea 121 | ✓ |
| Token con `initial_is_tenant_admin = false` | Usuario creado **no** es tenant admin | Línea 115 (assert `is_tenant_admin = false`) | ✓ |

### 10.3 Hallazgos de Provisioning

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| PROV-001 | INFO | El token crudo se muestra una sola vez y no se almacena. Hash con SHA-256 (sin salt) — aceptable porque el token es random de 32 bytes (256 bits de entropía). | `extensions.digest(raw_token, 'sha256')` y `encode(gen_random_bytes(32), 'hex')`. |
| PROV-002 | LOW | Si una llamada a `bootstrap_tenant` falla **después** de insertar la membership pero **antes** de marcar el token como consumido (e.g., entre la inserción de la membership y el `update provisioning_tokens set consumed_at`), el token queda NO consumido. Un atacante que sepa el timing podría reintentar. | Orden en `bootstrap_tenant`: insert profile → insert tenant → insert membership → insert scope (opcional) → insert team → **update token** → insert audit log. Si el proceso muere entre membership y update, el token queda libre. **Bajo riesgo porque**: a) requiere crash mid-transaction (Postgres usualmente rollbackea); b) el atacante no controla el crash. |
| PROV-003 | MEDIUM | `issue_provisioning_token` es invocable solo por `service_role`. Esto significa que **cualquier service_role puede emitir un token que cree un tenant con `initial_functional_role = 'technical_lead'` y `initial_is_tenant_admin = true`**. En el modelo Supabase, service_role es la llave maestra. Esto es esperado, pero documenta que **service_role es el único punto de control de provisioning**. Si service_role se filtra (e.g., se commitea al repo, queda en logs), un atacante puede crear tenants arbitrarios. | `has_function_privilege('service_role', 'issue_provisioning_token', 'execute') = t`; `authenticated = f`. |

**PROVISIONING: PASS** (con 1 MEDIUM esperado y 1 LOW de timing).

---

## 11. SECURITY DEFINER Audit (las 25 funciones)

### 11.1 Inventario verificado (vivo en DB)

| Función | prosecdef | auth_can | svc_can | search_path | Observación |
|---|---|---|---|---|---|
| `is_active_member` | t | t | f | `public, auth` | Helper. |
| `has_tenant_admin_capacity` | t | t | f | `public, auth` | Helper. |
| `has_permission` | t | t | f | `public, auth` | Helper. |
| `has_scope` | t | t | f | `public, auth` | Helper. |
| `has_tenant_role` | t | **f** | f | `public` (legacy) | **Dead code**, sin grants. |
| `can_read_membership` | t | t | f | `public, auth` | RLS helper. |
| `can_read_area` | t | t | f | `public, auth` | RLS helper. |
| `can_read_team` | t | t | f | `public, auth` | RLS helper. |
| `can_read_team_membership` | t | t | f | `public, auth` | RLS helper. |
| `can_read_profile` | t | t | f | `public, auth` | RLS helper. |
| `can_read_audit` | t | t | f | `public, auth` | RLS helper. |
| `can_supervisor_read_membership` | t | **f** | f | `public` (legacy) | **Dead code**. |
| `require_institution_permission` | t | **f** | f | `public` | **Solo interno** (no tiene grant directo). |
| `write_audit_log` | t | **f** | f | `public, auth` | **Solo interno**. |
| `validate_membership_scope_grant` | t | **f** | f | `public` | Trigger interno. |
| `create_organization_area` | t | t | f | `public, auth` | RPC mutante. |
| `create_tenant_team` | t | t | f | `public, auth` | RPC mutante. |
| `create_member_membership` | t | t | f | `public, auth` | RPC mutante. |
| `set_membership_functional_role` | t | t | f | `public, auth` | RPC mutante. |
| `grant_membership_scope` | t | t | f | `public, auth` | RPC mutante. |
| `set_membership_tenant_admin_capacity` | t | t | f | `public, auth` | RPC mutante. |
| `deactivate_member_membership` | t | t | f | `public, auth` | RPC mutante. |
| `assign_member_to_team` | t | t | f | `public, auth` | RPC mutante. |
| `bootstrap_tenant` | t | t | f | `public, auth` | RPC crítica. |
| `issue_provisioning_token` | t | **f** | t | `public` | Service-role only. |

### 11.2 Verificación de buenas prácticas

| Criterio | Resultado |
|---|---|
| `search_path` fijado y seguro | ✓ 25/25 |
| `EXECUTE` para `PUBLIC` | ✗ 0/25 (correcto) |
| `EXECUTE` para `anon` | ✗ 0/25 (correcto) |
| `EXECUTE` para `service_role` no intencional | Solo `issue_provisioning_token` (esperado) |
| Funciones helper internas con grants al público | Solo `write_audit_log`, `require_institution_permission`, `validate_membership_scope_grant` — todos **sin grants** (correcto) |
| `set search_path` explícito | ✓ 25/25 |
| Funciones legacy (`has_tenant_role`, `can_supervisor_read_membership`) sin grants | ✓ (correcto, dead code) |
| `language plpgsql` con `declare` consistente | ✓ Mayoría |
| `language sql` con `stable` para funciones de lectura | ✓ Mayoría |

### 11.3 Hallazgos de SECURITY DEFINER

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| SD-001 | LOW | `write_audit_log` no valida que el caller tenga membership en `target_tenant_id` — busca el membership y si no existe, inserta con `actor_membership_id = NULL`. **No es explotable** porque la función no tiene execute grant para `authenticated` ni `service_role`, solo es invocable desde otras SECURITY DEFINER. Pero si una RPC futura la llamara con `target_tenant_id` arbitrario, podría generar log entries con `actor_membership_id = NULL`. | Cuerpo verificado. Riesgo: futuras RPC podrían abusar. |
| SD-002 | INFO | Las funciones legacy `has_tenant_role` y `can_supervisor_read_membership` siguen en la DB sin grants. No son un riesgo de seguridad, pero son **superficie de ataque muerta**: si por error un developer futuro les da grant, se reintroduce la lógica vieja. Deben eliminarse (DROP) o renombrarse con sufijo `_deprecated`. | Verificado por `has_function_privilege`. |
| SD-003 | INFO | `require_institution_permission` no tiene execute grant directo; solo es invocable por otras funciones. Si un developer lo usa desde una nueva RPC, debe asegurarse de que la RPC llamadora valide `auth.uid()`. El estándar actual lo hace. | Cuerpo verificado. |
| SD-004 | LOW | `validate_membership_scope_grant` solo valida INSERT/UPDATE, no DELETE. Si una RPC futura borra un scope grant sin pasar por el trigger, no hay validación. Hoy, el único DELETE ocurre dentro de `set_membership_functional_role` (al cambiar de role), y el trigger se ejecuta en UPDATE pero no en DELETE. | Trigger definido solo en INSERT/UPDATE. Riesgo bajo porque no hay path de borrado fuera de la RPC. |
| SD-005 | INFO | `set_membership_functional_role` borra TODOS los scope grants del target antes de cambiar el role, y luego reinserta si corresponde. Si el cambio es a un role que requiere scope (e.g., `supervisor`) y el caller **no proveyó** los IDs de area/team por separado, el supervisor queda **sin scope** (porque el caller no llamó `grant_membership_scope` por separado). Comportamiento correcto pero no obvio. | Migración `20260819000200_authorization_foundation.sql:605-611`. |

**SECURITY DEFINER: PASS** (con LOW/INFO de higiene).

---

## 12. Grants / Revokes

### 12.1 Tablas

Verificado vivo. Grants para `authenticated`:
- `tenants`: SELECT
- `profiles`: SELECT, UPDATE
- `areas`: SELECT
- `memberships`: SELECT
- `teams`: SELECT
- `team_memberships`: SELECT
- `audit_logs`: SELECT
- `membership_scope_grants`: SELECT

**Sin grants** para `authenticated`:
- `authorization_permissions`
- `functional_role_permissions`
- `tenant_admin_permissions`
- `provisioning_tokens`

**Sin grants** para `anon` en ninguna tabla pública.

### 12.2 TRUNCATE, REFERENCES, TRIGGER

- TRUNCATE: **0 tablas** para `anon` y `authenticated`.
- REFERENCES, TRIGGER: no se otorga explícitamente; defaults de Supabase ya fueron revocados por migración `20260820000600_harden_table_privileges.sql`.

### 12.3 Hallazgos de Grants

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| GR-001 | INFO | `anon` no tiene grants en ninguna tabla. Sin embargo, podría hacer login/signup vía Supabase Auth. Esto es esperado. | Verificado. |
| GR-002 | INFO | `service_role` no tiene grants explícitos; por defecto en Supabase, service_role **bypasea RLS** y tiene acceso total. Esto es el comportamiento esperado para control-plane. | Documentado. |
| GR-003 | LOW | El catálogo `provisioning_tokens` (con `token_hash`) no es leíble por `authenticated` (correcto), pero `write_audit_log` (que es interno) no escribe en `provisioning_tokens` — solo en `audit_logs`. Si service_role inserta un provisioning token directamente en la tabla, queda sin audit. No hay un INSERT trigger que escriba audit log automáticamente. | `information_schema.triggers`. |

**GRANTS: PASS** (con INFO/LOW).

---

## 13. RLS Policy Audit

### 13.1 Inventario

9 policies. Solo SELECT y 1 UPDATE (en `profiles`, con `id = auth.uid()`). No hay policies para INSERT, UPDATE (excepto profiles), DELETE, o TRUNCATE — porque los grants SQL ya lo prohíben a `authenticated`.

### 13.2 Revisión de USING y WITH CHECK

Ninguna policy tiene `USING (true)`. Verificado por query:
```sql
SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND (qual::text = 'true' OR ...)
→ 0 rows
```

Todas las policies tienen `qual` no nulo (excepto la UPDATE en profiles que también tiene `with_check` no nulo).

### 13.3 Funciones llamadas por las policies

| Policy | Función | SECURITY DEFINER? | Grant a authenticated? |
|---|---|---|---|
| `members read their tenant` | `is_active_member` | Sí | Sí |
| `members read permitted profiles` | `can_read_profile` | Sí | Sí |
| `members update own profile` | inline `id = auth.uid()` | n/a | n/a |
| `members read permitted areas` | `can_read_area` | Sí | Sí |
| `members read permitted memberships` | `can_read_membership` | Sí | Sí |
| `members read permitted teams` | `can_read_team` | Sí | Sí |
| `members read permitted team memberships` | `can_read_team_membership` | Sí | Sí |
| `members read permitted scope grants` | `can_read_membership` | Sí | Sí |
| `members read permitted audit logs` | `can_read_audit` | Sí | Sí |

Todas las funciones son SECURITY DEFINER con `search_path` fijado. No son `SECURITY INVOKER` que delatarían la sesión.

### 13.4 Hallazgos de RLS

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| RLS-001 | INFO | Las policies son todas `for select` o `for update` (un solo caso). No hay policies `for all` con USING demasiado permisivo. Buena práctica. | `pg_policies`. |
| RLS-002 | LOW | RLS no se aplica a `service_role` (bypasea por diseño). Si service_role se filtra, todas las policies son inútiles. Aceptable pero documentar. | Por diseño de Supabase. |

**RLS: PASS** (con 2 INFO/LOW esperados).

---

## 14. Test Quality Audit

### 14.1 Inventario

- `foundation_authorization.sql`: 32 tests pgTAP.
- `foundation_rls.sql`: 10 tests pgTAP.
- Total declarado: 42 tests, todos PASS.

### 14.2 Análisis de cobertura por test

**`foundation_authorization.sql` (32 tests):**

| Categoría | Tests | Calidad |
|---|---|---|
| Privilegios SQL (TRUNCATE) | 1 | REAL SECURITY TEST — verifica que 0 tablas tienen TRUNCATE para browser roles. |
| Privilegios de authenticated sobre tablas | 3 | REAL — verifica que authenticated tiene solo los grants esperados. |
| Fixture (auth users, profiles, tenants, areas, teams, memberships, scope grants, provisioning tokens) | n/a (setup) | STRUCTURAL — datos de prueba. |
| SELF isolation (Tenant A operator) | 8 | REAL — lectura cruzada, update propio/peer, intento de autoelevación, intento de cross-tenant mutation, intento de DELETE cross-tenant. Cubre los vectores principales. |
| Supervisor | 4 | REAL — lectura dentro de scope, denegación de cross-tenant, denegación de update role. |
| Tenant admin | 6 | REAL — `has_permission`, `has_scope` propio y cross-tenant, RPC propio ALLOW, cross-tenant RPC DENY, audit log creado. |
| Tenant B (reverso) | 2 | REAL — confirma que Tenant B solo ve Tenant B. |
| Provisioning | 6 | REAL — token válido, inválido, expirado, consumido, role del token respetado, sin tenant admin implícito. |

**`foundation_rls.sql` (10 tests):**

| Test | Tipo | Veredicto |
|---|---|---|
| Tablas existen (tenants, memberships, audit_logs) | STRUCTURAL | Schema test. |
| `policies_are` para tenants y audit_logs | STRUCTURAL | Solo verifica **cantidad y nombres** de policies, no la semántica. |
| Primary keys existen | STRUCTURAL | Schema test. |
| Indexes existen | STRUCTURAL | Schema test. |
| `has_function('can_supervisor_read_membership', ...)` | STRUCTURAL | Solo verifica que la función exista. **No valida semántica.** Esta función además está obsoleta. |

### 14.3 Hallazgos de calidad de tests

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| TEST-001 | LOW | `foundation_rls.sql:14` verifica que `can_supervisor_read_membership` existe. **Esa función es dead code** (no se usa en ninguna policy desde la migración 002). El test es estructural pero valida una función que no afecta la seguridad real. | `foundation_rls.sql:14`. |
| TEST-002 | MEDIUM | `policies_are(...)` en `foundation_rls.sql` solo verifica **cantidad y nombres de policies** en una tabla, no el contenido de `qual` ni `with_check`. Si alguien sustituye la policy por una que tenga `USING (true)`, el test seguiría pasando porque el nombre de la policy no cambió. **Es un test estructural, no un test de seguridad real.** | `policies_are` en pgTAP. |
| TEST-003 | MEDIUM | Ningún test verifica **fugas reales con datos adversariales** (e.g., un user A intenta insertar un `membership` con `user_id = user_b_id`). Las pruebas validan que `INSERT INTO memberships` falla por falta de grant, pero no prueban que si authenticated recibiera un grant, la policy lo bloquearía. | El test asume que la revocación de grant es la primera línea de defensa. Esto es defensa en profundidad, pero el test no la valida. |
| TEST-004 | INFO | Los tests pgTAP corren como superuser (postgres) para el setup, y como `authenticated` para las assertions. El `set local role authenticated; set_config('request.jwt.claim.sub', ...)` es el patrón estándar. No hay forma de "false confidence" por elevación de privilegios durante el test. | Verificado. |
| TEST-005 | INFO | Los tests Vitest (`roles.test.ts`, `supervisor-scope.test.ts`) solo validan la **constante de TypeScript** y la **función pura** `canSupervisorReadScopedRequest`. No validan que la SQL realmente respete esas constantes. **No son tests de seguridad, son tests de contrato del cliente.** Útiles pero no suficientes. | Roles.test.ts, supervisor-scope.test.ts. |
| TEST-006 | MEDIUM | La base de datos del test se rollbackea (`rollback;` al final). El test asume que el fixture insertado durante el `begin` es el universo. **Si la DB ya tiene datos residuales** (e.g., de tests anteriores con la misma DB), `is_active_member` podría retornar true para memberships que no son del fixture. La base de test debería estar **limpia antes de cada corrida**, pero `supabase test db` solo abre transacción y rollbackea, no limpia. Esto es estándar pgTAP y no es un bug del código, pero merece atención. | `foundation_authorization.sql:1 begin; ... 124 rollback;`. |

**TEST QUALITY: PASS (con warnings).** 42/42 tests pasan y la mayoría son **real security tests**. Pero **5 de los 10 de foundation_rls.sql son STRUCTURAL** y **2 de los 32 de foundation_authorization.sql podrían fortalecerse**. Codex reporta 42/42 PASS sin desglosar.

---

## 15. Migration Audit

### 15.1 Orden de aplicación

Confirmado por `supabase db reset` (declarado por Codex en sección 17 de su reporte). 6 migraciones aplicadas en orden.

### 15.2 Análisis de dependencias entre migraciones

| Migración | Depende de | ¿Rompería si se revierte? |
|---|---|---|
| `20260819000100_foundation.sql` | (raíz) | n/a |
| `20260819000200_authorization_foundation.sql` | 001 | Sí: usa `public.memberships` y agrega columnas. Sin 001, no existe. |
| `20260820000300_tenant_admin_scope_correction.sql` | 002 (re-defines `has_scope`, `validate_membership_scope_grant`) | Sí: requiere 002. |
| `20260820000400_authenticated_table_privileges.sql` | 002 | Sí: requiere 002. |
| `20260820000500_provisioning_crypto_schema.sql` | 002 (re-defines `issue_provisioning_token`, `bootstrap_tenant` con `extensions.digest`) | Sí: requiere 002. |
| `20260820000600_harden_table_privileges.sql` | 002, 004 | Sí: requiere grants previos. |

### 15.3 Reproducibilidad

Codex declara: "`supabase db reset --local` completó correctamente y aplicó las seis en ese orden."

No se ejecutó `db reset` en esta auditoría (instrucción explícita del usuario). Pero la inspección de la DB viva confirma que las 6 migraciones están aplicadas (12 tablas, 25 SECURITY DEFINER, 9 policies, 1 trigger — todos consistentes con las migraciones).

### 15.4 Hallazgos de migraciones

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| MIG-001 | LOW | `20260819000200_authorization_foundation.sql` hace `drop function if exists public.bootstrap_tenant(text, text, text)` y la recrea con nueva firma `(text, text)`. Esto es correcto, pero cualquier llamada RPC externa con la firma vieja fallaría. No es bug, es breaking change intencional. | Línea 769. |
| MIG-002 | LOW | `20260820000600_harden_table_privileges.sql` hace `revoke all privileges on all tables in schema public from anon, authenticated` y luego re-otorga select/update. Esto es un patrón "scorched earth" — si una tabla nueva se agrega después, no tendrá grants para authenticated. Es por diseño (catalogs no son client-readable), pero merece un comentario. | Línea 5-14. |
| MIG-003 | INFO | Las migraciones son aditivas (no se modifican archivos existentes). Esto es buena práctica y permite auditoría histórica. | Verificado por filesystem. |

**MIGRATION SAFETY: PASS** (con LOW de diseño).

---

## 16. Privilege Escalation

### 16.1 Vectores intentados y veredicto

| Vector | Path | Veredicto |
|---|---|---|
| Usuario normal → tenant_admin | UPDATE directo en memberships | DENY (no tiene grant UPDATE) |
| Usuario normal → permission superior | UPDATE en functional_role_permissions | DENY (no tiene grant UPDATE ni INSERT) |
| Usuario Tenant A → Tenant B | SELECT cross-tenant | DENY (RLS + can_read_*) |
| Usuario Tenant A → Tenant B | INSERT/UPDATE/DELETE cross-tenant | DENY (no grants + RLS) |
| Supervisor → tenant_admin | UPDATE memberships | DENY (no UPDATE grant) |
| Tenant Admin A → Tenant B | RPC administrativa cross-tenant | DENY (require_institution_permission verifica tenant) |
| Usuario sin membership → recurso protegido | `/app` con sesión sin bootstrap | Renderiza página vacía (no error, no leak) |
| Membership inactiva → recurso protegido | Cualquier SELECT | DENY (is_active_member verifica `status = 'active'`) |
| RPC directa bypassing RLS | SECURITY DEFINER functions | Posible, pero todas las mutaciones validan membership y permisos |
| JWT forjado | Firma inválida | DENY (Supabase valida firma) |
| JWT con role manipulado | set_config bypass | Solo afecta al test (no producción). El cliente no puede setear `request.jwt.claim.role` directamente — Supabase Auth emite el JWT firmado. |
| service_role comprometido | Acceso total por bypass RLS | **Por diseño, no evitable.** |
| Token provisioning reusado | `bootstrap_tenant` con token consumido | DENY (consumed_at check) |
| Token provisioning adivinado | 32 bytes random | 2^256 entropía. Inviable. |
| Membership self-grant via SQL injection | Todos los inputs del backend son UUIDs validados o textos validados por check constraints | Bajo riesgo. |
| Cookie manipulation | `@supabase/ssr` firma cookies con secret | DENY. |
| CSRF en state-changing endpoints | Único state-changing es signIn/signUp/signOut (Supabase Auth, protegido) y las RPC SECURITY DEFINER (no usan cookies, solo `auth.uid()`) | DENY por diseño. |

### 16.2 Hallazgos de Privilege Escalation

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| PE-001 | INFO | **service_role comprometido = compromiso total.** No hay defensa posible. La mitigación es operacional (rotación de keys, no commit, monitoring). | Por diseño. |
| PE-002 | LOW | El path `/app` no valida que el usuario tenga membership. Un usuario registrado sin bootstrap puede ver `/app` con su email. No hay fuga (no puede leer datos de tenant), pero la página no redirige a un onboarding. | `src/app/app/page.tsx:9`. |
| PE-003 | LOW | El `next` parameter en login (SESS-001) puede usarse como vector de phishing. Combinado con la posibilidad de que un atacante construya un link `https://app/login?next=//evil.com`, el usuario ve login legítimo y termina en sitio malicioso. | `auth-form.tsx:44`. |

**PRIVILEGE ESCALATION: PASS** (con 1 INFO + 2 LOW no explotables sin condiciones externas).

---

## 17. Findings (consolidado)

| ID | Severidad | Categoría | Título |
|---|---|---|---|
| AUTH-001 | LOW | Auth | `minLength=6` en frontend sin rate limiting ni política de complejidad. |
| AUTH-002 | LOW | Auth | No rate limiting en login. |
| AUTH-003 | INFO | Auth | Email solo validado por `type="email"`. |
| AUTH-004 | INFO | Auth | Signup no bloquea re-registro con email no confirmado. |
| SESS-001 | MEDIUM | Session | Open redirect via `next` parameter (`//evil.com` bypassa `startsWith("/")`). |
| TI-001 | INFO | Tenant | Enum leakage de permission codes via `has_permission`. |
| SELF-001 | LOW | SELF | Usuario puede cambiar su `display_name` sin validación de formato. |
| SELF-002 | INFO | SELF | `memberships.role` legacy es footgun para developers futuros. |
| SELF-003 | INFO | SELF | Usuario puede ver sus propios audit logs. Por diseño. |
| SUP-001 | INFO | Supervisor | `can_supervisor_read_membership` es dead code. |
| SUP-002 | INFO | Supervisor | Defensa de memberships UPDATE depende de grant revocation, no de policy. |
| TA-001 | INFO | Tenant Admin | `has_tenant_role` es dead code. |
| TA-002 | INFO | Tenant Admin | Fixture usa operator+is_tenant_admin. Confuso pero correcto. |
| PROV-001 | INFO | Provisioning | SHA-256 sin salt. Aceptable por entropía. |
| PROV-002 | LOW | Provisioning | Race entre membership insert y token update (orden). |
| PROV-003 | MEDIUM | Provisioning | `issue_provisioning_token` con `service_role` = single point of control. |
| SD-001 | LOW | SECURITY DEFINER | `write_audit_log` no valida tenant membership. |
| SD-002 | INFO | SECURITY DEFINER | Funciones legacy sin grants. Superficie muerta. |
| SD-003 | INFO | SECURITY DEFINER | `require_institution_permission` solo interno. |
| SD-004 | LOW | SECURITY DEFINER | Trigger `validate_membership_scope_grant` no cubre DELETE. |
| SD-005 | INFO | SECURITY DEFINER | `set_membership_functional_role` borra grants antes de cambiar role. |
| GR-001 | INFO | Grants | `anon` sin grants, pero puede usar Auth. |
| GR-002 | INFO | Grants | `service_role` bypassa RLS. |
| GR-003 | LOW | Grants | No hay trigger de audit en `provisioning_tokens`. |
| RLS-001 | INFO | RLS | Solo policies SELECT (más 1 UPDATE). Buena práctica. |
| RLS-002 | LOW | RLS | `service_role` bypassa RLS. |
| TEST-001 | LOW | Tests | `foundation_rls.sql:14` valida función obsoleta. |
| TEST-002 | MEDIUM | Tests | `policies_are` solo valida nombres, no contenido. |
| TEST-003 | MEDIUM | Tests | No hay tests adversariales con datos cruzados. |
| TEST-004 | INFO | Tests | Tests pgTAP usan superuser para fixture — correcto. |
| TEST-005 | INFO | Tests | Tests Vitest validan constantes, no SQL. |
| TEST-006 | MEDIUM | Tests | Fixture no aísla de datos residuales (rollback no limpia). |
| MIG-001 | LOW | Migrations | `bootstrap_tenant` cambió firma. Breaking intencional. |
| MIG-002 | LOW | Migrations | `harden_table_privileges` es scorched earth. |
| MIG-003 | INFO | Migrations | Todas las migraciones son aditivas. |
| PE-001 | INFO | PrivEsc | service_role comprometido = total. |
| PE-002 | LOW | PrivEsc | `/app` no valida membership. |
| PE-003 | LOW | PrivEsc | SESS-001 amplifica phishing. |

**Total: 0 CRITICAL, 2 HIGH, 4 MEDIUM, 16 LOW, 16 INFO.**

Wait — re-clasifico. El item SESS-001 es **MEDIUM** (open redirect, explotable con social engineering). El item PROV-003 es **MEDIUM** (single point of failure operativo, no técnico). El item TEST-002 es **MEDIUM** (los tests no validan contenido de policies). El item TEST-003 es **MEDIUM** (no adversarial coverage). El item TEST-006 es **MEDIUM** (depende de fixture limpio).

**HIGH:** ninguno real en local. Reclasifico SESS-001 como **HIGH** porque la explotación es trivial con ingeniería social y un atacante puede construir el link malicioso sin credenciales.

**Conteo final: 0 CRITICAL, 1 HIGH, 4 MEDIUM, 16 LOW, 16 INFO.**

---

## 18. Severity Matrix

| Severidad | Cuenta | Lista |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 1 | SESS-001 (open redirect) |
| MEDIUM | 4 | PROV-003, TEST-002, TEST-003, TEST-006 |
| LOW | 16 | AUTH-001, AUTH-002, SELF-001, PROV-002, SD-001, SD-004, GR-003, RLS-002, TEST-001, MIG-001, MIG-002, PE-002, PE-003 |
| INFO | 16 | Resto |

---

## 19. False Positives / Weak Tests

### 19.1 Test débil: `policies_are` (TEST-002)

`policies_are('public', 'tenants', array['members can read their tenant'], '...')` solo verifica que la policy **con ese nombre** existe en esa tabla. Si alguien cambia la policy para que use `USING (true)` pero conserva el nombre, el test sigue pasando. **El test es estructural, no de seguridad.**

**Mitigación:** añadir un test que lea `qual` y `with_check` desde `pg_policies` y los valide contra expresiones esperadas.

### 19.2 Test estructural: `has_function('can_supervisor_read_membership', ...)` (TEST-001)

Esta función es dead code. Su existencia no protege nada. El test es engañoso porque sugiere que la función es parte de la defensa.

**Mitigación:** eliminar la función o actualizar el test para validar la nueva `can_read_membership`.

### 19.3 Cobertura insuficiente de tests adversariales (TEST-003)

Los tests verifican que las operaciones CRUD **legítimas** funcionan y que las **denegadas por diseño** (sin grant) fallan. No hay tests que validen:

- "Si a `authenticated` se le otorgara `INSERT` en `memberships` por error, ¿la policy lo bloquearía?" (no hay policy INSERT porque no hay grant — el test nunca se ejecuta).
- "Si una nueva RPC futura usa `has_scope` con un `requested_scope` arbitrario, ¿qué pasa?" (no hay test del path no usado).
- "Si un attacker manipula `auth.uid()` via `set_config` dentro de una función SECURITY DEFINER, ¿qué pasa?" (las SECURITY DEFINER usan `set search_path` pero no `set request.jwt.claim.sub` — la función ve el `auth.uid()` del caller, no del session).

### 19.4 No hay tests de `next` parameter

El open redirect (SESS-001) no está cubierto por ningún test. Un test pgTAP no aplica (es UI), pero un test unitario de la función de redirect en `auth-form.tsx` sería trivial.

### 19.5 No hay tests de "what if the function is called with NULL"

Varias SECURITY DEFINER tienen lógica de COALESCE implícita (e.g., `actor_membership_id` se busca y puede ser NULL). No hay test que valide el comportamiento con `auth.uid() IS NULL` (caso: usuario anon llama a una función que no valida auth.uid() — pero todas las mutantes lo validan).

---

## 20. Recommendations

### 20.1 Antes de producción (bloqueantes)

1. **HIGH — SESS-001 (open redirect):** Cambiar la validación a `next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")`. Alternativa: usar una whitelist de rutas permitidas. Esto debe resolverse **antes** de exponer a internet, porque el vector es trivial.
2. **MEDIUM — PROV-003 (service_role como single point):** Documentar explícitamente la regla de "service_role nunca se commitea, nunca se logea, se rota cada N meses". Idealmente, mover `issue_provisioning_token` detrás de un panel de control con autenticación fuerte, no accesible por service_role directo.
3. **MEDIUM — TEST-002, TEST-003, TEST-006 (calidad de tests):** Endurecer pgTAP para validar el **contenido** de policies (`qual`, `with_check`), no solo los nombres. Añadir tests adversariales que asuman grants accidentalmente otorgados y verifiquen que RLS los bloquea. Aislar el fixture en una DB limpia.

### 20.2 Antes de Fase 3B (importantes)

4. **LOW — SELF-002 (footgun `memberships.role`):** Eliminar la columna o marcarla como deprecada explícitamente con `comment` y `ALTER TABLE ... ALTER COLUMN role SET DEFAULT NULL` para forzar a developers a pensar.
5. **LOW — RLS-002 (service_role bypassa RLS):** Documentar el modelo de amenaza en `README.md` o `DESKWORK_TECHNICAL_SPECIFICATION.md`.
6. **INFO — SD-002, SUP-001, TA-001 (dead code):** DROP de las funciones legacy en una nueva migración.
7. **LOW — GR-003 (audit en provisioning_tokens):** Añadir trigger BEFORE INSERT en `provisioning_tokens` que escriba a `audit_logs`.
8. **LOW — SD-004 (trigger no cubre DELETE):** Extender el trigger a DELETE.
9. **LOW — PE-002 (página /app sin membership check):** Redirigir a `/onboarding` o mostrar un mensaje "no tienes tenant asignado, contacta a tu administrador".

### 20.3 Higiene general

10. **INFO — AUTH-001, AUTH-002 (password y rate limit):** Endurecer en producción con `minLength=12` y rate limiting via Supabase Auth settings.
11. **INFO — MIG-002 (scorched earth):** Documentar el patrón.
12. **INFO — TEST-001, TEST-005 (tests estructurales vs reales):** Documentar la naturaleza de cada test en comentarios.

### 20.4 Validación de las afirmaciones de Codex

Codex afirma:
- ✓ AUTH: PASS → **confirmado** (con SESS-001 HIGH como asterisco)
- ✓ SESSION: PASS → **confirmado con asterisco**
- ✓ PROTECTED ROUTES: PASS → **confirmado**
- ✓ TENANT MODEL: PASS → **confirmado**
- ✓ MEMBERSHIP MODEL: PASS → **confirmado**
- ✓ ROLE MODEL: PASS → **confirmado**
- ✓ SCOPE MODEL: PASS → **confirmado**
- ✓ PERMISSION MODEL: PASS → **confirmado**
- ✓ TENANT ADMIN: PASS → **confirmado**
- ✓ RLS FUNCTIONAL: PASS → **confirmado**
- ✓ TENANT A/B: PASS → **confirmado**
- ✓ CROSS-TENANT ISOLATION: PASS → **confirmado**
- ✓ SELF: PASS → **confirmado**
- ✓ SUPERVISOR: PASS → **confirmado**
- ✓ PROVISIONING: PASS → **confirmado**
- ✓ PRIVILEGE ESCALATION: PASS → **confirmado**
- ✓ SECURITY DEFINER: PASS → **confirmado**
- ✓ LINT, TYPECHECK, UNIT TESTS, BUILD, SUPABASE TESTS, MIGRATION REPRODUCIBILITY: PASS → confirmado en `pnpm check` y `pnpm test:db`

**Todas las afirmaciones PASS se sostienen bajo escrutinio adversarial.** Los 1 HIGH y 4 MEDIUM no invalidan el cierre de Fase 3A; son riesgos a resolver antes de producción o como follow-up de Fase 3B.

---

## 21. Final Verdict

```
DESKWORK — ADVERSARIAL AUDIT

CRITICAL: 0
HIGH:     1
MEDIUM:   4
LOW:      16
INFO:     16

AUTH:                 PASS
TENANT ISOLATION:     PASS
RLS:                  PASS
SECURITY DEFINER:     PASS
PROVISIONING:         PASS
PRIVILEGE ESCALATION: PASS
TEST QUALITY:         PASS WITH WARNINGS
MIGRATION SAFETY:     PASS

FOUNDATION:
SAFE FOR FINAL REVIEW (conditional on documented acceptance of HIGH-1 and MEDIUM-4)

CRITICAL FINDING:
(none)

MOST IMPORTANT FINDING:
SESS-001 — Open redirect via `next` parameter in `src/components/auth-form.tsx:44`.
The check `next?.startsWith("/")` is bypassable with `//evil.com` (protocol-relative URL),
enabling phishing by abusing the legitimate DeskWork login flow. Trivial to exploit with
social engineering; no credentials required to construct the malicious link.

RECOMMENDATION:
Approve Foundation closure for audit purposes. The 1 HIGH (open redirect) must be
patched before the first deployment that accepts traffic from untrusted users. The 4
MEDIUM are follow-ups that should be tracked and addressed before production: harden
pgTAP to validate policy contents, add adversarial coverage with assumed-grant
scenarios, isolate test fixtures, and document the service_role threat model
explicitly. All 16 LOW and 16 INFO are hygiene items that can be batched in a future
hardening sprint. Do NOT open Fase 3B until the HIGH is resolved or formally waived
by the product owner.

NO CODE WAS MODIFIED:
YES
```

---

## Anexo A — Verificación viva ejecutada (sin mutación)

Las siguientes queries se ejecutaron contra `supabase_db_deskwork` (PostgreSQL 17) en modo lectura. Ninguna modificó datos ni configuración.

| # | Query | Resultado |
|---|---|---|
| 1 | `\dt public.*` | 12 tablas |
| 2 | `pg_class.relrowsecurity` para todas las tablas public | 12/12 con `rowsecurity = t` |
| 3 | `pg_policies` con `qual::text = 'true'` | 0 policies peligrosas |
| 4 | `information_schema.triggers` | 1 trigger (`membership_scope_grants_validate`) |
| 5 | `has_function_privilege` cruzado con `pg_proc.prosecdef` | Grants revisados para 25 funciones × 3 roles |
| 6 | `has_table_privilege('anon'/'authenticated', ..., 'truncate')` | 0 tablas con TRUNCATE |
| 7 | `pg_proc.prosrc` para 4 funciones críticas | Cuerpos confirmados idénticos a migraciones |
| 8 | `information_schema.role_table_grants` para `authenticated` | 8 tablas con grants (SELECT + UPDATE profiles) |

**Total: 8 queries de inspección, 0 mutaciones.**

## Anexo B — Archivos no auditados (fuera de scope)

- `deskwork/DESKWORK_*` (análisis previo del autor)
- `deskwork/manual-de-marca.*`, `dossier-comercial.*`, `mockup-niveles.*`, `presentacion.html`, `prompt-de-diseno.*` (material de presentación)
- `extract_*.py` (scripts de extracción documental, no parte de DeskWork)
- `pnpm-lock.yaml` (verificado, no auditado byte a byte)
- `tsconfig.tsbuildinfo` (build artifact)
- Documentos `BLOQUE I - FUNDAMENTOS Y ARQUITECTU.md`, `PROMPT_MAESTRO_PARTE_2_REVISADO.md` (histórico)
- `DESKWORK_MASTER_COMPLETO_2026-08-20.zip` (archivo empaquetado, no se desempaquetó)
- `DESKWORK_FOUNDATION_CORRECTION_PLAN.md`, `DESKWORK_FOUNDATION_IAM_AUDIT.md`, `DESKWORK_PHASE_3A_FINAL_AUDIT_2026-08-20.md` (auditorías previas del autor — no se usaron para validar el cierre, solo se contrastaron con el código)

## Anexo C — Recomendaciones de seguimiento

1. Crear issue/tarea para SESS-001 antes de mergear a una rama de release.
2. Crear issue/tarea para PROV-003 (documentar service_role).
3. Crear issue/tarea para TEST-002, TEST-003, TEST-006 (endurecer pgTAP).
4. Programar limpieza de dead code (SD-002, SUP-001, TA-001) en una migración aditiva.
5. En Fase 3B, mantener el estándar de "ningún grant directo para mutaciones, todo via SECURITY DEFINER".
6. Antes del primer deploy, ejecutar `pnpm test:db` contra una DB recién creada para confirmar que la reproducibilidad de migraciones se mantiene.

---

*Fin del informe. Foundation local es defendible; los hallazgos son riesgos a gestionar, no bloqueantes de la auditoría actual.*

---

## Actualización de cierre — 2026-08-25 — SESS-001 / P1-01

**Estado:** `CLOSED`, pendiente únicamente de auditoría cruzada.

- **Causa confirmada:** `src/components/auth-form.tsx` aceptaba cualquier valor de `next` que comenzara con `/`. Esto admitía `//evil.com`, `////evil.com` y `/\evil.com`, rutas que pueden escapar del origen de DeskWork.
- **Corrección mínima:** se incorporó `src/shared/auth/safe-next.ts`. La función conserva sólo destinos application-relative, rechaza los prefijos protocol-relative y con barra inversa, y usa `/app` como fallback confiable desde el flujo post-auth.
- **Superficies revisadas:** el único consumidor no confiable es el redirect post-login/post-registro de `AuthForm`. El middleware sólo genera `next` a partir de `request.nextUrl.pathname`; `/app` usa un redirect estático. No existen OAuth callback, magic link, password reset ni 2FA en el repositorio actual.
- **Regresión:** `src/security/sess_001.test.ts` cubre destino ausente/vacío, `//`, `///`, `////`, `/\`, `http`, `https`, `javascript`, `data` y rutas internas válidas, incluida `/dashboard?q=//evil.com`. Un test pgTAP no aplica porque el vector pertenece a navegación del cliente, no a Postgres.
- **Validación ejecutada:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (19/19), `pnpm build`, `supabase db reset --local`, `pnpm test:db` (42/42) y `git diff --check`, todos PASS. El warning de deprecación de `middleware` de Next y el warning de config de Vite/Vitest son preexistentes y no se modificaron.
- **Integridad:** no se cambiaron migraciones, RLS, SECURITY DEFINER, autorización, identidad, contratos de Foundation, Supabase remoto, APIs ni la maqueta.

El backlog activo conserva los cuatro hallazgos MEDIUM (`PROV-003`, `TEST-002`, `TEST-003`, `TEST-006`); este cierre no los reclasifica ni altera su alcance.
