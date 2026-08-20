# DESKWORK — FINAL AUDIT FASE 3A

**Fecha:** 20 de agosto de 2026  
**Alcance:** auditoría únicamente. No se implementaron correcciones ni funcionalidades de Ticketing Core durante esta ejecución.

## 1. Executive Summary

**Resultado: NO-GO.** DeskWork no está técnicamente autorizado para iniciar Ticketing Core.

La Foundation contiene una base de esquema IAM/RBAC/RLS en migraciones, pero no hay evidencia de una instalación ejecutable y validada. El repositorio fue movido desde `C:\DeskWork` a `C:\Users\cargi\Cóndor Group\0. Matriz\Cóndor HUBTEC-LAB\Frabric Lab\Proyectos\DeskWork`; las dependencias instaladas conservan junctions a la ruta eliminada. Como consecuencia, `lint`, `typecheck`, `test` y `build` fallan antes de ejecutar. Docker Desktop no expone su daemon, no hay Supabase local en ejecución y no se han aplicado ni probado las migraciones actuales. Además, Auth no está implementado en la aplicación y la prueba pgTAP sigue validando políticas y funciones retiradas/reemplazadas por la segunda migración.

La decisión no refleja que el modelo de autorización sea innecesario; refleja que aún no es reproducible ni verificable de extremo a extremo.

## 2. Estado real del repositorio

| Componente | Estado | Ubicación | Evidencia | Dependencias | Riesgo |
|---|---|---|---|---|---|
| Proyecto Next.js | IMPLEMENTADO NO VALIDADO | `package.json`, `src/app` | Next 16 y scripts declarados; build no ejecuta | Dependencias reparadas | Alto |
| Frontend | PARCIAL | `src/app/page.tsx` | Una página estática y dos health routes | Next.js | Alto |
| Backend/API | PARCIAL | `src/app/api/health/*` | Sólo `live` y `ready`; no hay BFF de negocio | Variables de entorno | Alto |
| Supabase esquema | IMPLEMENTADO NO VALIDADO | `supabase/migrations/*.sql` | Dos migraciones presentes, no aplicadas en esta auditoría | Docker/Supabase local | Blocker |
| IAM/RBAC | IMPLEMENTADO NO VALIDADO | migración `20260819000200...`, `src/modules/identity` | Roles/scopes/permisos están declarados | PostgreSQL migrado | Alto |
| Pruebas unitarias | IMPLEMENTADO NO VALIDADO | `src/modules/identity/*.test.ts` | Cuatro casos estáticos; Vitest no inicia | Dependencias reparadas | Alto |
| Prueba pgTAP | ROTO | `supabase/tests/foundation_rls.sql` | Aún espera política y función del modelo anterior | Supabase local | Blocker |
| Auth de aplicación | NO IMPLEMENTADO | — | No hay cliente Supabase, login, logout, middleware ni protección de rutas | Supabase/Auth | Blocker |
| Storage | NO IMPLEMENTADO | — | No hay buckets, políticas ni cliente | Supabase Storage | No necesario todavía |
| Control de versiones/CI | NO IMPLEMENTADO | raíz | No existe `.git` ni configuración CI/CD | Repositorio versionado | Medio |

## 3. Arquitectura actual

- **Framework:** Next.js 16, React 19, TypeScript, Vitest y ESLint.
- **Backend:** sólo dos Route Handlers de salud; no hay servicios de negocio ni API de autenticación.
- **Datos propuestos:** Supabase/PostgreSQL, configurado localmente en `supabase/config.toml` para puertos 54321/54322.
- **Modelo Foundation propuesto:** `tenants`, `profiles`, `areas`, `memberships`, `teams`, `team_memberships`, `audit_logs`, roles funcionales, permisos, concesiones de scope y tokens de provisioning.
- **Modelo no existente aún:** Ticket, categoría, estado, prioridad, asignación, comentario, adjunto, evento y temporizador. Su ausencia es esperada mientras Fase 3B siga sin autorización.

## 4. Supabase

