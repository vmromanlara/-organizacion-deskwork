# DESKWORK — Auditoría de autorización de Foundation / Fase 3A

**Fecha:** 19 de agosto de 2026  
**Alcance:** revisión de la capa de identidad, roles, alcance y RLS creada en Fase 3A frente a la especificación de autorización de cinco niveles.  
**Resultado:** no se modificaron código, migraciones, configuración ni funcionalidades de Fase 3B.

## Evidencia revisada

- `src/modules/identity/roles.ts` y `supervisor-scope.ts`.
- `supabase/migrations/20260819000100_foundation.sql`.
- `supabase/tests/foundation_rls.pgtap.sql`.
- Configuración de la aplicación y estado de los comandos de validación.

La base actual declara cuatro roles técnicos: `requester`, `agent`, `supervisor` y `tenant_admin`. Las tablas Foundation existentes son `tenants`, `profiles`, `areas`, `memberships`, `teams`, `team_memberships` y `audit_logs`. Todavía no existe una entidad `tickets`; por tanto, no es posible demostrar aún RLS sobre casos reales ni sus archivos, comentarios o métricas.

La validación dinámica local tampoco pudo ejecutarse: el motor de Docker Desktop no estaba disponible al momento de la revisión. Los resultados de este informe distinguen por ello entre evidencia estática del SQL/código y validaciones que siguen pendientes de ejecución.

## A. Matriz actual de permisos y alcance

| Rol actual | Alcance efectivo observado | Permisos declarados | Observación |
|---|---|---|---|
| `requester` | Propio | Crear y leer/comentar sus futuros tickets | No hay aún política de tickets que lo demuestre. |
| `agent` | Institución para lectura de membresías; futuro alcance de equipo/asignación en catálogo TS | Crear, leer asignado/equipo, comentar, asignar, transición, clasificación y override de prioridad | La RLS de `memberships` permite lectura de toda la institución a `agent`, no sólo de su equipo. |
| `supervisor` | Propio, reportes directos o misma `area_id` | Crear, lectura/comentarios de alcance, dashboard supervisor | La función de alcance combina jerarquía directa y área; aún no discrimina explícitamente departamento frente a equipo. |
| `tenant_admin` | Institución | Gestión de tenant, miembros, equipos, catálogo, SLA y auditoría | Es una administración técnica/tenant-wide. Actualmente también es el resultado del bootstrap. No equivale de forma segura al Nivel 0 funcional. |

La base contiene funciones `SECURITY DEFINER` para comprobar membresía activa, rol de tenant y alcance de supervisor. La función de supervisor concede además alcance total a `tenant_admin`.

## B. Modelo objetivo requerido por la autorización

El modelo objetivo debe expresar separadamente **rol funcional**, **permisos** y **alcance**. Un número de nivel por sí solo no es un modelo de autorización.

| Nivel funcional | Código sugerido | Alcance | Capacidad principal | Límite esencial |
|---|---|---|---|---|
| 0 — Encargado técnico | `technical_lead` | `INSTITUTION` | Opera y visualiza la institución completa; ejecuta las acciones técnicas autorizadas | No debe inferirse por ser `tenant_admin`. |
| 1 — Director/Gerente General | `director` | `INSTITUTION` | Visibilidad, métricas, reportes e historial completos; inicia solicitudes de gestión | Debe quedar explícito qué cambios de estado de casos puede **ejecutar**, si alguno. |
| 2 — Supervisor | `supervisor` | `DEPARTMENT` y/o `TEAM` | Ve, reporta y solicita acciones dentro de su ámbito | Nunca puede inferir acceso fuera de las unidades asignadas. |
| 3 — Administrativo | `administrative` | `SELF` | Gestiona sus propias solicitudes, reportes e historial permitido | No se convierte en supervisor por atributos de perfil. |
| 4 — Operario | `operator` | `SELF` | Gestiona sus propias solicitudes, reportes e historial permitido | Es un rol funcional distinto de Administrativo, aunque inicialmente compartan alcance. |

