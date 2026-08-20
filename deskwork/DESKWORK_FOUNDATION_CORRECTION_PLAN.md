# DESKWORK — Plan de corrección Foundation IAM/RBAC/RLS

**Fecha:** 19 de agosto de 2026  
**Alcance autorizado:** exclusivamente Foundation/Fase 3A. No se crean tickets, comentarios, adjuntos, dashboards, workflows ni integraciones.

## Arquitectura actual

La Foundation existente tiene `tenants`, `profiles`, `areas`, `memberships`, `teams`, `team_memberships` y `audit_logs`. Usa el enum legado `mvp_role` con cuatro valores y políticas RLS que combinan ese enum con `area_id` y reporte directo. Su bootstrap acepta parámetros de tenant de cualquier usuario `authenticated` sin membresía y le entrega `tenant_admin`.

## Arquitectura objetivo

- `functional_role`: `technical_lead`, `director`, `supervisor`, `administrative`, `operator`.
- `is_tenant_admin`: capacidad administrativa técnica separada, concedida explícitamente; nunca derivada del rol funcional ni del primer acceso.
- Catálogo de permisos y asignaciones por rol en base de datos. El formato canónico es `resource.action.scope` y contempla pares `request`/`execute`.
- `membership_scope_grants`: concesiones inequívocas de `institution`, `department` o `team`. `self` es estructural: la propia membresía y no una concesión ampliable por el usuario.
- Funciones de autorización en PostgreSQL para identidad, membresía activa, permiso y scope. Las políticas RLS las usan como autoridad final.
- Operaciones sensibles exclusivamente por RPC `SECURITY DEFINER` protegida, con validación de actor, tenant, permiso, scope, autoelevación y auditoría.

## Migración necesaria

Se añadirá una migración aditiva, sin borrar tablas ni datos:

1. Crear enums, catálogos y tablas de roles, permisos, scopes y provisioning.
2. Añadir `functional_role` e `is_tenant_admin` a `memberships`.
3. Conservar `role`/`mvp_role` como dato legado sin uso en la autorización nueva. Las filas existentes se inician como `operator` sin capacidad `tenant_admin`; un administrador confiable deberá conceder roles/capacidades explícitamente. Esto evita convertir silenciosamente una capacidad histórica en un privilegio nuevo.
4. Ampliar `audit_logs` con resultado, origen, motivo, correlación y membresía del actor.
5. Sustituir todas las políticas Foundation por políticas de lectura mínima y denegar escrituras directas de identidad/organización.
6. Retirar el bootstrap antiguo y crear un bootstrap de dos parámetros basado exclusivamente en token provisionado.

## Archivos que se modificarán

- `src/modules/identity/roles.ts` y sus pruebas: catálogo funcional y permisos canónicos.
- `src/modules/identity/supervisor-scope.ts` y sus pruebas: scope explícito de departamento/equipo, sin inferencia por reporte directo.
- `supabase/tests/foundation_rls.sql`: pruebas funcionales con sesiones `authenticated` y JWT simulado.
- `DESKWORK_PHASE_3A_REPORT.md`: informe de cierre tras la ejecución.

## Archivos nuevos

- `supabase/migrations/20260819000200_authorization_foundation.sql`.
- Este plan y el informe final de validación, si corresponde.

## Estrategia de bootstrap

Se adopta **Provisioning Token**. Un proceso de control-plane, usando credenciales de servicio fuera del cliente, emite un token aleatorio con hash almacenado, vencimiento y una configuración inicial explícita. El token contiene la definición autorizada de tenant, rol funcional inicial y capacidad `tenant_admin`, que por defecto es falsa. `bootstrap_tenant(token, display_name)` consume el token de forma atómica y nunca acepta del usuario el slug, rol ni capacidad. Registra el consumo y el bootstrap. Sólo `service_role` puede emitir tokens; un cliente autenticado sólo puede canjear uno válido.

## Estrategia RBAC y scope

Los roles funcionales reciben permisos desde tablas semilla. El permiso se evalúa en la base de datos mediante `has_permission`. Los roles institucionales requieren además una concesión `institution`; un supervisor requiere concesiones explícitas de departamento y/o equipo. La propia membresía satisface `self`. `tenant_admin` posee un conjunto técnico de permisos propio y auditado, sin cambiar el rol funcional.

## Estrategia RLS y auditoría

RLS valida membresía activa, tenant, permiso y scope en cada lectura. No se habilitan políticas CRUD genéricas sobre membresías, scopes, equipos ni áreas. Las RPC de gestión validan que el actor no pueda modificar su propia membresía, rol, scope ni capacidad administrativa. Cada operación sensible inserta un evento inmutable con actor, objeto, antes/después, resultado, origen, correlación y motivo.

## Impacto sobre datos existentes

No se eliminan registros. La migración no mapeará automáticamente el enum histórico a privilegios nuevos. Si existe una base previa, las personas continuarán como miembros pero deben ser remediadas explícitamente por el control-plane: asignar rol funcional, scopes y, sólo si procede, capacidad `tenant_admin`. Esta decisión es conservadora y evita privilegios heredados ambiguos.

## Plan de pruebas

Las pruebas pgTAP sembrarán dos tenants, dos departamentos, equipos y usuarios Auth de prueba. Ejecutarán consultas como `authenticated`, con el `sub` JWT de cada caso, para comprobar aislamiento A/B, self, supervisor departamental/equipo, Nivel 0 sin `tenant_admin`, Nivel 1 institucional, ausencia de autoelevación y provisioning válido, expirado, reutilizado e inválido. Además se ejecutarán lint, typecheck, pruebas unitarias y build. Supabase local/pgTAP se ejecutarán sólo cuando Docker Desktop esté disponible.
