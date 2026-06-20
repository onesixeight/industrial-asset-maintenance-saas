# Phase 6 — Parts Inventory Design

**Date:** 2026-06-21
**Branch:** `feat/phase-6-parts-inventory`
**Predecessor:** Phase 5 (Inspections) — `feat/phase-5-inspections`

## 1. Goal

Implement parts inventory with transactional consumption against work orders, restock, and a low-stock trigger that fires once per threshold-crossing consumption. This is a **critical-path phase** per the execution spec §3.1: parts consumption must decrement stock transactionally and low-stock must trigger on the crossing.

## 2. Scope

### In scope
- `Part` CRUD (admin/manager for mutations)
- `WorkOrderPart` transactional consumption (decrement) and restock (restore via delete)
- Low-stock trigger (bounded: direct Notification inserts, no read service)
- ≥12 tests covering the critical paths (consumption decrement, restock restore, low-stock crossing)
- Frontend `/parts` list + create/edit pages; parts section on WO detail page

### Out of scope (deferred)
- Notification read/unread service + UI → **Phase 8 (Notifications)**
- Parts reporting/analytics → Phase 7 (Dashboard + Reports)
- Supplier/PO management → not scheduled (YAGNI)

## 3. Data model (already in Prisma schema)

```prisma
model Part {
  id, name, sku, description?, quantity (default 0), minQuantity (default 0),
  companyId, @@unique([companyId, sku]), createdAt, updatedAt
}
model WorkOrderPart {
  id, workOrderId, partId, quantity, @@unique([workOrderId, partId]), createdAt
}
```

No migrations needed — models exist since Phase 2 schema bootstrap.

## 4. RBAC

| Endpoint | Auth |
|---|---|
| `GET /parts`, `GET /parts/:id` | any authenticated |
| `POST/PATCH/DELETE /parts/:id` | admin, manager |
| `GET /work-orders/:id/parts` | any authenticated (tenant-scoped) |
| `POST /work-orders/:id/parts` | technician-if-owner OR admin/manager |
| `DELETE /work-orders/:id/parts/:partId` | admin, manager |

Technician ownership follows Phase 4's pattern: a technician consuming parts must own the assigned WO (`wo.assignedToId === user.sub`). The class-level `RolesGuard` can't express "technician-if-owner", so `POST /work-orders/:id/parts` has no class-level role gate — the service enforces it (returns 403 otherwise), mirroring the WO transition endpoint.

## 5. Transactional consumption (critical path)

`POST /work-orders/:id/parts { partId, quantity }` runs inside `prisma.$transaction(async (tx) => ...)`:

1. Load WO scoped by company; **404** if missing or wrong tenant.
2. Enforce technician-ownership: if `user.role === "technician" && wo.assignedToId !== user.sub` → **403**.
3. Load Part scoped by company; **404** if missing.
4. **409 Conflict** if `part.quantity < requested` (insufficient stock).
5. Decrement `Part.quantity`.
6. Upsert `WorkOrderPart` (add to existing quantity if row already exists — `@@unique([workOrderId, partId])`).
7. **Low-stock trigger**: if `newQuantity <= minQuantity` AND `oldQuantity > minQuantity` (the crossing), insert Notification rows for every admin/manager user in the company.
8. Return `{ part, workOrderPart }`.

All steps inside one transaction — partial failure rolls back (no consumption without decrement, no orphan Notification).

## 6. Restock

`DELETE /work-orders/:id/parts/:partId` (admin/manager) inside `$transaction`:

1. Load WOPart + WO; **404** if missing or wrong tenant.
2. Increment `Part.quantity` by `woPart.quantity`.
3. Delete `WorkOrderPart` row.
4. **No** low-stock trigger on restock (restock only raises quantity, never crosses downward).
5. Return 204.

## 7. Low-stock trigger (bounded)

- Fires only on the **downward crossing**: `oldQuantity > minQuantity && newQuantity <= minQuantity`.
- Does **not** fire if already below min (prevents spam on repeat consumption).
- Creates one `Notification` per admin/manager in the company (direct Prisma insert; title/message describe the part + current quantity).
- `Notification.userId` is required by schema, hence the per-user fan-out.
- The full Notification read/mark-read service lands in Phase 8.

## 8. Shared schemas (`packages/shared`)

New `parts.ts`:
- `createPartRequestSchema`: name, sku, description?, quantity (≥0, default 0), minQuantity (≥0, default 0)
- `updatePartRequestSchema`: partial of create (sku updates allowed)
- `partFiltersSchema`: search?, lowStock? (boolean), with `booleanQuery` preprocessor (Phase 5 pattern)
- `consumePartRequestSchema`: `{ partId: uuid, quantity: int ≥ 1 }`
- Response types: `PartResponse` (Date→ISO via mapper), `WorkOrderPartResponse`

Exported from `packages/shared/src/index.ts`.

## 9. Module structure

```
apps/api/src/parts/
  parts.module.ts
  parts.controller.ts
  parts.service.ts
  parts.service.spec.ts
  to-part-response.ts          # Date→ISO mapper (Phase 3 pattern)
apps/api/src/work-orders/
  work-order-parts.service.ts  # transactional consumption/restock + low-stock
  work-order-parts.service.spec.ts
  work-orders.controller.ts    # extended with /parts endpoints
  work-orders.module.ts        # provides WorkOrderPartsService, imports PartsModule
```

## 10. Frontend

- `/parts` — list with search + lowStock filter, stock badge (ok / low / out)
- `/parts/new`, `/parts/[id]` (edit) — RHF + Zod form, delete on edit page
- WO detail page (`/work-orders/[id]`) — new "Parts" section: list consumed parts, "Add part" form (qty picker), remove button (admin/manager)
- Sidebar nav entry "Parts" added in Phase 5 layout

## 11. Testing

- **Unit (`*.service.spec.ts`)**: PartsService CRUD + multi-tenant + SKU uniqueness (409); WorkOrderPartsService transactional decrement, 409 insufficient stock, accumulation on repeat consume, restock restore, technician-not-owner 403, cross-tenant 404, low-stock crossing fires once, no fire when already-low, no fire on restock.
- **e2e (≥10)**: full CRUD flow; consume then verify Part.quantity decremented; insufficient stock → 409; restock restores quantity; cross-tenant access → 404; technician-not-owner consume → 403; low-stock creates Notifications only on crossing; accumulation; delete part with existing consumption → cascade behavior; list filters (lowStock=true).

## 12. Success criteria

- Lint + typecheck + test + build all green across `api`, `shared`, `web`.
- All existing 170 tests remain green; ≥12 new Phase 6 tests pass.
- Critical paths proven by tests: transactional decrement, restock restore, low-stock crossing.
- DEVELOPMENT_LOG + progress.md + ADR updated.
- Conventional commit + push to `feat/phase-6-parts-inventory`.