| Verificación | Resultado | Evidencia |
|---|---|---|
| Configuración local | PARTIAL | `supabase/config.toml` declara `project_id = "deskwork"`, API 54321 y DB 54322. |
| Migración inicial | IMPLEMENTADO NO VALIDADO | `supabase/migrations/20260819000100_foundation.sql`. |
| Migración IAM correctiva | IMPLEMENTADO NO VALIDADO | `supabase/migrations/20260819000200_authorization_foundation.sql`. |
| Proyecto/cliente Supabase | FAIL | No se encontró cliente `createClient`/`createServerClient`, ni variables reales configuradas. |
| Supabase local | FAIL | `docker version` devolvió error de conexión al pipe `dockerDesktopLinuxEngine`. |
| Instalación limpia reproducible | FAIL | La instalación Node no puede completarse en la ruta actual y las migraciones no se ejecutaron. |
| Seeds | NO IMPLEMENTADO | No existe directorio/archivo de seed. |

## 5. Database

### Entidades frente al MVP

| Entidad | Estado | Evidencia |
|---|---|---|
| Tenant | EXISTE | Tabla `public.tenants` en migración inicial. |
| User | PARCIAL | `auth.users` es externo a la migración y `profiles` existe. Auth no está integrado en la app. |
| Membership | EXISTE | `public.memberships`, con estado, rol legado, rol funcional y capacidad `is_tenant_admin`. |
| Role | EXISTE | Enum `functional_role` y tabla `functional_role_permissions`. |
| Permission | EXISTE | `authorization_permissions`, asignaciones funcionales y permisos de tenant admin. |
| Ticket | NO EXISTE | No hay tabla ni migración. |
| Ticket Category | NO EXISTE | — |
| Ticket Status | NO EXISTE | — |
| Ticket Priority | NO EXISTE | — |
| Ticket Assignment | NO EXISTE | — |
| Ticket Comment | NO EXISTE | — |
| Ticket Attachment | NO EXISTE | — |
| Ticket Event | NO EXISTE | — |
| Ticket Timer | NO EXISTE | — |

Las tablas, constraints, índices, funciones y triggers sólo tienen evidencia estática en las migraciones; no hay evidencia de que una base las haya aceptado en orden ni de que las políticas resultantes estén activas.

## 6. Authentication

**Estado: NO IMPLEMENTADO.**

No existen código de registro, login, logout, recuperación/persistencia de sesión, middleware, protección de rutas, cliente browser/server de Supabase ni manejo de usuario autenticado. La ruta `GET /api/health/ready` únicamente inspecciona la presencia de dos variables públicas y devuelve `503` si faltan.

**Impacto:** no se puede ejercer una sesión real contra RLS desde la aplicación ni demostrar el flujo de usuario requerido para el MVP.

## 7. IAM

**Estado: IMPLEMENTADO NO VALIDADO.**

La segunda migración define los cinco roles aprobados: `technical_lead`, `director`, `supervisor`, `administrative` y `operator`. Declara scopes `institution`, `department`, `team` y `self`; separa `is_tenant_admin`; incluye catálogo de permisos y concesiones `membership_scope_grants`.

El código TypeScript en `src/modules/identity/roles.ts` refleja el catálogo, pero no es consumido por rutas, middleware ni cliente. La autoridad propuesta está en funciones PostgreSQL (`has_permission`, `has_scope`, `can_read_*`), pero no existe instancia donde comprobarlas.

**Riesgo alto:** `has_scope` concede cualquier scope a quien tenga `is_tenant_admin`. Esto debe ser una decisión explícita y testeada: la capacidad técnica no debe convertirse accidentalmente en sustituto del rol funcional o del scope institucional.

## 8. Authorization

**Estado: PARTIAL.**

La migración correctiva reemplaza las políticas CRUD amplias por lecturas mínimas y RPC `SECURITY DEFINER` para cambios organizacionales. Contiene validaciones contra auto-cambio de rol, scope, tenant admin y desactivación propia. El bootstrap propuesto usa token con hash, expiración y consumo atómico.

No hay endpoints, middleware, API ni sesión autenticada que invoque estas funciones. Tampoco hay evidencia de autorización server-side o de manejo correcto de `service_role` en una aplicación real.

| Caso mínimo | Resultado | Evidencia |
|---|---|---|
| A — Tenant A lee/modifica Tenant B | NO TESTABLE | No hay Supabase local ni prueba funcional ejecutada. |
| B — Rol insuficiente ejecuta operación restringida | NO TESTABLE | RPCs existen en SQL, pero no se ejecutaron. |
| C — Usuario accede a información ajena | NO TESTABLE | Políticas están en migración, sin sesión DB real. |
| D — No autenticado accede a recurso protegido | NO TESTABLE | No hay cliente/API autenticable en ejecución. |
| E — Rol limitado ejecuta administración | NO TESTABLE | No hay pruebas integradas de RPC/RLS. |

