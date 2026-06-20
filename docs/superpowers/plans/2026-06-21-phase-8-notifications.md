# Phase 8 — Notifications Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-21-phase-8-notifications-design.md`
**Branch:** `feat/phase-8-notifications`

TDD throughout. Run affected scope after each task.

## Task 1 — Shared types
- [ ] `packages/shared/src/notifications.ts`: `notificationResponseSchema`/`NotificationResponse`, `unreadCountResponseSchema`/`UnreadCountResponse`, `notificationListQuerySchema` (extends listQuerySchema), `markAllReadResponseSchema`/`MarkAllReadResponse`.
- [ ] Export from `index.ts`. `pnpm --filter @iam/shared test` → green.

## Task 2 — NotificationsService + tests
- [ ] `apps/api/src/notifications/notifications.service.ts`:
  - `list(userId, query)` → `findFirst`-free `findMany` where `userId`, paginated, `orderBy createdAt desc`, map createdAt→ISO
  - `unreadCount(userId)` → `count({ where: { userId, read: false } })`
  - `markRead(id, userId)` → get-then-update; missing/wrong-user → 404
  - `markAllRead(userId)` → `updateMany({ where: { userId, read: false }, data: { read: true } })` → `{ updated: result.count }`
- [ ] `notifications.service.spec.ts` (≥6 tests): list scope+pagination, unreadCount, markRead happy + 404, markAllRead returns count, createdAt ISO.
- [ ] vitest → green.

## Task 3 — Module + Controller + AppModule wiring
- [ ] `notifications.controller.ts`: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/read`. **Static routes before `:id`** (Phase 3/5 ordering rule).
- [ ] `notifications.module.ts`; register in AppModule.
- [ ] existing api tests still green.

## Task 4 — E2E tests (≥7)
- [ ] `apps/api/test/notifications.e2e.spec.ts`:
  1. empty list + unread-count 0
  2. low-stock crossing (Phase 6 producer) → manager sees the notification + unread-count increments
  3. mark-one-read flips read + decrements unread-count
  4. mark-all-read zeroes count + returns update count
  5. IDOR: A cannot read B's notification → 404
  6. unauthenticated → 401
  7. static routes don't collide with `:id` (e.g. PATCH `/notifications/read-all` is not treated as id "read-all")
- [ ] all e2e green.

## Task 5 — Verification gate
- [ ] `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test` (242 + new), `pnpm -w build` — all green.

## Task 6 — Frontend
- [ ] `lib/api/notifications.ts`.
- [ ] `components/notifications-menu.tsx`: bell + badge (unread-count query, `refetchInterval: 60_000`) + dropdown (list query on open) + "Mark all read" action.
- [ ] Mount `NotificationsMenu` in the dashboard layout header (visible app-wide under `(dashboard)`).
- [ ] `pnpm --filter web build` → green.

## Task 7 — Docs + commit + push
- [ ] `docs/progress.md` Phase 8 → done.
- [ ] `DEVELOPMENT_LOG.md` Phase 8 entry.
- [ ] `docs/adr/0006-polling-over-websockets.md` (60s polling per exec spec §3.6).
- [ ] Commit spec+plan → backend → e2e → web → docs; push to `feat/phase-8-notifications`.

## Risk notes
- **Static-route ordering:** `unread-count` and `read-all` MUST be declared before `@Patch(':id')` / `@Get(':id')` or Nest treats them as ids. Covered by e2e #7.
- **IDOR:** every id-keyed query must include `userId` in `where`. Covered by e2e #5.
- **markAllRead idempotency:** calling twice returns `{ updated: 0 }` the second time — acceptable, no error.
- **Polling load:** 1 request / 60s / active user is negligible; no throttle override needed (global 60/min is fine).
