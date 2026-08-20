# Auditoría técnica — DeskWork

Fecha: 2026-08-18  
Alcance: `C:\DeskWork` únicamente.  
Método: inspección estática, validación sintáctica y ejecución segura de los artefactos disponibles. No se modificó código, configuración ni datos; este informe es el único archivo creado para la auditoría.

## 1. Resumen ejecutivo

El repositorio **no contiene una aplicación DeskWork implementada**. Contiene un mockup HTML autocontenido, tres scripts Python para extraer texto de documentos fuente y documentación de producto. No hay repositorio Git, gestor de paquetes, servidor, backend, API, base de datos, autenticación, migraciones, tests, Docker, CI/CD ni variables de entorno.

El único artefacto de interfaz, `DeskWork_Mockup_Interactivo_v2.html`, es una **maqueta/demostración** con datos hardcodeados. Su única lógica es alternar cuatro pantallas visuales; el formulario muestra `alert()` y no crea ni persiste tickets. Por ello, no existe evidencia de ningún flujo de negocio DeskWork funcionando de extremo a extremo.

**Estado real del MVP: 2% estimado.** Ese porcentaje reconoce una maqueta visual y una navegación JavaScript mínima; el avance funcional verificable de una aplicación de mesa de ayuda es **0%**.

## 2. Stack tecnológico real

| Capa | Tecnología encontrada | Estado |
|---|---|---|
| Interfaz | HTML5, CSS inline y JavaScript vanilla inline | Un mockup estático. |
| Tipografía | Google Fonts: Outfit y JetBrains Mono | Recurso externo de presentación. |
| Backend / API | No encontrado | No existe implementación. |
| Base de datos / ORM | No encontrado | No existe implementación. |
| Autenticación | No encontrado | No existe implementación. |
| Tests | No encontrado | No existe configuración ni suite. |
| Build / dependencias | No se encontró `package.json`, lockfile ni manifiesto equivalente | No hay build instalable o ejecutable. |
| Scripts auxiliares | Python: `pypdf`, `python-docx` y una dependencia `daimon_runtime` | Utilidades documentales, no parte de DeskWork. |

No hay evidencia de React, Next.js, Vite, Node como runtime de aplicación, Supabase, PostgreSQL, Prisma, Firebase, Docker, ni proveedor SaaS configurado.

## 3. Arquitectura

La arquitectura real se limita a un archivo estático que el navegador puede renderizar localmente:

`HTML + CSS + datos hardcodeados + una función JavaScript de cambio de pantalla`

No hay capa de servicio, routing, persistencia, validación de servidor, modelo de dominio, sesión, autorización, multi-tenancy ni integración externa. Los scripts Python leen documentos locales con rutas absolutas de OneDrive y no están conectados con el mockup.

## 4. Estructura del repositorio

```text
C:\DeskWork
├── DeskWork_Mockup_Interactivo_v2.html  # mockup visual autocontenido
├── extract_docx.py                      # extracción de texto de un DOCX externo
├── extract_pdf.py                       # extracción de PDF; dependencia ausente
├── extract_pdf2.py                      # extracción de PDF con pypdf
├── DESKWORK_PROJECT_MEMORY.md            # contexto/documentación de producto
└── DESKWORK_TECHNICAL_AUDIT.md           # este informe
```

No hay directorios de código, `README`, `.git`, `.env`, dependencias, migraciones, esquemas, tests ni configuración de despliegue.

## 5. Base de datos

**Estado: G — NO EXISTE.**

No se encontraron archivos SQL, migraciones, ORM, schema, seeds, modelos, conexiones, tablas ni configuración de un motor de datos. En consecuencia no existe evidencia de:

- motor, tablas, relaciones, claves, índices o constraints;
- enums, triggers, funciones, seeds o datos de prueba persistidos;
- RLS o aislamiento por tenant;
- modelo de tickets, usuarios, organizaciones, SLA o auditoría.

El modelo actual no permite operar un SaaS multiempresa: no hay almacenamiento ni una noción implementada de organización/tenant.

## 6. Autenticación y autorización

**Estado: G — NO EXISTE.**

No hay login, logout, sesión, proveedor de identidad, middleware, roles, permisos o validación de autorización. El nombre “Ana García” y el avatar del mockup son HTML fijo ([mockup, líneas 712–715](C:\DeskWork\DeskWork_Mockup_Interactivo_v2.html:712)); no representan una sesión.

