# DeskWork — RUNBOOK

> **Runbook operacional de DeskWork Ticketing Core.**
> **Rama de release:** `remediation/ticketing-core` (HEAD: `49995a7`)
> **Versión del documento:** 1.0 (2026-08-31)
> **Audiencia:** operadores de producción, SRE, equipo de soporte técnico.

Este documento describe cómo operar DeskWork Ticketing Core en producción:
prerequisitos, variables de entorno, configuración de Supabase, seguridad,
procedimiento de deploy, rollback, troubleshooting, manejo del outbox,
limitaciones conocidas y verificación post-deploy.

> ⚠️ **Este runbook corresponde al RELEASE IN-APP ONLY de DeskWork.**
> Email transaccional y worker de outbox **NO forman parte de este release**
> (ver sección 9 — Limitaciones conocidas y §10 — Estado del outbox).

---

## Tabla de contenidos

1. [Prerequisitos de deployment](#1-prerequisitos-de-deployment)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Configuración de Supabase](#3-configuración-de-supabase)
4. [Configuración de `SUPABASE_SERVICE_ROLE_KEY`](#4-configuración-de-supabase_service_role_key)
5. [Seguridad: `service_role` exclusivamente server-side](#5-seguridad-service_role-exclusivamente-server-side)
6. [Configuración de `NEXT_PUBLIC_APP_URL`](#6-configuración-de-next_public_app_url)
7. [Procedimiento de deploy](#7-procedimiento-de-deploy)
8. [Procedimiento de rollback](#8-procedimiento-de-rollback)
9. [Limitaciones conocidas](#9-limitaciones-conocidas)
10. [Estado del outbox y procedimiento de diagnóstico](#10-estado-del-outbox-y-procedimiento-de-diagnóstico)
11. [Troubleshooting básico](#11-troubleshooting-básico)
12. [Procedimiento de verificación post-deploy](#12-procedimiento-de-verificación-post-deploy)
13. [Distinción KPIs operacionales vs SLA contractual](#13-distinción-kpis-operacionales-vs-sla-contractual)

---

## 1. Prerequisitos de deployment

### 1.1 Runtime

| Requisito | Versión | Notas |
|-----------|---------|-------|
| Node.js | ≥ 24.0.0 | Declarado en `package.json:engines.node` |
| pnpm | ≥ 11.19.0 | `packageManager: pnpm@11.19.0` en `package.json` |
| Sistema operativo | Linux (recomendado), macOS, Windows | Build validado en Windows 11 (dev) y Linux (server target) |

### 1.2 Servicios externos

| Servicio | Necesario | Notas |
|----------|-----------|-------|
| **Supabase** (producción) | ✅ SÍ | Proyecto dedicado con migraciones aplicadas |
| **Supabase Storage** | ✅ SÍ | Bucket `ticket-attachments` (creado por migration) |
| Email provider (Resend/SMTP) | ❌ NO en este release | Diferido a TKT-026 |
| Sentry / observabilidad | ❌ NO en este release | Diferible |
| CDN / reverse proxy | ⚠ Opcional | Cloudflare, Vercel, Cloud Run, etc. |

### 1.3 Artefactos del build

| Artefacto | Comando | Output |
|-----------|---------|--------|
| Build de producción | `pnpm install --frozen-lockfile && pnpm build` | `.next/` |
| Server de producción | `pnpm start` | Levanta Next.js en puerto 3000 (default) |
| Migraciones DB | `supabase db push` (en host con CLI) | Aplica migrations 20260819* + 20260820* + 20260827* |

### 1.4 Permisos necesarios para deployar

- Acceso de escritura al proyecto Supabase (rol `postgres` o migration runner).
- Acceso de lectura al secret manager / env del host de deploy.
- Acceso al repositorio Git (rama `remediation/ticketing-core` o `main` después de merge).

---

## 2. Variables de entorno

Las variables se declaran en `src/shared/config/env.ts` y se validan con Zod.
**El servidor falla en arrancar si las vars públicas requeridas faltan.**
Las vars server-side son opcionales y degradan funcionalidad si faltan.

### 2.1 Variables públicas (cliente + servidor)

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ SÍ | — | URL del proyecto Supabase (`https://<project>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ SÍ | — | Publishable key del proyecto Supabase (no es `service_role`) |
| `NEXT_PUBLIC_APP_URL` | ⚠ Recomendado | `http://localhost:3000` | Origin del deploy (usado para CORS, redirects, links) |

**Si faltan `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`:**
- En **server**: `Error: Supabase public configuration is required.` (en `src/shared/supabase/server.ts:9`).
- En **middleware**: el middleware pasa sin redirigir (no protege rutas).
- La **app no arranca**.

### 2.2 Variables server-side (NUNCA `NEXT_PUBLIC_*`)

| Variable | Requerida | Default | Si falta |
|----------|-----------|---------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠ SÍ para Storage | — | `getSupabaseAdminClient()` retorna `null`. TKT-014 v2 (upload + signed URL) responde **503 `storage_disabled`**. |
| `RESEND_API_KEY` | ❌ NO (TKT-026) | — | Diferido; no afecta este release |
| `RESEND_FROM_EMAIL` | ❌ NO (TKT-026) | — | Diferido; no afecta este release |
| `SENTRY_DSN` | ❌ NO | — | Sin observabilidad centralizada |
| `EMAIL_OUTBOX_BATCH_SIZE` | ❌ NO | `25` | Diferido; no afecta este release |

> ⚠️ **Cualquier `NEXT_PUBLIC_*` que contenga secretos se considera VULNERABILIDAD CRÍTICA.** El linter no lo detecta; la convención es manual.

### 2.3 Ejemplo de configuración (`.env.example`)

```bash
# Public Supabase connection. Safe to expose only with RLS policies enabled.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# Server-only integrations. Never expose these in NEXT_PUBLIC_* variables.
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=DeskWork <support@example.com>
SENTRY_DSN=

# Operational controls
NEXT_PUBLIC_APP_URL=http://localhost:3000
EMAIL_OUTBOX_BATCH_SIZE=25
```

### 2.4 Cómo inyectar las variables en producción

| Plataforma | Mecanismo |
|------------|-----------|
| Vercel | Project Settings → Environment Variables |
| Netlify | Site Settings → Environment Variables |
| AWS / EC2 / ECS | Parameter Store / Secrets Manager + task definition |
| Kubernetes | Secret + env var en Pod spec |
| Docker | `docker run -e VAR=value` o `--env-file` |
| Self-hosted Node | `.env.production` (NO commitear) o systemd `EnvironmentFile` |

> ⚠️ **NUNCA commitear `.env.local`, `.env.production` ni archivos con secretos.** Verificar `.gitignore` antes de cada push.

---

## 3. Configuración de Supabase

### 3.1 Proyecto Supabase

- **Tier mínimo recomendado:** Pro (para backups PITR, pero Free tier funciona para staging/MVP).
- **Región:** elegir la más cercana a los usuarios finales.
- **Auth:** Email/Password habilitado (configurado por Foundation 3A; no modificar).

### 3.2 Migraciones a aplicar

Las migraciones viven en `supabase/migrations/`. Aplicar en este orden cronológico:

| Rango | Descripción | Estado |
|-------|-------------|--------|
| `20260819000100_foundation.sql` | Schema Foundation 3A | NO TOCAR (intacto) |
| `20260819000200_authorization_foundation.sql` | Auth + RLS Foundation | NO TOCAR |
| `20260820000300_tenant_admin_scope_correction.sql` | Scope correction | NO TOCAR |
| `20260820000400_authenticated_table_privileges.sql` | Privileges hardening | NO TOCAR |
| `20260820000500_provisioning_crypto_schema.sql` | Provisioning crypto | NO TOCAR |
| `20260820000600_harden_table_privileges.sql` | TRUNCATE defense | NO TOCAR |
| `20260827000700_tickets_schema.sql` | Tickets schema + enums | Aplicar |
| `20260827000710_tickets_categories_seed.sql` | 9 categorías en `bootstrap_tenant` | Aplicar |
| `20260827000720_tickets_authorization.sql` | Helpers + mutators Ticketing | Aplicar |
| `20260827000730_tickets_rls.sql` | RLS Ticketing | Aplicar |
| `20260827000740_tickets_hardening_acl.sql` | TRUNCATE defense Ticketing | Aplicar |
| `20260827000750_tickets_can_modify_hardening.sql` | `can_modify_ticket` check | Aplicar |
| `20260827000760_tickets_multitenant_integrity.sql` | Multi-tenant defense | Aplicar |
| `20260827000770_ticket_categories_hide_inactive.sql` | Hide inactive categories | Aplicar |
| `20260827000780_ticket_apply_transition.sql` | `apply_ticket_transition` | Aplicar |
| `20260827000790_ticket_apply_transition_null_safety.sql` | Null safety | Aplicar |
| `20260827000800_ticket_create_comment.sql` | `create_ticket_comment` | Aplicar |
| `20260827000810_ticket_assign.sql` | `assign_ticket` | Aplicar |
| `20260827000820_ticket_register_attachment.sql` | `register_ticket_attachment` | Aplicar |
| `20260827000830_ticket_create.sql` | `create_ticket` (priority stub) | Aplicar |
| `20260827000840_notifications_outbox.sql` | Outbox + dispatcher RPCs | Aplicar |
| `20260827000850_storage_attachments.sql` | Bucket + RLS Storage | Aplicar |
| `20260827000860_ticket_kpis.sql` | `compute_ticket_kpis` | Aplicar |

**Comando:**
```bash
supabase db push
```

**Verificación post-migration:**
```bash
supabase test db
# Esperado: All tests successful. Files=16, Tests=259
```

### 3.3 Storage

- **Bucket** `ticket-attachments` se crea vía migration `20260827000850_storage_attachments.sql`:
  - Privado (`public = false`)
  - Límite: **25 MiB** (25 × 1024 × 1024 = 26.214.400 bytes). El bucket Storage, la app (`MAX_SIZE` en `route.ts`) y el schema de DB (`tickets_attachments.size_bytes > 0` CHECK) aplican el límite. El `size_bytes > 0` solo es lower bound; el upper bound lo aplican la app y el bucket.
  - Sin whitelist de MIME (validación por app)
- **RLS policies** en `storage.objects` (insert + delete) están activas via migration.
- **Service role** requerido para I/O server-side. Ver §4.

### 3.4 Auth

- **Auth.users** se provisiona vía `bootstrap_tenant(provisioning_token, initial_display_name)`.
- **Memberships** se crean con `status='active'` y `functional_role` configurable.
- **Sessions** son cookies SSR (patrón `@supabase/ssr` 0.8.0).

### 3.5 Row-Level Security (RLS)

7 tablas Ticketing tienen RLS activo:
- `tickets`, `ticket_events`, `ticket_comments`, `ticket_attachments`, `ticket_assignments`, `notification_outbox`, `ticket_categories`

Cada policy filtra por `is_active_member(tenant_id)` o helpers tenant-aware. **Defense in depth:** `revoke all privileges` + `grant select` replica el patrón Foundation 3A.

### 3.6 Database functions (SECURITY DEFINER)

**12 helpers** (lectura de permisos/autorización):
- `is_active_member(tenant_id)` — Foundation
- `has_scope(tenant_id, scope)` — Foundation
- `has_permission(code)` — Foundation
- `validate_membership_scope_grant(...)` — Foundation
- `is_tenant_admin(tenant_id)` — Foundation
- `can_modify_ticket(ticket_id)` — Ticketing
- `can_read_ticket(ticket_id)` — Ticketing
- `can_assign_ticket(ticket_id)` — Ticketing
- `ticket_attachment_tenant_id(path)` — Storage
- `can_upload_to_attachment_bucket(path)` — Storage
- `can_read_attachment_bucket(path)` — Storage
- `enqueue_ticket_notifications(event_id)` — Outbox (enqueue = mutator, pero también exposable)

**9 mutadores** (escritura controlada):
- `create_ticket(...)` — TKT-009
- `create_ticket_comment(...)` — TKT-013
- `assign_ticket(...)` — TKT-012
- `register_ticket_attachment(...)` — TKT-014
- `apply_ticket_transition(...)` — TKT-006
- `enqueue_ticket_notifications(...)` — TKT-019
- `claim_pending_notifications(...)` — TKT-019
- `complete_notification(...)` — TKT-019
- `compute_ticket_kpis(...)` — TKT-021 (lectura agregada, no mutación)

> ⚠️ Todos los mutadores son `SECURITY DEFINER` y re-validan autorización. Defense in depth: la API valida ANTES, la DB re-valida DENTRO de la transacción.

---

## 4. Configuración de `SUPABASE_SERVICE_ROLE_KEY`

### 4.1 Qué es

`SUPABASE_SERVICE_ROLE_KEY` es la clave de Supabase con permisos totales (bypass RLS). **Es server-only.**

### 4.2 Dónde se usa en DeskWork

| Punto de uso | Archivo | Por qué |
|--------------|---------|---------|
| `getSupabaseAdminClient()` | `src/shared/supabase/admin.ts` | Lazy init; retorna `null` si falta |
| `uploadAttachmentBlob()` | `src/modules/ticketing/supabase-repository.ts` | Sube binario a `ticket-attachments/{tenant_id}/{ticket_id}/{filename}` |
| `createAttachmentSignedUrl()` | `src/modules/ticketing/supabase-repository.ts` | Genera signed URL temporal (60-3600s) |
| `applyRegisterAttachment` cleanup | `src/modules/ticketing/supabase-repository.ts` | Borra objeto si metadata falla (anti-orphan) |

### 4.3 Cómo obtenerla

1. Ir a **Supabase Dashboard** → tu proyecto → **Settings** → **API**.
2. Sección **Project API keys**.
3. Copiar `service_role` (secret). **NO** la `anon` ni la `publishable`.
4. Guardar en el secret manager del host de deploy.

### 4.4 Dónde inyectarla

**Solo en variables de entorno server-side.** Ejemplos:

| Plataforma | Comando / UI |
|------------|--------------|
| Vercel | Settings → Environment Variables → agregar `SUPABASE_SERVICE_ROLE_KEY` |
| Docker | `docker run -e SUPABASE_SERVICE_ROLE_KEY=...` |
| Kubernetes | `Secret` + `env.valueFrom.secretKeyRef` |
| systemd | `Environment=SUPABASE_SERVICE_ROLE_KEY=...` en unit file |
| GitHub Actions | `secrets.SUPABASE_SERVICE_ROLE_KEY` |

### 4.5 Rotación

Recomendado cada 90 días o ante sospecha de compromiso.

1. Generar nueva key en Supabase Dashboard.
2. Actualizar en TODOS los entornos (staging + producción).
3. Redeploy.
4. Monitorear logs por errores 5xx en rutas de Storage.
5. Opcional: revocar la key vieja desde Supabase Dashboard.

### 4.6 Comportamiento si falta

```typescript
// src/shared/supabase/admin.ts:23-26
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  cached = null;
  return cached;
}
```

- `getSupabaseAdminClient()` retorna `null`.
- `POST /api/tickets/[id]/attachments` → **503 `storage_disabled`**.
- `GET /api/tickets/[id]/attachments/[id]/url` → **503 `storage_disabled`**.
- UI muestra error al usuario.

> ⚠️ **Si la app corre sin esta key, el feature de adjuntos binarios está INHABILITADO.** El resto del producto funciona.

---

## 5. Seguridad: `service_role` exclusivamente server-side

### 5.1 Principio

`service_role` bypassa RLS. Si se filtra al cliente, **toda la base de datos queda expuesta al browser del usuario**.

### 5.2 Garantías implementadas

| Capa | Garantía |
|------|----------|
| Código | `src/shared/supabase/admin.ts` tiene comentario `SOLO server-side. NUNCA importar este modulo en componentes "use client"` |
| Import path | El módulo está en `src/shared/supabase/`, no en `src/components/` ni marcado con `"use client"` |
| Convención `NEXT_PUBLIC_*` | Cualquier variable con `NEXT_PUBLIC_*` se bundlea al cliente. Service role NUNCA debe tener ese prefijo. |
| Build | El bundler de Next.js respeta `"use client"` y excluye módulos server-only. |

### 5.3 Auditoría rápida (anti-leak)

```bash
# 1) Buscar imports de admin.ts en archivos "use client"
grep -r "use client" src/ --include="*.tsx" --include="*.ts" -l | \
  xargs grep -l "shared/supabase/admin" 2>/dev/null
# Esperado: vacío.

# 2) Buscar service_role en código committed
grep -r "service_role" src/ scripts/ 2>/dev/null
# Esperado: solo en admin.ts (lectura) y comentarios explicativos.

# 3) Buscar service_role en NEXT_PUBLIC_*
grep -E "NEXT_PUBLIC_.*(SERVICE|service_role)" .env* 2>/dev/null
# Esperado: vacío.
```

### 5.4 Si se detecta un leak

1. **Inmediato:** rotar `service_role` en Supabase Dashboard.
2. Identificar el punto de leak (commit, screenshot, log, deploy error).
3. Re-deploy con la key nueva.
4. Auditar logs de Supabase por queries anómalas con `service_role` en `auth.role()`.
5. Documentar incidente en `CHANGELOG.md` (cuando exista).

---

## 6. Configuración de `NEXT_PUBLIC_APP_URL`

### 6.1 Propósito

Define el origin público de la app. Usado para:
- CORS (en combinación con el middleware de Supabase Auth).
- Links absolutos en emails (cuando se implemente TKT-026).
- Redirects post-login (si el `next` param requiere URL absoluta).

### 6.2 Valores esperados

| Entorno | Valor |
|---------|-------|
| Local dev | `http://localhost:3000` |
| Staging | `https://staging.deskwork.example.com` |
| Producción | `https://deskwork.example.com` |

### 6.3 Cómo se consume

- En `src/shared/config/env.ts:6` como `z.string().url().optional()`.
- Leída vía `getServerEnv()`.
- Si falta, Next.js usa el origin del request (suficiente para dev).

### 6.4 Configurar correctamente

- **Protocolo:** `https://` en staging/prod.
- **Sin trailing slash** (Zod valida con `.url()`).
- **Sin path** (es el origin, no la URL completa).

---

## 7. Procedimiento de deploy

### 7.1 Pre-deploy checklist

- [ ] Rama `remediation/ticketing-core` (o `main` post-merge) está en el HEAD deseado.
- [ ] Quality gates PASS en CI/local: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm build`.
- [ ] Variables de entorno configuradas en el host (ver §2).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` provisionada si se quiere Storage (ver §4).
- [ ] Migraciones DB aplicadas en el proyecto Supabase target (ver §3.2).
- [ ] Bucket `ticket-attachments` verificado en Supabase Storage.
- [ ] DNS / dominio apuntando al host de deploy.
- [ ] `NEXT_PUBLIC_APP_URL` configurado con el origin correcto.

### 7.2 Build

```bash
# 1) Clonar / fetch
git fetch origin
git checkout remediation/ticketing-core
git pull --ff-only

# 2) Instalar deps
pnpm install --frozen-lockfile

# 3) Quality gates
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db      # Requiere Docker + supabase CLI
pnpm build

# 4) Output
# .next/ listo para servir
```

### 7.3 Aplicar migraciones (si no se hizo antes)

```bash
# Desde el repo, con Supabase CLI apuntando al proyecto remoto
supabase link --project-ref <project-ref>
supabase db push
supabase test db
# Esperado: All tests successful. Files=16, Tests=259
```

### 7.4 Deploy de la app

| Plataforma | Procedimiento |
|------------|---------------|
| **Vercel** | `vercel deploy --prod` (CLI) o push a `main` (auto) |
| **Netlify** | `netlify deploy --prod` |
| **Docker self-host** | `docker build -t deskwork . && docker run -d --env-file .env.production -p 3000:3000 deskwork` |
| **PM2 / systemd** | `pnpm start` (después de `pnpm build`) |
| **Kubernetes** | `kubectl apply -f k8s/` (manifiestos específicos del cluster) |

### 7.5 Post-deploy inmediato

Ver §12 — Procedimiento de verificación post-deploy.

---

## 8. Procedimiento de rollback

### 8.1 Cuándo hacer rollback

- App no levanta (errores 5xx generalizados).
- Storage no responde (no es problema de key, sino del bucket).
- Pérdida de datos o corrupción de estado.
- Falla crítica de seguridad detectada post-deploy.

### 8.2 Procedimiento

1. **Identificar el último deploy funcional** (git tag, commit, release tag).
2. **Revertir el código de la app** (no de la DB):
   ```bash
   # Vercel
   vercel rollback

   # Docker
   docker pull deskwork:<last-good-tag>
   docker run ... deskwork:<last-good-tag>

   # Kubernetes
   kubectl rollout undo deployment/deskwork

   # PM2
   pm2 reload deskwork  # con el commit anterior en el código
   ```
3. **NO revertir migraciones de DB** a menos que sea absolutamente necesario (causa pérdida de datos).
4. **Verificar** con el checklist post-deploy (§12).
5. **Comunicar** al equipo y al Product Owner.

### 8.3 Rollback de migración (último recurso)

⚠️ **Peligroso:** causa pérdida de datos si la migration no es reversible.

```bash
# Identificar la última migration aplicada
supabase migration list

# Revertir manualmente (requiere SQL craft)
psql -h <host> -U postgres -d postgres -c "BEGIN; ... ROLLBACK;"

# O usar supabase db reset (DESTRUCTIVO — borra datos)
# NO recomendado en producción.
```

### 8.4 Si el rollback no es posible

1. Poner la app en **modo read-only** (feature flag o middleware que bloquee POST/PUT/DELETE).
2. Diagnosticar el problema con logs.
3. Aplicar fix forward.
4. Re-deploy.

---

## 9. Limitaciones conocidas

### 9.1 TKT-007 — Priority contractual (DIFERIDO)

- **Estado:** stub implementado.
- **Comportamiento actual:** priority se computa desde `category.slug`:
  - accesos, cuenta, correo → P1
  - computador, software → P2
  - internet, impresora, telefonia → P3
  - otro → P4
  - default → P3
- **Marcador:** `ticket_events.metadata.priority_source = 'tkt007_stub'`.
- **Limitación:** no considera cargo del requester, no recalcula al cambiar categoría, no permite override manual.
- **Trazabilidad:** `tickets_create.sql:140-173`.

### 9.2 TKT-008 — SLA engine (DIFERIDO)

- **Estado:** stub.
- **Comportamiento actual:** `tickets.sla_status = 'on_track'` (default). CHECK constraint permite `at_risk`, `overdue`, `met`, pero NUNCA se actualiza.
- **Limitación:** no hay `sla_due_at`, no hay trigger de breach, no hay notificaciones por breach.
- **Trazabilidad:** `tickets_schema.sql:66-67` + `tickets_schema.sql:219` (comentario "stub temporal hasta TKT-008").

### 9.3 TKT-019 — Email / Outbox (DIFERIDO A TKT-026)

- **Estado:** outbox funcional SIN worker que lo drene.
- **Comportamiento actual:**
  - Tickets generan eventos → trigger `notify_ticket_event` → `enqueue_ticket_notifications` inserta en `notification_outbox`.
  - Las filas quedan en `status='pending'` indefinidamente.
  - **NO se envía ningún email.**
- **UI impact:** usuarios ven cambios in-app (estado, asignación, comentarios). **NO reciben emails.**
- **Mitigación actual:** la UI muestra cambios en tiempo real (no requiere refresh).
- **Trazabilidad:** `notifications_outbox.sql` + `dispatcher.ts` (no invocado).
- **Próximo paso:** TKT-026 implementará worker + provider.

### 9.4 TKT-020 — SLA dashboard (BLOQUEADO POR TKT-008)

- No se implementa. El dashboard del supervisor usa KPIs operacionales (TKT-021).

### 9.5 Sentry / observabilidad

- `SENTRY_DSN` está declarado en `env.ts` pero **no integrado** en el código. Sin tracking centralizado de errores.

### 9.6 Sin CI/CD

- No hay `.github/`, no hay `Dockerfile`, no hay `vercel.json`.
- Deploys son manuales o usan la config default de la plataforma.

### 9.7 Sin E2E browser tests

- Cobertura es vitest (unit) + pgTAP (DB). No hay Playwright/Cypress.
- UAT manual requerido (ver `C:\DeskWork\DESKWORK_TICKETING_CORE_UAT_CHECKLIST.md`).

### 9.8 Sin load testing

- No se ha medido comportamiento bajo carga.
- Estimación conservadora: 100-500 RPS sin degradación (suficiente para MVP de Fundación TECHO, 185 trabajadores).

---

## 10. Estado del outbox y procedimiento de diagnóstico

### 10.1 Estado actual

```
Outbox:  FUNCIONAL (wired) pero NO drenado.
Trigger: AFTER INSERT ON ticket_events -> enqueue_ticket_notifications()
Provider: InMemoryProvider (sólo tests)
Worker:   AUSENTE
```

### 10.2 Diagnóstico manual

#### 10.2.1 Ver cuántas notificaciones hay pendientes

```sql
SELECT status, count(*)
FROM public.notification_outbox
GROUP BY status
ORDER BY status;
```

Estados posibles: `pending`, `processing`, `sent`, `failed`.

**Si `pending` crece monótonamente → el worker no está corriendo (esperado en este release).**

#### 10.2.2 Ver las últimas N notificaciones pendientes

```sql
SELECT id, tenant_id, ticket_id, notification_type, recipient_user_id,
       recipient_email_snapshot, created_at, attempt_count, last_error
FROM public.notification_outbox
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 50;
```

#### 10.2.3 Marcar pending como "manualmente enviado" (workaround de emergencia)

⚠️ **Solo si se decide comunicar por otro canal** (Slack, llamada, etc.) y se quiere limpiar el outbox:

```sql
-- Marcar como sent sin enviar realmente
UPDATE public.notification_outbox
SET status = 'sent',
    processed_at = now(),
    last_error = 'manual_handling_release_v1'
WHERE id = '<notification-id>'
  AND status = 'pending';
```

#### 10.2.4 Resetear un claim expirado (force re-claim)

```sql
UPDATE public.notification_outbox
SET claim_id = NULL,
    claim_expires_at = NULL,
    status = 'pending'
WHERE id = '<notification-id>'
  AND status = 'processing'
  AND claim_expires_at < now();
```

### 10.3 Monitoreo recomendado

Métrica sugerida (script o dashboard):

```sql
-- Alerta si pending > 1000 o processing > 100
SELECT
  (SELECT count(*) FROM public.notification_outbox WHERE status = 'pending') AS pending_count,
  (SELECT count(*) FROM public.notification_outbox WHERE status = 'processing') AS processing_count,
  (SELECT count(*) FROM public.notification_outbox WHERE status = 'failed') AS failed_count;
```

### 10.4 Cleanup de notificaciones antiguas sent/failed

```sql
-- Borrar sent/failed con más de 90 días
DELETE FROM public.notification_outbox
WHERE status IN ('sent', 'failed')
  AND processed_at < now() - interval '90 days';
```

> ⚠️ **NO borrar `pending` o `processing` manualmente** — se perderían notificaciones.

---

## 11. Troubleshooting básico

### 11.1 La app no arranca

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `Error: Supabase public configuration is required.` | Faltan `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Configurar env vars (ver §2.1) |
| Build falla con `MODULE_NOT_FOUND` | Dependencias no instaladas | `pnpm install --frozen-lockfile` |
| Build falla con TypeScript | Cambios incompatibles | `pnpm typecheck` para identificar; revertir si es necesario |

### 11.2 Storage no funciona

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| 503 `storage_disabled` al subir archivo | Falta `SUPABASE_SERVICE_ROLE_KEY` | Provisionar (ver §4) |
| 502 `storage_error` al subir | Bucket no existe o path inválido | Verificar bucket + path convention `ticket-attachments/{tenant_id}/{ticket_id}/{filename}` |
| 403 al subir siendo miembro | Path no matchea tenant | Verificar que `tenant_id` del path sea el mismo que `tickets.tenant_id` |
| Signed URL expirada | `expiresIn > 3600` o `expiresIn < 60` | Validar rango (ver `route.ts:30-31`) |

### 11.3 Tickets no aparecen

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Lista vacía con datos en DB | RLS bloqueando (membership inactiva) | Verificar `memberships.status = 'active'` y `tenant_id` correcto |
| 403 en `GET /api/tickets?scope=tenant` | Actor no es `technical_lead` ni `director` | Documentado: supervisor (functional_role) no califica para scope institución (regla DB `validate_membership_scope_grant`) |
| 404 en ticket que existe | Ticket en otro tenant | Cross-tenant es bloqueado por RLS (esperado, no es bug) |

### 11.4 Transición rechazada con 403

| Razón (`fsm_denied.reason`) | Significado | Acción |
|------------------------------|-------------|--------|
| `CERRADO es estado terminal.` | No se puede salir de CERRADO | Esperado |
| `Actor no autenticado.` | Sesión expirada | Re-login |
| `Ticket no asignado.` | Transición requiere assignee | Asignar primero (lead/director) |
| `Agente no es el asignado.` | Otro agente intenta ejecutar transición operativa | Esperado |
| `Supervisor puede solicitar...` | Supervisor intenta ejecutar, solo puede solicitar | Usar comment (FSM requestOnly) |
| `Reapertura por objeción requiere ejecutor autorizado.` | Requester o supervisor intenta ejecutar RESUELTO→EN_PROCESO | Solo lead/director pueden ejecutar |

### 11.5 KPIs no devuelven datos

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| 403 `scope_institution_required` | Actor no es `technical_lead` ni `director` | Esperado (ver TKT-021) |
| `firstResponseMinutes: 0` | No hay tickets con `first_response_at` | Esperado si ningún ticket fue resuelto aún |
| `dailyTrend: []` | Período sin tickets creados | Esperado si la organización es nueva |

### 11.6 i18n no cambia

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Switcher no aparece | Componente no integrado en el shell | Verificar `demo-shell.tsx` incluye `<LocaleSwitcher />` |
| Cambio no persiste | localStorage bloqueado (modo incógnito, cookies deshabilitadas) | Esperado en algunos navegadores |
| Idioma no detectado en SSR | Inline script no se ejecutó | Verificar `<head>` en `app/layout.tsx` |

---

## 12. Procedimiento de verificación post-deploy

Después de cada deploy, ejecutar este checklist (puede automatizarse con smoke tests):

### 12.1 Salud básica

- [ ] `GET /` responde 200 (homepage).
- [ ] `GET /login` responde 200.
- [ ] `GET /api/tickets` (sin auth) responde 401 `authentication_required`.

### 12.2 Auth + tenant

- [ ] Login con un usuario real del tenant de prueba funciona.
- [ ] Cookie de sesión persiste en el browser.
- [ ] `GET /api/tickets` (con sesión) responde 200 con tickets visibles (no cross-tenant).

### 12.3 Ticketing Core

- [ ] Crear ticket vía UI → 201 → ticket visible en `/tickets`.
- [ ] Crear ticket vía API (`POST /api/tickets`) con payload válido → 201.
- [ ] Crear ticket con payload inválido → 400.
- [ ] Asignar ticket (lead/director) → 201.
- [ ] Comentar → 201.
- [ ] Transición válida → 200.
- [ ] Transición inválida (e.g. `ABIERTO→RESUELTO`) → 403 `fsm_denied`.

### 12.4 Storage (si `SUPABASE_SERVICE_ROLE_KEY` está configurada)

- [ ] Subir archivo vía UI → 201 → archivo visible en lista.
- [ ] Generar signed URL → 200 → URL abre el archivo.
- [ ] Intentar subir a otro tenant → 403/404 (no cross-tenant).

### 12.5 KPIs (lead/director solamente)

- [ ] `GET /api/tickets/kpis?periodDays=30` → 200 con datos.
- [ ] Como `supervisor` (department/team) → 403 `scope_institution_required`.
- [ ] Dashboard `/supervisor` renderiza KPIs en ES y EN.

### 12.6 i18n

- [ ] Switcher ES/EN cambia la UI.
- [ ] Reload preserva el idioma (localStorage).
- [ ] Estados (`ABIERTO`, `EN_PROCESO`, etc.) aparecen en su valor crudo (no traducidos).
- [ ] Prioridades (`P1`, `P2`, etc.) aparecen en su valor crudo.

### 12.7 Outbox

- [ ] Crear ticket → fila en `notification_outbox` con `status='pending'`.
- [ ] Asignar ticket → fila adicional con `notification_type='ticket.assigned'`.
- [ ] **NO esperar email** (esperado en este release).

### 12.8 Logs y errores

- [ ] No hay 5xx en logs del servidor.
- [ ] No hay 5xx en logs de Supabase.
- [ ] Si hay Sentry configurado: no hay errores críticos nuevos.

---

## 13. Distinción KPIs operacionales vs SLA contractual

### 13.1 Lo que se calcula (TKT-021 — operacional)

| Métrica | Fuente | Interpretación |
|---------|--------|----------------|
| `total` | `count(*) from tickets where tenant_id = …` | Conteo absoluto |
| `active` | `count(*) where state not in ('CERRADO','RESUELTO')` | Tickets en curso |
| `unassigned` | `count(*) where assigned_to is null and state not in ('CERRADO','RESUELTO')` | Tickets sin agente |
| `byState` | `count(*) group by state` | Distribución por estado |
| `byPriority` | `count(*) group by priority` | Distribución por prioridad |
| `firstResponseMinutes` | `avg(extract(epoch from (first_response_at - created_at))/60)` | **OPERACIONAL**: promedio del tiempo entre creación y primera respuesta |
| `resolutionMinutes` | `avg(extract(epoch from (resolved_at - created_at))/60)` | **OPERACIONAL**: promedio del tiempo entre creación y resolución |
| `dailyTrend` | `count(*) group by date(created_at)` | Tickets creados por día |

### 13.2 Lo que NO se calcula (TKT-008 — bloqueado)

| Métrica | Por qué falta |
|---------|----------------|
| `% cumplimiento de SLA` | No hay SLA contractual definido |
| `tiempo restante para breach` | No hay `sla_due_at` |
| `tickets en breach` | `sla_status='overdue'` nunca se setea |
| `tiempo de pausa por ESPERANDO_USUARIO` | No hay regla de pausa |
| `horario laboral vs 24/7` | No hay calendario |

### 13.3 Disclaimer obligatorio en UI

Cualquier superficie que muestre promedios DEBE incluir el disclaimer explícito:

> **ES:** "Tiempos operacionales. NO representan SLA contractual. El motor de SLA (TKT-008) está diferido."
> **EN:** "Operational times. They do NOT represent contractual SLA. The SLA engine (TKT-008) is deferred."

Este disclaimer está implementado en `src/components/demo/supervisor-dashboard.tsx` y en los labels i18n (`src/i18n/messages/es.ts` + `en.ts`).

### 13.4 Riesgo de interpretación

Si un manager ve `firstResponseMinutes: 480` (8 horas), puede interpretar:
- ✅ "En promedio, las respuestas tardan 8 horas" (correcto, operacional).
- ❌ "Incumplimos nuestro SLA de 4 horas" (incorrecto: no hay SLA de 4 horas).

**Acción:** al presentar el dashboard a stakeholders, recordar verbalmente que los números son operacionales.

---

## Anexo A — Comandos útiles

```bash
# Aplicar migraciones
supabase db push

# Tests de DB
pnpm test:db

# Quality gates completos
pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm build

# Iniciar en dev
pnpm dev

# Iniciar en prod
pnpm build && pnpm start

# Generar tipos de Supabase (si se modifican migrations)
supabase gen types typescript --local > src/shared/supabase/database.types.ts
```

## Anexo B — Referencias

- **Release Readiness Report:** `C:\DeskWork\DESKWORK_TICKETING_CORE_RELEASE_READINESS_REPORT.md`
- **UAT Checklist:** `C:\DeskWork\DESKWORK_TICKETING_CORE_UAT_CHECKLIST.md`
- **Release Procedure:** `RELEASE.md` (en este repo)
- **Documentación TKT-018 (estado real):** `C:\DeskWork\DESKWORK_TICKETING_CORE_TKT_018.md`
- **Foundation 3A audit:** `C:\DeskWork\DESKWORK_PHASE_3A_ADVERSARIAL_AUDIT.md`
- **TKT-018 contradicciones detectadas:** sección 21 del doc TKT-018

---

**Versión del runbook:** 1.0 (2026-08-31)
**Próxima revisión:** al cierre de TKT-026 (cuando se implemente el worker de outbox)
