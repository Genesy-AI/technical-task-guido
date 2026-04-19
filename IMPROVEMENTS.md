---
title: TinyEnginy — Technical Roadmap & Improvements
status: Draft
owner: Guido Turnes
last_updated: 2026-04-20
---

# IMPROVEMENTS.md

Punch list of issues and follow-ups found while working on the leads app.
Items are scoped like tickets so they can be picked up independently.
Each ticket leads with the **problem it solves** — if that line is weak,
the ticket doesn't belong here.

**Priorities:**
- **P0** — blocks a real deployment.
- **P1** — needed for maintainability & scale in the next 1–2 sprints.
- **P2** — clear value but can wait; pick up opportunistically.
- **P3** — nice-to-have / park until evidence of pain.

---

## Epic 1 — Backend architecture

### [P0] Restrict CORS + minimal auth gate
`cors({ origin: '*' })` with no auth means anyone who knows the URL can
read and mutate the lead database. Read `CORS_ORIGINS` from env
(allowlist) and add an `X-API-Key` middleware stubbed from env. Hard
blocker for any non-local deployment.

### [P1] Split `backend/src/index.ts` into routes/controllers
The ~480-line single-file API mixes HTTP handlers, validation, Temporal
client wiring, and worker bootstrap — touching any route forces you to
scroll through everything and merges conflict constantly. Extract into
`routes/leads.ts`, `routes/workflows.ts`, `validators/`, keeping
`index.ts` as a thin composition root. Also gate the embedded worker
behind `RUN_WORKER=true` so API and worker can run as separate processes
in prod.

### [P1] Env-var validation at startup
`TEMPORAL_ADDRESS` and provider credentials are hard-coded; the frontend
throws at module load if `VITE_API_URL` is missing, with no useful error.
A typo in env config today means silent misbehavior or a cryptic stack
trace. Parse a Zod schema in `config.ts` and fail fast with a clear
message on bad config.

### [P2] Per-lead failure reasons + structured logging
`verify-emails` / `enrich-phone` use `Promise.allSettled` internally but
surface generic strings to the client — when a bulk run fails there's no
way to tell *which* lead broke or *why* without grepping server logs.
Propagate per-lead failure reasons to the response, add a `pino` logger
with request ids, and a central error middleware so handlers stop doing
ad-hoc `res.status(400).json(...)` + `console.error`.

---

## Epic 2 — Data model

### [P1] Indexes on `lead`
`prisma/schema.prisma` has zero indexes; bulk-import dedup scans the
whole table by name, and queries filtered by enrichment status do full
scans. Cheap once the table grows past a few hundred rows. Add
`@@index([createdAt])`, `@@index([phoneEnrichmentStatus])`,
`@@index([firstName, lastName])`, and switch dedup to email-first.
Email uniqueness (`@@unique([email])`) is intentionally **not** included
here — needs product confirmation first (same contact across campaigns?).

### [P1] Shared lead type between backend and frontend
Lead shape is duplicated in Prisma schema, `LeadFields` in `index.ts`,
and `frontend/src/api/types/leads/*` — every new field touches three
places and drift is already happening (e.g. `phoneEnrichmentStatus`
is a free-form string on both sides). Introduce a `shared/` workspace
package with DTOs + Zod schemas, also covering the status string → enum.

---

## Epic 3 — Validation & known bugs

### [P0] Finish country-code validation rollout
`docs/plan-country-code-validation.md` specifies `i18n-iso-countries`
end-to-end but the integration is partial — bulk import just calls a
stubbed `sanitizeCountryCode()`, so invalid countries silently pass
through. Wire it through CSV parser, create/update endpoints, and bulk
import; add Vitest cases for lowercase, alpha-3, and common country
names.

### [P1] Regression test for Bug-2 timeout
Bug-2 (email verification stalls) was fixed in `workflows/workflows.ts`
but nothing pins the timeout/retry config — a well-meaning refactor
could silently reintroduce the hang. Add a test that fails if
`startToCloseTimeout` drops below 10s or retries go unbounded.

### [P2] Zod-based request validation
Each handler hand-rolls phone/URL/range checks; the frontend
re-implements similar logic in `csvParser.ts`. Low current pain but
every new field means writing validation twice. One Zod schema per DTO
in the shared package (Epic 2), used by an Express validation middleware
and by the CSV import UI.

---

## Epic 4 — Temporal

### [P1] Deterministic workflow IDs + cancellation
Enrich workflows use random IDs, so a double-click on "Enrich" spawns
two workflows for the same lead (duplicate provider calls, inconsistent
final state), and there's no way to abort an in-flight run. Use
`workflowId: \`enrich-phone-${leadId}\`` with
`workflowIdReusePolicy: ALLOW_DUPLICATE_FAILED_ONLY` for idempotency,
and wrap the provider loop in a `CancellationScope` reacting to a
`cancelEnrichment` signal (hooks into the UI "Cancel" button, Epic 5).

### [P2] Batch parent workflow for `verify-emails`
The HTTP handler loops over leads and awaits every workflow before
responding — a bulk verify of ~50+ leads risks proxy/browser timeouts
and leaves the UI blind if the API restarts mid-run. Today it's not felt
because tandas are small, but a large CSV import would expose it.
Introduce `verifyEmailsBatchWorkflow` that spawns bounded child
workflows; the endpoint returns its workflow id immediately and the UI
queries progress. Survives API restarts and scales past a single HTTP
request lifetime.

