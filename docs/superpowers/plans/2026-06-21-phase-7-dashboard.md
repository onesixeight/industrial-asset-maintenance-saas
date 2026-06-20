# Phase 7 — Dashboard + Reports Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-21-phase-7-dashboard-design.md`
**Branch:** `feat/phase-7-dashboard-reports`

TDD throughout. Run affected test scope after each task.

## Task 1 — Shared types
- [ ] `packages/shared/src/dashboard.ts`: `statsResponseSchema`/`StatsResponse`, `trendsQuerySchema` (`days` 1–365 default 30), `trendPointSchema`/`TrendPoint`, `trendsResponseSchema`/`TrendsResponse`.
- [ ] Export from `index.ts`.
- [ ] `pnpm --filter @iam/shared test` → green.

## Task 2 — MTTR helper + tests
- [ ] `apps/api/src/dashboard/mttr.ts`: `computeMttr(items: { createdAt: Date; completedAt: Date | null }[]): number | null` — mean hours of completedAt−createdAt for completed items only; null if none.
- [ ] `apps/api/src/dashboard/mttr.spec.ts` (≥4 tests): empty→null, single, excludes incomplete, averages.
- [ ] vitest → green.

## Task 3 — DashboardService + tests
- [ ] `apps/api/src/dashboard/dashboard.service.ts`:
  - `stats(companyId)`: prisma groupBy WO by status; count assets total + maintenance; count inspections last 30 days + passed; count parts, filter lowStock/outOfStock in memory.
  - `trends(companyId, days)`: compute window start; prisma findMany WO created in window (select createdAt, completedAt) + inspections created in window (select createdAt); bucket by YYYY-MM-DD; compute MTTR.
- [ ] `dashboard.service.spec.ts` (≥5 tests, mocked prisma): stats happy path, passRate null when 0 inspections, lowStock filter, trends buckets, MTTR delegation.
- [ ] vitest → green.

## Task 4 — DashboardModule + Controller
- [ ] `dashboard.controller.ts`: `GET /dashboard/stats`, `GET /dashboard/trends?days=` (ZodValidationPipe on trendsQuerySchema).
- [ ] `dashboard.module.ts`; register in AppModule.
- [ ] existing api tests still green.

## Task 5 — ReportsService + tests
- [ ] `apps/api/src/reports/reports.service.ts`:
  - `generateWorkOrdersCsv(companyId)`: fetch WOs (include asset name, assigned email), serialize to CSV string via `toCsv`.
  - `toCsv(headers, rows)`: RFC 4180 escape.
- [ ] `reports.service.spec.ts` (≥5 tests): plain field, comma-escape, quote-escape, newline-escape, empty→headers only, header row correct.
- [ ] vitest → green.

## Task 6 — ReportsModule + Controller
- [ ] `reports.controller.ts`: `GET /reports/work-orders.csv` → `@Header('Content-Type', 'text/csv')` + `@Header('Content-Disposition', 'attachment; filename="work-orders.csv"')`, returns CSV string from service.
- [ ] `reports.module.ts`; register in AppModule.
- [ ] existing api tests green.

## Task 7 — E2E tests (≥7)
- [ ] `apps/api/test/dashboard.e2e.spec.ts`:
  1. stats empty company → zeros/nulls
  2. stats after seed → counts reflect
  3. trends 7-day window with seeded WO
  4. MTTR reflects a completed WO
  5. CSV export → 200 + text/csv + body with seeded WO
  6. CSV escaping — seed WO with comma/quote in title → escaped in body
  7. unauthenticated → 401
  8. cross-tenant isolation (two companies, stats independent)
- [ ] all e2e green.

## Task 8 — Verification gate
- [ ] `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test` (209 + new), `pnpm -w build` — all green.

## Task 9 — Frontend
- [ ] `lib/api/dashboard.ts` (`statsApi`, `trendsApi`), `lib/api/reports.ts` (`downloadWorkOrdersCsv(token)` → fetch+blob → trigger download).
- [ ] Rewrite `/dashboard/page.tsx`: KPI grid + trend bars + export button. Remove placeholder text.
- [ ] `pnpm --filter web build` → green.

## Task 10 — Docs + commit
- [ ] `docs/progress.md` Phase 7 → done.
- [ ] `DEVELOPMENT_LOG.md` Phase 7 entry.
- [ ] `docs/adr/0005-defer-bullmq-r2.md` (deferred async report infra; synchronous at portfolio scale).
- [ ] Commit spec+plan → backend → e2e → web → docs; push to `feat/phase-7-dashboard-reports`.

## Risk notes
- **Timezone on trend bucketing:** use UTC date string of `createdAt` consistently. Tests use fixed `new Date("...Z")`.
- **CSV streaming vs string:** WO set per tenant is bounded; returning a string is fine. If we wanted true streaming we'd use `StreamableFile`, deferred.
- **PassRate rounding:** keep full precision in API; format on the frontend.