## 9. RLS

La siguiente matriz es estática: describe las migraciones y **no constituye un PASS de seguridad**.

| Tabla | RLS declarado | SELECT | INSERT | UPDATE | DELETE | Criterio propuesto | Resultado |
|---|---|---|---|---|---|---|---|
| `tenants` | Sí | miembro activo propio | Ninguno directo | Ninguno directo | Ninguno directo | `tenant_id`/membership | NO TESTABLE |
| `profiles` | Sí | propio o directorio permitido | Ninguno directo | propio | Ninguno directo | identidad + scope | NO TESTABLE |
| `areas` | Sí | área permitida | RPC | RPC | RPC | tenant + department/institution | NO TESTABLE |
| `memberships` | Sí | membresía permitida | RPC | RPC | RPC | tenant + role + scope | NO TESTABLE |
| `teams` | Sí | equipo permitido | RPC | RPC | RPC | tenant + team/institution | NO TESTABLE |
| `team_memberships` | Sí | equipo y miembro permitidos | RPC | RPC | RPC | tenant + team + member | NO TESTABLE |
| `audit_logs` | Sí | actor propio o auditoría institucional | función interna | Ninguno directo | Ninguno directo | tenant + permiso + scope | NO TESTABLE |
| catálogos de permisos | Sí | Ninguna política cliente | Ninguno | Ninguno | Ninguno | acceso sólo vía funciones | NO TESTABLE |
| `membership_scope_grants` | Sí | membresía permitida | RPC | RPC | RPC | tenant + scope | NO TESTABLE |
| `provisioning_tokens` | Sí | Ninguna política cliente | sólo `service_role` | función interna | Ninguno | token hash/servicio | NO TESTABLE |

**Posibilidades no descartadas:** acceso cross-tenant, acceso no autorizado y elevación de privilegios son **BLOCKERS de validación**, no hallazgos de explotación confirmados. La base no ha sido desplegada ni sometida a pruebas con sesiones reales.

## 10. Tenant Isolation

**Estado: PARTIAL.** Las tablas de negocio Foundation incluyen `tenant_id`, claves foráneas compuestas y funciones que filtran por tenant. Esto es una buena base de diseño. No existe una prueba ejecutada de Tenant A/B, por lo que el aislamiento no puede marcarse como validado.

## 11. Frontend

**Estado: MOCKUP VISUAL / NO FUNCIONAL.**

La aplicación Next actual consta de una página con el texto “Foundation ready” y no tiene navegación, formularios, login, área de usuario/técnico/administrativa, responsive comprobado, estados de carga, errores o conexión backend. El mockup HTML histórico es un artefacto visual independiente, no una funcionalidad integrada.

## 12. Backend

**Estado: PARCIAL.**

Sólo existen:

- `GET /api/health/live`: respuesta fija `ok`.
- `GET /api/health/ready`: comprueba presencia de dos variables de entorno.

No hay endpoints de Auth, tenants, memberships, roles, provisioning ni tickets; no hay servicios de aplicación ni cliente Supabase. Ningún dato proviene actualmente de Supabase.

## 13. Tests

| Test | Resultado | Cobertura funcional | Fallas / riesgo |
|---|---|---|---|
| `roles.test.ts` | NO TESTABLE | Catálogo TypeScript de cinco roles | Vitest no inicia por instalación rota; no comprueba DB/RLS. |
| `supervisor-scope.test.ts` | NO TESTABLE | Lógica TypeScript de scope explícito | Vitest no inicia; no comprueba políticas reales. |
| `supabase/tests/foundation_rls.sql` | ROTO | Sólo 10 aserciones estructurales | Espera la política eliminada `admins read tenant audit logs` y la función antigua `can_supervisor_read_membership`; no cubre el modelo correctivo ni sesiones Tenant A/B. |

**Evidencia de ejecución:** `pnpm test` falló antes de lanzar Vitest, al intentar reparar dependencias en la nueva ruta y recibir `EPERM`.

## 14. Build / Runtime

