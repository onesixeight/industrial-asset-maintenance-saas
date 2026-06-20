# Phase 6 — Parts Inventory Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-21-phase-6-parts-design.md`
**Branch:** `feat/phase-6-parts-inventory`

TDD throughout (red → green → refactor). After each task, run the affected test scope.

## Task 1 — Shared schemas
- [ ] Create `packages/shared/src/parts.ts`:
  - `partResponseSchema` + `PartResponse` (id, name, sku, description?, quantity, minQuantity, companyId, createdAt ISO, updatedAt ISO)
  - `workOrderPartResponseSchema` + `WorkOrderPartResponse` (id, workOrderId, partId, quantity, createdAt ISO)
  - `createPartRequestSchema` (name 1–200, sku 1–100, description? ≤500, quantity int ≥0 default 0, minQuantity int ≥0 default 0)
  - `updatePartRequestSchema` = create.partial()
  - `partFiltersSchema` extends listQuerySchema + `lowStock: booleanQuery` (move booleanQuery to reference.ts as shared helper OR inline copy)
  - `consumePartRequestSchema` ({ partId uuid, quantity int ≥1 })
- [ ] Export from `packages/shared/src/index.ts`
- [ ] **Refactor:** extract `booleanQuery` into `reference.ts` (single source) and reuse in inspections.ts + parts.ts
- [ ] Run `pnpm --filter @iam/shared test` → green

## Task 2 — PartsService + unit tests
- [ ] Create `apps/api/src/parts/to-part-response.ts` (Date→ISO mapper)
- [ ] Create `apps/api/src/parts/parts.service.ts`:
  - `list(companyId, filters)` — lowStock filter: `quantity: { lte: minQuantity }` when true; search on name OR sku
  - `get(id, companyId)` — 404 if missing/cross-tenant
  - `create(input, companyId)` — catch Prisma P2002 (sku unique) → 409
  - `update(id, input, companyId)` — get-then-update; P2002 → 409
  - `remove(id, companyId)` — 404 if missing; cascade via Prisma (WorkOrderPart onDelete: Cascade already configured)
- [ ] Create `apps/api/src/parts/parts.service.spec.ts` (mocked prisma, ~8 tests): CRUD happy path, cross-tenant 404, SKU conflict 409, lowStock filter behavior
- [ ] Run vitest → green

## Task 3 — PartsModule + Controller
- [ ] `apps/api/src/parts/parts.module.ts` (controller + service)
- [ ] `apps/api/src/parts/parts.controller.ts`:
  - `GET /parts` (any authed) + `GET /parts/:id`
  - `POST /parts` [admin,manager] 201
  - `PATCH /parts/:id` [admin,manager]
  - `DELETE /parts/:id` [admin,manager] 204
- [ ] Register PartsModule in AppModule
- [ ] Run existing api tests → still green

## Task 4 — WorkOrderPartsService + unit tests
- [ ] Create `apps/api/src/work-orders/work-order-parts.service.ts`:
  - `list(workOrderId, companyId)` → WorkOrderPartResponse[] (include part)
  - `consume(workOrderId, input, user)` in `prisma.$transaction`:
    1. load WO (companyId scoped) → 404
    2. tech-not-owner → 403
    3. load Part (companyId scoped) → 404
    4. insufficient (part.quantity < qty) → 409
    5. decrement Part.quantity
    6. upsert WorkOrderPart (increment quantity if exists)
    7. low-stock crossing: if oldQty > min && newQty <= min → insert Notification per admin/manager in company
    8. return { part, workOrderPart }
  - `restock(workOrderId, partId, companyId)` in `$transaction`:
    1. load WOPart (via workOrder.companyId scope) → 404
    2. increment Part.quantity by woPart.quantity
    3. delete WOPart
    4. return 204 (no low-stock trigger)