## 7. Multi-tenancy

**Estado: F — DOCUMENTADO PERO NO IMPLEMENTADO.**

La memoria describe tenants y niveles 0–4, pero la búsqueda del código no encontró `tenant`, `organization`, `org_id`, RLS ni SDK/base de datos. No se puede crear/seleccionar una organización ni demostrar aislamiento de datos.

## 8. Sistema de tickets

**Estado global: D — MOCK / DEMO.**

El mockup muestra una tabla de tickets con identificadores, títulos, usuarios, prioridades y estados hardcodeados ([líneas 788–858](C:\DeskWork\DeskWork_Mockup_Interactivo_v2.html:788)). El formulario no posee `action`, `method` ni manejador `submit`; los botones solo ejecutan `alert()` ([líneas 883–957](C:\DeskWork\DeskWork_Mockup_Interactivo_v2.html:883)). No hay llamada API, almacenamiento de navegador ni mutación de la tabla.

Además, los botones dentro del formulario no definen `type="button"` ni previenen el submit, por lo que el comportamiento posterior al `alert()` no es un flujo de creación fiable incluso como demo.

La función `showScreen()` sí tiene implementación mínima ([líneas 1139–1155](C:\DeskWork\DeskWork_Mockup_Interactivo_v2.html:1139)): su sintaxis fue validada y una prueba aislada confirmó que al seleccionar `screen-3` deja activos únicamente esa pantalla y su botón. Esto comprueba navegación de maqueta, no funcionalidad de tickets.

## 9. SLA, estados, prioridad y escalamiento

| Área | Estado | Hallazgo |
|---|---|---|
| SLA / timers | F | No existe código de cálculo, calendario, vencimiento ni persistencia. |
| Prioridad | D | Un `<select>` fijo permite al usuario elegirla ([líneas 907–916](C:\DeskWork\DeskWork_Mockup_Interactivo_v2.html:907)); no hay motor P1–P4. |
| Estados | D | Hay estilos y valores visuales para abierto, en progreso, resuelto y escalado; no existe transición ni historial. |
| Escalamiento | D | Se representa visualmente, sin reglas, acciones ni integración. |
| Asignación | D | Hay un nombre fijo en el detalle; ningún control o persistencia de asignación. |

La selección manual de prioridad contradice el Documento Maestro, que establece que DeskWork debe calcularla. Al ser un mockup, no debe tratarse como una decisión implementada del producto.

## 10. Dashboard y reportes

**Estado: D — MOCK / DEMO.**

El dashboard exhibe cuatro KPI y cuatro tickets con valores fijados en el HTML. No hay consultas, filtros operativos, gráfico, actualización, API ni cálculo de métricas. Los tres botones de filtro no tienen evento asociado ([líneas 783–785](C:\DeskWork\DeskWork_Mockup_Interactivo_v2.html:783)).

No existe módulo de reportes. Las referencias a reportes solo forman parte del texto simulado de un ticket.

## 11. APIs, integraciones, IA y automatización

| Área | Estado | Evidencia |
|---|---|---|
| API / endpoints | G | No hay backend ni llamadas `fetch`, Axios, XHR, WebSocket o rutas. |
| Webhooks | G | No hay código ni configuración. |
| Email | E | Un mensaje visual dice “Email verificado”; no hay servicio ni envío. |
| Adjuntos | D | Hay un `<input type="file">`, pero ninguna carga, validación real ni storage. |
| Integraciones | F | Mencionadas en la memoria, ausentes del código. |
| IA | F | Mencionada como visión futura, sin código. |
| Automatización | G | No existe workflow, scheduler ni reglas. |
| Billing | F | Aparece en el modelo comercial, sin implementación. |

## 12. Seguridad

La evaluación es necesariamente limitada porque no existe una aplicación con superficie de servidor.

### Hallazgos

