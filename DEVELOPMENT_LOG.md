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

---

## 2026-06-19 — Phase 2: Reference Data

**Done:**
- `packages/shared/src/reference.ts`: Zod schemas for locations/categories (request + response), `createUserRequestSchema`, `changeRoleRequestSchema`, `changePasswordRequestSchema`, and a shared `listQuerySchema` (search + page + limit, capped at 100). Extracted a reusable `passwordSchema` from `registerRequestSchema` (now shared by register, createUser, changePassword — single source for the policy). Extended `userResponseSchema` with `mustChangePassword: boolean`.
- Prisma: `User.mustChangePassword Boolean @default(false)` (migration `add_user_must_change_password`). Default `false` keeps Phase 1a self-registered admins unaffected; only `/users`-created rows get `true`.
- Backend auth: `AuthService.login` gates on `mustChangePassword` (403 `{ code: "MUST_CHANGE_PASSWORD" }` before issuing tokens). New `AuthService.changePassword` (verifies temp password, hashes new, clears flag, returns `AuthResponse`). `POST /auth/change-password` (no Bearer — the blocked login issued none), throttled like login/register.
- Backend reference modules — `LocationsModule`, `CategoriesModule` (mirrors), `UsersModule` — each with controller + service. Multi-tenancy via per-service `companyId` from `@CurrentUser()` on every read/write; cross-tenant lookups by id → 404 (no existence leak). Delete guards: locations/categories with assets → 409. `UsersModule`: list (no password), create (temp password + force-change, P2002→409), role-change (admin-only).
- RBAC: reads open to any authenticated user; reference writes require admin/manager; `/users` list+create admin/manager; `/users/:id/role` admin-only. `class`-level `@Roles("admin","manager")` on `UsersController` with the role-change route narrowing to `@Roles("admin")`.
- Tests: 10 critical-path e2e (real Postgres) — locations CRUD scoped, cross-tenant 404, delete-guard 409, category mirror, user-create temp-password + dup 409, force-change flow, RBAC role-change (admin ok / manager 403), viewer write 403, weak-password 400 — + 15 new unit tests across the modules. `test/reference.e2e.spec.ts` resets the in-memory `ThrottlerStorage` per test (same fix as Phase 1a's throttle test) so multi-register tests aren't throttled by earlier tests.
- Frontend: `lib/api/reference.ts` (typed locations/categories/users calls via `apiJson`), `changePasswordApi` in `auth.ts`, `AppSidebar` (Users link hidden for non-admin/manager — cosmetic, backend enforces), `DataTable` + `Modal` primitives (hand-rolled on Tailwind v4). Pages: `/locations`, `/categories`, `/users` (DataTable + create/edit Modal via RHF + shared Zod; delete with 409 surfaced; role-change dropdown), and `/change-password` (Suspense-wrapped for `useSearchParams`). `(dashboard)/layout.tsx` now renders the sidebar. `AuthForm` routes a `MUST_CHANGE_PASSWORD` 403 to `/change-password?email=…`.

**Decisions:**
- **Temp password + force-change** (ADR 0003) over admin-sets-final-password (admin would know it) and over email-invite (no SMTP until Phase 10). Chosen to ship a secure provisioning flow now without an email dependency.
- **Cross-tenant access → 404** (not 403) so response codes don't leak the existence of another company's records.
- **Per-service `companyId` filter** (not a Prisma extension/interceptor) — explicit, auditable, matches Phase 1a. Each `where: { companyId }` is an audit point that data stays tenant-scoped.
- **`loginApi` reads the 403 body** to extract `code: "MUST_CHANGE_PASSWORD"` — Nest serializes `ForbiddenException(obj)` as `{ message: obj }`, so the client unwraps it to distinguish a role-based 403 from the force-change 403.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **79** + shared **16** + web **11** = 106 passed.
- `pnpm build` — api + web; web emits `/locations`, `/categories`, `/users` (ƒ dynamic, server cookie guard), `/change-password`, plus the Phase 1 routes.

**Deferred / out of Phase 2:**
- User deactivation/soft-delete + re-invite → future.
- Email-based invites (no admin-set temp password) → Phase 10 once SMTP exists.
- Audit log of who changed which user's role → future.

**Next:** Phase 3 — Assets + QR codes (asset CRUD, opaque-token QR generation, QR lookup, UI).

---

## 2026-06-20 — Phase 3: Assets + QR Codes

**Done:**
- `packages/shared/src/assets.ts`: Zod schemas — `assetStatusSchema` (active/maintenance/retired — aligned to the Prisma enum; the spec draft listed `lost`, which the init migration never had, so dropped), `assetFiltersSchema` (extends Phase 2 `listQuerySchema` with status/locationId/categoryId), `createAssetRequestSchema`, `updateAssetRequestSchema` (partial), `assetResponseSchema`. Re-exported from `index.ts`.
- Backend `AssetsModule` (controller + service): multi-tenant CRUD (list with filters + pagination, get, create, update, delete) reusing Phase 2 conventions (per-service `companyId`, cross-tenant → 404, per-route `ZodValidationPipe`, `JwtAuthGuard` + `RolesGuard`). `locationId`/`categoryId` validated to belong to the caller's company on create/update (foreign-tenant FK → 400). Delete guard: 409 if any WorkOrder or Inspection references the asset. Prisma `Date` fields mapped to ISO strings in the response (`toAssetResponse`) to match the shared schema.
- **Opaque QR lifecycle**: tokens are `randomBytes(24).toString("base64url")` (192-bit, URL-safe) generated server-side on create — never accepted from the client. `GET /assets/:id/qr` renders the QR as `image/svg+xml` (via the `qrcode` lib) encoding the public scan URL `${PUBLIC_SCAN_BASE}/assets/qr/:token`. `GET /assets/qr/:token` (scan) resolves token→asset (authed; cross-tenant → 404). `POST /assets/:id/qr/rotate` overwrites the token (the old printed sticker's token then 404s). On the astronomically-unlikely `qrCode` P2002 collision at create, the service retries once with fresh entropy.
- RBAC: list/get/scan open to any authenticated user; create/update/delete + QR SVG + rotate require admin/manager. Route ordering: `GET qr/:token` declared before `GET :id` so the static `qr` segment isn't swallowed by the param.
- `PUBLIC_SCAN_BASE` env (Zod-validated, default `http://localhost:3000`) — the origin a scanned QR opens; prod sets the deployed web URL.
- Tests: 10 critical-path e2e (real Postgres) — CRUD + scoped list, foreign-FK 400, cross-tenant 404, QR SVG content-type + `<svg`, scan resolve + unknown/cross-tenant 404, rotate invalidation, delete guard 409, RBAC split (viewer write 403 / scan 200), filtered list, qrCode read-only on PATCH — + 8 unit tests on the service (mock Prisma+Config). `test/assets.e2e.spec.ts` resets `ThrottlerStorage` per test (Phase 2 fix).
- Frontend: `lib/api/assets.ts` (typed calls via `apiJson`/`apiFetch`; `getQrSvg` returns SVG text). Primitives: `Select`, `QrCodeDisplay` (embeds the trusted SVG inline + Download SVG + Rotate for admin/manager), `QrScanner` (wraps `html5-qrcode`, starts/stops camera, decodes the scan URL). Pages: `/assets` (DataTable + status/location/category/search filters), `/assets/new` (RHF + Zod form), `/assets/[id]` (detail + QR display + delete with 409 surfaced), `/assets/scan` (camera → `assetsApi.scan` → redirect). Sidebar: + "Assets" + "Scan QR".

**Decisions:**
- **Opaque base64url token, not the asset UUID** (PROJECT_PLAN §8): a leaked QR grants access to one asset, not the list; only the server resolves token→asset. Rotation = overwrite (no denylist/TTL — the token is a stable pointer, not a session).
- **QR rendered as SVG server-side** (vector, prints crisply). The web embeds the trusted SVG inline (`dangerouslySetInnerHTML` — source is our own authenticated api, not user input).
- **Scan open to any authenticated user**: it's the everyday action for technicians/inspectors; the token is still scoped to the caller's company (cross-tenant token → 404).
- **Delete guard on WorkOrder + Inspection** (not just reference-data FKs): protects the audit history an asset accumulates once work is done on it.
- **AssetStatus enum = active/maintenance/retired** (3 values): the init migration never had `lost`; the shared schema was corrected to match Prisma rather than invent a value the DB rejects.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **97** + shared **16** + web **11** = 124 passed.
- `pnpm build` — api + web; web emits `/assets`, `/assets/[id]`, `/assets/new`, `/assets/scan` (all ƒ dynamic under the dashboard cookie guard).

**Deferred / out of Phase 3:**
- Bulk asset import, asset photos/attachments, asset history/timeline view → later / Phase 7.
- QR printing layout/PDF → SVG download is enough for now.
- Camera-based scan is HTTPS-gated in prod (secure context); documented for Phase 10 deployment.

**Next:** Phase 4 — Work orders (WO CRUD, status-transition validation, assign, UI).

---

## 2026-06-20 — Phase 4: Work Orders

**Done:**
- `packages/shared/src/work-orders.ts`: Zod schemas — `workOrderTypeSchema`, `workOrderStatusSchema` (open/in_progress/on_hold/completed/cancelled), `prioritySchema`, `workOrderFiltersSchema` (extends Phase 2 `listQuerySchema` with status/priority/assetId/assignedToId), `createWorkOrderRequestSchema`, `updateWorkOrderRequestSchema` (partial, no status), `transitionWorkOrderRequestSchema`, `workOrderResponseSchema` (temporal as ISO strings / null). Re-exported from `index.ts`. (Removed a `.default("medium")` on `priority` — it conflicted with React Hook Form's typing; the form always sends priority, and the api defaults at the Prisma layer.)
- Backend `WorkOrdersModule` (controller + service + pure `transitions.ts` map): multi-tenant CRUD (list filtered + excludes soft-deleted, get, create, update fields — NOT status, soft-delete sets `deletedAt`). `assetId`/`assignedToId` validated to the caller's company (foreign-tenant FK → 400). Cross-tenant by id → 404. Prisma `Date`→ISO via `toWorkOrderResponse` (Phase 3 pattern).
- **Validated status transitions**: a pure `ALLOWED_TRANSITIONS` map + `canTransition(from,to)` in `transitions.ts`, unit-tested directly (6 tests). Graph: `open→in_progress→completed`; `in_progress↔on_hold`; `{open,in_progress,on_hold}→cancelled`; `completed`/`cancelled` terminal. `completedAt` auto-set on `completed`. Invalid transition → 400 naming the statuses (PROJECT_PLAN §497 satisfied: `open→completed` rejected). This is the critical-path test (exec spec §3.1).
- **Transition ownership RBAC**: the `PATCH /:id/status` route is NOT class-role-gated (RolesGuard can't express "technician if owner") — the service enforces: technician may transition only a WO assigned to them (`assignedToId === user.sub`), else 403; manager/admin any. Field writes (create/update) and soft-delete require admin/manager.
- Tests: 10 critical-path e2e (real Postgres) — lifecycle + soft-delete, valid transition chain + completedAt, `open→completed`→400, terminal states→400, technician-ownership 403/200, viewer RBAC, foreign-FK 400, cross-tenant 404, filtered list, soft-delete excluded from list+get — + 8 service unit tests + 6 transition unit tests. `test/work-orders.e2e.spec.ts` resets ThrottlerStorage per test.
- Frontend: `lib/api/work-orders.ts`, `lib/work-orders/transitions.ts` (client mirror of the api map for rendering buttons), `StatusBadge` (colored pill per status). Pages: `/work-orders` (DataTable + status/priority/asset/assignee/search filters), `/work-orders/new` (RHF + Zod form), `/work-orders/[id]` (detail + `<StatusBadge>` + transition buttons derived from the current status + assign dropdown + soft-delete). Sidebar: + "Work orders".

**Decisions:**
- **Parts endpoints deferred to Phase 6.** `GET/POST/DELETE /work-orders/:id/parts` need the active `Part` inventory model + transactional consumption — the core of Phase 6. Shipping WO lifecycle now without parts keeps the phase focused; the controller is ready to add the routes later.
- **Transition graph is data, not scattered if/else.** `transitions.ts` is a pure map + helper, unit-tested in isolation; the critical-path e2e reads almost identically to the unit test. Adding/removing a transition is a one-line data change + a test.
- **Soft-delete only** (PROJECT_PLAN §491, §161 audit-friendly): `deletedAt` set, never hard-delete; list/get exclude deleted rows. Phase 6's parts endpoints will filter `deletedAt: null` where it matters.
- **Technician-ownership check is service-layer, not RolesGuard.** "Technician may transition only their assigned WO" can't be expressed by a role guard, so the service reads `wo.assignedToId` vs `user.sub`. Manager/admin bypass the check.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **121** + shared **16** + web **11** = 148 passed.
- `pnpm build` — api + web; web emits `/work-orders`, `/work-orders/[id]`, `/work-orders/new` (all ƒ dynamic under the dashboard cookie guard).

**Deferred / out of Phase 4:**
- Parts consumption endpoints → Phase 6.
- WO CSV export, stats/trends → Phase 7.
- Notifications on assignment/due-date → Phase 8.

**Next:** Phase 5 — Inspections (templates + inspection, dynamic checklist, `passed` logic, QR link).

---

## 2026-06-20 — Phase 5: Inspections

**Done:**
- `packages/shared/src/inspections.ts`: Zod schemas — template items (`{ id, label, type: "pass_fail" }`), `createTemplateRequestSchema`, `updateTemplateRequestSchema`, `templateResponseSchema`, `inspectionResultSchema` (`{ itemId, value: "pass"|"fail" }`), `submitInspectionRequestSchema`, `inspectionResponseSchema`, `inspectionFiltersSchema` (with a custom `booleanQuery` preprocessor — `z.coerce.boolean()` treats `Boolean("false")` as true, so we parse `"true"`/`"false"` explicitly). Re-exported from `index.ts`.
- Backend `InspectionsModule` (controller + service + pure `compute-passed.ts`): template CRUD (server generates item `id`s via `randomUUID()`, type always `"pass_fail"`; multi-tenant; delete guard 409 if inspections reference); inspection submit (validates asset + template in company, validates results against template items via `validateResults`, computes `passed` server-side — **never trusted from the client**); list/get with filters (asset/template/passed). `inspectedById` = the authenticated submitter. `items`/`results` are Prisma `Json` → validated at the service boundary.
- **`passed` logic** (the critical-path test, exec spec §3.1): `validateResults(templateItemIds, results)` returns `{ ok, passed }` — passed = true iff every template item has exactly one `"pass"` result (missing/duplicate/extra/unknown → `{ ok: false }` → 400). One `"fail"` → `passed=false`. Pure function, unit-tested directly (5 tests).
- RBAC: reads (list/get templates + inspections) open to all; template writes (create/edit/delete) admin/manager; inspection submit technician/manager/admin. Static `/templates` segments before `:id` (same as Phase 3 QR ordering).
- Tests: 10 critical-path e2e (real Postgres) — template CRUD + server item ids, all-pass→passed=true + one-fail→passed=false (the §512 rule), missing/unknown itemId→400, foreign-tenant→404, inspectedById=submitter, template delete guard 409, cross-tenant 404, RBAC (viewer 403 / technician submit 200 / technician create template 403), filtered list, passed=false in filtered=false not in filtered=true — + 7 service unit tests + 5 validateResults unit tests. Also fixed `truncate()` in `test/db.ts` to clear all domain tables (was only clearing notification/user/company — Phase 5 inspections were leaking between tests).
- Frontend: `lib/api/inspections.ts`, `PassedBadge` (green Passed / red Failed). Pages: `/inspections` (list + asset/template/passed filters), `/inspections/new` (asset+template select → dynamic pass/fail checklist from template items + notes → submit shows result), `/inspections/[id]` (read-only checklist + PassedBadge + notes), `/inspections/templates` (list + create/edit modal with dynamic item rows + delete with 409). Sidebar: + "Inspections" + "Templates" (manager/admin).

**Decisions:**
- **Item type = `pass_fail` only** (user-confirmed; PROJECT_PLAN §510). Measurement/text types deferred to Phase 9 polish — keeps `passed` unambiguous.
- **`passed` computed server-side, never from client.** The submit endpoint accepts `results` and the service derives `passed` via `validateResults` — results validated against the template (all items present, no unknowns/duplicates). This is the critical-path rule: one `fail` → `passed=false`.
- **Inspections are immutable history** — no `PATCH /inspections/:id`. An inspection is a snapshot; editing a template later doesn't retroactively change past inspections (they store `results` + `passed` on the row, self-contained).
- **Template `items`/inspection `results` are Prisma `Json` columns** — shape enforced by Zod at the service boundary, not by the column type.
- **`booleanQuery` preprocessor** — `z.coerce.boolean()` is broken for query strings (`Boolean("false") === true`); we parse `"true"`/`"false"` explicitly. This was caught by test #10.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **143** + shared **16** + web **11** = 170 passed.
- `pnpm build` — api + web; web emits `/inspections`, `/inspections/[id]`, `/inspections/new`, `/inspections/templates`.

**Deferred / out of Phase 5:**
- `measurement` / `text` item types → Phase 9 polish.
- Inspection PDF export → Phase 7/10.
- Auto-create from schedule, re-running/superseding → future.

**Next:** Phase 6 — Parts inventory (Part + WorkOrderPart transactional consumption, low-stock, restock).

---

## 2026-06-21 — Phase 6: Parts Inventory

**Done:**
- `packages/shared/src/parts.ts`: Zod schemas — `partResponseSchema` (temporal as ISO), `createPartRequestSchema` (name/sku/description?/quantity≥0/minQuantity≥0), `updatePartRequestSchema` (partial), `partFiltersSchema` (extends `listQuerySchema` + `lowStock`), `workOrderPartResponseSchema` (nested `part`), `consumePartRequestSchema` (`{ partId, quantity≥1 }`). Re-exported from `index.ts`. **Refactor:** extracted `booleanQuery` from `inspections.ts` into `reference.ts` (single source) — both inspections and parts now reuse it.
- Backend `PartsModule` (controller + service + `to-part-response.ts` mapper): multi-tenant CRUD. `list` supports search (name OR sku) + a `lowStock` filter (Prisma can't compare two columns in `where`, so applied in memory over the search match — parts lists per company are small). SKU is `@@unique([companyId, sku])` — a collision surfaces as Prisma P2002 and is mapped to 409 (Phase 1a pattern). Cross-tenant → 404.
- Backend `WorkOrderPartsService` (lives in work-orders module): transactional consumption + restock. **`consume`** runs in `prisma.$transaction`: load WO (tenant-scoped) → 404; technician-not-owner → 403; load Part → 404; insufficient stock (`part.quantity < qty`) → 409; decrement `Part.quantity`; upsert `WorkOrderPart` (accumulates if a line already exists via `@@unique([workOrderId, partId])`); low-stock trigger on the downward crossing only. **`restock`** (`DELETE`) runs in `$transaction`: restore `Part.quantity`, delete the line — never fires low-stock (restock only raises quantity). The critical-path test (exec spec §3.1): consume decrements stock transactionally; restock restores; low-stock triggers on the crossing consumption.
- **Low-stock trigger (bounded):** fires iff `oldQuantity > minQuantity && newQuantity <= minQuantity` — never when already below min (no spam), never on restock. Creates one `Notification` per admin/manager in the company via direct `tx.notification.createMany` inside the transaction (so it rolls back with the consumption). `Notification.userId` is required by schema, hence the per-user fan-out. The full Notification read/mark-read service lands in Phase 8 — see ADR 0004.
- RBAC: parts CRUD reads any-authed, writes admin/manager; consumption has **no class-level role gate** (the service enforces technician-ownership OR admin/manager — same pattern as Phase 4 WO transitions, since RolesGuard can't express "technician if owner"); restock (DELETE) admin/manager. Endpoints wired onto `WorkOrdersController` (`GET/POST /work-orders/:id/parts`, `DELETE /work-orders/:id/parts/:partId`) — Part CRUD is its own `/parts` controller.
- Tests: **23 unit** (10 PartsService — CRUD, cross-tenant 404, SKU P2002→409, lowStock in-memory filter; 13 WorkOrderPartsService — consume decrement, accumulation, 409 insufficient, tech-not-owner 403, cross-tenant 404, low-stock crossing fires once, no-fire already-low, restock restores, no-fire on restock, manager can consume unowned, list tenant-scoped) + **16 critical-path e2e** (real Postgres): parts CRUD, dup sku 409, cross-tenant 404, delete→404, tech 403 on create, consume decrements + creates line, insufficient 409 (qty unchanged), restock restores + clears line, tech-not-owner consume 403, tech-owner consume 200, lowStock filter, low-stock crossing creates a manager Notification, no-spam when already low, accumulation, viewer restock 403.
- Frontend: `lib/api/parts.ts` (`partsApi` + `workOrderPartsApi`). Pages: `/parts` (search + lowStock filter + stock badge: OK/Low/Out), `/parts/new` (create form, 409 handling), `/parts/[id]` (edit + delete). WO detail page (`/work-orders/[id]`) extended with a "Parts consumed" section (list of consumed lines + qty, Consume form with part picker + qty for manager/owner, Restock button for managers). Sidebar: + "Parts".

**Decisions:**
- **Bounded low-stock trigger** (user-confirmed; ADR 0004). Phase 8 owns Notifications end-to-end (read/unread, UI, real-time). Implementing the full Notification service here would inflate Phase 6 scope and delay the critical-path parts work. We insert Notification rows transactionally now; Phase 8 adds the read service that surfaces them.
- **Low-stock fires on the crossing, not the state.** `oldQuantity > min && newQuantity <= min`. This prevents notification spam (consuming 1→0→-1 of an already-low part would otherwise fire repeatedly) and matches exec spec §3.1's wording ("triggers on the crossing consumption").
- **Consumption accumulation via `@@unique` upsert.** Consuming the same part twice on a WO adds to the existing line quantity rather than creating duplicates — the unique constraint makes this the natural behavior.
- **Restock = `DELETE` the line + restore quantity.** No partial restock UI/endpoint (YAGNI); managers remove the full consumed line and stock is restored. This is reversible and audit-simple.
- **`lowStock` filter applied in memory.** Prisma cannot express `quantity <= minQuantity` (two-column comparison) in a `where` clause. Parts lists per company are bounded (hundreds), so fetching the search match then filtering/slicing in the service is correct and keeps the query honest.
- **Technician-ownership check is service-layer** (Phase 4 pattern repeated). "Technician may consume only on their assigned WO" can't be a RolesGuard rule, so the service reads `wo.assignedToId === user.sub`.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **182** + shared **16** + web **11** = 209 passed.
- `pnpm build` — api + web; web emits `/parts`, `/parts/[id]`, `/parts/new` (all ƒ dynamic under the dashboard cookie guard).

**Deferred / out of Phase 6:**
- Notification read/mark-read service + UI → Phase 8.
- Parts usage reports / low-stock dashboard widget → Phase 7.
- Supplier/PO management → unscheduled (YAGNI).

**Next:** Phase 7 — Dashboard + reports (MTTR, asset health, parts usage, CSV export).
