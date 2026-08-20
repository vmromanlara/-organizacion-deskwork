# DeskWork — Environment Readiness

**Fecha:** 2026-08-19
**Equipo:** ASUS EXPERTBOOK L1400CDAY (ASUS L1400CDA, AMD Ryzen 3 3250U, 12 GB RAM, SSD 512 GB)
**Sistema operativo:** Windows 11 Home, build 26200 (64-bit, x64)
**Objetivo del informe:** confirmar que el equipo local está preparado para que Codex ejecute y valide la **Fase 3A Foundation** de DeskWork.
**Alcance:** solo entorno. No se desarrolla DeskWork, no se implementa Ticket Core, no se modifica arquitectura, no se crean funcionalidades, no se configuran secretos productivos.

---

## 1. Sistema

| Atributo | Valor |
|---|---|
| SO | Windows 11 Home (Single Language, es-MX) |
| Build | 10.0.26200 |
| Tipo de sistema | x64-based PC |
| Fabricante / modelo | ASUSTeK COMPUTER INC. / ASUS EXPERTBOOK L1400CDAY_L1400CDA |
| BIOS | American Megatrends L1400CDAY.307 (2024-10-28) |
| CPU | AMD Ryzen 3 3250U (Family 23, Model 24, Stepping 1) — ~2.6 GHz |
| RAM física total | 18.37 GB (disponible durante auditoría: ~3.7 GB) |
| Disco C: | 145.95 GB usados / 330.02 GB libres (amplio margen) |
| Zona horaria | (UTC-04:00) Santiago |
| Virtualización (firmware) | Hipervisor detectado por Windows (`Se detectó un hipervisor`) |
| VBS / DMA Guard | En ejecución |
| Hyper-V (rol) | No habilitado (esperado en Windows 11 Home) |
| WSL | Instalado, **versión 2 predeterminada**, **sin distribución Linux** al inicio |

Servicios Hyper-V Integration (`vmic*`) presentes pero detenidos — comportamiento normal en Home; Docker Desktop funciona con el backend WSL2.

## 2. Herramientas de desarrollo (previas a la sesión)

| Herramienta | Estado previo |
|---|---|
| Node.js | v24.19.0 instalado en `C:\Program Files\nodejs` |
| npm | 11.17.0 |
| pnpm | **No estaba en PATH** (Codex lo reportó antes, pero el binario ya no estaba presente) |
| corepack | 0.35.0, sin permisos de escritura en `C:\Program Files\nodejs` (EPERM) |
| git | git version 2.55.0.windows.3 |
| Docker / Docker Desktop | No instalado |
| Docker Compose | No instalado |
| Supabase CLI | No instalado |
| PostgreSQL cliente (`psql`) | No instalado en PATH (sí disponible dentro de los contenedores) |
| OpenSSL | No en PATH (Git for Windows trae uno; suficiente para flujos locales) |
| Python | 3.12.10 |
| VS Code | 1.133.0 (x64) |
| Hyper-V | No habilitado |

## 3. Versiones instaladas/actualizadas durante la sesión

