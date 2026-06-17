# Spec: Phase 1 — Authentication

> **Date:** 2026-06-17
> **Status:** Approved (pending user spec review)
> **Phase:** 1 of 11
> **Depends on:** Phase 0 (Foundation) — complete
> **Related:** `PROJECT_PLAN.md` §5, §6, §7.1, §7.2; execution-process spec §3.1, §3.3, §7

---

## 1. Goal

Implement end-to-end authentication for the SaaS: a company can register its
first admin, users can log in, tokens rotate on refresh, and role-based access
control is enforced. Frontend gets login/register pages and protected routes.
All critical paths are covered by passing tests written **in this phase** (TDD).

## 2. Scope

### In scope
- Prisma schema with **all 12 domain models** from `PROJECT_PLAN.md` §6 (one
  migration `0001_init`). Only `Company` + `User` get endpoints/UI in Phase 1;
  the rest exist in schema only and are implemented in later phases.
- `@nestjs/config` with Zod env validation (the hardening deferred from Phase 0).
- Auth backend: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `GET /auth/me`, `POST /auth/logout`.
- JWT access + refresh tokens with `jti`; refresh-token **rotation on every
  refresh**; Redis-backed denylist keyed by `jti`.
- `@nestjs/throttler` on `/auth/login` and `/auth/register`.
- `@Roles()` decorator + `RolesGuard` (demonstrated by guarding the future
  `/users` admin path; the `/users` endpoints themselves ship in Phase 2).
- Frontend: shadcn/ui setup, login + register pages (React Hook Form + Zod),
  Zustand auth store (access token in memory), refresh token in httpOnly cookie,
  TanStack Query v5 mutations, `(dashboard)` layout guard.
- 11 TDD tests on real PostgreSQL (docker-compose.test.yml).
- ADR 0002 (refresh rotation + httpOnly cookie strategy).

### Explicitly out of scope (later phases)
- `/users` CRUD endpoints + page → Phase 2.
- Password reset, email verification, 2FA → future.
- Full dashboard UI → Phase 7.
- Locations/categories/assets/etc. endpoints → Phases 2–6.

---

## 3. Confirmed Decisions (from brainstorming)

1. **Refresh-token strategy: rotate on every refresh.** Each `/auth/refresh`
   issues a fresh access+refresh pair with a new `jti`; the consumed refresh
   token's `jti` is added to the Redis denylist. Reuse of a revoked refresh =
   rejected (401), signalling theft.
2. **First company + admin via `POST /auth/register`.** Registration
   transactionally creates `Company` + `User` with role `admin`. Other users
   are added later via `/users` (admin/manager).
3. **Password policy: minimum 8 chars, at least 1 letter + 1 digit.** Expressed
   as a Zod schema in `@iam/shared`, reused on frontend forms and backend DTO.
4. **`POST /auth/logout` is included** (added beyond `PROJECT_PLAN.md` §7.1) —
   it revokes the current refresh `jti`. Without it, the rotation/denylist
   design has no revocation trigger and logout would be cosmetic.
5. **All 12 Prisma models ship now** in one migration; only auth endpoints are
   implemented this phase. (Reduces migration churn across later phases.)

---

## 4. Backend Architecture

### Module layout
```
apps/api/src/
├── app.module.ts                  imports ConfigModule, PrismaModule, RedisModule, AuthModule
├── config/env.config.ts           Zod env schema (fail-fast on missing/invalid)
├── prisma/
│   ├── prisma.module.ts           global
│   └── prisma.service.ts          extends PrismaClient, onModuleInit connects
├── redis/
│   └── redis.module.ts            provides ioredis client (denylist + future use)
├── auth/
│   ├── auth.module.ts             JwtModule, ThrottlerModule, PassportModule
│   ├── auth.controller.ts         register, login, refresh, me, logout
│   ├── auth.service.ts            business logic (bcrypt, tx, delegates to TokenService)
│   ├── token/
│   │   └── token.service.ts       ONLY place that signs/verifies JWT + touches Redis denylist
│   ├── strategies/
│   │   ├── jwt-access.strategy.ts verifies access JWT signature + jti not denied
│   │   └── jwt-refresh.strategy.ts verifies refresh JWT; triggers rotation in controller
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   └── decorators/roles.decorator.ts
└── (DTOs derived from @iam/shared Zod schemas)
```

