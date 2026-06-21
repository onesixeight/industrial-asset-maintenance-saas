# Phase 10 — Deployment + Docs Design

**Date:** 2026-06-21
**Branch:** `feat/phase-10-deployment-docs`
**Predecessor:** Phase 9 (E2E + Polish) — `feat/phase-9-e2e-polish`

## 1. Goal

Ship everything needed to deploy the app and onboard a new developer or reviewer in minutes: a working seed script with a demo account, one-click deployment configs for the target providers, and a README that documents Quick Start + demo + deployment + screenshots. Per exec spec §7 line 190.

## 2. Scope

### In scope
1. **Seed script** (`apps/api/prisma/seed.ts`) — demo company + admin + sample reference/asset/WO/part data; a `db:seed` script; verified locally.
2. **Deployment config artifacts:**
   - `render.yaml` — Render Blueprint (api web service + postgres)
   - `vercel.json` — web build/rewrites config
   - Upstash Redis documentation (connection string plumbing)
   - R2 deferred per ADR 0005 (synchronous CSV export, no object storage needed)
3. **README rewrite** — Quick Start with demo account, screenshots, Deployment section linking all configs, full ADR index (0001–0008), architecture summary.
4. **`.env.example`** updated with deployment-time variables.
5. **ADR 0008** documenting the deployment-config-as-artifacts decision (why we ship configs not live deployments).

### Out of scope (requires your cloud accounts)
- **Live deployment execution** (`vercel deploy`, `render deploy`) — needs authenticated cloud accounts + secrets. Documented commands instead.
- **Custom domain wiring** — environment-specific.
- **Production monitoring/observability stack** — unscheduled.

## 3. Seed script

`apps/api/prisma/seed.ts` is idempotent: it checks for the demo company by email and exits cleanly if present. Creates:

- **Company** "Acme Industrial Maintenance"
- **Admin** `demo@acme.test` / `Password1` (role: admin, `mustChangePassword: false` — ready to log in)
- **Manager** `manager@acme.test` / `Password1`
- **Technician** `tech@acme.test` / `Password1`
- Reference data: 2 locations, 2 categories
- 3 assets (with QR tokens)
- 3 work orders across statuses (open / in_progress / completed)
- 2 parts (one above min, one at low-stock threshold)

Run via `pnpm --filter @iam/api db:seed`. Prisma `prisma.db.seed` configured in `package.json` so `prisma migrate deploy` + `db:seed` form the standard provisioning flow.

**Verification:** I run the seed against the local dev DB and confirm via a count query that the expected rows exist.

## 4. Deployment configs

### `render.yaml` (Render Blueprint)
- One `web` service: the NestJS api (`pnpm --filter @iam/api start`), build = `pnpm install && pnpm --filter @iam/shared build && pnpm --filter @iam/api build && pnpm --filter @iam/api exec prisma migrate deploy`, env vars wired from the blueprint (`DATABASE_URL` from the `postgres` resource, `REDIS_URL` set to an Upstash connection).
- One `postgres` resource (Render-managed Postgres 16).
- Health check path `/health`.

### `vercel.json` (web)
- Build command, output directory (Next.js default), `rewrites` mirroring `next.config.ts` (or environment-based `API_ORIGIN`).
- Documents env vars to set in the Vercel dashboard.

### Upstash Redis
- No config file (account-specific); README documents creating a free Redis instance and wiring `REDIS_URL` in both Render and Vercel.

### R2
- Deferred per ADR 0005 (we generate reports synchronously; no object storage in use).

## 5. README

Rewritten structure:
1. **Badges + one-line description**
2. **Live demo / Quick start** — clone, cp env, docker compose, install, **`db:seed`**, `pnpm dev`, then log in with `demo@acme.test` / `Password1`
3. **Screenshots** — register, dashboard, work-orders list, work-order detail (Phase 9 captures)
4. **Stack** — updated diagram/list
5. **Scripts** table (including `db:seed`)
6. **Architecture** — monorepo layout, auth model (JWT jti + rotation + Redis denylist), multi-tenancy, RBAC
7. **Deployment** — step-by-step for Render (api) + Vercel (web) + Upstash (Redis); link to `render.yaml` / `vercel.json`
8. **Testing** — vitest (unit/integration) + Playwright (browser E2E) + CI
9. **Documentation index** — links to PROJECT_PLAN, exec spec, all 8 ADRs, progress, dev log
10. **Project status** — phases 0–10 complete

## 6. `.env.example`

Adds deployment-time vars with comments: `DATABASE_URL` (production), `REDIS_URL` (Upstash), `CORS_ORIGIN` (deployed web URL), `JWT_SECRET` (generate strong), production `NEXT_PUBLIC_API_URL`.

## 7. Testing & verification

- Seed script: run locally → confirm expected rows via `prisma count`. Idempotency: run twice → no duplicates.
- Lint + typecheck + build remain green (no source code changes).
- README renders correctly (markdown sanity).

## 8. Success criteria

- `pnpm --filter @iam/api db:seed` runs and creates the demo dataset; logging in as `demo@acme.test` works.
- `render.yaml` + `vercel.json` exist and reference the correct build/start commands.
- README updated with Quick Start, demo account, screenshots, deployment, full ADR index.
- DEVELOPMENT_LOG + progress.md + ADR 0008 updated.
- Conventional commit + push to `feat/phase-10-deployment-docs`.