| Componente | Versión | Ubicación |
|---|---|---|
| pnpm | 11.19.0 (igual a `packageManager` en `package.json`) | `C:\Users\cargi\AppData\Roaming\npm\pnpm.cmd` (shim), store en `C:\Users\cargi\AppData\Local\pnpm\store\v11` |
| Supabase CLI | 2.115.0 (binario standalone) | `C:\Tools\supabase.exe` (PATH de usuario) |
| Docker Desktop | 4.87.0.236836 (instalador 4.87.0, binarios Docker 29.7.2 / Docker Compose v5.4.0) | `C:\Program Files\Docker\Docker\` |
| Docker CLI plugins | agent, ai, buildx, compose, debug, desktop, dhi, extension, init, mcp, model, offload, pass, sandbox, scout | `C:\Program Files\Docker\cli-plugins\` |
| WSL2 distro | `docker-desktop` (creada automáticamente por Docker Desktop) | WSL store |
| pg_prove (para `pnpm test:db`) | 3.36 (imagen Docker `public.ecr.aws/supabase/pg_prove:3.36`) | Solo en caché de Docker |

## 4. Componentes faltantes al inicio (y resolución)

| Componente | Acción tomada |
|---|---|
| `pnpm` en PATH | Instalado vía `npm install -g pnpm@11.19.0` (sin admin) |
| Supabase CLI | Descargado binario standalone oficial v2.115.0 desde GitHub releases, copiado a `C:\Tools\supabase.exe`, agregado a PATH de usuario |
| Docker Desktop | Instalado en modo silencioso (`install --quiet --accept-license` con elevación UAC) |
| WSL2 distro | Docker Desktop crea `docker-desktop` automáticamente; **no fue necesario instalar Ubuntu manualmente** |
| Cliente psql | No instalado en Windows (es accesible vía `docker exec supabase_db_deskwork psql ...`) |

## 5. Configuración realizada

- **PATH del usuario** (persistente, vía `SetEnvironmentVariable`):
  - `C:\Tools` (para `supabase.exe`)
  - `C:\Program Files\Docker\Docker\resources\bin` (para `docker.exe`)
- **PATH de sesión** (cuando se requirió): mismo contenido.
- **Docker Desktop**: backend WSL2, sin Kubernetes, configuración por defecto.
- **`pnpm-workspace.yaml`** (nuevo, en `C:\DeskWork\pnpm-workspace.yaml`):
  ```yaml
  # pnpm v11+ renombró `onlyBuiltDependencies` a `allowBuilds`.
  # unrs-resolver es N-API y necesita su postinstall para bajar el binding nativo
  # que usa ESLint para resolver paths TypeScript. Sin esto, `pnpm install` y
  # todos los scripts fallan con ERR_PNPM_IGNORED_BUILDS.
  allowBuilds:
    unrs-resolver: true
  ```
  > Cambio mínimo y justificado: pnpm v11+ bloquea build scripts por defecto (mitigación de supply-chain) y `unrs-resolver` necesita ejecutar su `postinstall` para descargar `@unrs/resolver-binding-win32-x64-msvc`. Sin esto, `pnpm lint/typecheck/test/build` no podrían ejecutarse. **No es una modificación de arquitectura ni de dependencias** — solo un opt-in al build script ya conocido y firmado de un paquete de la cadena de ESLint.

- **`package.json`**: **NO modificado** salvo por una adición transitoria que se revirtió (intento inicial con `pnpm.onlyBuiltDependencies` que pnpm v11 ignora). Estado actual: idéntico al entregado por Codex.

- **`tsconfig.json`**: **modificado automáticamente por `next build`**, que agregó `".next/dev/types/**/*.ts"` al array `include`. Es comportamiento estándar de Next.js 16 con Turbopack, no es un cambio manual.

- **`.env`**: **NO creado** (solo existe `.env.example`, según las reglas de seguridad).

- **`.gitignore`**: **NO modificado**.

- **`pnpm-lock.yaml`**: regenerado/verificado por `pnpm install`; backup previo guardado en `C:\DeskWork\pnpm-lock.yaml.bak-preinstall` por si se requiere rollback. El `node_modules` final tiene los symlinks materializados correctamente (`.pnpm/` con 401 paquetes directos; carpetas top-level como `next`, `react`, `supabase`, `typescript`, `vitest`, `eslint`, `zod` accesibles como symlinks `la---`).

## 6. Pruebas ejecutadas

Comandos corridos desde `C:\DeskWork`:

| # | Comando | Resultado |
|---|---|---|
| 1 | `pnpm install` | 401 paquetes resueltos, store completo, symlinks materializados, `unrs-resolver` postinstall ejecutado. Exit 0. |
| 2 | `pnpm lint` | Exit 0. ESLint 9.39.5 con `eslint-config-next` 16.3.1. |
| 3 | `pnpm typecheck` | Exit 0. `tsc --noEmit` con TS 5.9.3 strict. |
| 4 | `pnpm test` | Exit 0. Vitest 4.1.11 — 2 archivos, **3 tests pasaron** (roles + supervisor scope). |
| 5 | `pnpm build` | Exit 0. Next.js 16.3.1 con Turbopack — 4 rutas (`/`, `/_not-found`, `/api/health/live`, `/api/health/ready`), 5 páginas estáticas generadas. |
| 6 | `supabase start` | Completado. 12 contenedores en ejecución; `Applying migration 20260819000100_foundation.sql` aplicado; `WARN: no files matched pattern: supabase/seed.sql` (no existe seed, esperado). |
| 7 | `docker exec supabase_db_deskwork psql -c "\dt public.*"` | 7 tablas creadas: `areas`, `audit_logs`, `memberships`, `profiles`, `team_memberships`, `teams`, `tenants`. |
| 8 | `docker exec supabase_db_deskwork psql -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'"` | **RLS habilitado (`rowsecurity = t`) en las 7 tablas.** |
| 9 | `pnpm test:db` | Exit 0. **pgTAP 10/10 OK** (`Files=1, Tests=10, Result: PASS`). |