### Endpoint contracts

| Method & path | Body | Success (200/201) | Error |
|---|---|---|---|
| `POST /auth/register` | `{ company, email, password, firstName, lastName }` | `{ accessToken, refreshToken, user }` (also sets refresh httpOnly cookie) | 409 duplicate email; 400 weak password |
| `POST /auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user }` (cookie set) | 401 bad credentials; 429 throttled |
| `POST /auth/refresh` | _(reads refresh from cookie; falls back to body)_ | `{ accessToken, refreshToken }` — **rotated**, old jti denied | 401 invalid/revoked |
| `GET /auth/me` | — | `{ id, email, firstName, lastName, role, companyId }` | 401 |
| `POST /auth/logout` | _(refresh cookie)_ | `{ success: true }` — current refresh jti denied | 401 if no valid refresh |
| `GET /auth/admin-probe` | — | `{ ok: true }` — **Phase 1 only**, guarded by `@Roles('admin')` to exercise RolesGuard | 401 unauth; 403 non-admin |

### Token details
- **Access token**: JWT, `sub` = userId, `role`, `companyId`, `jti` = uuid v4,
  TTL from `JWT_ACCESS_TTL` (default 15m). Verified statelessly; `jti` checked
  against denylist only on refresh-sensitive ops (access denylist would negate
  statelessness — access TTL is short, accepted).
- **Refresh token**: JWT, `sub` = userId, `jti` = uuid v4, TTL from
  `JWT_REFRESH_TTL` (default 7d). On rotate and on logout, `jti` → Redis
  `rev:refresh:{jti}` with TTL = remaining lifetime.
- **bcrypt** cost factor 12.

### Throttling
`@nestjs/throttler` default storage (in-memory) for Phase 1 (single instance).
Limit: **10 requests / minute / IP** on `/auth/login` and `/auth/register`.
Redis-backed throttler storage deferred to Phase 8/9 when production multi-
instance matters. (Tracked as a note, not a Phase 1 task.)

---

## 5. Data Model (Prisma)

All 12 models from `PROJECT_PLAN.md` §6 are written to `schema.prisma` and
migrated as `0001_init` against real PostgreSQL (docker-compose.test.yml for
tests, docker-compose.yml for dev). Only `Company` and `User` are exercised by
Phase 1 code; the rest are dormant until their phases.

Key Phase 1 fields:
- `User.password` — bcrypt hash, never plaintext.
- `UserRole` enum: `admin`, `manager`, `technician`, `viewer`. Default `viewer`;
  registration forces `admin` for the first user of a company.
- `User.email` — `@unique`.
- `Company` → `User[]` with `onDelete: Cascade`.

---

## 6. Env Validation (Zod, fail-fast)

`config/env.config.ts` exports a Zod schema validated at bootstrap via
`ConfigModule.forRoot({ validationSchema })`. Missing/invalid env throws before
the app starts — closes the Phase 0 hardening gap (amendment 3.5 / §13 of the
critique).

```
PORT            coerce.number, default 4000
DATABASE_URL    string.url()
REDIS_URL       string.url()
JWT_SECRET      string.min(16)            ← fail-fast if empty/short
JWT_ACCESS_TTL  string, default "15m"
JWT_REFRESH_TTL string, default "7d"
CORS_ORIGIN     string, default "http://localhost:3000"
```

---

## 7. Frontend

### Layout
```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx              guard: no access → redirect /login
│       └── dashboard/page.tsx      "Welcome, {email}" placeholder (full UI in Phase 7)
├── lib/
│   ├── api-client.ts               fetch wrapper, attaches Authorization
│   ├── auth/
│   │   ├── store.ts                Zustand: user, accessToken (memory)
│   │   ├── hooks.ts                useAuth(), useLogin(), useRegister()
│   │   └── refresh-mutation.ts     TanStack Query: POST /auth/refresh on 401
│   └── api/auth.ts                 typed calls (types from @iam/shared)
└── components/
    ├── auth-form.tsx
    └── form-field.tsx              shadcn/ui input + Zod error
```

