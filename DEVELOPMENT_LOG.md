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

---

## 2026-06-18 — Phase 1a: Auth Backend

**Done:**
- Prisma schema: all 12 domain models in one `0001_init` migration (Phase 0/1a). Added `onDelete: Cascade` on `User.company` (migration `20260618184813_user_company_cascade`) to match spec §5 — deleting a Company now cascades to its Users like every other company FK.
- `@nestjs/config` + Zod env validation (`config/env.config.ts`): fail-fast at bootstrap on missing/invalid `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (min 16), TTLs, CORS. Typed `VALIDATED_ENV` token exported app-wide.
- `PrismaService` (composition over `extends PrismaClient` — the generated client recurses infinitely when subclassed under vite-node; ADR 0002 note) using `@prisma/adapter-pg` driver adapter (Prisma 7, ADR 0001). Global `PrismaModule`.
- `RedisService`/`RedisModule` (ioredis): global, provides the denylist store for refresh-token revocation.
- Shared Zod schemas (`packages/shared/src/auth.ts`): `registerRequestSchema` (accepts `company` name, password policy min 8 + letter + digit), `loginRequestSchema`, `refreshRequestSchema`, `userResponseSchema`, `authResponseSchema` (`{ accessToken, refreshToken, expiresIn, user }`), `jwtPayloadSchema` (with `typ` claim). Single source of truth for API + future web client.
- `TokenService`: the only place that signs/verifies JWTs and touches the Redis denylist. Issues access+refresh pairs with `jti`; `verify(token, typ)` enforces the `typ` claim and consults the denylist **for refresh only** (access is stateless per spec §4). `revoke` sets `auth:denylist:{jti}` with TTL = token's remaining life.
- `AuthService`: `register` transactionally creates `Company` + first `User(role: "admin")` (spec §3.2) and returns `{ user, accessToken, refreshToken, expiresIn }`; `login` (constant-time-ish on unknown email) returns the same; `refresh` rotates (revoke old `jti` → issue new pair); `logout` revokes (idempotent); `me` returns the user. Duplicate-email race caught as Prisma `P2002` → 409 (the unique constraint is the source of truth).
- Guards/decorators/strategies: `JwtAuthGuard` (Passport "jwt"), `JwtStrategy` pass-through (re-verifies via `TokenService` so denylist + single verify source), `RolesGuard` + `@Roles()`, `@CurrentUser()`. `GET /auth/admin-probe` guarded by `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")` exercises the guard end-to-end (200 admin / 403 viewer) — replaced by real `/users` in Phase 2.
- `AuthController`: `register`, `login`, `refresh`, `logout`, `me`, `admin-probe`. Refresh token travels in an **httpOnly, `sameSite: "lax"`, `path: "/auth"`** cookie (`refresh_token`), set on register/login, cleared on logout; `refresh`/`logout` read the cookie with a body fallback (spec §4). `cookie-parser` + `credentials: true` wired in `main.ts`. `@Throttle({ limit: 10, ttl: 60_000 })` on register + login (spec §4). Zod validation via per-route `ZodValidationPipe` → 400 on weak password.
- Tests: 50 api tests (incl. 14 e2e covering all 11 spec §8 critical paths) + 16 shared schema tests, on real PostgreSQL (`:5433`) + Redis. Throttle 429 test resets the in-memory `ThrottlerStorage` for determinism.

**Decisions:**
- **Refresh-token rotation + httpOnly cookie** (ADR 0002): access token in-memory (stateless, short TTL); refresh in httpOnly cookie; rotate on every refresh; denylist keyed by `jti`. Logout is idempotent (invalid/missing refresh → 200, no-op) so flaky client retries are harmless — a deliberate, documented deviation from spec §4's "401 if no valid refresh" on logout.
- **Zod→400 via per-route `ZodValidationPipe`** instead of the plan's global `ZodExceptionFilter`. Same spec outcome (400 on weak password), co-located with the route it validates.
- **Access-token statelessness preserved**: `TokenService.verify` skips the Redis denylist for `typ: "access"`. An access denylist would negate stateless verification (spec §4); the short access TTL is the accepted exposure window.
- **Register accepts `company` (name)** and creates the Company in a transaction with the first admin — per spec §3.2 (first-admin bootstrap). Earlier in the phase a `companyId`-based variant was tried and reverted to match the spec contract.
- **Test harness forces the test env** (`test/setup.env.ts` uses `=` not `??=`): the surrounding shell loads the repo `.env` (dev DB on `:5432`) into `process.env`, so a `??=` default would be skipped and e2e specs booting the real `AppModule` would hit the dev DB (ECONNREFUSED, or worse: stray writes). The harness owns these values; unit specs that need different env construct their own (`makeEnv()`).
- **Throttle test on the real app** (11 wrong-password logins → 11th is 429) rather than a second app with an overridden low limit: `overrideModule(ThrottlerModule)` breaks the global `ThrottlerGuard`/storage wiring, so the override silently stopped throttling. Resetting `ThrottlerStorage` before the test keeps it deterministic.

**Verified (real output, not assumed):**
- `pnpm --filter @iam/api lint` — clean.
- `pnpm --filter @iam/api typecheck` — clean.
- `pnpm --filter @iam/api test` — 9 files, **50 passed** (incl. 14 e2e = 11 spec critical paths + cookie-fallback/no-token extras, +1 P2002 race unit test).
- `pnpm --filter @iam/shared test` — 1 file, **16 passed**.
- `pnpm --filter @iam/api build` — `nest build` clean.
- `docker exec iam-postgres-test psql ... confdeltype` → `c` (CASCADE confirmed).
- Two-stage subagent review: spec-compliance **COMPLIANT** (all 11 critical-path tests covered, 10/10 prior gaps closed); code-quality **APPROVED** (no critical/important issues after the P2002 fix).