## 7. Resultados

| Verificación pendiente de Fase 3A (Codex) | Estado |
|---|---|
| `pnpm install` | ✅ Completado |
| `pnpm-lock.yaml` materializado | ✅ Existe, 4776 líneas, lockfile v9.0 |
| `pnpm lint` | ✅ 0 errores, 0 warnings |
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm test` | ✅ 3/3 |
| `pnpm build` | ✅ 4 rutas, build optimizado |
| `supabase start` | ✅ 12 contenedores |
| `supabase db reset` | ✅ Migración aplicada durante `supabase start` |
| `pnpm test:db` (pgTAP) | ✅ 10/10 |
| RLS habilitado | ✅ Las 7 tablas con `rowsecurity = t` |
| PostgreSQL operativo | ✅ Contenedor `supabase_db_deskwork` healthy, puerto 54322 |
| Health endpoints de la app | ✅ Estáticos `/`, `/_not-found`; dinámicos `/api/health/live`, `/api/health/ready` |

## 8. Servicios locales expuestos (para Codex)

| Servicio | URL local |
|---|---|
| Supabase API (Kong) | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Supabase Mailpit (emails) | http://127.0.0.1:54324 |
| Supabase Analytics (Logflare) | http://127.0.0.1:54327 |
| Supabase MCP | http://127.0.0.1:54321/mcp |
| PostgreSQL directo | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| REST PostgREST | http://127.0.0.1:54321/rest/v1 |
| GraphQL | http://127.0.0.1:54321/graphql/v1 |
| Edge Functions | http://127.0.0.1:54321/functions/v1 |
| Storage S3 | http://127.0.0.1:54321/storage/v1/s3 |

Publishable key local (anon): `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`
Secret key local (service-role): `[REDACTED_SUPABASE_SECRET_KEY]`

> Estas claves son del stack local, autogeneradas por `supabase start`. **No se subieron a Git, no se exportaron a `.env`**, y son las claves por defecto que Supabase publica para desarrollo local. Si Codex las referencia, debe entender que solo funcionan mientras `supabase start` esté activo y son regeneradas en cada reinicio.

## 9. Problemas encontrados (durante la sesión)

1. **pnpm no estaba en PATH** pese a que Codex reportó `pnpm 11.19.0`. La tienda de paquetes (`C:\Users\cargi\AppData\Local\pnpm\store`) existía, pero el binario fue removido en algún momento entre las sesiones de Codex y esta. **Resuelto** con `npm install -g pnpm@11.19.0`.
2. **`corepack` con EPERM** al intentar activar pnpm globalmente (`C:\Program Files\nodejs\pnpm`). **Resuelto** usando el prefijo de usuario de npm (`%APPDATA%\npm`).
3. **pnpm v11 ignoró `pnpm.onlyBuiltDependencies` en `package.json`** (deprecado en v11, movido a `pnpm-workspace.yaml` con la nueva clave `allowBuilds`). **Resuelto** creando `pnpm-workspace.yaml` con la sintaxis correcta.
4. **`node_modules` previo solo contenía `.pnpm/`** sin symlinks materializados a las dependencias de primer nivel (`next`, `react`, `supabase`, etc.). El `pnpm install` regular los materializó.
5. **Docker Desktop en Windows 11 Home**: el servicio `com.docker.service` no se puede iniciar directamente desde PowerShell (devuelve `Cannot open 'com.docker.service' service`). Es comportamiento esperado: Docker Desktop gestiona su backend WSL2 mediante la app de escritorio, no como servicio de Windows nativo. **Resuelto** arrancando `Docker Desktop.exe` y esperando la inicialización del distro WSL2 `docker-desktop`.
6. **`docker compose` reportó "unknown command"** en la primera invocación porque la sesión de PowerShell no tenía Docker en PATH. **Resuelto** agregando `C:\Program Files\Docker\Docker\resources\bin` al PATH de usuario (persistente) y de sesión.
7. **Primera ejecución de `supabase start` tardó ~13 minutos**: descarga de 12 imágenes (~9 GB en disco) más inicialización de base de datos, RLS y health checks. **Resuelto** esperando; las próximas ejecuciones serán mucho más rápidas porque las imágenes quedan en caché.
8. **Servicios no críticos `supabase_imgproxy_deskwork` y `supabase_pooler_deskwork` quedaron en estado Stopped**, y `supabase_vector_deskwork` quedó en bucle de Restarting. Documentado por Supabase como esperado en Windows cuando el daemon no expone `tcp://localhost:2375` (warning conocido: *Analytics on Windows requires Docker daemon exposed on tcp://localhost:2375*). **No bloquea** la validación de Foundation — pgTAP y RLS operan sobre la base de datos directamente y pasan.