> **Intentional non-goal:** parallelizing Orion/Nimbus/Astra. The
> sequential fallback is by design — Orion is preferred for quality,
> Nimbus/Astra are fallbacks on failure, not on latency.

---

## Epic 5 — Frontend & UX

### [P1] Loader & progress states for long-running actions
Clicking "Enrich" / "Verify emails" gives no per-row spinner and no
aggregate progress — the user can't tell whether the click registered
or how far along a bulk run is. Add per-row skeleton in the status cell,
a sticky bulk progress bar ("12 of 50…") with a Cancel button tied to
the workflow signal (Epic 4), and the same treatment for
`generate-messages`.

### [P1] Honest disabled states
Disabled actions are still clickable or silently no-op, and dropdowns
open on rows where the action doesn't apply — users click and nothing
happens, with no explanation. Apply real `disabled` + `aria-disabled` +
`pointer-events-none`, and show a tooltip explaining **why** ("Already
enriching…", "Set a template first…").

### [P1] Break up `LeadsList.tsx` + add an error boundary
At ~440 lines it mixes table, mutations, menus, and modal coordination;
one render crash blanks the whole app with a blank white screen. Extract
`LeadsTable`, `PhoneCell`, `EnrichMenu`, `LeadRow`; wrap the shell in
`react-error-boundary` so a single component failure doesn't take down
the page.

### [P2] Sortable tables
`LeadsList` is stuck on `createdAt desc` — users can't re-sort by name,
status, or enrichment result. Click-to-sort headers via
`@tanstack/react-table` (also unlocks virtualization later). Sort state
in URL params; server-side sort once pagination lands.

---

## Epic 6 — Testing

### [P1] API endpoint tests
Backend tests cover utilities and provider adapters but not a single
HTTP route — the contract the frontend depends on is completely
unverified. Supertest + in-memory Prisma for each route; mock the
Temporal client at the `@temporalio/client` boundary. Target ≥70%
coverage on `routes/*`.

### [P2] Frontend component tests
Only `csvParser` / `countryCode` utils are tested — the components that
actually ship to users have no coverage, so CSS/state regressions land
silently. Add RTL + MSW coverage for `CsvImportModal` (parsing +
errors), `LeadsList` (status cell states), `MessageTemplateModal`
(template interpolation).

---

## Epic 7 — DX & CI/CD

### [P0] GitHub Actions pipeline + branch protection on `main`
No `.github/workflows` today; anything — broken build, failing tests,
un-typechecked code — can land on `main`. Add `ci.yml` with parallel
backend/frontend jobs: pnpm/Node cache → install → `gen:prisma` → lint
→ `tsc --noEmit` → test with coverage → build (frontend uploads `dist/`
artifact). Enable branch protection: CI green required, ≥1 approving
review, no force-push, linear history. Turn on Dependabot (pnpm +
Actions) and CodeQL. PR template + auto-labeler for ergonomics. Future:
Playwright E2E job, then a CD job building API + worker images on merge
to `main`, with `prisma migrate deploy` as a separate step before app
start.

### [P1] Backend ESLint parity with frontend
Backend has no linter; style drifts between packages and the frontend's
`--max-warnings 0` is undermined by every backend touch. Shared
`eslint.config.js` at repo root that both workspaces extend, with
`--max-warnings 0`.

### [P2] Husky pre-commit hooks
Nothing enforces quality at commit time locally — CI catches it, but
the feedback loop is slow and PRs churn on lint fixes. Root `husky` +
`lint-staged`: ESLint + Prettier on staged files, `tsc --noEmit` in both
workspaces, `vitest related --run` against staged files. Optional
`commitlint` (Conventional Commits). `pre-push` runs the full
`pnpm lint && pnpm test` as a backstop. CI remains the non-bypassable
gate — Husky is just the fast local loop.

---

## Epic 8 — Security & performance

### [P1] CSV upload limits
No file-size or row-count cap on `/leads/bulk` — a 500MB CSV (accidental
or malicious) OOMs the server. Enforce `MAX_UPLOAD_FILE_SIZE` in the
multer/route layer and reject CSVs over N rows with a clear error.

### [P2] Rate limiting on mutation endpoints
Once the API key lands (Epic 1), a compromised key or a buggy UI loop
can still hammer expensive endpoints (each `/enrich-phone` call burns
provider credits). Add `express-rate-limit` on `/leads/bulk`,
`/leads/verify-emails`, `/leads/*/enrich-phone`. Prevents accidental
self-DOS from the UI and targeted abuse.

---

## Sequencing

**Sprint 1 — stability & foundation**
1. Epic 7 → GitHub Actions CI + branch protection (the non-bypassable
   gate against regressions).
2. Epic 1 → CORS/auth, env validation, split `index.ts`.
3. Epic 3 → finish country-code, Bug-2 regression test.
4. Epic 2 → indexes, shared lead type.

**Sprint 2 — UX polish & scale**
1. Epic 5 → loaders, disabled states, extract `LeadsList`.
2. Epic 4 → deterministic workflow IDs + cancellation.
3. Epic 6 → API endpoint tests.
4. Epic 8 → upload limits.

**Backlog (P2/P3)** — pick up opportunistically or when evidence of
pain appears: structured logging, Zod request validation, batch parent
workflow, sortable tables, frontend component tests, Husky, rate
limiting.
