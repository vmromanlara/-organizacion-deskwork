# DeskWork — RELEASE.md

> **Procedimiento de release de DeskWork Ticketing Core.**
> **Versión del documento:** 1.0 (2026-08-31)
> **Audiencia:** Product Owner, líder técnico, equipo de release.

Este documento define el procedimiento paso-a-paso para declarar un release
de DeskWork Ticketing Core, qué entra y qué no, qué validaciones se requieren,
cómo se mergea a `main`, y cómo se hace rollback.

> ⚠️ **Este release es MVP IN-APP ONLY.** Email transaccional y worker de
> outbox NO forman parte (ver sección 2 — Release Scope).

---

## Tabla de contenidos

1. [Release Scope (in/out)](#1-release-scope)
2. [Versión y nomenclatura](#2-versión-y-nomenclatura)
3. [Pre-release checklist](#3-pre-release-checklist)
4. [Procedimiento de release paso-a-paso](#4-procedimiento-de-release-paso-a-paso)
5. [Validaciones requeridas](#5-validaciones-requeridas)
6. [Procedimiento de merge a main](#6-procedimiento-de-merge-a-main)
7. [Post-release](#7-post-release)
8. [Rollback](#8-rollback)
9. [Limitaciones explícitas del release actual](#9-limitaciones-explícitas-del-release-actual)

---

## 1. Release Scope

### 1.1 IN SCOPE — qué se incluye en este release

| Capacidad | TKT | Evidencia |
|-----------|-----|-----------|
| **Foundation 3A** (intacto) | — | 6 migrations `20260819*` + `20260820*` |
| **Auth + multi-tenant** | TKT-010, TKT-002 | `authorization_foundation.sql` + RLS |
| **Tickets schema + FSM** | TKT-001, TKT-005, TKT-006 | `tickets_schema.sql` + `state-machine.ts` (14 válidas + 3 inválidas) |
| **Authorization refinement** | TKT-003 | Helpers + mutators SECURITY DEFINER |
| **API transitions** | TKT-006 | `POST /api/tickets/[id]/transitions` |
| **Mockup→Real** | TKT-009 | `POST /api/tickets` + UI integration |
| **API integration** | TKT-010 | `GET /api/tickets` (list + filters + scope) |
| **Asignaciones** | TKT-012 | `POST /api/tickets/[id]/assignments` + UI |
| **Comentarios** | TKT-013 | `POST/GET /api/tickets/[id]/comments` + UI |
| **Adjuntos binarios (v2)** | TKT-014 v2 | `POST /api/tickets/[id]/attachments` (multipart) + signed URL. **TKT-014 v1 (metadata-only JSON) DEPRECATED, NO implementado en este release** (ver §9.4). |
| **Filtros búsqueda** | TKT-022 | `state`, `priority`, `search`, `assigned_to`, `requester_id` |
| **E2E tests transitions** | TKT-024 | `route.e2e.test.ts` |
| **Outbox + dispatcher** | TKT-019 | Tabla + 3 SECURITY DEFINER + dispatcher library (no worker) |
| **KPIs operacionales** | TKT-021 | `compute_ticket_kpis` + `GET /api/tickets/kpis` + dashboard |
| **i18n ES/EN** | TKT-023 | Context React + diccionarios + LocaleSwitcher |
| **Documentación consolidada** | TKT-018 | Doc maestro en `C:\DeskWork\` |
| **Release Readiness Report** | — | `C:\DeskWork\DESKWORK_TICKETING_CORE_RELEASE_READINESS_REPORT.md` |
| **Operacional docs** | — | RUNBOOK.md, RELEASE.md, UAT checklist |

### 1.2 OUT OF SCOPE — qué NO se incluye

| Capacidad | TKT | Estado | Notas |
|-----------|-----|--------|-------|
| **Priority contractual** | TKT-007 | ❌ DIFERIDO | Stub por categoría activo (`priority_source='tkt007_stub'`). Requiere 5 decisiones PO. |
| **SLA engine** | TKT-008 | ❌ DIFERIDO | `sla_status='on_track'` hardcoded. KPIs son operacionales, no contractuales. |
| **SLA dashboard** | TKT-020 | ❌ BLOQUEADO por TKT-008 | No se implementa. |
| **Email provider** (Resend/SMTP) | TKT-019 (provider) | ❌ DIFERIDO A TKT-026 | Solo `InMemoryProvider` (tests). |
| **Outbox worker** (cron/scheduled) | TKT-019 (worker) | ❌ DIFERIDO A TKT-026 | `dispatchBatch` no se invoca. Outbox acumula `pending`. |
| **`vercel.json` con cron** | TKT-019 (config) | ❌ NO CREADO | Por motivo del item anterior. |
| **CI/CD pipeline** | — | ❌ NO INCLUIDO | Sin `.github/`, sin `Dockerfile`, sin `docker-compose`. |
| **Sentry integration** | — | ❌ NO INCLUIDO | Variable `SENTRY_DSN` declarada pero no consumida. |
| **Load testing** | — | ❌ NO INCLUIDO | Sin tests de carga/stress. |
| **Playwright/Cypress E2E** | — | ❌ NO INCLUIDO | Cobertura es vitest + pgTAP. UAT es manual. |
| **UI timeline** | TKT-025-a | ❌ FUTURO | No prioritario. |
| **CHANGELOG.md** | — | ⚠ Diferible | Crear al release. |

### 1.3 Resumen ejecutivo del scope

> **Este release entrega:** Ticketing Core funcional con auth multi-tenant, FSM, comentarios, asignaciones, adjuntos (requiere service_role), KPIs operacionales, i18n, y outbox wired.
>
> **Este release NO entrega:** emails transaccionales, SLA contractual, priority contractual, dashboards de SLA, CI/CD automatizado, E2E browser tests.

---

## 2. Versión y nomenclatura

### 2.1 Versionado semver

DeskWork usa [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH

MAJOR: cambios incompatibles de API o modelo de datos.
MINOR: features nuevas backward-compatible.
PATCH: bug fixes backward-compatible.
```

### 2.2 Versión propuesta para este release

```
0.1.0  (MVP TECHO in-app only)
```

- **0** = pre-1.0 (producto en validación, no garantía de estabilidad API).
- **1** = primera iteración con cambios compatibles (siguiente fase post-UAT).
- **0** = patch inicial.

### 2.3 Tag de Git

```bash
git tag -a v0.1.0 -m "DeskWork Ticketing Core MVP v0.1.0 (in-app only)"
git push origin v0.1.0
```

### 2.4 Changelog (cuando se cree)

Formato sugerido (basado en Keep a Changelog):

```markdown
# Changelog

## [0.1.0] - 2026-XX-XX

### Added
- TKT-001, 002, 003, 005, 006, 009, 010, 012, 013, 014 v1, 014 v2, 015, 016, 017, 019, 021, 022, 023, 024 — Ticketing Core MVP

### Security
- SESS-001 (open redirect via `next` parameter) — RESUELTO con `safeNext()` pattern.

### Known Limitations
- TKT-007 (priority contractual) deferred — stub by category.
- TKT-008 (SLA engine) deferred — `sla_status='on_track'`.
- TKT-019 (email outbox) deferred to TKT-026 — no worker.
- TKT-020 (SLA dashboard) blocked by TKT-008.
```

---

## 3. Pre-release checklist

### 3.1 Validaciones técnicas (gates)

Ejecutar en este orden; cada uno debe pasar antes del siguiente.

```bash
# 1) Lint
pnpm lint
# Esperado: 0 errors (puede haber 0-1 warning pre-existente TKT-024)

# 2) Typecheck
pnpm typecheck
# Esperado: EXIT 0

# 3) Vitest (unit + integration)
pnpm test
# Esperado: Test Files 16 passed (16), Tests 316 passed (316)

# 4) pgTAP (DB)
pnpm test:db
# Esperado: All tests successful. Files=16, Tests=259

# 5) Build
pnpm build
# Esperado: EXIT 0, 13 API routes + 11 UI routes registradas

# 6) Conteo total
# Esperado: 575/575 tests PASS
```

### 3.2 Validaciones de seguridad (automatizadas)

```bash
# Buscar service_role en NEXT_PUBLIC_*
grep -E "NEXT_PUBLIC_.*(SERVICE|service_role)" .env* 2>/dev/null
# Esperado: vacío.

# Buscar service_role en código committed
grep -r "service_role" src/ scripts/ 2>/dev/null | grep -v "^Binary"
# Esperado: solo src/shared/supabase/admin.ts (lectura) + comentarios.

# Buscar imports de admin.ts desde "use client"
grep -r "use client" src/ --include="*.tsx" --include="*.ts" -l 2>/dev/null | \
  xargs grep -l "shared/supabase/admin" 2>/dev/null
# Esperado: vacío.
```

### 3.3 Validaciones manuales (UAT)

Ejecutar el checklist completo: `C:\DeskWork\DESKWORK_TICKETING_CORE_UAT_CHECKLIST.md`.

Cobertura mínima:
- 4 perfiles: Requester, Technician, Supervisor, Security.
- 11 rutas UI exercised.
- 13 endpoints API exercised.
- 14 transiciones FSM (las 14 válidas) — 3 inválidas confirmadas con 403.
- i18n ES/EN — cambio de idioma persiste.
- Multi-tenant — un usuario de tenant A no ve tickets de tenant B.
- Storage — subir, descargar vía signed URL (con `SUPABASE_SERVICE_ROLE_KEY`).
- KPIs operacionales — sólo lead/director acceden.

### 3.4 Decisiones del PO requeridas ANTES de release

| # | Decisión | Default si no se decide |
|---|----------|-------------------------|
| 1 | ¿Se aceptan los stubs de TKT-007 (priority) y TKT-008 (SLA)? | SÍ (decisión actual del PO) |
| 2 | ¿Se difiere TKT-019 worker a TKT-026? | SÍ (decisión actual del PO) |
| 3 | ¿Se autoriza push a `remediation/ticketing-core`? | REQUERIDA para release |
| 4 | ¿Se autoriza merge a `main`? | REQUERIDA para release |
| 5 | ¿Se autoriza tag `v0.1.0`? | REQUERIDA para release |
| 6 | ¿Cuál es la fecha objetivo de release? | Necesaria para UAT + comunicación |

### 3.5 Pre-condiciones operacionales

- [ ] Proyecto Supabase de producción creado y configurado.
- [ ] Migraciones aplicadas (ver `RUNBOOK.md` §3.2).
- [ ] Bucket `ticket-attachments` verificado.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` provisionada (si se quiere Storage).
- [ ] `NEXT_PUBLIC_APP_URL` configurado con origin de producción.
- [ ] DNS apuntando al host de deploy.

---

## 4. Procedimiento de release paso-a-paso

### 4.1 Fase 1 — Pre-UAT

1. Confirmar rama actual: `git rev-parse --abbrev-ref HEAD` → debe ser `remediation/ticketing-core`.
2. Confirmar HEAD: `git rev-parse HEAD` → debe ser el commit que se quiere liberar.
3. Confirmar working tree: `git status --short` → debe estar limpio excepto por los 5 archivos out-of-scope documentados + 2 nuevos untracked (RUNBOOK.md, RELEASE.md).
4. Ejecutar los 5 quality gates (§3.1).
5. Ejecutar las 3 validaciones de seguridad automatizadas (§3.2).
6. Si todo pasa → continuar a Fase 2.

### 4.2 Fase 2 — UAT manual

1. Asignar equipo de UAT (mínimo 2 personas para 4 perfiles).
2. Provisionar tenant de prueba con datos sembrados (categorías, 3-5 tickets de muestra).
3. Cada persona ejecuta su subset del UAT checklist.
4. Documentar resultados en `C:\DeskWork\DESKWORK_TICKETING_CORE_UAT_RESULTS.md` (cuando se ejecute).
5. Recolectar defects. **No corregir durante UAT** — solo documentar.
6. Si hay defects bloqueantes (P0/P1) → volver a Fase 1 con fix.
7. Si no hay defects bloqueantes → continuar a Fase 3.

### 4.3 Fase 3 — Documentación final

1. Verificar que `RUNBOOK.md` y `RELEASE.md` (este documento) están en el repo.
2. Verificar que `C:\DeskWork\DESKWORK_TICKETING_CORE_UAT_CHECKLIST.md` está completo.
3. Crear `CHANGELOG.md` con la entrada de v0.1.0 (ver §2.4).
4. Marcar TKT-018, TKT-019 (provider+worker diferidos), TKT-021, TKT-023 como cerrados en el task board.

### 4.4 Fase 4 — Push

```bash
# Confirmar rama y HEAD
git rev-parse --abbrev-ref HEAD   # remediation/ticketing-core
git rev-parse HEAD                # 49995a7 o el que se decida

# Push de la rama (REQUIERE AUTORIZACIÓN DEL PO)
git push -u origin remediation/ticketing-core
```

### 4.5 Fase 5 — Merge a main

> ⚠️ **Merge directo a `main` requiere autorización explícita del PO.**

```bash
# Actualizar main
git checkout main
git pull --ff-only origin main

# Merge (estrategia: --no-ff para preservar la historia del release branch)
git merge --no-ff remediation/ticketing-core -m "Release: DeskWork Ticketing Core v0.1.0 (in-app only)"

# Push a main
git push origin main
```

### 4.6 Fase 6 — Tag

```bash
git tag -a v0.1.0 -m "DeskWork Ticketing Core MVP v0.1.0 (in-app only)"
git push origin v0.1.0
```

### 4.7 Fase 7 — Deploy

Ver `RUNBOOK.md` §7 — Procedimiento de deploy.

### 4.8 Fase 8 — Verificación post-deploy

Ver `RUNBOOK.md` §12 — Procedimiento de verificación post-deploy.

---

## 5. Validaciones requeridas

### 5.1 Bloqueantes de release (NO AVANZAR si fallan)

| Validación | Comando / Procedimiento | Criterio de éxito |
|------------|------------------------|------------------|
| Lint | `pnpm lint` | 0 errors |
| Typecheck | `pnpm typecheck` | EXIT 0 |
| Vitest | `pnpm test` | 316/316 PASS |
| pgTAP | `pnpm test:db` | 259/259 PASS |
| Build | `pnpm build` | EXIT 0 |
| Secret leak scan | `grep` (ver §3.2) | Sin matches |
| UAT completo | Manual con checklist | 0 defects P0/P1 |
| Autorización PO | Confirmación explícita | OK |
| Migraciones aplicadas | `supabase db push` + `supabase test db` | PASS |
| Smoke test post-deploy | `RUNBOOK.md` §12 | OK |

### 5.2 No bloqueantes (defer)

| Ítem | Por qué es deferrable |
|------|----------------------|
| 1 warning pre-existente en lint (`mockUpdateTicketState` unused) | Warning, no error. Cleanup técnico. |
| E2E browser tests (Playwright/Cypress) | Diferible a fase posterior. UAT manual cubre. |
| Load testing | MVP es para ~185 usuarios. No crítico. |
| Sentry integration | Diferible. Logs son suficientes para MVP. |
| CI/CD | Diferible. Deploy manual OK para MVP. |

---

## 6. Procedimiento de merge a main

### 6.1 Pre-merge

- [ ] Todos los tests pasan en `remediation/ticketing-core`.
- [ ] UAT completo ejecutado y aprobado.
- [ ] Decisiones PO registradas.
- [ ] Documentación actualizada (RUNBOOK, RELEASE, UAT, CHANGELOG).
- [ ] Working tree limpio (excepto archivos out-of-scope documentados).
- [ ] PO autoriza explícitamente.

### 6.2 Merge

```bash
# 1) Checkout main y pull
git checkout main
git pull --ff-only origin main

# 2) Verificar que main no tiene commits nuevos
git log --oneline -5
# Si hay commits nuevos, esperar a que se integren antes de mergear

# 3) Merge de la rama de release
git merge --no-ff remediation/ticketing-core \
  -m "Release: DeskWork Ticketing Core v0.1.0

Ticketing Core MVP (in-app only):
- Auth + multi-tenant
- Tickets + FSM (14 valid + 3 invalid transitions)
- Comments, assignments, attachments (storage)
- Operational KPIs (non-contractual)
- i18n ES/EN
- Outbox wired (worker deferred to TKT-026)

Deferred to future phases:
- TKT-007 (priority contractual)
- TKT-008 (SLA engine)
- TKT-020 (SLA dashboard)
- TKT-026 (outbox worker + email provider)"

# 4) Push
git push origin main
```

### 6.3 Post-merge

- [ ] Tag `v0.1.0` creado y pusheado.
- [ ] Notificación al equipo de release.
- [ ] Inicio de Fase 7 (Deploy) — ver `RUNBOOK.md` §7.

---

## 7. Post-release

### 7.1 Comunicación

- Anuncio en canal del equipo con:
  - Versión (`v0.1.0`).
  - Scope (in/out).
  - Limitaciones conocidas.
  - Link a `RUNBOOK.md`, `RELEASE.md`, `CHANGELOG.md`.

### 7.2 Monitoreo (primeras 24h)

- Logs del servidor: sin 5xx críticos.
- Logs de Supabase: sin errores de RLS o migration.
- Métricas básicas: número de tickets creados, número de comentarios, número de adjuntos.
- Outbox: `pending` crece monótonamente (esperado — worker no corre).

### 7.3 Cierre del ciclo

- Crear entradas en task board para los TKT diferidos (TKT-007, TKT-008, TKT-020, TKT-026).
- Archivar este RELEASE.md cuando se libere v0.2.0.
- Planificar retrospectiva de release (qué salió bien, qué mejorar).

---

## 8. Rollback

### 8.1 Cuándo hacer rollback

- App no arranca (errores generalizados).
- Pérdida de datos.
- Falla crítica de seguridad post-deploy.
- Defecto P0 reportado en producción.

### 8.2 Procedimiento

1. **Decisión del PO + líder técnico.**
2. **Revertir la app al último commit funcional:**
   - Vercel: `vercel rollback`.
   - Docker: redeploy con tag anterior.
   - Kubernetes: `kubectl rollout undo deployment/deskwork`.
3. **NO revertir migraciones DB** a menos que sea absolutamente necesario.
4. **Verificar** con checklist post-deploy (`RUNBOOK.md` §12).
5. **Comunicar** el rollback y la causa raíz.

### 8.3 Rollback de migración (último recurso)

⚠️ **Peligroso:** causa pérdida de datos si la migration no es reversible.

```bash
# Identificar la última migration problemática
supabase migration list

# Revertir manualmente (SQL craft + psql)
psql -h <host> -U postgres -d postgres -c "BEGIN; ... ROLLBACK;"

# O usar supabase db reset (DESTRUCTIVO — solo en staging/dev)
supabase db reset
```

### 8.4 Si no se puede hacer rollback

1. Poner app en **modo read-only** (feature flag o middleware que bloquee POST/PUT/DELETE).
2. Diagnosticar con logs.
3. Aplicar fix forward.
4. Re-deploy.

---

## 9. Limitaciones explícitas del release actual

> ⚠️ **Estas son las 4 limitaciones que el equipo y los usuarios deben conocer.**

### 9.1 TKT-007 — Priority contractual (diferido)

- Priority se asigna por categoría, no por impacto contractual.
- Categorías `accesos`, `cuenta`, `correo` → P1.
- Categorías `computador`, `software` → P2.
- Categorías `internet`, `impresora`, `telefonia` → P3.
- Categoría `otro` → P4.
- No considera cargo, no permite override manual, no recalcula al cambiar categoría.
- **Marcador:** `ticket_events.metadata.priority_source = 'tkt007_stub'`.

### 9.2 TKT-008 — SLA engine (diferido)

- `tickets.sla_status` siempre es `'on_track'`.
- Los promedios de `firstResponseMinutes` y `resolutionMinutes` son **operacionales**, NO contractuales.
- **Disclaimer obligatorio** en cualquier UI que muestre estos promedios (ver `RUNBOOK.md` §13).

### 9.3 TKT-019 — Email outbox (diferido a TKT-026)

- Los tickets generan eventos que se encolan en `notification_outbox`.
- **NO se envía ningún email** — el outbox acumula `pending` indefinidamente.
- Los usuarios ven cambios in-app (estado, asignación, comentarios).
- Workers de outbox: **AUSENTES** por diseño en este release.

### 9.4 Sin CI/CD, sin E2E browser, sin load testing

- Deploys manuales.
- Cobertura de tests: vitest (unit) + pgTAP (DB). No Playwright/Cypress.
- Sin tests de carga/stress.
- Sin Sentry (logs son suficientes para MVP).

---

## Anexo A — Roles en un release

| Rol | Responsabilidad |
|-----|-----------------|
| **Product Owner** | Autoriza el release. Decide limitaciones. Acepta stubs. |
| **Líder técnico** | Verifica quality gates. Decide rollback. |
| **Equipo de release** | Ejecuta UAT. Documenta defects. |
| **Operador de deploy** | Aplica migraciones. Despliega. Verifica post-deploy. |
| **SRE / observabilidad** | Monitorea post-release. |

## Anexo B — Referencias

- **Release Readiness Report:** `C:\DeskWork\DESKWORK_TICKETING_CORE_RELEASE_READINESS_REPORT.md`
- **UAT Checklist:** `C:\DeskWork\DESKWORK_TICKETING_CORE_UAT_CHECKLIST.md`
- **Runbook operacional:** `RUNBOOK.md` (en este repo)
- **Documentación TKT-018:** `C:\DeskWork\DESKWORK_TICKETING_CORE_TKT_018.md`
- **Foundation 3A audit:** `C:\DeskWork\DESKWORK_PHASE_3A_ADVERSARIAL_AUDIT.md`
- **Supabase docs:** https://supabase.com/docs
- **Next.js deployment:** https://nextjs.org/docs/app/building-your-application/deploying

---

**Versión del RELEASE.md:** 1.0 (2026-08-31)
**Próxima revisión:** al cierre de TKT-026 o al planificar v0.2.0
