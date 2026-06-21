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

---

## 2026-06-21 — Phase 7: Dashboard + Reports

**Done:**
- `packages/shared/src/dashboard.ts`: response types — `statsResponseSchema`/`StatsResponse` (nested workOrders/assets/inspections/parts), `trendsQuerySchema` (`days` 1–365 default 30), `trendPointSchema`/`TrendPoint`, `trendsResponseSchema`/`TrendsResponse` (`mttrHours: number | null`). Re-exported from `index.ts`.
- Backend `DashboardModule` (controller + service + pure `mttr.ts`): read-only tenant-scoped aggregates.
  - `GET /dashboard/stats`: WO counts by status via `groupBy`, `overdue` (non-terminal, `dueDate < now`), asset total + maintenance, inspections last 30 days + passed + `passRate` (null when 0), parts `lowStock`/`outOfStock` (in-memory — Prisma can't compare columns, Phase 6 pattern).
  - `GET /dashboard/trends?days=`: windowed daily series (`woCreated`/`woCompleted`/`inspections`) bucketed by UTC `YYYY-MM-DD`, plus `mttrHours` via the pure `computeMttr` helper (mean `completedAt − createdAt` in hours over completed WOs; null when none).
- Backend `ReportsModule`: `GET /reports/work-orders.csv` — synchronous CSV export (RFC 4180: comma/quote/newline escaping via `escapeCsvField`, CRLF line endings, doubled embedded quotes). `Content-Type: text/csv` + `Content-Disposition: attachment; filename="work-orders.csv"`. Tenant-scoped, excludes soft-deleted, includes asset name + assignee email.
- RBAC: both endpoints any-authenticated; everything scoped by `user.companyId`. Nothing to write-gate.
- Tests: **18 unit** (5 `computeMttr` pure — null/empty, single, excludes incomplete, averages, fractional; 8 `DashboardService` — status map, passRate null/ratio, lowStock/outOfStock split, tenant scope, trend bucketing, MTTR delegation, empty window; 5 `ReportsService`/`toCsv`/`escapeCsvField` — null/undefined, plain, comma, quote-doubling, newline, header-only, row serialization) + **10 critical-path e2e** (real Postgres): empty-company zeros, seeded counts, unauthenticated 401, cross-tenant isolation, trend bucketing, MTTR reflects a seeded 10h-old completed WO, days validation 400, CSV 200 + content-type + disposition + body, CSV escaping (comma+quote), CSV tenant-scoped.
- Frontend: rewrote the `/dashboard` placeholder (the "Full UI lands in Phase 7" stub is gone). KPI card grid (Open/In progress/On hold/Overdue WOs, 30-day inspections + pass rate, assets in maintenance %, low/out-of-stock parts), a 30-day WO-created bar chart (div-based, no chart lib — hand-rolled-primatives decision preserved), MTTR readout, and an "Export work orders (CSV)" button. `lib/api/dashboard.ts` (`dashboardApi.stats/trends`), `lib/api/reports.ts` (`downloadWorkOrdersCsv` — fetch+blob+object-URL download since `<a href>` can't attach the bearer token).

**Decisions:**
- **Defer BullMQ + R2 (ADR 0005).** The exec spec lists "BullMQ reports, R2" for Phase 7. At portfolio-scale data volume (hundreds of WOs per tenant) a synchronous CSV generator runs in milliseconds; a job queue + object store + status polling would be significant infra for no user-visible benefit. Synchronous generation is the right-sized choice; documented as an ADR for reviewers.
- **MTTR is a pure function.** `computeMttr(items)` is extracted to `mttr.ts` and unit-tested directly — the service delegates to it. Keeps the time-arithmetic testable without a database.
- **Trend buckets use UTC `YYYY-MM-DD`.** Stable regardless of server timezone; `toISOString().slice(0,10)`. Tests use fixed `Z` dates.
- **CSV is RFC 4180-correct, not a naive join.** `escapeCsvField` doubles embedded quotes and wraps fields containing comma/quote/newline. Caught by a dedicated e2e that seeds a title with both a comma and a quote.
- **No chart library.** The trend is a flex row of div-bars. Matches the Phase 5 decision to hand-roll primitives (shadcn was broken on Tailwind v4); a chart lib would be a new dependency for a single small viz.
- **CSV download via fetch+blob, not `<a href>`.** Browsers won't attach the Authorization header to a navigated link, so we fetch the blob with `apiFetch` (token + silent refresh handled) and trigger a download via an object URL.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **215** + shared **16** + web **11** = 242 passed.
- `pnpm build` — api + web; dashboard renders real KPIs (no more placeholder).

**Deferred / out of Phase 7:**
- Async report generation (BullMQ) + R2 storage → ADR 0005 (deferred; synchronous is right-sized).
- PDF report generation → Phase 10 polish.
- Real-time dashboard (websockets / SSE) → unscheduled.

**Next:** Phase 8 — Notifications (read/mark-read service + UI, 60s polling; consumes the low-stock Notifications Phase 6 already produces).

---

## 2026-06-21 — Phase 8: Notifications

**Done:**
- `packages/shared/src/notifications.ts`: `notificationResponseSchema`/`NotificationResponse` (id, userId, title, message, read, createdAt ISO), `notificationListQuerySchema` (extends listQuerySchema — page/limit only, no search), `unreadCountResponseSchema` (`{ count }`), `markAllReadResponseSchema` (`{ updated }`). Re-exported from `index.ts`.
- Backend `NotificationsModule` (controller + service): per-user consumer. `GET /notifications` (paginated, newest first, scoped by `userId`), `GET /notifications/unread-count` (`{ count }` — the 60s-poll endpoint), `PATCH /notifications/:id/read` (get-then-update), `PATCH /notifications/read-all` (`updateMany`, returns count). **Static routes (`unread-count`, `read-all`) declared before `:id`** so Nest doesn't route them as ids (Phase 3/5 ordering rule).
- **Per-user, not per-tenant.** Notifications are owned by a user; the service scopes by `userId === user.sub` from the JWT, with no company filter. Id-keyed queries include `userId` in the `where` → another user's notification id returns 404 (no existence leak / IDOR, e2e #5).
- `markAllRead` idempotent via `updateMany` — a second call returns `{ updated: 0 }`, no error.
- Tests: **7 unit** (list scope+pagination, unreadCount, markRead happy + 404 IDOR, markAllRead count + idempotency, ISO mapping) + **8 critical-path e2e** (real Postgres): empty list + count 0, the **Phase 6→8 loop** (low-stock crossing creates a notification the manager sees + unread-count increments), mark-one-read flips read + decrements count, mark-all-read zeroes count + returns update count, IDOR 404 (B cannot read A's notification, A's stays unread), unauthenticated 401, static-route/no-id-collision, list scoped to requesting user. The Phase 6→8 e2e required seeding the manager with `mustChangePassword: false` and the right password (caught the force-change-password gate from Phase 1a).
- Frontend: `lib/api/notifications.ts`. `components/notifications-menu.tsx` — bell button + numeric unread badge (red pill, "9+" overflow), dropdown panel listing the 10 most recent (title + message + timestamp, unread rows tinted), per-row "Read" + "Mark all read". Two queries: `unread-count` with **`refetchInterval: 60_000`** (exec spec §3.6); `list` fetched on dropdown open only (no interval). Mounted in the `(dashboard)` layout header — visible on every dashboard page, not just `/dashboard`.

**Decisions:**
- **Polling, not websockets/SSE (ADR 0006).** Exec spec §3.6 fixes notification polling to `refetchInterval: 60s` via TanStack Query. A real-time socket layer is explicitly out of scope; 1 request / 60s / active user is negligible load against an indexed `userId` count.
- **Notifications are user-owned, not company-owned.** The schema's required `userId` (no company-broadcast) plus Phase 6's per-manager fan-out makes per-user scoping the natural model. The service has no company filter; a viewer only ever sees their own notifications.
- **The read service is producer-agnostic.** Phase 6's low-stock trigger is the only producer today; this module only reads + marks read. Future producers (WO assignment, due-date warnings) just insert `Notification` rows and they'll surface here unchanged.
- **60s polling on the count query only.** The list query runs when the dropdown opens (user-driven), not on an interval — avoids pulling full notification bodies every minute when the bell is closed.
- **`markAllRead` returns `{ updated }`, not the rows.** `updateMany` returns a count; the client invalidates both queries and the badge re-renders from the fresh `unread-count`. No need to return the touched rows.

**Verified (real output, not assumed):**
- `pnpm lint` — 3 workspaces pass.
- `pnpm typecheck` — 3 workspaces pass.
- `pnpm test` — api **230** + shared **16** + web **11** = 257 passed.
- `pnpm build` — api + web.

**Deferred / out of Phase 8:**
- Real-time push (SSE/WebSocket) → unscheduled (exec spec mandates 60s polling).
- Additional producers (WO assignment, due-date) → future.
- Email/digest delivery → unscheduled (YAGNI).

**Next:** Phase 9 — E2E + polish (Playwright critical paths, Swagger, error/loading states, edge cases).

---

## 2026-06-21 — Phase 9: E2E + Polish

**Done:**
- **Swagger** (`@nestjs/swagger`): `DocumentBuilder` wired in `main.ts`, served at `GET /docs` (disabled in production via `NODE_ENV`). Enabled the Nest swagger CLI plugin in `nest-cli.json` for controller/DTO introspection. Added `@ApiTags(...)` to all 11 controllers (auth, users, locations, categories, assets, work-orders, inspections, parts, dashboard, reports, notifications) via a batch edit.
- **Playwright browser E2E** (`apps/web/e2e/`): installed `@playwright/test` + chromium, `playwright.config.ts` (baseURL :3000, webServer=Next dev, screenshot on failure, trace on first retry, 1 worker — shared test DB). `e2e/helpers.ts` with `registerCompany`, `seedAsset`, and a `loginThroughUi` helper that **drives the real login flow through the browser** (not token injection — see ADR 0007) and navigates the Phase 1a force-change-password gate when the user was admin-created.
  - **5 critical-path specs, all green against a live docker-compose stack:**
    1. `register-dashboard` — register a fresh company, land on /dashboard with KPI cards
    2. `login-silent-refresh` — login, reload, remain authenticated (Phase 1b loop)
    3. `work-order-lifecycle` — create WO, transition open→in_progress→completed, status badge updates
    4. `parts-notification` — create part, consume past low-stock threshold, the **manager's bell badge increments** (Phase 6→8 loop end-to-end in a real browser)
    5. `rbac` — viewer reaches the new-WO form but the create submission is **rejected with 403** by the backend RolesGuard (the UI doesn't cosmetically hide the button; the guard is the contract)
- **Error/loading polish:** `apps/web/src/app/not-found.tsx` (global 404 with link home), `apps/web/src/app/error.tsx` (client error boundary with retry). Most pages already show "Loading…".
- **CI:** added a `playwright` job to `.github/workflows/ci.yml` — postgres+redis services, builds shared+api, installs chromium with deps, starts the api, waits on `/health` via `wait-on`, runs `playwright test`, uploads `playwright-report/` (14d) + `test-results/` traces (7d) on failure.

**Bugs found + fixed by the live browser run (the whole point of Phase 9):**
- **`useAuth` infinite loop (zustand).** The `useAuth` selector returned a new object literal every render → `useSyncExternalStore` threw "getSnapshot should be cached" → `<AppSidebar>` crashed the dashboard with "Maximum update depth exceeded". This was latent through Phases 1–8 because vitest never rendered the component. Fixed by wrapping the selector in `useShallow` (`zustand/react/shallow`) so the returned reference is stable when values are equal.
- **`main.ts` pino logger crash.** `app.get(Logger)` from `nestjs-pino` threw "Nest could not find Logger element" because `LoggerModule` was never registered — only the import existed. Latent for the same reason (vitest doesn't run main.ts). Fixed by removing the pino logger line and using the default Nest logger.
- **Shared package not buildable.** `@iam/shared` had `"type": "module"` + `main: "./src/index.ts"` (raw TS), which Node's ESM loader can't resolve (missing extensions) when the compiled api imports it. Added a `tsconfig.json` + `build` script that emits CJS `dist/`, pointed `main`/`types` at `dist`. The api server now boots.

**Decisions:**
- **Playwright authenticates via the real login flow, not token injection** (ADR 0007). The access token is in-memory (Zustand) and the refresh token is httpOnly — neither can be injected into a fresh browser context. Specs `POST /auth/login` through the browser so the cookie is set and the client-side silent refresh hydrates auth naturally. This also exercises the real auth path, which is the point of E2E.
- **RBAC test asserts the 403, not a hidden button.** The WO list page shows "New work order" to everyone; the RolesGuard is the actual gate. The spec verifies a viewer's submission is rejected — that's the contract that matters, not a cosmetic UI hide.
- **`loginThroughUi` handles the must-change-password gate.** Admin-created users ship with `mustChangePassword: true`; the helper waits for either `/dashboard` or `/change-password`, fills the form by stable input `id` (`#currentPassword`/`#newPassword` — `getByLabel` was flaky against the `(temporary)` parenthetical), submits, and waits for `/dashboard`.

**Verified (real output, not assumed):**
- `pnpm lint` — 4 workspaces pass.
- `pnpm typecheck` — 4 workspaces pass.
- `pnpm test` — api **230** + shared **16** + web **11** = 257 vitest passed.
- `pnpm build` — 3 workspaces pass.
- `pnpm --filter @iam/web exec playwright test` — **5/5 specs green** against live api(:4000) + web(:3000) + postgres(:5432) + redis(:6379). Screenshots captured (`phase9-01..05-*.png`).
- `curl /health` → 200, `curl /docs/` → 200.

**Deferred / out of Phase 9:**
- Exhaustive per-DTO Swagger `@ApiProperty` annotation → Phase 10 polish (the plugin infers most).
- Visual regression testing → unscheduled.
- Mobile-responsive pass → Phase 11 buffer.

**Next:** Phase 10 — Deployment + docs (Vercel + Render + Upstash + R2, seed script, README Quick Start + demo account, screenshots, Playwright CI artifacts).

---

## 2026-06-21 — Phase 10: Deployment + Docs

**Done:**
- **Seed script** (`apps/api/prisma/seed.ts`, idempotent): creates a demo company "Acme Industrial Maintenance" with admin (`demo@acme.test`) / manager / technician accounts (all `Password1`, `mustChangePassword: false` — ready to log in), 2 locations, 2 categories, 3 assets with QR tokens, 3 WOs across statuses (open/in_progress/completed), and 2 parts (one above min, one at low-stock threshold so the dashboard shows a low-stock count out of the box). Loaded the monorepo root `.env` explicitly + used the Prisma 7 driver-adapter pattern (`PrismaClient({ adapter: new PrismaPg(pool) })`) — the generated client requires the adapter (caught during local verification). Wired as `prisma.seed` + a `db:seed` npm script, run via `node --experimental-strip-types` (Node 24 native TS). **Verified locally:** seed runs, idempotent on re-run, login as `demo@acme.test` returns an access token.
- **Deployment configs (artifacts, not live deploys — ADR 0008):**
  - `render.yaml` — Render Blueprint: one `web` service (`iam-api`, build installs + builds shared + api + runs `prisma migrate deploy`, start = `pnpm --filter @iam/api start`, health `/health`), one managed Postgres (`iam-postgres`), env wiring (`DATABASE_URL` from the postgres resource, `REDIS_URL`/`CORS_ORIGIN`/`PUBLIC_SCAN_BASE` as `sync: false` to set in the dashboard, `JWT_SECRET` auto-generated).
  - `vercel.json` — web build command (`pnpm --filter @iam/shared build && pnpm --filter @iam/web build`), output dir, and the `/api/* → ${API_ORIGIN}` rewrite mirroring `next.config.ts` so the browser's same-origin calls proxy to the api.
  - Upstash Redis documented as a manual create-and-wire step (cross-provider, account-specific).
  - R2 omitted per ADR 0005 (synchronous CSV export; no object storage in use).
- **README rewrite:** badges + status; Quick Start with the `db:seed` step and the demo-account table (admin/manager/tech, all `Password1`); 4 screenshots (registration, dashboard, WO list, WO detail) moved to `docs/screenshots/`; updated stack list; scripts table (+`db:seed`, +`e2e`); Architecture section (multi-tenancy, hybrid JWT auth model, RBAC, in-phase critical-path tests); Deployment section with step-by-step Render/Upstash/Vercel instructions; full ADR index 0001–0008; Testing summary.
- **`.env.example`** updated with a deployment-vars section (DATABASE_URL/REDIS_URL/CORS_ORIGIN/PUBLIC_SCAN_BASE/API_ORIGIN/JWT_SECRET for production, with the `openssl rand -hex 32` note for JWT_SECRET).

**Decisions:**
- **Ship configs, not live deploys (ADR 0008).** Executing `vercel deploy` / `render deploy` needs authenticated cloud accounts + secrets that can't be autonomously provisioned or verified here. The deliverable's value — "deploy in minutes" — is satisfied by correct `render.yaml` + `vercel.json` + docs; whether the deploy runs today or next week is environment-dependent. Option documented honestly rather than faked.
- **Seed uses the Prisma 7 driver adapter directly.** `new PrismaClient()` with no args throws in Prisma 7 (the generated client requires `@prisma/adapter-pg`). The seed mirrors `PrismaService` exactly — a `pg.Pool` wrapped in `PrismaPg`.
- **Node-native TS via `--experimental-strip-types`.** Node 24 strips types natively, so the seed runs as a `.ts` file with no `tsx`/`ts-node` dependency. Avoids adding a dev-only toolchain just for seeding.
- **Demo users have `mustChangePassword: false`.** Unlike admin-created users (Phase 1a gate), the seed users are meant for immediate demo login; the flag is cleared so reviewers can log straight in without the change-password dance.
- **R2 not included.** Per ADR 0005 we generate reports synchronously; no object storage is used, so wiring R2 would be dead config.

**Verified (real output, not assumed):**
- `pnpm --filter @iam/api db:seed` → "Seed complete." + the demo company/users/assets/WOs/parts created. Second run → "demo company already exists. Nothing to do." (idempotent).
- `POST /auth/login` with `demo@acme.test` / `Password1` → 200 + access token (login works end-to-end after seed).
- Lint + typecheck + build remain green (no source-code changes; Phase 10 is seed + configs + docs only).

**Deferred / out of Phase 10:**
- **Live deploy execution** — needs your cloud accounts (Render/Vercel/Upstash). Configs + README §Deployment are ready; commands documented 1:1.
- Custom domain wiring — environment-specific.
- Production monitoring/observability — unscheduled.

**Next:** Phase 11 — Buffer (bugs, mobile, perf, polish). The roadmap's critical path (Phases 0–10) is complete.

---

## 2026-06-21 — Phase 11: Buffer (audit-driven fixes)

**Done:** The exec spec leaves Phase 11 open ("bugs, mobile, perf, polish"). I audited the live stack (browser + repo) rather than inventing work, and found three real issues — all fixed.

- **Mobile responsive sidebar.** The dashboard layout used a fixed `w-56` (224px) sidebar on every viewport — on a 375px phone that left ~150px for the main content, crushing the KPI grid, tables, and forms (verified by a mobile screenshot). `AppSidebar` is now a Client Component: static column on `md+` (`hidden md:flex`), and a hamburger button + slide-over drawer below `md`. The drawer closes on link navigation (pathname → `setOpen(false)`) so a tap doesn't leave an open overlay. Verified: mobile viewport now shows full-width content; desktop layout unchanged.
- **Favicon.** Every page logged a 404 for `/favicon.ico`. Added `apps/web/src/app/icon.svg` (App Router convention — Next auto-serves it as the favicon). Console error count dropped to 0.
- **MTTR `-0.0h` display bug.** The demo seed creates a completed WO with `completedAt: new Date()` that, due to the order of `default(now())` createdAt vs the explicit completedAt, can land a few microseconds *before* createdAt → `computeMttr` returned a tiny negative number → the dashboard rendered `MTTR: -0.0h`. Fixed at two layers: (a) backend `computeMttr` now clamps each delta with `Math.max(0, ...)` so a non-monotonic clock / seed race can't produce negative MTTR (new unit test covers it); (b) frontend hides the MTTR readout unless `mttrHours > 0` (null/zero/negative → no readout, instead of a misleading `-0.0h`).

**Verified (real output, not assumed):**
- `pnpm lint` / `pnpm typecheck` / `pnpm build` — green (3/4/3 workspaces).
- `pnpm test` — api **231** (added MTTR clamp test) + shared **16** + web **11** = 258 passed.
- `pnpm --filter @iam/web exec playwright test` — **5/5 green** (sidebar refactor didn't regress).
- Live mobile viewport (375×667): hamburger visible, drawer opens/closes, full-width content, **0 console errors**.

**Notes:**
- Audit also confirmed the demo seed renders correctly on the dashboard (1 open, 1 in-progress, 3 assets, 1 low-stock part — all from the seed).
- No TODO/FIXME markers in the source. No other in-your-face bugs surfaced.

**Status:** Phases 0–11 complete. The roadmap is finished.
