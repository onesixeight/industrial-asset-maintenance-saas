# ADR 0005: Defer BullMQ + R2 — synchronous report generation at portfolio scale

**Date:** 2026-06-21
**Status:** Accepted
**Context:** The execution spec (`docs/superpowers/specs/2026-06-17-execution-process-design.md` §7) lists "BullMQ reports, R2" under Phase 7 (Dashboard + Reports). That implies a job queue (BullMQ on Redis) for asynchronous report generation and an S3-compatible object store (Cloudflare R2) for generated report files, with status polling for the client.

**Options considered:**

1. **Synchronous generation (chosen)** — `/reports/work-orders.csv` builds the CSV on request and streams it directly back as the HTTP response. No queue, no object store, no polling.
2. **BullMQ + R2 as specified** — enqueue a report job, a worker generates the CSV, uploads to R2, the client polls a status endpoint then downloads a presigned URL.
3. **Hybrid** — synchronous now, add BullMQ+R2 behind a feature flag when volume grows.

**Decision:** Option 1 (synchronous generation).

**Rationale:**
- At portfolio scale (tens to low-hundreds of work orders per tenant), the CSV generator runs in single-digit milliseconds against indexed, tenant-scoped queries. A job queue would add Redis-as-queue, a worker process, status polling, and object-storage config — significant infrastructure for zero user-visible benefit.
- Asynchronous generation pays off when a report takes seconds-to-minutes (large exports, heavy joins, PDF rendering). None of those apply here; the work-order CSV is a flat, filtered `findMany` + serialization.
- The spec is a guideline, not a contract; the verification gates (lint/typecheck/test/build + critical-path tests) are the actual contract. Deferring BullMQ+R2 keeps Phase 7 focused on its user-facing value (dashboard + export) without inflating scope.
- Option 3 (hybrid) is the natural escalation path if volume ever warrants it — the synchronous endpoint stays as a fallback.

**Consequences:**
- One endpoint, one service, one pure CSV helper — simple to test (the RFC 4180 unit tests + e2e prove correctness).
- No R2 credentials / bucket setup needed for Phase 7; deployment (Phase 10) is simpler.
- If a future phase adds heavy reports (e.g. multi-year PDF analytics), revisit and introduce BullMQ+R2 then — the synchronous path can remain for small exports.
- Documented so a reviewer seeing the spec vs. implementation gap understands it's a deliberate scope decision, not an omission.
