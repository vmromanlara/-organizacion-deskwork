# DESKWORK — Provisioning Security Policy

**Fecha:** 2026-08-26
**Hallazgo remediado:** PROV-003 (Phase 3A adversarial audit, MEDIUM)
**Baseline al momento de redactar:** `210e37398cc141cc57c49bd0281a782b61415b57`
**Estado:** Implementación documental. Pendiente de cross-audit Mavis.

---

## 1. Propósito

Esta política establece las reglas operativas que gobiernan el uso, la custodia, la rotación y la respuesta a incidente de las credenciales de **máximo privilegio** dentro de DeskWork, en particular la credencial `service_role` de Supabase y, por extensión, cualquier RPC o función `SECURITY DEFINER` que dependa exclusivamente de ella.

El objetivo es reducir la probabilidad y el blast radius de una exposición de credenciales administrativas, definiendo controles operativos, reglas de no exposición, periodicidad de rotación y procedimientos de respuesta.

Esta política **no introduce cambios en Foundation 3A** (migrations, RLS, funciones `SECURITY DEFINER`, `auth`, `identity`, `provisioning` SQL). Es una capa de control operativo sobre el estado ya commiteado.

## 2. Alcance

Esta política aplica a:

- **`service_role`** de Supabase (credencial de máximo privilegio).
- **`issue_provisioning_token(...)`** y cualquier otra función SQL invocable únicamente por `service_role`.
- **Toda credencial, secret, API key o token** que tenga impacto en el modelo de seguridad de DeskWork, sin importar el proveedor.
- **Entornos de Supabase** (local, staging, producción).
- **Entornos de deployment y runtime** donde se ejecuten servicios que tengan acceso a `service_role` o equivalentes.
- **Procesos de provisioning** de tenants, memberships, scopes y roles funcionales.
- **Logs, repositorios, canales de comunicación, issues, tickets y documentación pública** donde pudiera filtrarse una credencial.
- **Personas y roles** que tengan acceso a credenciales administrativas (Product Owner, ingenieros de plataforma, SRE, auditores).

## 3. Regla de privilegio

`service_role` es la credencial administrativa de Supabase. Suplantarla equivale a tener control total sobre la base de datos, el esquema público, las funciones `SECURITY DEFINER` y los grants asociados.

Por lo tanto:

- **`service_role` NUNCA debe ser invocada desde código de cliente** (navegador, app móvil, frontend). El modelo de Supabase está diseñado para que el cliente use `anon` o `authenticated`.
- **`service_role` NUNCA debe ser expuesta a un usuario final**, bajo ninguna circunstancia.
- **`service_role` NUNCA debe formar parte del código de aplicación cliente**, de variables públicas (`NEXT_PUBLIC_*`), ni de artefactos distribuidos.
- **`service_role` NUNCA debe aparecer en repositorios de código** (commits, branches, tags, forks, history, backups).
- **Cualquier código que necesite operaciones administrativas** debe ejecutarse en un entorno de servidor confiable, no en el cliente.

La función `issue_provisioning_token(text, text, text, public.functional_role, boolean, timestamptz, uuid, text)` está `GRANT EXECUTE` únicamente a `service_role` por diseño. Esto es intencional y no se modifica en esta remediación. El control se aplica a **quién puede invocar la credencial**, no a la función misma.

## 4. Custodia

### 4.1 Ubicación

`service_role` y cualquier credencial de equivalente privilegio deben residir en un **secret manager** o un **secure environment variable store** del entorno de ejecución, nunca en el código fuente.

Aplica tanto a:

- Entornos locales de desarrollo (`.env.local`, pero nunca commiteado al repo).
- Entornos de CI/CD (secret store del runner).
- Entornos de deployment (managed secret del proveedor cloud).
- Entornos de runtime (injected env vars en el pod, container, function o worker).

### 4.2 Acceso

- El acceso a las credenciales de máximo privilegio debe estar limitado a **personas con responsabilidad explícita** sobre la operación de DeskWork: Product Owner, ingenieros de plataforma, SRE.
- El número de personas con acceso directo debe ser el **mínimo indispensable**.
- El acceso debe estar sujeto a autenticación fuerte (MFA) cuando el secret manager lo soporte.
- El acceso debe ser **auditable** (logs de quién leyó qué secret y cuándo).

### 4.3 Prohibiciones

