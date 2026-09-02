-- DeskWork Ticketing Core / TKT-026 Phase 2A-1.
-- Adición del estado `dead` al enum `notification_status`.
--
-- DECISIÓN DE DISEÑO:
--   `dead` es estado terminal. Una notificación llega a `dead` cuando
--   `complete_notification(..., 'failed', error)` incrementa `attempt_count`
--   hasta el cap hard-coded (5). NO se asigna por re-enqueue automático.
--
-- ROLLBACK — IMPORTANTE:
--   PostgreSQL 17 NO SOPORTA `ALTER TYPE ... DROP VALUE` para enums.
--   Verificado vía `\h ALTER TYPE` (solo `ADD VALUE` y `RENAME VALUE`).
--   Esta migration es ESTRICTAMENTE FORWARD-ONLY. Una vez aplicada, el
--   valor `dead` no puede eliminarse del enum sin recrear el tipo
--   (operación invasiva que requiere migrar todas las filas que lo usen).
--
--   Si se necesita revertir funcionalmente la semántica de `dead`:
--     1) Reemplazar `complete_notification` con una versión que NO
--        use el valor `dead` (recoverable desde `git log`).
--     2) Reemplazar `enqueue_ticket_notifications` con una versión
--        que NO use el valor `dead`.
--     3) NO intentar `ALTER TYPE ... DROP VALUE`.
--     4) El valor `dead` permanece en el enum pero ningún código lo usa.
--
-- VALORES DEL ENUM DESPUÉS DE ESTA MIGRATION:
--   'pending' | 'processing' | 'sent' | 'failed' | 'dead'
--
-- Defense in depth:
--   1) NO se modifican las funciones existentes.
--   2) NO se modifica la tabla.
--   3) NO se modifican índices ni constraints.
--   4) El valor se agrega en una transacción separada de las migrations
--      00950 y 00960 que lo consumen (limitación de PG: ADD VALUE no
--      puede usarse en la misma transacción donde se referencia el nuevo
--      valor).
--
-- APLICACIÓN LOCAL: `supabase db reset` aplica todas las migrations
-- desde cero. Para una instalación ya en producción, aplicar 00940,
-- luego 00950, luego 00960, en ese orden estricto.

set search_path = public;

-- Pre-check: el enum y el valor deben estar en estado esperado.
do $$
begin
  if not exists (
    select 1 from pg_type t
     join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'notification_status'
      and n.nspname = 'public'
  ) then
    raise exception 'TKT-026 2A-1: enum public.notification_status no existe. Aplicar migrations previas.';
  end if;
end $$;

-- Adición idempotente del valor `dead`.
alter type public.notification_status add value if not exists 'dead';

-- Comentario de documentación sobre la irreversibilidad.
comment on type public.notification_status is
  'TKT-019 / TKT-026 Phase 2A: estados del outbox. Forward-only: `dead` se agregó en migration 20260901000940 y NO puede removerse via DROP VALUE (limitación PG). Si se requiere reversión funcional, restaurar el cuerpo de las funciones complete_notification / enqueue_ticket_notifications desde git log sin intentar ALTER TYPE.';
