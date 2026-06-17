# Development Log

Chronological journal of implementation work. One entry per phase, appended at
the end of each phase. Mirrors the process defined in
[`docs/superpowers/specs/2026-06-17-execution-process-design.md`](./docs/superpowers/specs/2026-06-17-execution-process-design.md).

---

## 2026-06-17 — Phase 0: Foundation

**Done:**
- pnpm workspaces + Turborepo root configured (`package.json`, `pnpm-workspace.yaml`, `turbo.json`).
- `packages/shared` created as the Zod-based single source of truth for types. `HealthResponse` schema defined here and consumed by both apps.
- `apps/api`: NestJS 11 skeleton. `/health` endpoint written **TDD** (red test → green implementation). 1 passing Vitest test. Pino logger wired. CORS enabled.
- `apps/web`: Next.js 16.2.9 (Turbopack, React 19) + Tailwind CSS v4 skeleton. Shared-types wiring proven (`HealthResponse` imported in `page.tsx`, passes typecheck + production build).
- `docker-compose.yml`: postgres:16-alpine + redis:7-alpine (dev). `docker-compose.test.yml`: isolated postgres on `:5433` for integration tests.
- `.env.example` documented (API, DB, Redis, auth placeholders, web).
- **GitHub Actions CI** (`.github/workflows/ci.yml`): lint, typecheck, test, build on push/PR to `main`, with postgres + redis service containers.
- **Root ESLint flat config** (`eslint.config.mjs`) added so `pnpm lint` is a real gate, not a no-op. JS + TS recommended + prettier-compat. Test files relax `no-explicit-any`.
- ADR 0001 recorded: adopted current stable majors (June 2026) — Next 16, NestJS 11, Prisma 7, Tailwind v4 — superseding `PROJECT_PLAN.md`'s pinned versions.

**Decisions:**
- Adopted current stable majors (ADR 0001) rather than the plan's 2024-era pins. Verified actual published versions via `pnpm view` and pinned caret ranges in each `package.json`.
- `@nestjs/config` Zod env validation **deferred to Phase 1** — env shapes (JWT, DB) only become meaningful once auth exists, so validating them in Phase 0 would be a placeholder. Recorded here, not silently.
- Added root ESLint beyond the bare plan because `pnpm lint` would otherwise be a no-op and the CI gate would be meaningless. This keeps the verification gate honest.
- `.nvmrc` pinned to `22` (Node 22 LTS — the active LTS line as of June 2026; Node 24 is the odd/current line until Oct 2026, not LTS). Keeps `.nvmrc`, CI (`node-version: 22`), `package.json` `engines` (`>=22`), and ADR 0001 all consistent. (Local machine runs Node 24, which is compatible — nvm will use 22 where pinned; CI enforces 22.)

**Verified (real output, not assumed):**
- `pnpm install` — clean (490+ packages, no peer-dep errors).
- `pnpm lint` — 3/3 workspaces pass.
- `pnpm typecheck` — 3/3 workspaces pass.
- `pnpm test` — `apps/api` `/health` test: 1 passed.
- `pnpm build` — both apps build (Next 16 build in ~2s; `nest build` clean).
- `docker compose ps` — `iam-postgres` and `iam-redis` both `healthy`.
- `psql ... SELECT version();` → `PostgreSQL 16.14`.
- `redis-cli ping` → `PONG`.
- `curl http://localhost:4000/health` → `{"status":"ok","timestamp":"2026-06-17T13:18:58.816Z"}`.

**Git identity:** `onesixeight <onesixeight@users.noreply.github.com>` (GitHub noreply email — keeps the real address private while still attributing commits to the account).

**Deferred / out of Phase 0:**
- `gh` CLI install + GitHub repo creation + first push (Task 8) — requires user consent for a system-level install and `gh auth login`.
- Shadcn/ui component setup — Phase 1 (when auth forms need it).
- Prisma `schema.prisma` + initial migration — Phase 1 (with `Company`/`User`).

**Next:** Phase 1 — Authentication. JWT with `jti`, access + refresh tokens, Redis-backed refresh revocation list (keyed by `jti`), `@nestjs/throttler` on `/auth/login` + `/auth/register`, `@Roles()` decorator + `RolesGuard`, login/register UI, protected routes. Critical-path tests written in-phase (TDD).
