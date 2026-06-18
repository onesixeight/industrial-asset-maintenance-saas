# Spec: Phase 2 — Reference Data

> **Date:** 2026-06-19
> **Status:** Approved (pending user spec review)
> **Phase:** 2 of 11
> **Depends on:** Phase 1 (Auth) — complete (1a backend + 1b frontend)
> **Related:** `PROJECT_PLAN.md` §7.2 (users), §7.3 (locations), §7.4 (categories), §9 Phase 2; execution-process spec §3.1 (critical-path tests in-phase), §7

---

## 1. Goal

Add CRUD for locations, categories, and users within a company, plus a
force-change-password flow for admin-created users. Reference data is the
foundation for assets (Phase 3), work orders (Phase 4), and inspections (Phase 5).

## 2. Scope

### In scope
- `Location` CRUD (`/locations`).
- `Category` CRUD (`/categories`).
- `User` management (`/users`): list, create (temp password + force-change), role-change.
- `POST /auth/change-password` + login-time force-change gate.
- Multi-tenancy: every query scoped to the authenticated user's `companyId`.
- Delete guards: locations/categories with assets → 409.
- Frontend: `/users`, `/locations`, `/categories` pages + `/change-password` + dashboard sidebar nav.
- Shared Zod schemas for all request/response shapes.
- Critical-path tests on real PostgreSQL (TDD).

### Explicitly out of scope (later phases)
- User deactivation/soft-delete + re-invite → future.
- Email-based invites / SMTP → Phase 10 deployment.
- Pagination of `/users` beyond simple list (small N per company) — Phase 8+ if needed.
- Audit log of who changed which user's role → future.

---

## 3. Confirmed Decisions

1. **User creation = temp password + force-change.** Admin/manager supplies
   `email, firstName, lastName, role, password` at `/users`; the new user is
   created with `mustChangePassword = true`. The first login with that password
   is rejected with `403 { code: "MUST_CHANGE_PASSWORD" }` and no tokens; the
   user must complete `POST /auth/change-password` (which accepts
   `email + currentPassword + newPassword` — no Bearer, since the blocked login
   issues none) to obtain a normal `AuthResponse`. Chosen over admin-set-password
   (admin would know the final password) and over email-invite (no SMTP until
   Phase 10).
2. **Multi-tenancy via per-service `companyId` from JWT.** Each service method
   receives `companyId` (from `req.user` via `@CurrentUser()`) and adds
   `where: { companyId }` to every Prisma read/write. Explicit, auditable, no
   Prisma-extension magic. Matches the Phase 1a pattern (`AuthService.me`).
3. **Cross-tenant access → 404, not 403.** A request for a location/category/user
   by `id` that belongs to another company returns 404, so response codes do not
   leak the existence of other tenants' records.
4. **Delete guards per `PROJECT_PLAN` §884.** `DELETE /locations/:id` and
   `DELETE /categories/:id` return 409 if any `Asset` references them; hard
   delete is allowed for genuinely throwaway reference data (the plan's stated
   policy) once the guard passes.
5. **Role permissions** (matches PROJECT_PLAN §7.2 + the role model from Phase 1):

   | Endpoint group | viewer | technician | manager | admin |
   |---|---|---|---|---|
   | GET locations/categories | ✓ | ✓ | ✓ | ✓ |
   | write locations/categories | ✗ | ✗ | ✓ | ✓ |
   | GET users | ✗ | ✗ | ✓ | ✓ |
   | POST users | ✗ | ✗ | ✓ | ✓ |
   | PATCH /users/:id/role | ✗ | ✗ | ✗ | ✓ |

6. **No second-admin restriction.** PROJECT_PLAN does not limit the number of
   admins per company; `POST /users` accepts any role including `admin`.

---

## 4. Data Model (Prisma)

Add one field; everything else already exists from the `0001_init` migration
(Phase 1a).

- `User.mustChangePassword Boolean @default(false)`
  - `false` for self-registration via `POST /auth/register` (the first admin).
  - `true` for users created via `POST /users`.
  - Cleared to `false` by `POST /auth/change-password`.

Migration: `add_user_must_change_password` (single `ALTER TABLE` adding the
column with `DEFAULT false`).

`Location` and `Category` are unchanged; both already have
`companyId` + `onDelete: Cascade` to `Company` (init migration). Assets reference
both, which is what the delete guard checks.