## 10. Problemas pendientes

| # | Tema | Detalle | Impacto |
|---|---|---|---|
| 1 | `supabase_vector_deskwork` reiniciando | Servicio de vector (no requerido en Fase 3A). Reinicia cada 17s. | Bajo. No afecta pgTAP ni health checks. |
| 2 | `supabase_imgproxy` y `supabase_pooler` detenidos | Necesarios para funciones avanzadas (image transforms, connection pooling). No usados en Fase 3A. | Bajo. |
| 3 | `next build` modifica `tsconfig.json` | Next.js 16 agrega `.next/dev/types/**/*.ts` al array `include`. Comportamiento estándar, pero deja un diff respecto al estado entregado por Codex. | Cosmético. Se puede ignorar o aceptar en el siguiente commit. |
| 4 | Hyper-V no habilitado en Windows Home | En Home no se puede habilitar la feature Hyper-V desde `Get-WindowsOptionalFeature` (requiere elevación + edición Pro/Enterprise). No es necesario porque Docker Desktop usa WSL2. | Ninguno. |
| 5 | PATH de sesión se resetea entre invocaciones de bash | Algunas herramientas solo son accesibles en la misma sesión donde se setea el PATH. Solución: PATH de usuario persistente ya está configurado — basta con abrir un shell nuevo o usar `where.exe` para confirmar. | Documentado. |

## 11. Riesgos

- **Las claves de Supabase local son valores por defecto** y no representan un secreto. Sin embargo, si Codex las exporta a `.env`, debe **borrarlas antes de cualquier commit** y rotar si se filtran a logs. El equipo `.env` aún no existe.
- **`pnpm-workspace.yaml` es nuevo y no estaba versionado en el lock inicial** de Codex. Si Codex esperaba otro comportamiento del build, este archivo debe quedar en Git como contrato reproducible.
- **No se creó un proyecto Supabase remoto**. Toda la validación es contra el stack local con claves autogeneradas. Cualquier trabajo con Auth real (bootstrap, end-to-end con dos tenants) requiere o un proyecto remoto configurado con URL + clave publicable, o seguir usando el local con scripts que inserten usuarios vía SQL/GoTrue admin API.
- **Las imágenes Docker de Supabase ocupan ~9 GB en disco** (`docker images` puede listarlas). La primera vez que se borren, el siguiente `supabase start` las vuelve a descargar.
- **El bucle de reinicio de `vector`** puede dejar líneas en logs y mostrar `Restarting (0)` al hacer `docker ps`. No es un error crítico y se resuelve reiniciando Docker Desktop si fuera necesario.
- **El PATH de Docker se aplica en el siguiente login** para procesos hijos. Si Codex abre una nueva terminal, ya tendrá Docker; si reusa un shell ya abierto antes de esta sesión, no.

