# Design: Execution Process for Industrial Asset & Maintenance SaaS

> **Date:** 2026-06-17
> **Status:** Approved (pending user spec review)
> **Author:** ZCode agent, in collaboration with project owner
> **Related:** `PROJECT_PLAN.md` (the product/technical spec)

---

## 1. Purpose

`PROJECT_PLAN.md` is a complete product and technical specification — stack, architecture, domain model, Prisma schema, API endpoints, frontend pages, 11 phases, and documented tradeoffs. It is **not** a raw idea; it does not need to be brainstormed into a design.

This document specifies something the project plan does **not** cover: **the process** by which we execute those 11 phases across multiple agent sessions over 10–12 weeks. It defines:

- The per-phase work cycle (how a single phase is executed).
- The repository structure.
- The roadmap with agreed amendments to the original plan.
- Memory, verification, and git strategy.

It also records the **amendments** the owner approved to the original plan.

---

## 2. Environment & Constraints (confirmed)

- **Local dev environment:** Docker Desktop available on Windows. `docker-compose up` will run PostgreSQL + Redis (+ a dedicated test-db container) as planned.
- **Execution cadence:** strictly **one phase per session**. After each phase: implementation → verification → documentation → report → pause for owner confirmation. No phase begins until the previous is confirmed.
- **Memory strategy:** **Hybrid** (see §6).
- **GitHub:** owner requested **auto-push after each phase**. Repo details confirmed at Phase 0.

---

## 3. Amendments to `PROJECT_PLAN.md`

The owner approved all four amendments below. They do not change the project's concept; they reduce risk and fix internal contradictions.

### 3.1 Testing is done inside each phase, not deferred to Phase 9 (amends §9, Phase 9)

**Original:** Phase 9 "Testing + Polish" carries all backend/frontend tests.
**Problem:** "Tests later" ⇒ "no tests". This directly contradicts TDD discipline and §15.1's path-based coverage intent.
**Change:** Critical-path tests are written **within** the phase that implements the feature (TDD: red → green → refactor). Phase 9 is renamed **"E2E + Polish"** and carries only Playwright end-to-end tests, Swagger, error/loading states, and edge cases.

**Critical paths that MUST have tests in their phase:**
- Phase 1 — registration, login, refresh, role guard.
- Phase 4 — work order status transitions (reject invalid transitions).
- Phase 5 — inspection `passed` = true only if all items passed.
- Phase 6 — parts consumption decrements stock transactionally; restock restores; low-stock triggers on the crossing consumption.

### 3.2 Rate limiting on auth endpoints (amends §7.1, Phase 1)

**Original:** Redis "rate-limit counter" is mentioned in the stack (§3) but never scheduled in a phase.
**Change:** Add `@nestjs/throttler` (Redis-backed) to `/auth/login` and `/auth/register` in Phase 1. Brute-force protection is infrastructure, not a feature.

### 3.3 JWT `jti` + corrected "stateless" terminology (amends §3, §15.1)

**Original:** "JWT stays stateless; Redis is for ops, not sessions" with a refresh-token revocation list in Redis.
**Problem:** A revocation list keyed only by user cannot distinguish two valid refresh tokens of the same user. Calling this "stateless" is misleading — it is a **hybrid** (signed tokens + server-side denylist).
**Change:**
- Include a `jti` (JWT ID) claim in both access and refresh tokens.
- The revocation list is keyed by `jti`, enabling per-token logout/rotation.
- README and ADR describe this correctly as a **hybrid model**: stateless verification + Redis denylist for revocation.

### 3.4 Success criteria: critical paths, not a coverage percentage (amends §14, §15.1)

**Original:** §14 lists "At least 70% test coverage for critical paths" as a success criterion; §15.1 says coverage is path-based, not a vanity number. These contradict.
**Change:** The success criterion is **"all critical paths (§3.1 above) are covered by passing tests."** Coverage % is collected and reported as an informational metric, **not a gate**.

### 3.5 Additional hardening carried into Phase 0 (not an amendment, but recorded here)