- **NO** compartir credenciales por canales inseguros (correo sin cifrar, chat sin cifrado de extremo a extremo, documentos compartidos sin control de acceso, etc.).
- **NO** pegar credenciales en issues, tickets, descripciones de PR, comentarios de código, screenshots o cualquier sistema que pueda ser indexado o filtrado.
- **NO** transcribir credenciales en notas personales, libretas físicas no custodiadas, o sistemas de notas no cifrados.
- **NO** usar credenciales de máximo privilegio en entornos donde la rotación es difícil o no se puede garantizar.

## 5. No-commit / No-log

`service_role` (y cualquier secret equivalente) **nunca** debe aparecer en:

- **Commits** de cualquier rama, fork, tag o release del repositorio.
- **Logs** de aplicación, sistema operativo, base de datos, balanceador, WAF, CDN, monitoring.
- **Console output** de procesos, scripts, funciones serverless o jobs.
- **Screenshots**, recordings, videos de demo o cualquier captura visual.
- **Issues, tickets, descripciones de PR, code review comments, o mensajes de equipo.**
- **Documentación pública** (incluyendo sitios web, wikis públicas, blogs, papers).
- **Logs de debugging**, traces de APM, dumps de error, stack traces que incluyan el environment completo.
- **Respaldos de bases de datos** que no estén cifrados y custodiados.

Durante el debugging, **nunca imprimir el valor de un secret**. Si se necesita confirmar que un secret está siendo leído correctamente, registrar solo la **longitud** o un **hash no reversible** (e.g., SHA-256 truncado), nunca el valor.

## 6. Rotación

### 6.1 Política general

La periodicidad exacta de rotación preventiva debe ser definida por la **política corporativa de secretos** aplicable a DeskWork. Esta política documental no impone una periodicidad concreta porque eso depende del contexto operacional, del proveedor cloud y de la madurez de la organización.

Como **mínimo obligatorio**, esta política exige:

- **Rotación inmediata ante compromiso** confirmado o sospecha razonable de exposición.
- **Rotación ante cambios de personal** que hubieran tenido acceso a la credencial.
- **Rotación ante incidentes de seguridad** que comprometan el entorno donde reside la credencial.
- **Rotación tras cualquier exposición accidental**, incluso si se considera contenida (defense in depth).

### 6.2 Procedimiento de rotación

Una rotación no es solo "cambiar el valor":

1. **Generar el nuevo secret** en el secret manager.
2. **Inyectar el nuevo secret** en los entornos correspondientes (staging, producción) sin periodo de inactividad.
3. **Validar** que los servicios que dependen de la credencial siguen funcionando.
4. **Revocar el secret anterior** solo después de confirmar la transición.
5. **Auditar el uso** del secret anterior en los logs del secret manager para detectar accesos recientes.
6. **Documentar la rotación** con fecha, motivo, persona responsable, hash no reversible del valor anterior.

Si la rotación es por compromiso, seguir además el procedimiento de respuesta a incidente (sección 7).

## 7. Respuesta ante compromiso

Si se sospecha o confirma que `service_role` (o cualquier credencial equivalente) ha sido expuesta, comprometida o filtrada:

1. **Declarar el incidente.** Notificar al Product Owner, al equipo de seguridad y a las partes relevantes. Abrir un ticket de incidente con clasificación de severidad.
2. **Rotar la credencial inmediatamente.** Generar un nuevo valor y revocar el anterior lo antes posible. No esperar a tener "más información" — la contención es prioritaria.
3. **Identificar el vector de exposición.** Revisar: cuándo se filtró, dónde (commit, log, issue, screenshot, conversación, etc.), quién tuvo acceso, si quedó cacheado en algún sistema.
4. **Revisar logs de actividad de provisioning.** Identificar todas las invocaciones recientes de `issue_provisioning_token` y otras funciones administrativas. Determinar si hubo actividad sospechosa.
5. **Evaluar tenants creados o modificados durante la ventana de exposición.** Listar tenants con timestamps, comparar contra operación esperada. Si hay tenants no reconocidos, documentar y aislar.
6. **Invalidar credenciales derivadas** si corresponde. Si tokens de provisioning fueron emitidos durante la ventana de exposición y no han sido consumidos, invalidarlos. Si memberships fueron creadas con roles administrativos, evaluar su legitimidad.
7. **Preservar evidencia.** No borrar logs, no eliminar archivos de configuración antiguos, no hacer force-push al repo. Toda la cadena de custodia es importante.
8. **Cerrar el incidente.** Documentar causa raíz, blast radius, remediaciones aplicadas, lecciones aprendidas. Si corresponde, actualizar esta política.

