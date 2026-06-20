# ADR 0006: 60s polling for notifications (no WebSocket/SSE)

**Date:** 2026-06-21
**Status:** Accepted
**Context:** Phase 8 (Notifications) needs users to see new notifications (e.g. the low-stock alerts Phase 6 produces) without a manual refresh. Options for delivery: client polling, Server-Sent Events, or WebSockets.

**Decision:** Client polling at a fixed 60s interval via TanStack Query's `refetchInterval`, scoped to the `unread-count` endpoint.

**Rationale:**
- The execution spec (`docs/superpowers/specs/2026-06-17-execution-process-design.md` §3.6, line 74) explicitly fixes notification polling to `refetchInterval: 60s` via TanStack Query. This ADR records that we followed the spec rather than diverging.
- Notifications in this app are low-frequency (low-stock crossings, future WO-assignment events) — not a chat stream. Sub-minute latency is acceptable; the cost of a socket layer (connection management, reconnection, backpressure, a pub/sub bridge from the producer transaction to the socket) is not justified.
- The polled query is a single indexed `count({ where: { userId, read: false } })` — 1 request / 60s / active user is negligible load against PostgreSQL and well under the global 60-req/min throttle.
- Polling the **count** only (not the full list) keeps each poll cheap; the full list is fetched on demand when the user opens the dropdown.

**Consequences:**
- A new notification is visible at most ~60s after it's created. Acceptable for this domain; not acceptable for a real-time-critical app (chat, trading) — but this isn't one.
- No socket infrastructure to deploy, scale, or debug. Simpler ops, simpler CI.
- If real-time delivery ever becomes a requirement, swap the `refetchInterval` for an SSE/WS subscription on the same endpoint shape — the service layer is unchanged.
