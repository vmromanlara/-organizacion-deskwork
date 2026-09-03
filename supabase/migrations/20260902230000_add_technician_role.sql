-- DeskWork Ticketing Core / Fase Block 2 (Remediation).
-- DEFECT-UAT-NN1/NN2: introducir el rol funcional 'technician' (T�cnico TI)
-- como ciudadano de primera clase del modelo de autorizaci�n.
--
-- Por qu� un ALTER TYPE separado (forward-only):
--   PG17 permite ALTER TYPE ... ADD VALUE dentro de una transacci�n, pero el
--   valor a�adido NO puede ser referenciado (INSERT/UPDATE/CASE) hasta que
--   la transacci�n confirme. Para evitar esta restricci�n, esta migraci�n
--   SOLO agrega el valor al enum; las migraciones subsiguientes
--   (20260902230010_*, etc.) lo referencian.
--
-- Por qu� NO se reutiliza 'operator' ni 'supervisor':
--   * operator: auto-rol por default (Foundation, migraci�n 20260819000200).
--     Carece de permisos de operaci�n (transici�n, comentario, adjunto,
--     asignaci�n). Extenderlo globalmente contradice la matriz can�nica v3.
--   * supervisor: tiene scope 'department' por default (no 'institution'),
--     y la matriz de permisos ya est� consolidada para alcance de
--     coordinaci�n, no de operaci�n t�cnica.
--   * El TKT-UI y la documentaci�n de DeskWork (DESIGN_SYSTEM_SOURCE_PACK.md)
--     referencian expl�citamente al 'T�cnico TI' como perfil con UI propia
--     (/tech, /tech/tickets, /tech/tickets/[id]). Crear el rol completa la
--     trazabilidad producto <-> autorizaci�n.
--
-- Decisi�n de scope por default:
--   'department' (no 'institution'). El t�cnico trabaja sobre su �mbito
--   departamental; el escalamiento a 'institution' corresponde a lead/director.
--   El scope se asigna expl�citamente v�a grant_membership_scope() en la
--   migraci�n siguiente; no se hace autom�tico para preservar la regla
--   "scope nunca es impl�cito" de Foundation.
--
-- Irreversibilidad:
--   PG17 no soporta DROP VALUE para enums. Esta migraci�n es forward-only.
--   Si en el futuro se elimina el rol, se hace por desuso funcional + nota
--   en el changelog (v�a deskwork-changelog); nunca borrando el valor.

-- TX �nica: ALTER TYPE ADD VALUE.
-- IF NOT EXISTS protege contra re-ejecuci�n manual accidentada.
do $$
begin
  alter type public.functional_role add value if not exists 'technician';
exception
  when duplicate_object then null;
end $$;

-- Sin grants directos: el valor se usar� en la pr�xima migraci�n
-- (20260902230010_technician_grants_and_take.sql) cuando la transacci�n
-- de ALTER TYPE ya est� confirmada.