## 8. `issue_provisioning_token`

### 8.1 Quién puede invocarla

Únicamente `service_role`. El grant está definido en `supabase/migrations/20260819000200_authorization_foundation.sql` y no se modifica en esta remediación.

La función es `SECURITY DEFINER` y se ejecuta con privilegios del owner. Esto es intencional: el caller (con `service_role`) tiene la capacidad de emitir un token que crea un nuevo tenant con `initial_functional_role` y `initial_is_tenant_admin` configurados según el token.

### 8.2 Por qué existe

Es la única vía legítima para crear un tenant nuevo desde el plano de control. Cualquier otra vía de creación de tenants fuera de esta función es un bypass de seguridad operacional.

### 8.3 Riesgo

Si `service_role` se filtra, un atacante puede emitir tokens de provisioning para crear tenants arbitrarios con privilegios elevados (`technical_lead`, `is_tenant_admin = true`). Cada token emitido puede consumirse una vez para crear un membership inicial con esos privilegios.

Por lo tanto, la protección de `service_role` es **la única línea de control** de la creación de tenants. Esta es la esencia del hallazgo PROV-003.

### 8.4 Restricciones de exposición

- **`issue_provisioning_token` no debe exponerse** mediante UI, endpoint público, función serverless accesible desde internet, ni ningún canal accesible por `anon` o `authenticated`.
- **El acceso continúa restringido a `service_role`** y no se modifica en esta remediación.
- **Cualquier propuesta de exponer esta función a otros roles** debe pasar por una revisión de seguridad y waiver explícito del Product Owner.

## 9. Checklist operativo

### 9.1 Antes de deployment

- [ ] Las credenciales de máximo privilegio están almacenadas en un secret manager o equivalente.
- [ ] Ninguna credencial de máximoprivilegio está hardcoded en el código, en archivos `.env` commiteados, en variables `NEXT_PUBLIC_*`, ni en documentación pública.
- [ ] Los entornos de CI/CD tienen acceso a las credenciales vía secret store, nunca vía archivos planos en el repo.
- [ ] El `.gitignore` del proyecto excluye `.env`, `.env.local`, `.env.*.local` (verificado en Foundation 3A).
- [ ] Los logs de los servicios donde se inyectan las credenciales están configurados para no imprimirlas.

### 9.2 Durante operación

- [ ] Las invocaciones de `issue_provisioning_token` y otras funciones administrativas son trazables al secret manager.
- [ ] El acceso a las credenciales de máximo privilegio es auditado (logs de lectura del secret manager).
- [ ] El acceso directo a las credenciales está limitado a las personas con responsabilidad explícita.
- [ ] No se imprimen valores de secrets durante debugging (solo longitud o hash no reversible).
- [ ] No se comparten credenciales por canales inseguros.

### 9.3 Ante incidente

- [ ] Incidente declarado y documentado con clasificación de severidad.
- [ ] Credencial rotada inmediatamente, sin esperar confirmación completa de exposición.
- [ ] Vector de exposición identificado (commit, log, issue, screenshot, etc.).
- [ ] Logs de actividad de provisioning revisados en la ventana de exposición.
- [ ] Tenants creados/modificados durante la ventana evaluados.
- [ ] Credenciales derivadas invalidadas si corresponde.
- [ ] Evidencia preservada (no se borra nada).
- [ ] Incidente cerrado con causa raíz, blast radius, remediaciones y lecciones aprendidas.

---

## 10. Relación con Foundation 3A y remediación PROV-003

Esta política es la **remediación documental** del hallazgo PROV-003 identificado en la auditoría adversarial de Foundation 3A.

- **No se modifican migraciones, RLS, funciones SQL, auth, identity, ni provisioning SQL.**
- **No se crea tabla `provisioning_audit`**, panel de control, ni nueva RPC en esta remediación.
- **El grant de `issue_provisioning_token` a `service_role` permanece sin cambios.**

Esta política establece **controles operativos** que reducen el blast radius de una exposición de `service_role` sin alterar la arquitectura de seguridad implementada en Foundation 3A.

El cierre formal del hallazgo PROV-003 queda **pendiente de cross-audit Mavis** que valide que esta política cumple con los requisitos del DoD definido en el plan de remediación v2.

---

**Fin del documento.**