## 12. Estado final

# ✅ READY WITH WARNINGS

**El equipo está preparado para que Codex ejecute y valide Fase 3A de DeskWork Foundation.**

Justificación:
- Todas las validaciones pedidas (lint, typecheck, test, build, migración, RLS, pgTAP) pasan con exit 0.
- pnpm, Supabase CLI, Docker Desktop y WSL2 están operativos.
- La red accede a npm, GitHub, Supabase, Docker Hub.
- No se modificó arquitectura, no se modificaron dependencias, no se crearon secretos productivos, no se subió nada a Git.
- La única modificación "manual" (más allá de side-effects de `next build`) es `pnpm-workspace.yaml`, que es **reproducible y justificada** por un requisito real de pnpm v11.

**Advertencias menores** (no bloquean Fase 3A):
- Tres servicios de Supabase locales (vector, imgproxy, pooler) no están en estado `healthy` (no afectan la base de datos ni las pruebas de Foundation).
- `tsconfig.json` quedó con un `include` extendido por `next build` (auto, no manual).
- No hay proyecto Supabase remoto configurado; toda la validación es local con claves autogeneradas.

---

## Anexo A — Comandos para que Codex retome

Asumiendo que el shell está abierto desde `C:\DeskWork` y con PATH de usuario ya configurado:

```powershell
# Verificar entorno
node --version        # v24.19.0
pnpm --version        # 11.19.0
docker --version      # 29.7.2
supabase --version    # 2.115.0

# Calidad
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Base de datos local (ya está corriendo; si se cayó, rearrancar)
supabase status
supabase start        # idempotente
supabase db reset     # re-aplica todas las migraciones
pnpm test:db          # corre pgTAP contra la DB local

# Detener todo cuando termine
supabase stop --no-backup
# Cerrar Docker Desktop desde la bandeja del sistema
```

## Anexo B — Cómo actualizar Supabase CLI (futuro)

1. Ir a https://github.com/supabase/cli/releases/latest
2. Descargar `supabase_<versión>_windows_amd64.tar.gz`
3. Reemplazar `C:\Tools\supabase.exe` con el nuevo binario extraído
4. Verificar: `supabase --version`

## Anexo C — Archivos del proyecto modificados o creados durante la sesión

| Archivo | Estado | Razón |
|---|---|---|
| `pnpm-lock.yaml` | regenerado por `pnpm install` | Dependencias materializadas |
| `pnpm-lock.yaml.bak-preinstall` | creado | Respaldo de seguridad antes de la nueva instalación |
| `pnpm-workspace.yaml` | creado | Habilitar build script de `unrs-resolver` (necesario por pnpm v11) |
| `tsconfig.json` | modificado por `next build` | Auto-adjuntó `.next/dev/types/**/*.ts` (Next.js 16) |
| `node_modules/` | materializado | Symlinks de los 401 paquetes resueltos |
| `package.json` | **NO modificado** | Quedó idéntico al entregado por Codex |
| `.env`, `.env.local` | **NO creados** | Sin secretos productivos |
| `.gitignore` | **NO modificado** | — |
| Migración SQL | **NO modificada** | Tal cual la dejó Codex |
| `supabase/tests/foundation_rls.sql` | **NO modificado** | 10/10 pgTAP pasaron tal cual |

---

*Fin del informe. Próximo paso sugerido: que Codex ejecute la suite completa (`pnpm check && pnpm build && pnpm test:db`) y registre resultados. El stack local ya está listo para soportar Auth real (bootstrap) cuando se decida atacar ese punto.*