---

## 5. Backend Architecture

### Module layout (new)
```
apps/api/src/
├── auth/
│   ├── auth.controller.ts        + POST /auth/change-password
│   └── auth.service.ts           + changePassword()
├── locations/
│   ├── locations.module.ts
│   ├── locations.controller.ts
│   ├── locations.service.ts
│   └── locations.controller.spec.ts
├── categories/
│   ├── categories.module.ts
│   ├── categories.controller.ts
│   ├── categories.service.ts
│   └── categories.controller.spec.ts
└── users/
    ├── users.module.ts
    ├── users.controller.ts
    ├── users.service.ts
    └── users.controller.spec.ts
```

All four modules are imported by `AppModule`. They reuse `JwtAuthGuard`,
`RolesGuard`, `@Roles()`, `@CurrentUser()` from Phase 1a. No new guards.

### Endpoint contracts

| Method & path | Body | Success | Error |
|---|---|---|---|
| `GET /locations?search=&page=&limit=` | — | `Location[]` (scoped) | 401 |
| `GET /locations/:id` | — | `Location` | 401; 404 (not found / other tenant) |
| `POST /locations` | `{ name, description? }` | 201 `Location` | 401; 403 (viewer/technician) |
| `PATCH /locations/:id` | `{ name?, description? }` | 200 `Location` | 401; 403; 404 |
| `DELETE /locations/:id` | — | 204 | 401; 403; 404; 409 (assets exist) |
| `GET /categories?search=&page=&limit=` | — | `Category[]` | 401 |
| `GET /categories/:id` | — | `Category` | 401; 404 |
| `POST /categories` | `{ name, description? }` | 201 `Category` | 401; 403 |
| `PATCH /categories/:id` | `{ name?, description? }` | 200 `Category` | 401; 403; 404 |
| `DELETE /categories/:id` | — | 204 | 401; 403; 404; 409 (assets exist) |
| `GET /users` | — | `User[]` (no password) | 401; 403 (viewer/technician) |
| `POST /users` | `{ email, firstName, lastName, role, password }` | 201 `User` (no password) | 401; 403; 409 (dup email) |
| `PATCH /users/:id/role` | `{ role }` | 200 `User` | 401; 403 (non-admin); 404 |
| `POST /auth/change-password` | `{ email, currentPassword, newPassword }` | 200 `AuthResponse` + clears flag | 401 (bad current); 400 (weak new); 404 (unknown email) |

> `POST /auth/change-password` is decorated `@Throttle({ default: { limit: 10, ttl: 60_000 } })` like login/register — it verifies a password, so it is brute-force-sensitive.

> `Location`/`Category` responses: `{ id, name, description, companyId }`.
> `User` responses: `{ id, email, firstName, lastName, role, companyId, mustChangePassword }` — never `password`.

### Force-change flow detail
- `AuthService.login`: after bcrypt compare succeeds, if `user.mustChangePassword`
  → throw `ForbiddenException({ code: "MUST_CHANGE_PASSWORD" })` **before**
  issuing tokens. The 403 body carries `code` so the client distinguishes it from
  a role-based 403.
- `AuthService.changePassword({ email, currentPassword, newPassword })`:
  1. find user by email (404 if missing — note: unlike login, here we surface
     404 because the user is acting on their own known identity, not probing).
  2. bcrypt.compare current → 401 on mismatch.
  3. Zod-validate `newPassword` against the shared password policy → 400 on weak.
  4. hash + save, set `mustChangePassword = false`.
  5. issue a fresh `AuthResponse` (user + token pair), so the client is now
     authenticated and can proceed to the dashboard.

### Delete guards
- `LocationsService.remove(id, companyId)`: count `asset` where
  `locationId === id && companyId`; if > 0 → `ConflictException`. Else `delete`.
- `CategoriesService.remove`: same against `categoryId`.

### Multi-tenancy invariant
Every service method's first Prisma `where` includes `companyId`. Single-record
lookups (`findUnique({ where: { id } })`) are replaced with
`findFirst({ where: { id, companyId } })` so a foreign-tenant id yields null →
404 rather than leaking the row.

---

## 6. Shared Schemas (`packages/shared/src`)

New file `reference.ts` (re-exported from `index.ts`):