| Comando | Resultado | Evidencia |
|---|---|---|
| `node --version` | PASS | `v24.19.0`. |
| `pnpm --version` | PASS | `11.19.0`. |
| `pnpm lint` | FAIL | `EPERM` al crear temporal; pnpm intenta `install` y falla. |
| `pnpm typecheck` | FAIL | Mismo fallo previo a TypeScript. |
| `pnpm test` | FAIL | Mismo fallo previo a Vitest. |
| `pnpm build` | FAIL | Mismo fallo previo a Next build. |
| Supabase/pgTAP | FAIL | Docker daemon no disponible. |
| `dev/start` | NOT TESTED | Dependencias actuales no son ejecutables. |

El enlace `node_modules/next` apunta a `C:\DeskWork\node_modules\.pnpm\...`, directorio que ya no existe. Es la causa comprobada de la instalación no reproducible en la ruta actual.

## 15. Configuration

- Hay `.env.example`, sin secretos reales expuestos.
- No existe `.env.local` en el proyecto auditado.
- Las variables Supabase se declaran como opcionales en `src/shared/config/env.ts`; por tanto, la compilación no garantiza que el servicio esté configurado.
- `supabase/config.toml` existe, pero no identifica una instancia en ejecución.
- No hay Dockerfile, compose de aplicación, CI/CD ni repositorio Git en la raíz actual.
- La versión declarada de Supabase CLI en `package.json` es `^2.49.0`, no una fijación a 2.115.0; no se pudo confirmar binario local ejecutable.

## 16. Technical Debt

| Prioridad | Deuda |
|---|---|
| BLOCKER | Dependencias rotas por traslado de ruta; no se ejecutan las verificaciones básicas. |
| BLOCKER | Docker/Supabase local no operativo; migraciones y RLS sin evidencia real. |
| BLOCKER | Auth y protección de rutas inexistentes. |
| HIGH | pgTAP está desalineado con la migración IAM y no prueba autorización funcional. |
| HIGH | No hay cliente Supabase ni API/server authorization que ejercite el modelo de DB. |
| HIGH | `tenant_admin` obtiene scope total por `has_scope`; requiere una decisión y test explícitos. |
| MEDIUM | Rol legado `mvp_role` permanece junto al modelo nuevo; requiere una estrategia de eliminación/remediación validada. |
| MEDIUM | No hay Git/CI para preservar y verificar la Foundation. |
| LOW | Página home afirma “Foundation ready” sin evidencia de ejecución. |

## 17. Blockers

1. **Entorno Node no reproducible.**
   - Causa: junctions de `node_modules` apuntan a la antigua `C:\DeskWork` eliminada.
   - Archivos/ubicación: `node_modules/next` y dependencias vinculadas en la nueva raíz.
   - Impacto: no se pueden ejecutar lint, typecheck, test, build ni dev.
   - Corrección recomendada: restaurar una ruta de proyecto estable y realizar instalación reproducible desde el lockfile; no editar código antes de ello.
   - Prueba necesaria: `pnpm install --frozen-lockfile`, seguido de los cuatro comandos de calidad.

2. **Supabase/RLS no validables.**
   - Causa: Docker Desktop no tiene daemon disponible.
   - Impacto: migraciones, funciones, triggers, pgTAP, bootstrap y aislamiento multi-tenant no se ejecutan.
   - Corrección recomendada: iniciar Docker Desktop y levantar Supabase local con la CLI versionada; aplicar migraciones en una base local vacía.
   - Prueba necesaria: `supabase start`, `supabase db reset`, `supabase test db` y pruebas reales autenticadas Tenant A/B.

3. **Autenticación y sesiones no existen en la aplicación.**
   - Causa: no hay cliente Supabase/Auth, middleware ni rutas/formularios de sesión.
   - Impacto: Foundation no puede ejercer la identidad que RLS necesita.
   - Corrección recomendada: implementar y probar la capa mínima Auth de Fase 3A antes de Ticketing.
   - Prueba necesaria: registro/login/logout/sesión/restauración/protección de rutas contra Supabase local.

4. **Prueba de base obsoleta.**
   - Causa: `foundation_rls.sql` aún espera política y función del modelo previo.
   - Impacto: no valida la migración IAM vigente; la aserción de política de `audit_logs` fallará si se aplica la migración correctiva.
   - Corrección recomendada: reescribirla con identidades Auth y casos reales de tenant, self, scope, privilegios y provisioning.
   - Prueba necesaria: resultado pgTAP completo y casos negativos ejecutados.

