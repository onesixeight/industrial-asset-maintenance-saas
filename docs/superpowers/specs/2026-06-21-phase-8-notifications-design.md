# Phase 8 — Notifications Design

**Date:** 2026-06-21
**Branch:** `feat/phase-8-notifications`
**Predecessor:** Phase 7 (Dashboard + reports) — `feat/phase-7-dashboard-reports`

## 1. Goal

Build the **consumer side** of notifications: list, unread-count, mark-read. This closes the loop opened in Phase 6 — low-stock `Notification` rows are already being produced transactionally; Phase 8 makes them visible to users via a header bell with 60s polling (exec spec §3.6).

## 2. Scope

### In scope
- `GET /notifications` — paginated list, scoped to `user.sub`, newest first
- `GET /notifications/unread-count` — `{ count }` for the bell badge (the 60s-poll endpoint)
- `PATCH /notifications/:id/read` — mark one read
- `PATCH /notifications/read-all` — mark all of the user's notifications read
- Frontend `NotificationsMenu` (bell + dropdown + badge) wired into the dashboard layout, `refetchInterval: 60_000` on the unread-count query

### Out of scope (deferred)
- **Real-time push (SSE/WebSocket)** — exec spec explicitly mandates 60s polling; no socket layer.
- **Notification producers beyond Phase 6's low-stock** — WO assignment / due-date notifications are future enhancements; the read service is producer-agnostic.
- Email/in-app delivery preferences — unscheduled (YAGNI).

## 3. Data model (already in Prisma schema)

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(...)
  title     String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

No migration needed. `userId` is required (no company-broadcast); Phase 6 already fans out one row per admin/manager on a low-stock crossing.

## 4. RBAC & security

- Notifications are **per-user**, not per-tenant. Every query scopes by `userId === user.sub` (from the JWT). There is no class-level role gate beyond `JwtAuthGuard` — any authenticated user reads their own.
- **IDOR protection:** `PATCH /notifications/:id/read` and any id-keyed lookup use `findFirst({ where: { id, userId } })`. Another user's notification id → 404 (no existence leak, consistent with the cross-tenant pattern).
- `userId` comes from the verified JWT (`user.sub`), never from the request body — a client can't read another user's notifications by spoofing `userId`.

## 5. Endpoints

```
GET    /notifications?page=1&limit=50   → NotificationResponse[]
GET    /notifications/unread-count      → { count: number }
PATCH  /notifications/:id/read          → NotificationResponse   (200)
PATCH  /notifications/read-all          → { updated: number }    (200, no :id collision)
```

- Static `unread-count` and `read-all` segments are declared **before** the `:id` segment so Nest doesn't route them as ids (same ordering rule as Phase 3 QR + Phase 5 templates).
- `read-all` uses a `PATCH` (not `POST`) — it's an idempotent state mutation; calling it again is a no-op that returns `updated: 0`.

## 6. Shared types

`packages/shared/src/notifications.ts`:
- `notificationResponseSchema` / `NotificationResponse` (id, userId, title, message, read, createdAt ISO)
- `unreadCountResponseSchema` / `UnreadCountResponse` (`{ count }`)
- `notificationListQuerySchema` extends `listQuerySchema` (page/limit only — no search; notifications are time-ordered, not searchable)
- `markAllReadResponseSchema` / `MarkAllReadResponse` (`{ updated }`)
- Exported from `index.ts`.

## 7. Module structure

```
apps/api/src/notifications/
  notifications.module.ts
  notifications.controller.ts
  notifications.service.ts
  notifications.service.spec.ts
```

Registered in `AppModule`. The service is pure consumer logic — it does **not** create notifications (Phase 6's `WorkOrderPartsService` is the only producer today).

## 8. Testing

- **Unit (`notifications.service.spec.ts`)** — mocked prisma:
  - list scoped by userId, paginated
  - unreadCount counts `read: false` for the user
  - markRead get-then-update; missing / wrong-user → 404
  - markAllRead updates only the user's rows, returns update count
  - createdAt mapped to ISO
- **e2e (≥7)** — real Postgres, closing the Phase 6 loop:
  1. empty list + unread-count 0 for a fresh user
  2. trigger a low-stock crossing (Phase 6 producer) → notification appears in the manager's list + unread-count increments
  3. mark-one-read flips `read`, decrements unread-count
  4. mark-all-read zeroes unread-count, returns update count
  5. IDOR: user A cannot read/mark user B's notification → 404
  6. unauthenticated → 401
  7. static routes (`unread-count`, `read-all`) don't collide with `:id`

## 9. Frontend

- `lib/api/notifications.ts` (`notificationsApi.list / unreadCount / markRead / markAllRead`).
- `components/notifications-menu.tsx` — bell button with a numeric badge (unread count), a dropdown panel listing the most recent notifications (title + message + relative time + read/unread styling), and a "Mark all read" action. Uses two queries: `unread-count` with `refetchInterval: 60_000` (exec spec §3.6) and `list` (fetched on dropdown open, no interval).
- Mount the menu in the dashboard layout header (next to the existing Log out area) — visible on every dashboard page, not just `/dashboard`.
- Optional `/notifications` page with full paginated history — included if cheap; the dropdown covers the common case.

## 10. Success criteria

- Lint + typecheck + test + build green across `api`, `shared`, `web`.
- Existing 242 tests remain green; ≥10 new Phase 8 tests pass.
- The Phase 6 → Phase 8 loop is demonstrable: a low-stock consumption creates a notification that the manager sees in the bell within 60s.
- DEVELOPMENT_LOG + progress.md updated; ADR 0006 records the polling-over-websockets decision (matches exec spec §3.6).
- Conventional commit + push to `feat/phase-8-notifications`.