| Prioridad | Hallazgo | Evidencia / impacto | Recomendación |
|---|---|---|---|
| Crítica | Autenticación y autorización inexistentes | No hay identidad, sesión ni control de acceso. Un producto con datos reales no podría protegerlos. | Implementar identidad, roles y autorización por tenant antes de exponer datos. |
| Crítica | Aislamiento multi-tenant inexistente | No existe base de datos, RLS ni comprobación de tenant. | Diseñar modelo multi-tenant y políticas de aislamiento antes de crear recursos. |
| Alta | Validación y subida de archivos no implementadas | El archivo adjunto es solo un control HTML con un error permanente. | Validación de tipo/tamaño, almacenamiento privado y análisis/controles de descarga cuando exista backend. |
| Media | Sin cabeceras o controles web observables | No hay servidor, CSP, CSRF, rate limiting ni trazabilidad. | Definirlos en la arquitectura de despliegue; no aplica aún como vulnerabilidad explotable del mockup. |

No se detectaron credenciales, API keys, secretos, SDK de tercero ni archivos `.env` en el alcance auditado. Esto no equivale a una certificación de seguridad: simplemente no existe una aplicación con la que probar autenticación, inputs o aislamiento.

## 13. Calidad técnica

Las notas califican la implementación de producto, no la intención del diseño.

| Área | Nota / 10 | Justificación |
|---|---:|---|
| Arquitectura | 1 | Solo hay HTML estático; no hay arquitectura de aplicación. |
| Frontend | 2 | Mockup con CSS responsive y una interacción de pantalla, sin componentes, estado ni datos reales. |
| Backend | 0 | No existe. |
| Base de datos | 0 | No existe. |
| API | 0 | No existe. |
| Seguridad | 1 | No hay secretos expuestos, pero tampoco controles de producto. |
| Multi-tenancy | 0 | Solo está documentado. |
| Testing | 0 | No hay suite ni framework. |
| UX | 4 | La maqueta comunica algunos flujos, pero no fue posible verificarla en navegador y diverge de reglas de producto. |
| Escalabilidad | 0 | No hay runtime ni datos. |
| Mantenibilidad | 2 | Un archivo HTML de 1.155 líneas mezcla estructura, estilos, datos y lógica; los scripts auxiliares usan rutas absolutas. |

## 14. Validaciones ejecutadas

| Verificación | Resultado | Evidencia |
|---|---|---|
| Inventario de archivos/configuración | Completado | Cinco archivos previos a este informe; sin manifiestos de aplicación. |
| Git / CI / Docker / README / env | No encontrado | `C:\DeskWork` no es un repositorio Git y no contiene esos artefactos. |
| Sintaxis del JavaScript inline | Correcta | Un script inline, sin errores de parseo. |
| Lógica aislada de navegación | Correcta | La prueba cambió exclusivamente a `screen-3` y `button-3`. |
| Sintaxis Python | Correcta | Los tres scripts hacen parseo AST correcto. |
| `extract_pdf2.py` | Ejecuta con código 0 | Script documental; no prueba DeskWork. |
| `extract_docx.py` | Ejecuta con código 0 | Script documental; no prueba DeskWork. |
| `extract_pdf.py` | Falla | `ModuleNotFoundError: daimon_runtime`. |
| Dependencias / build / tests | No aplicable | No hay manifiesto, comando de build, entrypoint ni tests. |
| Prueba visual de navegador | No verificada | El navegador integrado del entorno no estaba disponible; no se afirma funcionalidad visual. |

Un intento de servir el HTML con un servidor local no permitió establecer conexión en este entorno. No se considera un defecto del mockup: el repositorio no define un servidor ni una aplicación que ejecutar.

## 15. Matriz de funcionalidades

Leyenda: **A** implementado y funcional; **B** parcialmente; **C** implementado no verificable; **D** mock/demo; **E** placeholder; **F** documentado no implementado; **G** no existe.

