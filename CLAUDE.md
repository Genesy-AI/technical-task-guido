# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TinyEnginy is a take-home exercise: a leads management app with CSV import, message templating, and Temporal-backed workflows (e.g. email verification, and an upcoming phone enrichment workflow). The tasks to complete are listed in `README.md` under "Task Description". Supporting assets (example CSVs, wireframes) live in `docs/`.

## Common commands

Everything uses `pnpm`. Use `nvm use` in each package (`.nvmrc` present in both `backend/` and `frontend/`).

**All services together** (Temporal dev server + backend + frontend):
```
./dev.sh
```

**Backend** (`backend/`):
- `pnpm run dev` — nodemon on `src/index.ts` (starts Express API on port 4000 AND the Temporal worker in the same process)
- `pnpm migrate:dev` — run Prisma migrations against local SQLite (`prisma/dev.db`)
- `pnpm gen:prisma` — regenerate the Prisma client
- `pnpm test` / `pnpm test:watch` — Vitest
- Requires Temporal dev server running separately: `temporal server start-dev` (gRPC on `localhost:7233`, default namespace, task queue `myQueue`)

**Frontend** (`frontend/`):
- `pnpm run dev` — Vite dev server
- `pnpm run build` — `tsc -b && vite build`
- `pnpm run lint` — ESLint (`--max-warnings 0`)
- `pnpm test` — Vitest (jsdom)

Run a single test: `pnpm test <path-or-pattern>` (e.g. `pnpm test csvParser`).

## Architecture

### Backend (`backend/src`)
- `index.ts` — single-file Express app. All REST endpoints for leads live here (`/leads`, `/leads/bulk`, `/leads/generate-messages`, `/leads/verify-emails`, etc.). It also calls `runTemporalWorker()` on startup, so the API process also hosts the Temporal worker.
- `worker.ts` — Temporal worker bootstrap. Connects to `localhost:7233`, registers `workflowsPath: ./workflows` and all `./workflows/activities`.
- `workflows/workflows.ts` — workflow definitions. Activities are invoked via `proxyActivities` with timeouts/retry policy configured here. New workflows (e.g. phone enrichment) should be added here and re-exported from `workflows/index.ts`.
- `workflows/activities/` — activity implementations (one activity per provider call, etc.). Keep these side-effect-ful and deterministic-free; all HTTP/IO belongs here, not in workflows.
- `utils/messageGenerator.ts` — template interpolation for lead messages.
- `prisma/schema.prisma` — single `lead` model (SQLite). New lead fields (phone, yearsAtCompany, linkedinUrl, etc.) require a Prisma migration via `pnpm migrate:dev` and a client regeneration.

Data flow for workflow-backed endpoints: HTTP handler → `@temporalio/client` → `client.workflow.execute(...)` → worker picks up from `myQueue` → activity runs → result persisted to Prisma → response returned. The current `verify-emails` handler runs leads sequentially in a for-loop; expect this to be a hotspot when adding new workflows.

### Frontend (`frontend/src`)
- `App.tsx` + `Providers.tsx` — shell; React Query + Tailwind 4 + `react-hot-toast`.
- `api/` — API layer: `modules/` has resource-scoped query hooks, `mutations/` for writes, `types/` for shared DTO types, `utils.ts` and `axios.ts` for the Axios instance.
- `components/` — feature components: `LeadsList.tsx` (table), `CsvImportModal.tsx` (uses `papaparse`), `MessageTemplateModal.tsx` (template editor).
- `utils/csvParser.ts` — CSV→lead mapping (this is where the country-code bug lives per the README).

State is fetched via React Query; mutations invalidate queries to refresh the list. No router — single page.

### Cross-cutting
- Types for lead shape exist independently in Prisma schema (backend) and `frontend/src/api/types` — when adding lead fields, update both plus the CSV parser and the message template UI.
- CORS is wide open (`*`) in `index.ts`.
- Provider APIs for the phone-enrichment task are documented in `README.md` (Orion Connect, Astra Dialer, Nimbus Lookup) — each has a different auth scheme and response shape, so the activity layer needs a small adapter per provider.