- `@nestjs/config` with a Zod-validated env schema; `JWT_SECRET` and other required vars fail-fast if missing (prevents a common deploy bug).
- Phase 3 will evaluate `html5-qrcode` vs `@zxing/browser` for App Router compatibility before committing.
- Phase 10 will produce a README Quick Start with a demo account and screenshots, and a dedicated Playwright CI job with `actions/upload-artifact`.
- Phase 8 fixes notification polling to `refetchInterval: 60s` via TanStack Query.

---

## 4. Per-Phase Work Cycle

Every phase (Phase 0 onward) runs the same rigid cycle:

```
1. PLAN
   - Decompose the phase into a TodoWrite checklist.
   - Write a mini-spec / ADR for any contested decision.

2. IMPLEMENT (TDD for critical paths)
   - Red: write the test; it fails.
   - Green: minimal implementation to pass.
   - Refactor: keep it clean.

3. VERIFY (verification-before-completion)
   - Run: pnpm lint && pnpm typecheck && pnpm test
   - Show the real command output. Never claim success without evidence.

4. DOCUMENT
   - DEVELOPMENT_LOG.md  += phase entry.
   - docs/adr/NNNN-*.md  += ADR if a significant decision was made.
   - docs/progress.md    += checkmarks.
   - Conventional commits: feat / fix / test / docs / chore.

5. REPORT + PAUSE
   - Summarize: what was done, what was verified, what was deferred.
   - Wait for owner's "continue" before starting the next phase.
```