| Módulo | Estado | Evidencia | Backend | Frontend | DB | Verificado |
|---|---|---|---|---|---|---|
| Autenticación | G | No existe código de identidad/sesión | No | No | No | No |
| Usuarios | E | Menú y nombres fijos; no gestión | No | Etiqueta/mock | No | No |
| Organizaciones | F | Solo memoria | No | No | No | No |
| Multi-tenancy | F | Solo memoria | No | No | No | No |
| Roles | F | Solo memoria | No | No | No | No |
| Permisos | G | No encontrado | No | No | No | No |
| Tickets | D | Tabla, detalle y formulario hardcodeados | No | Sí, estático | No | No |
| Categorías | D | Opciones fijas de formulario | No | Sí, estático | No | No |
| Prioridades | D | Selector y textos fijos | No | Sí, estático | No | No |
| Estados | D | Badges/clases fijos | No | Sí, estático | No | No |
| Asignación | D | “Ana García” fija en detalle | No | Sí, estático | No | No |
| Equipos | G | No encontrado | No | No | No | No |
| SLA | F | Solo memoria | No | No | No | No |
| Escalamiento | D | Badge/valor fijo | No | Sí, estático | No | No |
| Comentarios | E | Botón “Responder” sin evento | No | Placeholder | No | No |
| Adjuntos | D | Input de archivo sin carga | No | Sí, estático | No | No |
| Historial | D | Timeline fija | No | Sí, estático | No | No |
| Notificaciones | E | Mensajes/alerts locales | No | Placeholder | No | No |
| Email | E | Texto “verificado”, sin servicio | No | Placeholder | No | No |
| Dashboard | D | KPI y tabla fijos | No | Sí, estático | No | No |
| Reportes | F | Solo referencias textuales | No | No | No | No |
| Auditoría | F | Solo memoria | No | No | No | No |
| Configuración | G | No encontrado | No | No | No | No |
| API | G | Sin endpoints ni llamadas | No | No | No | No |
| Webhooks | G | No encontrado | No | No | No | No |
| Integraciones | F | Solo documentación | No | No | No | No |
| IA | F | Solo visión futura | No | No | No | No |
| Automatización | G | No encontrado | No | No | No | No |
| Billing | F | Solo modelo comercial | No | No | No | No |
| Administración | E | Ítem de menú sin pantalla/acción | No | Placeholder | No | No |

## 16. Comparación: memoria vs. código

### Documentado y existe

- Paleta de colores, tipografías Outfit/JetBrains Mono y algunos patrones visuales.
- Representaciones visuales de tickets, estados, prioridad, adjuntos, dashboard y responsive.
- Navegación entre cuatro pantallas del mockup.

### Documentado pero no existe

- Autenticación, perfiles y niveles 0–4.
- Organización, tenant y aislamiento de datos.
- Motor de prioridad P1–P4, SLA y medición de tiempos.
- Tickets persistentes, comentarios, historial, asignación, cierre/reapertura y notificaciones reales.
- Dashboard basado en datos, reportes, auditoría, configuración, API e integraciones.
- Base de conocimiento, inventario, automatización, IA, proyectos y billing.

### Existe pero no está documentado claramente

- Tres scripts de extracción documental con rutas absolutas externas a `C:\DeskWork`.
- Un mockup v2.0 centrado en demostrar mejoras de interfaz, no un producto ejecutable.

### Existe como mock

- KPI, listado de tickets, datos de personas, detalle, timeline, filtros, prioridad, asignación, adjuntos, estados, formulario y vista móvil.
- El supuesto “ticket creado” es únicamente el texto de un `alert()`; no genera datos.

### Desviaciones de las decisiones de producto/marca

- El formulario permite que el usuario seleccione prioridad, en lugar de calcularla automáticamente.
- Solo se visualizan cuatro de los seis estados acordados; no hay `ESPERANDO USUARIO` ni `CERRADO` como flujo real.
- Incluye emojis como iconos/indicadores visuales, pese a que el brief de marca los prohíbe como iconografía principal.

## 17. Deuda técnica y brechas

| Prioridad | Problema | Evidencia | Impacto | Recomendación |
|---|---|---|---|---|
| Crítica | No existe producto ejecutable | Sin backend, DB, API, auth ni servidor | No es posible operar tickets ni guardar datos | Establecer repositorio, runtime y arquitectura mínima antes de implementar módulos. |
| Crítica | No existe modelo SaaS ni aislamiento | Sin organizaciones, tenants o RLS | Riesgo inaceptable al incorporar más de un cliente | Diseñar primero datos, identidad y autorización tenant-aware. |
| Crítica | No existen tickets funcionales | Formulario usa alert y datos fijos | El flujo central del MVP no opera | Implementar dominio de tickets y persistencia antes de ampliar UX. |
| Alta | No hay pruebas, build ni CI | Ausencia de manifiestos/configuración | No se puede medir calidad ni prevenir regresiones | Introducir herramientas de build, lint, test y CI desde el inicio. |
| Alta | Los scripts auxiliares no son portables | Rutas absolutas; `extract_pdf.py` depende de módulo ausente | Utilidades no reproducibles | Convertir rutas en argumentos/configuración y declarar dependencias cuando se decida mantenerlos. |
| Media | Mockup monolítico | HTML, estilos, datos y lógica en un archivo | Bajo mantenimiento y difícil evolución | Al iniciar frontend real, separar componentes, estilos, estado y capa de datos. |
| Media | Brecha entre mock y decisiones de producto | Prioridad manual, estados incompletos, emojis | Riesgo de implementar UX no aprobada | Alinear la especificación visual antes de usar el mockup como base de desarrollo. |
| Baja | Dependencia visual externa | Google Fonts remoto | La apariencia depende de red | Definir estrategia de fuentes/caché en el producto real. |