**Deferred / out of Phase 1a:**
- Frontend (Phase 1b): login/register pages (React Hook Form + Zod), Zustand auth store (access token in memory), TanStack Query silent-refresh on 401, `(dashboard)` layout guard, shadcn/ui setup.
- Redis-backed throttler storage (Phase 8/9, multi-instance).
- `sameSite: "none"` + `secure: true` cookie for prod cross-origin (Phase 10 deployment).

**Next:** Phase 1b — frontend auth UI + protected routes.

---

## 2026-06-19 — Phase 1b: Auth Frontend

**Done:**
- Web deps: Zustand (in-memory token store), TanStack Query v5 (mutations + silent refresh), React Hook Form v7 + @hookform/resolvers/zod (shared-schema validation). Vitest 2.1.0 (pinned to match api; vitest 4 broke on the monorepo's vite 5). Tailwind v4 `@theme` form/util tokens.
- Backend coordination: widened the refresh cookie path `/auth` → `/` so the `(dashboard)` Server Component guard can read it via `next/headers` `cookies()` at `/dashboard` (httpOnly; only `/auth/refresh` + `/auth/logout` consume it server-side).
- Dev proxy: `next.config.ts` rewrites `/api/:path*` → `${API_ORIGIN}/:path*` (default `:4000`). Same-origin fetch means the `sameSite: "lax"` refresh cookie is sent/accepted in dev without cross-origin CORS-cookie gymnastics. `NEXT_PUBLIC_API_URL=/api` (client base). Prod cross-origin + `sameSite:"none"; secure` deferred to Phase 10.
- `lib/api/auth.ts`: typed `registerApi`/`loginApi`/`refreshApi`/`logoutApi`/`meApi` over `fetch` with `credentials: "include"`; errors carry `status`. `BASE` read at call time so tests can swap `NEXT_PUBLIC_API_URL`.
- `lib/auth/store.ts`: Zustand store — `user`, `accessToken` (memory only), `status` (`idle|loading|authenticated|unauthenticated`).
- `lib/auth/refresh.ts` + `lib/api-client.ts`: `silentRefresh()` dedupes concurrent calls, fetches `/me` with the new token, and `setAuth`s `{user, token}` (flipping status to `authenticated`). `apiFetch` attaches the in-memory Bearer token and on a 401 attempts one silent refresh + one retry, clearing auth on a second failure (no loop).
- `lib/auth/hooks.ts`: `useLogin`/`useRegister`/`useLogout` TanStack mutations that update the store.
- UI primitives hand-rolled on Tailwind v4 (`button`, `form-field`, `auth-form`) — shadcn/ui `init` is known-broken on TW v4 (spec §7/§10), so the few components needed are built directly. `auth-form` is parameterised by mode and uses the shared `loginRequestSchema`/`registerRequestSchema`.
- Routes: `(auth)/login` + `(auth)/register` (centered card shell); `(dashboard)/layout.tsx` Server Component guard (no `refresh_token` cookie → `redirect('/login')`); `(dashboard)/dashboard/page.tsx` triggers `silentRefresh` on load, redirects to `/login` on failure, renders "Welcome, {email}" + logout; `/` redirects to `/dashboard`.
- Tests: 11 web unit tests (auth api 5, store 3, api-client 3). All on the same Vitest 2.1.0 as the api.

**Decisions:**
- **Access token in memory only** (Zustand), refresh token in httpOnly cookie — no `localStorage`/`sessionStorage`/`document.cookie` anywhere (spec §7). Lost on reload → `silentRefresh` via the cookie restores `{user, token}` (fetching `/me` so the store is whole, not half-set).
- **Server Component guard checks cookie presence, not validity**: presence = "the browser *might* have a session" (the access token is in-memory and never reaches the server); validity is re-established client-side via silent refresh. A revoked-but-present cookie falls through the guard, but the dashboard's failed-refresh path redirects to `/login`.
- **Dev proxy over cross-origin fetch**: avoids `sameSite:"lax"` cookie-not-sent and wildcard-origin-with-credentials rejection in dev. CORS already permits `localhost:3000` with `credentials:true`.
- **`meApi` calls `fetch` directly** (not `apiFetch`): in `silentRefresh` the token is freshly minted so a 401 retry is moot. `apiFetch`'s 401-retry path is infrastructure for Phase 2+ authenticated endpoints; documented as such.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api 50 + shared 16 + web 11, all green.
- `pnpm build` — api + web both build; web emits `/login`, `/register`, `/dashboard` (ƒ dynamic, server-rendered — the guard reads cookies), `/` (redirect).
- Subagent review: initially CHANGES_REQUESTED (silent refresh left `status='idle'` → dashboard stuck on "Loading…"; no failed-refresh redirect; `onLogout` had no error handling). Fixed and re-verified: `silentRefresh` now `setAuth`s via `/me`; dashboard redirects on failure; `onLogout` is best-effort (always clears + redirects).

**Deferred / out of Phase 1b:**
- Redis-backed throttler storage (Phase 8/9).
- `sameSite: "none"` + `secure: true` for prod cross-origin (Phase 10).
- Full dashboard UI (Phase 7).

**Next:** Phase 2 — reference data (locations, categories, users CRUD + `/users` admin page replacing the `/auth/admin-probe`).