`tenant_admin` debe ser una capacidad administrativa técnica separada —por ejemplo, para configuración y provisión controlada del tenant—, no un sustituto silencioso de `technical_lead`. Puede coexistir con un rol funcional, pero esa asignación debe ser explícita y auditada.

### Solicitar versus ejecutar

Cada acción sensible debe tener dos permisos distintos cuando aplique:

- `*.request`: crea una solicitud trazable para que un responsable la evalúe o ejecute.
- `*.execute`: produce el cambio efectivo.

Ejemplos: `member.create.request` frente a `member.create.execute`; `member.deactivate.request` frente a `member.deactivate.execute`; `ticket.status.request` frente a `ticket.status.execute`.

La indicación de que Dirección puede “modificar estado de casos de terceros” entra en tensión con la regla solicitar/ejecutar. Antes de implementar tickets debe aprobarse una de estas dos opciones: Dirección ejecuta transiciones explícitamente permitidas y auditadas, o sólo las solicita. No debe resolverse por una excepción implícita en RLS.

## C. Diferencias entre Foundation y el modelo objetivo

1. El enum actual sólo contiene cuatro roles y no representa los niveles 0, 1, 3 y 4 requeridos.
2. `agent` y `tenant_admin` no tienen equivalencia aprobada con Encargado técnico. Hoy sus facultades y nombres mezclan operación de soporte con administración del tenant.
3. No hay modelo persistente de permisos independientes del rol. Los permisos viven en un catálogo TypeScript, no en una asignación verificable por RLS.
4. El alcance se deduce de `area_id`, reporte directo y membresía de equipo; no existe una asignación explícita de alcance `INSTITUTION` / `DEPARTMENT` / `TEAM` / `SELF` por persona y permiso.
5. No existe distinción técnica entre solicitar y ejecutar. Tampoco existe una entidad de solicitud/flujo de aprobación.
6. Las políticas actuales permiten a todo miembro activo consultar todas las áreas y membresías de equipos del tenant; un `agent` puede leer todas las membresías. Esto excede el alcance de equipo declarado para varios escenarios.
7. Los perfiles sólo tienen una política de lectura propia. Un Nivel 0 o 1 no podría obtener de forma directa los datos de perfil de terceros mediante RLS, aunque pueda leer membresías.
8. No hay tickets, comentarios, adjuntos ni dashboard productivo. Por ello las reglas de alcance de casos y las métricas no están implementadas ni comprobadas.
9. Las pruebas pgTAP actuales verifican principalmente existencia de objetos y políticas; no prueban accesos permitidos/denegados bajo identidades autenticadas diferentes.

## D. Riesgos y observaciones críticas

### 1. Bootstrap con elevación automática de privilegios — crítico

`bootstrap_tenant(...)` está concedida a `authenticated`. Cualquier usuario autenticado sin membresía previa puede crear un tenant nuevo y recibir `tenant_admin` activo. La función le impide repetirlo después de tener una membresía, y no le concede administración sobre un tenant ajeno existente; aun así habilita autoaprovisionamiento y autoelevación del primer administrador sin un proceso de confianza aprobado.

No debe considerarse una provisión segura del “primer admin/tenant” hasta restringirla a un procedimiento confiable, por ejemplo:

- una operación de control-plane realizada desde servidor con credenciales de servicio, o
- una invitación/token de aprovisionamiento de un único uso, validado y consumido atómicamente.

### 2. Aislamiento entre tenants no demostrado — crítico

Las claves, funciones y políticas contienen `tenant_id`, lo que es una buena base estática. Sin embargo, no se ha ejecutado una prueba real de dos tenants con sesiones autenticadas distintas. La propiedad “Tenant A ≠ Tenant B” permanece como hipótesis hasta realizar ese test.

### 3. Catálogo de roles y RLS pueden divergir — alto

La interfaz conoce permisos TypeScript pero las políticas SQL usan sólo el enum de roles. Cambiar una pantalla o catálogo de permisos no cambia por sí mismo la seguridad de base de datos. La base debe ser la autoridad final para datos sensibles y las comprobaciones de servidor/UI un refuerzo, no el sustituto de RLS.

