# Phase 7 — Dashboard + Reports Design

**Date:** 2026-06-21
**Branch:** `feat/phase-7-dashboard-reports`
**Predecessor:** Phase 6 (Parts inventory) — `feat/phase-6-parts-inventory`

## 1. Goal

Replace the placeholder `/dashboard` page with real KPIs and trend data, and add a synchronous CSV export of work orders. Aggregations are computed on demand against PostgreSQL (tenant-scoped). This delivers the operator-facing overview the app has been missing.

## 2. Scope

### In scope
- `GET /dashboard/stats` — aggregate KPI cards (tenant-scoped)
- `GET /dashboard/trends?days=30` — WO created/completed per day, inspections/day, MTTR over the window
- `GET /reports/work-orders.csv` — synchronous CSV export (streamed)
- Frontend dashboard rewrite (KPI cards + simple trend bars + export button)

### Out of scope (deferred)
- **BullMQ job queue + R2 object storage** for async report generation — over-engineered for portfolio-scale data volume; deferred (ADR 0005). Synchronous generation is correct at this scale.
- Real-time dashboards / websockets
- PDF report generation (deferred to Phase 10 deployment polish)
- Per-asset deep-dive analytics

## 3. Endpoints

### `GET /dashboard/stats`
Returns a single object of scalar KPIs, all scoped to `user.companyId`:

```ts
{
  workOrders: { open, inProgress, onHold, completed, cancelled, overdue }
  assets: { total, maintenance }
  inspections: { last30Days, passed, passRate }  // passRate 0..1 or null
  parts: { lowStock, outOfStock }
}
```

- **overdue** = WOs with `dueDate < now()`, not in a terminal state (`completed`/`cancelled`), not soft-deleted.
- **passRate** = `passed / last30Days` (null if zero inspections).
- **lowStock** = `quantity <= minQuantity` (in-memory; Prisma can't compare columns — Phase 6 pattern); **outOfStock** = `quantity <= 0`.

### `GET /dashboard/trends?days=30`
Query: `days` integer 1–365 (default 30). Returns daily series for the window:

```ts
{
  windowDays: number,
  mttrHours: number | null,          // mean time to resolve, over window
  series: [{ date: "YYYY-MM-DD", woCreated, woCompleted, inspections }]
}
```

- `date` = local calendar day (UTC date string from `createdAt`).
- `mttrHours` = mean of `(completedAt - createdAt)` in hours for WOs completed within the window; null if none.
- Pure helper `computeMttr(items: { createdAt, completedAt }[])` extracted to `mttr.ts` and unit-tested.

### `GET /reports/work-orders.csv`
- 200 with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="work-orders.csv"`.
- Headers: `id,title,status,priority,type,assetName,assignedEmail,createdAt,completedAt,dueDate`.
- CSV escaping: fields with comma/quote/newline wrapped in quotes, embedded quotes doubled (RFC 4180).
- Empty set → headers only (no body rows).
- Tenant-scoped; excludes soft-deleted.

## 4. RBAC

- `GET /dashboard/*` and `GET /reports/work-orders.csv` — any authenticated user. All aggregations are scoped by `user.companyId` (a viewer sees only their tenant's aggregates; nothing write-gated).

## 5. Shared types

`packages/shared/src/dashboard.ts`:
- `statsResponseSchema` + `StatsResponse` (nested objects, all numbers; `passRate: number | null`)
- `trendsQuerySchema` (`days: z.coerce.number().int().min(1).max(365).default(30)`)
- `trendsResponseSchema` + `TrendsResponse` (`series: TrendPoint[]`, `mttrHours: number | null`)
- Exported from `index.ts`.

These are response-only (read); no request bodies to validate beyond the query.

## 6. Module structure

```
apps/api/src/dashboard/
  dashboard.module.ts
  dashboard.controller.ts
  dashboard.service.ts
  dashboard.service.spec.ts
  mttr.ts
  mttr.spec.ts
apps/api/src/reports/
  reports.module.ts
  reports.controller.ts
  reports.service.ts          # toCsv(rows)
  reports.service.spec.ts
```

`DashboardController` exposes `GET /dashboard/stats` + `GET /dashboard/trends`. `ReportsController` exposes `GET /reports/work-orders.csv` and streams via Nest `StreamableFile` (or a plain string body — small enough). Both registered in `AppModule`.

## 7. Testing

- **`mttr.spec.ts`** (pure): empty → null; single completed → exact delta; excludes incomplete; averages multiple.
- **`dashboard.service.spec.ts`** (mocked prisma): stats returns correct counts from mocked groupBy/findMany; trends aggregates per-day; tenant scope passed through.
- **`reports.service.spec.ts`** (pure): RFC 4180 escaping — plain field, comma, embedded quote, newline, empty set → headers only.
- **e2e** (≥7): stats for empty company = zeros/nulls; stats after seeding reflects counts; trends over a 7-day window; MTTR reflects a completed WO; CSV export → 200 + content-type + escaped body; unauthenticated → 401; cross-tenant isolation (stats don't leak across companies).

## 8. Frontend

- Rewrite `/dashboard` page: KPI card grid (WO by status, overdue, asset maintenance %, inspection pass rate, low-stock count) + a simple daily bar trend (created vs completed) using divs (no chart lib — keeps the hand-rolled-primatives decision from Phase 5). "Export work orders (CSV)" button triggers `window.location = /reports/work-orders.csv` with the bearer token via a fetch+blob download (can't use plain `<a>` because it lacks the Authorization header).
- New `lib/api/dashboard.ts` + `lib/api/reports.ts`.

## 9. Success criteria

- Lint + typecheck + test + build green across `api`, `shared`, `web`.
- Existing 209 tests remain green; ≥10 new Phase 7 tests pass.
- Dashboard renders real numbers (not the "Full UI lands in Phase 7" placeholder).
- DEVELOPMENT_LOG + progress.md + ADR 0005 (BullMQ/R2 deferred) updated.
- Conventional commit + push to `feat/phase-7-dashboard-reports`.