**In-phase conventions:**
- One NestJS module per folder: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`.
- Next.js: Server Components by default; `'use client'` only when needed.
- No `any` type. No hardcoded secrets. No `console.log` in production (Pino only).
- Shared types come from a single source (§5).
- Tests run against real PostgreSQL (Docker test-db), never SQLite.
- Prisma transactions for multi-step operations (e.g., parts consumption).

---

## 5. Repository Structure

```
industrial-asset-maintenance-saas/     (git root)
├── apps/
│   ├── web/                           Next.js 14 (App Router)
│   │   ├── src/app/                   routes per §8 of PROJECT_PLAN
│   │   ├── src/components/            shared + shadcn/ui
│   │   ├── src/lib/                   api client, hooks, utils
│   │   └── tests/                     RTL + Playwright specs
│   └── api/                           NestJS
│       ├── src/<module>/              one folder per domain module
│       ├── prisma/                    schema.prisma + migrations + seed
│       └── test/                      Vitest integration tests
├── packages/
│   └── shared/                        Zod schemas = single source of truth
│                                      (exports types for web + DTOs for api)
├── docs/
│   ├── adr/                           ADRs (Nygard format)
│   ├── architecture/                  diagrams, DB schema
│   ├── progress.md                    phase checklist
│   └── superpowers/specs/             design docs (this file, etc.)
├── .github/workflows/                 CI: lint, typecheck, test, build, e2e
├── docker-compose.yml                 postgres + redis
├── docker-compose.test.yml            isolated postgres (port 5433) for tests
├── DEVELOPMENT_LOG.md                 chronological journal
├── PROJECT_PLAN.md                    original product/tech spec
├── README.md                          Quick Start + demo + screenshots
├── .env.example                       all env vars with descriptions
├── pnpm-workspace.yaml
├── turbo.json
└── package.json                       root (pnpm workspaces)
```

**Single source of truth for types:** `packages/shared` holds **Zod schemas**. Backend derives `class-validator` DTOs / runtime validation from them; frontend infers types for React Hook Form. This eliminates hand-maintained parallel DTOs that inevitably drift.

**Test database:** `docker-compose.test.yml` runs a dedicated Postgres on port 5433 so integration tests never touch the dev database.

---

## 6. Memory Between Sessions (Hybrid)

**Always, after every phase:**
1. `DEVELOPMENT_LOG.md` — append: phase N, date, what was done, decisions made, problems hit, what's next.
2. `docs/adr/NNNN-<short-name>.md` — one ADR per significant decision (Status / Context / Decision / Consequences).
3. `docs/progress.md` — update phase checkmarks.
4. Git commits with **Conventional Commits** (`feat(scope): ...`, `test(scope): ...`, `docs(adr): ...`, `chore(ci): ...`).
5. **Auto-push to GitHub** after each phase (owner request). CI must be green before push.

**graphify — on demand**, used:
- At the start of a new session to refresh structural context.
- Before refactoring tangled modules.
- To visualize domain model / Prisma relations.
- When work orders, parts, and inspections start interweaving.

**Why hybrid:** Git + markdown docs are readable by the owner, recruiters, and don't depend on tooling. graphify gives machine-readable structure but a code graph goes stale every commit, so it is used selectively, not automatically.

---

## 7. Roadmap (11 phases with amendments)

| Phase | Week | Deliverable | Amendment notes |
|---|---|---|---|
| **0** Foundation | 1 | monorepo, web/api skeletons, docker-compose, CI skeleton, README stub, `.env.example` with Zod validation | + `@nestjs/config` env validation |
| **1** Auth | 1–2 | Prisma `Company`/`User`, auth module, **JWT with `jti`**, refresh + Redis revocation, Roles/Guard, login/register UI, protected routes | **+ throttler**; **+ jti**; critical-path tests here |
| **2** Reference data | 2 | locations / categories / users CRUD + UI | tests here |
| **3** Assets + QR | 3 | asset CRUD, QR generation (opaque token), QR lookup, UI (list/detail/new/scan) | evaluate `html5-qrcode` vs `@zxing/browser`; tests here |
| **4** Work orders | 4 | WO CRUD, status-transition validation, UI, assign | transition tests here |
| **5** Inspections | 5 | templates + inspection, dynamic checklist, QR link | `passed`-logic tests here |
| **6** Parts inventory | 5–6 | `Part` + `WorkOrderPart` transactional consumption, low-stock, UI | consumption + low-stock tests here (critical) |
| **7** Dashboard + Reports | 6–7 | `/dashboard/stats`, `/dashboard/trends`, BullMQ reports, R2, CSV | tests here |
| **8** Notifications | 7 | model + CRUD + auto-create + header dropdown + **60s polling** | `refetchInterval: 60s` |
| **9** **E2E + Polish** | 8–9 | Playwright critical paths, Swagger, error/loading states, edge cases | renamed from "Testing"; unit/integration tests already in phases |
| **10** Deployment + Docs | 10 | Vercel + Render + Upstash + R2, seed, screenshots, **demo account in README**, Playwright CI job | README Quick Start + demo; Playwright CI with artifacts |
| **11** Buffer | 11–12 | bugs, mobile, perf, polish | — |

**Success criteria** (revised, §3.4): all critical paths in §3.1 are covered by passing tests; coverage % is informational, not a gate.

---

## 8. Quality Gates & Git Strategy

**Verification (verification-before-completion):**
- "Done / works / passes" is never claimed without showing the real output of `pnpm lint && pnpm typecheck && pnpm test`.
- If a command fails, the error is shown and fixed in the same phase — not deferred.

**Git strategy:**
- `main` is the integration branch (protected in README).
- Each phase works on a branch: `feat/phase-N-<name>` (or sub-task branches).
- Merge to `main` only after the phase passes its verification gate and owner confirmation.
- **Auto-push to GitHub** after each phase (owner request). CI green is a precondition for push.

**Out of scope unless explicitly requested:**
- No production deploys without an explicit "deploy" instruction.
- No features outside the current phase.
- No new dependencies without justification.

---

## 9. Open Items for Phase 0

These are resolved at the start of Phase 0, not now:
- GitHub repo: new or existing? public or private? exact name?
- Git identity (use owner's real GitHub email/name vs. placeholder).
- Whether to copy `PROJECT_PLAN.md` into the new repo root verbatim.

---

## 10. Transition

The terminal state of this design is **invoking the writing-plans skill** to produce a detailed implementation plan, starting with Phase 0 (Foundation).