### 4. Alcance de supervisor incompleto — alto

La regla actual es “mismo `area_id` o reporte directo”. No establece cuál prevalece, ni cómo se traduce una unidad organizativa a los futuros tickets, ni permite asignar varios departamentos/equipos de forma expresa. Es suficiente como esqueleto, no como política final de Fase 3B.

### 5. Administración técnica y rol funcional mezclados — alto

Usar `tenant_admin` como Encargado técnico rompería la separación solicitada y haría difícil limitar privilegios futuros. La capacidad de configurar el tenant, aprovisionar personas o acceder a auditoría debe separarse de las facultades de operación de casos.

### 6. Lectura amplia de directorios — medio

Todos los miembros activos pueden leer áreas y composiciones de equipo; los agentes pueden leer todas las membresías. Debe decidirse si esos directorios son deliberadamente visibles a toda la institución. Si no lo son, las políticas deben reducirse antes de que se añadan datos personales adicionales.

### 7. Auditoría insuficiente para gestión de identidad — medio

Existe `audit_logs`, pero aún no hay un contrato de eventos para altas, bajas, cambios de rol, cambios de alcance, solicitudes y ejecuciones. Sin él no se puede demostrar quién elevó permisos o por qué.

### 8. Autorización de servidor futura — medio

RLS protege consultas directas de clientes autenticados. Las rutas server-side, jobs y acciones con `service_role` deberán comprobar actor, tenant, permiso y alcance antes de realizar operaciones privilegiadas; `service_role` no debe usarse como atajo para decisiones de negocio.

### 9. Estado operativo local no validado — medio

Al momento de la auditoría Docker Desktop no exponía su daemon, por lo que no se pudo levantar Supabase local ni ejecutar pgTAP contra una instancia real. Esto no demuestra un fallo de diseño, pero bloquea la aprobación empírica de Fase 3A.

### 10. Migración futura sin una decisión de modelo — medio

Cambiar apresuradamente el enum `mvp_role` o el significado de `tenant_admin` una vez que haya usuarios reales puede exigir migración de datos y reescritura de políticas. La taxonomía objetivo debe aprobarse antes de persistir datos productivos.

## E. Cambios propuestos — no implementados

Estas son propuestas de corrección para aprobación, no cambios aplicados.

1. **Reemplazar el bootstrap abierto.** Revocar el flujo directo para cualquier `authenticated` y definir uno de los dos mecanismos confiables descritos en el riesgo 1. Debe ser one-time, transaccional, auditable y separar el tenant inicial de la persona que recibe privilegios.
2. **Aprobar una taxonomía de identidad.** Mantener por separado: `functional_role` (los cinco niveles), capacidades administrativas de tenant y estado de la membresía. No mapear automáticamente `technical_lead` a `tenant_admin`.
3. **Formalizar alcance.** Conservar `area_id` y equipos sólo como datos organizativos; agregar posteriormente una fuente explícita de concesiones de alcance, aplicable a departamentos/equipos y con fechas/autor de asignación si el producto lo necesita. `SELF` se obtiene de la propia membresía; `INSTITUTION` requiere permiso explícito.
4. **Definir permisos de negocio.** Establecer un vocabulario canónico `resource.action.scope`, incluyendo pares `request`/`execute`. Las políticas de datos y las rutas servidor deberán consumir la misma decisión de autorización.
5. **Reducir políticas de directorio según decisión de privacidad.** Limitar lectura de membresías, áreas y equipos a información necesaria por rol/alcance; mantener identificadores mínimos cuando una relación sea necesaria para RLS.
6. **Diseñar el contrato de auditoría de identidad.** Registrar siempre actor, tenant, objeto, antes/después, motivo/correlación, origen y resultado para solicitudes y ejecuciones sensibles.
7. **No modificar aún la Fase 3B.** La incorporación de tickets debe esperar estas decisiones, pues sus filas necesitarán `tenant_id`, solicitante, equipo/departamento, asignados y políticas que materialicen exactamente el alcance aprobado.

## F. Plan de pruebas de autorización