- `locationRequestSchema = { name: z.string().min(1).max(100), description: z.string().max(500).optional() }`
- `categoryRequestSchema` — identical shape.
- `createUserRequestSchema = { email, firstName, lastName, role: userRoleSchema, password: passwordSchema }`
  (`passwordSchema` reused from Phase 1a).
- `changeRoleRequestSchema = { role: userRoleSchema }`
- `changePasswordRequestSchema = { email: z.string().email(), currentPassword: z.string().min(1), newPassword: passwordSchema }`
- `locationResponseSchema`, `categoryResponseSchema` — `{ id, name, description, companyId }`.
- `userResponseSchema` extended with `mustChangePassword: z.boolean()`.
- `listQuerySchema = { search?: string, page?: z.coerce.number().int().min(1).default(1), limit?: z.coerce.number().int().min(1).max(100).default(50) }`

Zod validation via the existing per-route `ZodValidationPipe`.

---

## 7. Frontend

### Layout & navigation
- `(dashboard)/layout.tsx` gains an `<AppSidebar />` (Server-safe, links only).
  Links: Dashboard, Locations, Categories, Users (Users hidden for non-admin via
  client check on `user.role`).
- Existing dashboard page unchanged.

### Pages (all client components, TanStack Query)
- `/locations`, `/categories`: list (`useQuery`) + create/edit modal or inline
  form (`useMutation`) + delete with confirm. Delete 409 shows "Has assets;
  remove them first."
- `/users`: list + create dialog (email, firstName, lastName, role select,
  password) + role-change dropdown per row. Non-admin → redirect to `/dashboard`.
- `/change-password`: reached after a `MUST_CHANGE_PASSWORD` login. Form
  (email prefilled from the failed login, currentPassword, newPassword). On
  success → store tokens + redirect `/dashboard`.

### Force-change UX
`useLogin`/`AuthForm`: if the mutation rejects with status 403 and body
`code === "MUST_CHANGE_PASSWORD"`, redirect to
`/change-password?email=<encoded>` instead of showing "invalid credentials".

### Reuse from Phase 1b
`Button`, `FormField`, `apiJson` (the 401-retry fetch wrapper), the Zustand
store, the silent-refresh path. No new primitives beyond a small `DataTable`
(plain `<table>` + Tailwind) and a `Modal` (dialog element) — both hand-rolled,
shadcn still deferred.

---

## 8. Critical-Path Tests (TDD, written in this phase)

All on real PostgreSQL (`:5433`) + Redis, same harness as Phase 1.

| # | Test | Asserts |
|---|---|---|
| 1 | create + list + get + update + delete location (scoped) | full CRUD happy path; list scoped to caller's company |
| 2 | cross-tenant location by id → 404 | no existence leak |
| 3 | delete location with an asset → 409 | delete guard |
| 4 | category CRUD + cross-tenant 404 + delete-guard 409 | mirrors #1–3 for categories |
| 5 | manager creates user (temp password, mustChangePassword=true) | POST /users returns user without password; flag set |
| 6 | duplicate email on POST /users → 409 | P2002 → 409 |
| 7 | login as must-change user → 403 MUST_CHANGE_PASSWORD; change-password clears flag + returns tokens | force-change flow end-to-end |
| 8 | role-change: admin → ok; manager → 403 | RBAC on PATCH /users/:id/role |
| 9 | viewer cannot POST /locations → 403 | RBAC on reference-data writes |
| 10 | change-password rejects weak new password → 400 | shared password policy enforced |

Acceptance: all 10 pass; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

---

## 9. Risks & Mitigations

- **`mustChangePassword` blocks existing Phase 1a users?** No — the column
  defaults to `false`; the Phase 1a first-admin rows stay `false`. Only newly
  created `/users` rows get `true`.
- **`changePassword` as a non-Bearer endpoint** widens the login surface
  (email+password verified there too). Mitigation: reuse the same bcrypt path +
  constant-time-ish handling as `login`; rate-limit via the existing throttler on
  `/auth/*`.
- **List without pagination returns huge N?** Capped at `limit=100` by the shared
  schema; default 50. Companies are small in this domain.
- **Frontend role-gating is cosmetic** (client hides the Users link); the backend
  `RolesGuard` is the real gate. Documented in code comments.