- [ ] Create `apps/api/src/work-orders/work-order-parts.service.spec.ts` (mocked prisma $transaction, ~10 tests): consume decrements, 409 insufficient, accumulation, restock restores, tech-not-owner 403, cross-tenant 404, low-stock crossing fires once, no fire when already-low, no fire on restock
- [ ] Run vitest → green

## Task 5 — Wire endpoints into WorkOrdersController
- [ ] Extend `work-orders.controller.ts`:
  - `GET /work-orders/:id/parts` (any authed, tenant-scoped via service)
  - `POST /work-orders/:id/parts` (no class-level role gate — service enforces tech-owner|admin|manager) with consumePartRequestSchema
  - `DELETE /work-orders/:id/parts/:partId` [admin,manager] 204
- [ ] Update `work-orders.module.ts`: provide WorkOrderPartsService, import PartsModule (for Part type access if needed; service uses PrismaService directly so may not need it)
- [ ] Run existing api tests → green

## Task 6 — E2E tests (≥10 critical paths)
- [ ] Create `apps/api/test/parts.e2e.spec.ts`:
  1. create part → 201, get → 200, list → contains it
  2. update part → reflects changes
  3. duplicate sku in same company → 409
  4. cross-tenant get → 404
  5. delete part → subsequent get 404
  6. consume part on WO → Part.quantity decremented, WOPart created
  7. consume insufficient → 409, quantity unchanged
  8. restock → Part.quantity restored, WOPart removed
  9. technician-not-owner consume → 403
  10. lowStock=true filter returns only low parts
  11. low-stock crossing creates Notification for managers (verify count)
  12. accumulation: consume twice → WOPart.quantity adds, Part decrements twice
- [ ] Extend `test/db.ts` truncate if needed (notification + workOrderPart + part already in list per Phase 5 fix)
- [ ] Run all e2e → green

## Task 7 — Verification gate
- [ ] `pnpm -w lint` (all workspaces)
- [ ] `pnpm -w typecheck`
- [ ] `pnpm -w test` (all 170 existing + ~22 new)
- [ ] `pnpm -w build`
- [ ] All four green before proceeding

## Task 8 — Frontend
- [ ] `apps/web/src/app/parts/page.tsx` — list (search + lowStock filter toggle, stock badge)
- [ ] `apps/web/src/app/parts/new/page.tsx` — RHF + Zod create form
- [ ] `apps/web/src/app/parts/[id]/page.tsx` — edit + delete
- [ ] Extend `apps/web/src/app/work-orders/[id]/page.tsx` — Parts section (list consumed, add form, remove btn for admin/manager)
- [ ] Add "Parts" link to sidebar
- [ ] Add `partsApi` to `apps/web/src/lib/api.ts` (or wherever client lives)
- [ ] `pnpm --filter web build` → green; web tests if any

## Task 9 — Docs + commit
- [ ] Update `docs/progress.md` (Phase 6 → done, list test counts)
- [ ] Update `DEVELOPMENT_LOG.md` with Phase 6 entry (decisions, deviations, test counts)
- [ ] Write `docs/adr/0004-low-stock-trigger.md` (bounded trigger, defer full Notification service to Phase 8)
- [ ] Commit spec + plan first (`docs: phase 6 parts spec + plan`)
- [ ] Commit backend (`feat(api): phase 6 parts ...`)
- [ ] Commit e2e (`test(api): phase 6 parts critical-path e2e`)
- [ ] Commit web (`feat(web): phase 6 parts UI`)
- [ ] Commit docs (`docs: phase 6 parts (dev log, progress, adr)`)
- [ ] Push to `feat/phase-6-parts-inventory`

## Risk notes
- **Low-stock Notification fan-out:** must query users with role in [admin, manager] for the company *inside* the transaction to avoid race. Use `tx.user.findMany`.
- **`$transaction` mock in unit tests:** vitest mock — provide `getClient().$transaction` that invokes the callback with the same client (no real rollback needed for unit tests).
- **Truncate order:** Part before WorkOrderPart before WO — already correct in db.ts per Phase 5 fix. Verify notification + workOrderPart + part are all in the truncate list.
