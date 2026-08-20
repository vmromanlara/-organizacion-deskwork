# DeskWork — Fase 3A Foundation

DeskWork is a multi-tenant internal support platform. This repository is in Phase 3A: foundation only. Ticket Core (Phase 3B) is intentionally not implemented yet.

## Prerequisites

- Node.js 24+
- pnpm 11+
- A Supabase project for runtime database/auth checks, or Docker plus the Supabase CLI for local database tests.

## Setup

1. Copy `.env.example` to `.env.local` and fill only the required Supabase public URL and publishable key.
2. Install dependencies: `pnpm install`.
3. Apply migrations to the target Supabase project with the Supabase CLI after linking/configuring that project.
4. Run `pnpm dev`.

## Quality checks

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:db  # requires Supabase local environment / Docker
```

## Security foundations

- The browser receives only the Supabase publishable key.
- Service-role credentials are server-only and prohibited in user-initiated request handlers.
- SQL migrations enable RLS on foundation data tables.
- The initial user-to-tenant bootstrap is a security-definer SQL function; it only creates a single initial tenant membership for the authenticated caller.

See `DESKWORK_TECHNICAL_SPECIFICATION.md` section 21 for the approved architecture and Phase 3A report for validation status.