### Token storage & flow
- **Access token: in-memory** (Zustand). Lost on refresh — triggers silent
  refresh via the refresh cookie.
- **Refresh token: httpOnly cookie** set by backend (`res.cookie` with
  `httpOnly: true, secure: production, sameSite: 'lax'`). Browser sends it
  automatically on `POST /auth/refresh` (fetch with `credentials: 'include'`).
- **Protected route**: `(dashboard)/layout.tsx` (Server Component) reads
  `cookies()` from `next/headers`; no access → `redirect('/login')`.
- **401 retry**: TanStack Query retry handler calls `/auth/refresh` once, then
  logs out if it still fails.

### Forms
React Hook Form + Zod. Schemas `loginSchema`, `registerSchema` in `@iam/shared`
(single source for frontend validation and backend DTO). Password policy lives
in the same shared schema.

### shadcn/ui
`npx shadcn init` (Tailwind v4 path). Components: `button`, `input`, `card`,
`label`, `form`. If `shadcn init` fails (known TW v4 issue shadcn-ui/ui#6522),
fall back to manual registry setup per shadcn's TW v4 guide.

---

## 8. Critical-Path Tests (TDD, written in this phase)

All run on real PostgreSQL via `docker-compose.test.yml` (port 5433 →
`DATABASE_URL_TEST`). No SQLite.

| # | Test | Asserts |
|---|---|---|
| 1 | register creates company + admin | tx creates both; role=admin; password is hashed (≠ plaintext); returns token pair |
| 2 | register rejects duplicate email | unique violation → 409 ConflictException |
| 3 | register rejects weak password (no digit) | Zod DTO validation → 400 |
| 4 | login returns token pair for valid creds | bcrypt verify; access+refresh issued |
| 5 | login rejects wrong password | 401 |
| 6 | login throttled after 10 attempts | ThrottlerGuard → 429 |
| 7 | refresh rotates: new pair, old jti revoked | old refresh now denied; new works |
| 8 | refresh rejects revoked jti | reuse of revoked refresh → 401 |
| 9 | me returns user for valid access | JwtStrategy parses, returns user |
| 10 | roles guard blocks viewer from admin path | RolesGuard + `@Roles('admin')` on a probe endpoint `GET /auth/admin-probe` → 403 for viewer, 200 for admin. The probe exists only to exercise the guard; it is replaced by real `/users` endpoints in Phase 2. |
| 11 | logout revokes refresh jti | jti in denylist; subsequent refresh → 401 |

---

## 9. Acceptance Criteria

- [ ] All 11 critical-path tests pass on real PostgreSQL.
- [ ] `curl POST /auth/register` → `{ accessToken, refreshToken, user }`, refresh
      cookie set.
- [ ] Browser flow: register → dashboard → token refresh → logout → login.
- [ ] Throttler blocks brute-force on `/auth/login` (manual verify + test #6).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green locally.
- [ ] CI green on GitHub `main`.
- [ ] ADR 0002 (refresh rotation + httpOnly cookie) written.
- [ ] DEVELOPMENT_LOG + docs/progress.md updated; conventional commits; push.

## 10. Risks & Mitigations

- **shadcn/ui TW v4 install failure** — documented fallback path (§7).
- **httpOnly cookie + CORS + credentials** — CORS must use `credentials: true`
  on backend and `credentials: 'include'` on fetch; `sameSite: 'lax'` works for
  same-site dev. Production cross-origin (Vercel → Render) needs `sameSite:
  'none'` + `secure: true` (noted in ADR 0002 for Phase 10).
- **Throttler in tests** — tests that exercise repeated login must disable or
  bypass the throttler guard (e.g., `ThrottlerGuard` overridden in test module)
  so the throttle test itself is deterministic.
