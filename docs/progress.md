# Phase Progress

Tracker mirrors the roadmap in
[`docs/superpowers/specs/2026-06-17-execution-process-design.md`](./superpowers/specs/2026-06-17-execution-process-design.md) §7.

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation | ✅ Complete |
| 1 | Authentication (JWT `jti`, refresh + Redis revocation, throttler, roles/guard) | ✅ Complete (1a backend + 1b frontend) |
| 2 | Reference data (locations, categories, users) | ✅ Complete |
| 3 | Assets + QR codes | ✅ Complete |
| 4 | Work orders | ✅ Complete |
| 5 | Inspections | ✅ Complete |
| 6 | Parts inventory | ✅ Complete |
| 7 | Dashboard + reports | ✅ Complete |
| 8 | Notifications | ✅ Complete |
| 9 | E2E + polish | ⬜ Pending |
| 10 | Deployment + docs | ⬜ Pending |
| 11 | Buffer | ⬜ Pending |

## Critical-path test coverage

Per execution-process spec §3.1, each critical path must be covered by passing
tests **within its phase** (not deferred to Phase 9):

- [x] **Phase 1a (backend)** — register (tx Company+admin), login, refresh (rotation + Redis denylist), logout, me, throttle 429, RolesGuard `/auth/admin-probe` (200 admin / 403 viewer). 11/11 critical-path tests pass on real PostgreSQL.
- [x] **Phase 1b (frontend)** — login/register pages (RHF + shared Zod), Zustand in-memory access-token store, httpOnly refresh cookie, silent refresh on load + 401 retry, `(dashboard)` Server Component guard, logout. Browser flow register → dashboard → reload (silent refresh) → logout → login.
- [x] **Phase 2** — locations/categories/users CRUD (multi-tenant, delete guards), temp-password + force-change flow, RBAC (reference writes admin/manager; role-change admin-only). 10/10 critical-path e2e tests pass on real PostgreSQL.
- [x] **Phase 3** — assets CRUD (multi-tenant, filtered list), opaque-token QR generation/scan/rotation, delete guard (work orders/inspections), RBAC (read+scan any authed; write+gen+rotate admin/manager). 10/10 critical-path e2e tests pass on real PostgreSQL.
- [x] **Phase 4** — work-order CRUD (multi-tenant, soft-delete), validated status transitions (open→completed rejected; terminal states; the §497 rule), technician-ownership of transitions, RBAC. 10/10 critical-path e2e tests pass on real PostgreSQL.
- [x] **Phase 5** — inspection templates (pass_fail items), submit with server-computed `passed` (all-pass→true, one-fail→false), RBAC (submit technician+; templates manager+), delete guard. 10/10 critical-path e2e tests pass on real PostgreSQL.
- [x] **Phase 6** — parts CRUD (multi-tenant, SKU uniqueness), transactional consumption (decrement + WorkOrderPart upsert in one `$transaction`), restock restores quantity, low-stock trigger fires only on the downward threshold crossing (no spam), technician-ownership of consumption, RBAC. 16/16 critical-path e2e + 23 unit tests pass on real PostgreSQL.
- [x] **Phase 7** — dashboard aggregates (`/dashboard/stats` KPI cards, `/dashboard/trends` daily series + MTTR) and synchronous CSV report export (`/reports/work-orders.csv`, RFC 4180 escaping), all tenant-scoped. 10/10 critical-path e2e + 18 unit tests pass on real PostgreSQL.
- [x] **Phase 8** — notifications consumer (list, unread-count, mark-read, mark-all-read), per-user scoping (`userId === sub`), IDOR-safe (404 on another user's id), header bell with 60s polling. Closes the Phase 6 loop: a low-stock crossing produces a notification the manager sees. 8/8 critical-path e2e + 7 unit tests pass on real PostgreSQL.

## Coverage policy

Coverage % is an **informational metric, not a gate**. The gate is: every
critical path above is covered by passing tests. (See spec §3.4.)
