# ADR 0004: Bounded low-stock trigger (defer full Notification service to Phase 8)

**Date:** 2026-06-21
**Status:** Accepted
**Context:** Phase 6 (Parts inventory) requires a low-stock trigger per execution spec §3.1 ("low-stock triggers on the crossing consumption"). The Notification model exists in the schema (`Notification { id, userId, title, message, read, createdAt }`), and `userId` is required — there is no company-wide broadcast. Phase 8 is explicitly scoped to "Notifications" (read/unread service, UI, real-time delivery).

**Options considered:**

1. **Bounded trigger (chosen)** — Phase 6 inserts `Notification` rows directly via Prisma inside the consumption `$transaction`, fanned out to every admin/manager in the company. No read/mark-read service is built here; Phase 8 adds that.
2. **Full Notification service now** — build the read/unread/mark-read service + endpoints + UI in Phase 6, pulling Phase 8's scope forward.
3. **Defer the trigger entirely to Phase 8** — ship Phase 6 consumption without any notification, add it in Phase 8.

**Decision:** Option 1 (bounded trigger).

**Rationale:**
- The exec spec mandates the trigger **in Phase 6** (it's a critical-path item); option 3 violates that.
- Option 2 would inflate Phase 6 scope with UI/real-time work that Phase 8 is designed to own, delaying the critical-path parts consumption work and creating two phases that each half-build notifications.
- The trigger is the only Notification *producer* in the system today; the consumer side is cleanly separable. Inserting rows transactionally now (so they roll back with a failed consumption) is a small, correct addition that Phase 8 consumes unchanged.
- Low-stock fires only on the **downward crossing** (`oldQuantity > minQuantity && newQuantity <= minQuantity`) — not when already below min, not on restock. This avoids notification spam and matches the spec's "on the crossing" wording.

**Consequences:**
- Phase 8 must build: `GET /notifications`, `PATCH /notifications/:id/read` (or similar), a Notifications nav entry + bell UI, and ideally real-time push. The Notification rows produced by Phase 6 are already in the right shape.
- Until Phase 8 ships, low-stock Notifications accumulate in the DB unread with no UI to view them — acceptable for a portfolio project; the producer correctness is what the Phase 6 tests prove.
- Per-user fan-out (one row per admin/manager) means deleting a manager user cascades their notifications (schema `onDelete: Cascade` on `Notification.user`) — desirable, not a leak.