## 18. High Risk

1. El alcance efectivo de `is_tenant_admin` debe confirmarse: la función actual le concede todos los scopes.
2. Las RPC `SECURITY DEFINER` y las restricciones de privilegios no han pasado un despliegue ni pruebas negativas.
3. El perfil global puede ser actualizado por la RPC de creación de membresía ante conflictos; se requiere revisar su impacto multi-tenant al implementar/validar la capa de servicio.
4. No existe mecanismo de versión/CI que permita rastrear o repetir el estado auditado.

## 19. Medium / Low Risk

- **MEDIUM:** `mvp_role` histórico queda en `memberships`; aunque documentado como legado, aún necesita una migración de datos/control operacional verificada.
- **MEDIUM:** variables relevantes son opcionales en Zod y no fallan de forma temprana.
- **LOW:** documentación y UI usan afirmaciones de “Foundation ready” que no coinciden con la evidencia actual.

## 20. Evidence

Comandos ejecutados el 20-08-2026:

```text
Test-Path C:\DeskWork                         -> False
docker version --format {{.Server.Version}}   -> error: dockerDesktopLinuxEngine unavailable
node --version                                -> v24.19.0
pnpm --version                                -> 11.19.0
pnpm lint                                     -> FAIL (EPERM / pnpm install)
pnpm typecheck                                -> FAIL (EPERM / pnpm install)
pnpm test                                     -> FAIL (EPERM / pnpm install)
pnpm build                                    -> FAIL (EPERM / pnpm install)
```

Evidencia de enlace roto:

```text
node_modules/next -> C:\DeskWork\node_modules\.pnpm\next@...\node_modules\next
```

La ruta objetivo no existe. No se halló `.env.local`, `.git`, cliente Supabase ni código de autenticación en `src`.

## 21. Comparison against Fase 3A criteria

| Criterio | Resultado | Evidencia |
|---|---|---|
| Proyecto reproducible | FAIL | Enlaces de dependencias rotos; instalación falla. |
| Build funcionando | FAIL | `pnpm build` no llega a Next. |
| Supabase operativo | FAIL | Docker daemon no disponible. |
| Migraciones operativas | NOT TESTED | Archivos presentes, sin ejecución local. |
| Auth funcionando | FAIL | No implementada. |
| Roles definidos | PARTIAL | Definidos en SQL/TS, sin DB ejecutada. |
| Memberships definidos | PARTIAL | Modelo SQL presente, no validado. |
| Permisos definidos | PARTIAL | Catálogo SQL/TS presente, no validado. |
| RLS funcionando | NOT TESTED | Sólo evidencia estática. |
| Tenant isolation validado | FAIL | No hay prueba A/B ejecutada. |
| Foundation documentada | PASS | Existen especificaciones, plan y auditorías. |
| Frontend base operativo | FAIL | Página estática; no hay Auth ni flujos. |
| Backend base operativo | PARTIAL | Sólo health checks no validados en runtime. |
| Tests básicos ejecutables | FAIL | pnpm/Vitest no arranca y pgTAP es obsoleto. |

## 22. Recommendation

Permanecer en Foundation/Fase 3A. Primero se debe recuperar un entorno reproducible y obtener evidencia real de migrations + Auth + RLS antes de diseñar o desarrollar Ticketing Core.

## 23. FINAL DECISION

# NO-GO

## 24. Conditions for next phase

No se puede autorizar Fase 3B hasta aceptar todas estas condiciones:

1. El proyecto vive en una ruta estable y `pnpm install --frozen-lockfile`, lint, typecheck, tests y build pasan.
2. Supabase local inicia y una base limpia aplica ambas migraciones sin error.
3. Auth mínimo funciona con sesiones reales y rutas protegidas.
4. Se reemplaza la prueba pgTAP obsoleta y se ejecutan pruebas negativas de Tenant A/B, self, supervisor, roles institucionales, bootstrap y autoelevación.
5. Se decide y prueba el alcance real de `tenant_admin`, separado del rol funcional.
6. Las conclusiones anteriores se documentan con resultados ejecutados, no sólo con código.

## 25. Proposed next step

**Restaurar la reproducibilidad del entorno en la nueva ruta (dependencias y Docker/Supabase local) y volver a ejecutar la auditoría de Foundation antes de modificar código o iniciar Ticketing Core.**