Las siguientes pruebas deben añadirse y ejecutarse con Supabase local levantado. Las identidades de prueba se crean en una fase privilegiada; cada aserción se ejecuta después como rol `authenticated` con el `sub` JWT del usuario que corresponde. No se debe evaluar RLS como propietario de tablas ni como `service_role`.

| Caso | Preparación | Resultado exigido |
|---|---|---|
| Aislamiento Tenant A/B | Dos tenants, miembros y áreas diferentes | Cada identidad sólo puede seleccionar/modificar filas de su tenant; intentos cruzados devuelven cero filas o denegación. |
| Solicitante SELF | Dos solicitantes del mismo tenant | Cada uno ve únicamente su propio perfil/membresía y, cuando existan, sus casos, comentarios y adjuntos autorizados. |
| Supervisor por departamento | Supervisor asignado a Departamento A; usuarios en A y B | Puede consultar/gestionar sólo objetos vinculados a A o reportes directos aprobados; B queda denegado. |
| Supervisor por equipo | Supervisor con Equipo A; Equipo B separado | Sólo ve los casos/miembros autorizados del Equipo A. |
| Nivel 0 institucional | Encargado técnico sin `tenant_admin` y otro usuario técnico con esa capacidad | La visibilidad institucional del Nivel 0 procede de permisos explícitos; administración de tenant no aparece por herencia accidental. |
| Dirección | Director con alcance institucional | Puede ejecutar sólo las operaciones expresamente aprobadas; el resto genera solicitud o denegación. |
| Administrativo/Operario | Una identidad de cada tipo | Ambos permanecen en SELF, con diferencias de permiso sólo donde se aprueben. |
| Cambio de rol/alcance | Actor sin permiso y actor con permiso de ejecución | El primero es denegado; el segundo deja un `audit_log` completo y el cambio se refleja sin abrir alcance fuera del tenant. |
| Elevación propia | Usuario intenta pasar a rol superior o ampliar área/equipo mediante API/SQL | Siempre denegado; no puede editar su propia membresía ni consumir un bootstrap no autorizado. |
| Bootstrap | Usuario sin membresía, invitación válida, invitación inválida/reutilizada | Sólo el mecanismo confiable aprobado crea el tenant y primer administrador; un token es consumible una vez y deja auditoría. |
| Archivos futuros | Archivo de Tenant A referenciado por ticket A y sesión B | Storage y metadatos deniegan listar, descargar, firmar URL o borrar en otro tenant. |
| Rutas servidor | Llamadas a API con sesión válida, sin sesión y sesión de otro tenant | Las rutas repiten actor/tenant/permiso/alcance; ninguna `service_role` omite esas comprobaciones. |

Además de pgTAP, conviene mantener pruebas de integración de API para confirmar que las rutas no eluden RLS, y una prueba de regresión por cada permiso o política nueva.

## G. Decisión de fase

**Estado: NO APROBADA para cierre definitivo de Foundation / Fase 3A.**

La base de tablas, claves `tenant_id`, RLS habilitada y funciones de alcance es una plataforma prometedora, pero no cumple todavía la autorización aprobada ni cuenta con evidencia de ejecución real. En particular, no se puede iniciar Fase 3B hasta aprobar y resolver estos puntos:

1. El mecanismo seguro y auditable para crear el primer tenant/administrador, sustituyendo el bootstrap abierto a cualquier usuario autenticado.
2. La separación aprobada entre los cinco roles funcionales, permisos administrativos de tenant y `tenant_admin`.
3. La semántica exacta de Dirección: solicitar versus ejecutar cambios de estado de casos de terceros.
4. La regla de alcance de Supervisor: departamentos, equipos, reportes directos y combinaciones permitidas.
5. La política de visibilidad de directorios organizativos y perfiles.
6. La ejecución satisfactoria de las pruebas de aislamiento, alcance y elevación de privilegios en Supabase local.

Una vez aprobadas esas decisiones, las correcciones de Foundation deben implementarse y validarse antes de modelar `tickets`, Storage o endpoints de Fase 3B.
