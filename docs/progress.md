# Phase Progress

Tracker mirrors the roadmap in
[`docs/superpowers/specs/2026-06-17-execution-process-design.md`](./superpowers/specs/2026-06-17-execution-process-design.md) §7.

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation | ✅ Complete |
| 1 | Authentication (JWT `jti`, refresh + Redis revocation, throttler, roles/guard) | 🟡 In progress (1a backend ✅, 1b frontend ⬜) |
| 2 | Reference data (locations, categories, users) | ⬜ Pending |
| 3 | Assets + QR codes | ⬜ Pending |
| 4 | Work orders | ⬜ Pending |
| 5 | Inspections | ⬜ Pending |
| 6 | Parts inventory | ⬜ Pending |
| 7 | Dashboard + reports | ⬜ Pending |
| 8 | Notifications | ⬜ Pending |
| 9 | E2E + polish | ⬜ Pending |
| 10 | Deployment + docs | ⬜ Pending |
| 11 | Buffer | ⬜ Pending |

## Critical-path test coverage

Per execution-process spec §3.1, each critical path must be covered by passing
tests **within its phase** (not deferred to Phase 9):

- [x] **Phase 1a (backend)** — register (tx Company+admin), login, refresh (rotation + Redis denylist), logout, me, throttle 429, RolesGuard `/auth/admin-probe` (200 admin / 403 viewer). 11/11 critical-path tests pass on real PostgreSQL.
- [ ] **Phase 1b (frontend)** — login/register pages, Zustand auth store, silent refresh, `(dashboard)` guard
- [ ] **Phase 4** — work-order status transitions (reject invalid)
- [ ] **Phase 5** — inspection `passed` = true only if all items passed
- [ ] **Phase 6** — parts consumption (transactional decrement), restock, low-stock trigger

## Coverage policy

Coverage % is an **informational metric, not a gate**. The gate is: every
critical path above is covered by passing tests. (See spec §3.4.)