## 18. Porcentaje de avance

Estimaciones redondeadas; indican implementación funcional, no extensión de la documentación o calidad del diseño.

| Área | Avance estimado |
|---|---:|
| Frontend | 10% |
| Backend | 0% |
| Base de datos | 0% |
| API | 0% |
| Autenticación | 0% |
| Multi-tenancy | 0% |
| Tickets | 5% |
| SLA | 0% |
| Dashboard | 5% |
| Integraciones | 0% |
| Seguridad | 1% |
| Testing | 0% |
| **MVP completo** | **2%** |

El 10% de frontend y los porcentajes de tickets/dashboard son diseño demostrativo, no flujos utilizables. Si se mide exclusivamente software de soporte operativo, todos esos módulos están en 0% funcional.

## 19. Estado del MVP

### ¿Qué tenemos hoy?

Una maqueta HTML navegable entre dashboard, formulario de creación, detalle y una representación móvil; utilidades para extraer documentos; y documentación de producto.

### ¿Qué funciona?

- Renderizado estático del HTML cuando un navegador abre el archivo.
- Sintaxis JavaScript validada.
- Cambio de las pantallas de maqueta mediante `showScreen()` comprobado en prueba aislada.
- Dos de los tres scripts documentales ejecutan con el runtime de auditoría.

### ¿Qué funciona parcialmente?

Ningún flujo de negocio. El cambio de pantalla es la única interacción con evidencia; no usa datos ni persiste estado.

### ¿Qué es solamente maqueta?

Dashboard, tickets, formulario, prioridad, categorías, adjuntos, detalle, timeline, asignación, estados, filtros, métricas y vista móvil.

### ¿Qué falta?

Todo el MVP funcional: repositorio de aplicación, dependencia/build, servidor, autenticación, datos multi-tenant, roles, tickets, prioridad calculada, estado, timers/SLA, archivos, notificaciones, dashboard basado en datos, seguridad, tests, observabilidad y despliegue.

### ¿Está listo para un cliente piloto?

**NO.** No se pueden crear, almacenar, consultar, proteger ni medir solicitudes reales.

### ¿Está listo para producción?

**NO.** No existe una aplicación de producción, arquitectura de datos, controles de acceso, pruebas ni despliegue.

## 20. Roadmap técnico recomendado

Este es un orden de cierre de brechas, no una afirmación de que esos componentes ya existan ni una implementación realizada durante la auditoría.

1. Definir stack, crear repositorio de aplicación versionado, convenciones, gestor de dependencias, `.env.example`, build, lint y test básico.
2. Diseñar el modelo multi-tenant y las políticas de seguridad: organizaciones, usuarios, roles, membresías, tickets, estados, prioridades, historial y adjuntos; validar aislamiento antes de UI avanzada.
3. Implementar autenticación y autorización por rol/tenant, con pruebas de acceso cruzado negativas.
4. Construir el flujo mínimo de tickets: creación simple, listado, detalle, cambio de estado, historial y asignación; la prioridad debe ser calculada por reglas, no suministrada por el solicitante.
5. Añadir timer, SLA, notificaciones por email y dashboard con datos reales; cubrirlos mediante API y pruebas end-to-end.
6. Incorporar adjuntos seguros, auditoría, administración/configuración de tenant, observabilidad, CI/CD y respaldo/retención.
7. Solo después validar WhatsApp, inventario, conocimiento, automatización, IA y proyectos como evoluciones de producto.

