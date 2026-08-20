# DeskWork — Informe Fase 3A: Foundation

Fecha: 2026-08-19  
Estado: foundation creada; validación de runtime pendiente de completar en un entorno con instalación de paquetes y Supabase disponible.  
Límite respetado: no se implementó Ticket Core (Fase 3B).

## Qué se creó

- Scaffold Next.js + TypeScript modular en `src/`.
- Configuración de calidad: TypeScript strict, ESLint, Vitest, scripts de build/check y `.gitignore`.
- `.env.example` sin secretos y README de ejecución.
- Endpoints de salud: `GET /api/health/live` y `GET /api/health/ready`.
- Módulo de identidad con los cuatro roles aprobados y la regla de alcance del supervisor.
- Migración SQL versionada `supabase/migrations/20260819000100_foundation.sql` con:
  - `tenants`, `profiles`, `areas`, `memberships`, `teams`, `team_memberships` y `audit_logs`.
  - Tenant único por cliente/organización en el MVP; no existe selector multi-tenant ni módulo `organizations`.
  - Roles `requester`, `agent`, `supervisor`, `tenant_admin`.
  - RLS, helper functions y políticas de administración/alcance.
  - Alcance del Supervisor restringido a sí mismo, dependientes directos y área asignada; nunca tenant-wide por defecto.
  - Bootstrap restringido de primer tenant/admin y equipo inicial `Soporte TI`.
- Pruebas unitarias iniciales de roles y alcance del supervisor.
- Esqueleto de prueba pgTAP para verificar esquema/políticas RLS al disponer de Supabase local.
- Actualización de `DESKWORK_TECHNICAL_SPECIFICATION.md` v1.1 para reflejar la decisión aprobada de Supervisor.

## Qué funciona / verificado

| Verificación | Resultado |
|---|---|
| Estructura de Fase 3A creada | Sí, verificada por inventario de archivos. |
| Configuración TypeScript/Next/Vitest/ESLint presente | Sí, inspección estática. |
| Migración foundation y prueba pgTAP presentes | Sí, inspección estática. |
| Corrección de alcance del Supervisor en especificación | Sí, aplicada. |
| Node.js y pnpm disponibles | Sí: Node v24.19.0, pnpm 11.19.0. |
| Docker / Supabase local | No disponible: Docker no está instalado. |
| Variables Supabase reales | No disponibles en el entorno. |

## Pruebas pasadas

- No hay pruebas de aplicación ejecutadas todavía: las dependencias no se lograron instalar de forma completa en este entorno.
- La validación final de lint/typecheck/Vitest/build y pgTAP queda pendiente.

## Pruebas fallidas o bloqueadas

| Prueba | Estado | Motivo |
|---|---|---|
| `pnpm install` | Bloqueada | El sandbox no tenía acceso al registro; tras aprobar red, el comando resolvió/descargó paquetes pero no materializó `node_modules` ni `pnpm-lock.yaml` antes de finalizar en este entorno. |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | No ejecutadas | Dependen de una instalación exitosa. |
| `pnpm test:db` / pgTAP RLS | Bloqueada | Requiere Supabase local y Docker, que no está instalado, o un proyecto Supabase configurado. |
| Auth real y RLS end-to-end | Bloqueada | No hay URL/clave publicable de proyecto Supabase ni usuarios de prueba. |

## Decisiones tomadas

- Stack foundation: Next.js + TypeScript + Supabase (Postgres/Auth/Storage/RLS), como aprobó la arquitectura.
- Modelo MVP: tenant = cliente = organización; se pospone multi-organization y selector multi-tenant.
- RBAC: solicitante, técnico, supervisor y administrador tenant.
- Supervisor: lectura limitada a propio/dependientes directos/área asignada; sin mutación libre de tickets y sin tenant-wide por defecto.
- No se creó aún ninguna tabla de tickets, categorías, servicios, asignaciones, comentarios, adjuntos de ticket, SLA/outbox ni UI operacional: pertenecen a Fases 3B/3C/3D.

## Archivos creados

```text
.env.example
.gitignore
README.md
eslint.config.mjs
next.config.ts
package.json
tsconfig.json
vitest.config.ts
src/app/layout.tsx
src/app/page.tsx
src/app/api/health/live/route.ts
src/app/api/health/ready/route.ts
src/shared/config/env.ts
src/modules/identity/roles.ts
src/modules/identity/roles.test.ts
src/modules/identity/supervisor-scope.ts
src/modules/identity/supervisor-scope.test.ts
supabase/config.toml
supabase/migrations/20260819000100_foundation.sql
supabase/tests/foundation_rls.sql
DESKWORK_PHASE_3A_REPORT.md
```

## Pendientes para cerrar Fase 3A

1. Completar `pnpm install` y generar `pnpm-lock.yaml`.
2. Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`; corregir únicamente defects de Foundation si aparecen.
3. Provisionar/proporcionar Supabase local con Docker o proyecto Supabase de desarrollo y aplicar la migración.
4. Ejecutar pgTAP RLS y pruebas de dos tenants/usuarios: el Tenant A no puede leer/escribir/inferir datos del Tenant B.
5. Validar bootstrap Auth real, incluyendo el flujo de primer administrador.
6. Definir/probar la política de migraciones y entornos (local, staging, producción).

## Riesgos

- La migración RLS todavía no ha sido ejecutada contra PostgreSQL; la inspección no sustituye pruebas de política reales.
- El bootstrap de tenant debe validarse contra el proveedor Auth elegido para confirmar que no deja rutas de elevación de privilegio.
- El modelo de supervisor asume `area_id` y `manager_membership_id`; el piloto debe cargar esos datos correctamente para que el alcance sea útil.
- No hay política final de dominios, adjuntos, backups ni disponibilidad; siguen siendo condiciones de producción, no motivo para iniciar únicamente 3B una vez Foundation esté validada.

## Comandos de validación

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
supabase start
supabase db reset
pnpm test:db
```

## Siguiente paso

No iniciar Fase 3B automáticamente. Primero completar y aprobar las validaciones pendientes de Foundation. Luego se requiere autorización explícita para implementar Ticket Core.
