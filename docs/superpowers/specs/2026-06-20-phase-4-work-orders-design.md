# Spec: Phase 4 — Work Orders

> **Date:** 2026-06-20
> **Status:** Approved (pending user spec review)
> **Phase:** 4 of 11
> **Depends on:** Phase 3 (Assets) — complete
> **Related:** `PROJECT_PLAN.md` §7.6 (work-orders), §6 (WorkOrder model), §8 (audit-friendly soft-delete); execution-process spec §3.1 (status-transition critical-path test)

---

## 1. Goal

Add work-order (WO) CRUD with validated status transitions, assignment, and
soft-delete — the operational core where maintenance work is scheduled, tracked,
and closed out. Parts consumption (`/work-orders/:id/parts`) is deferred to
Phase 6 (it needs the active `Part` inventory model); this phase ships the WO
lifecycle without parts.

## 2. Scope

### In scope
- WO CRUD: list (filtered, excludes soft-deleted), get, create, update fields, soft-delete.
- `PATCH /work-orders/:id/status` with a validated transition graph.
- `completedAt` auto-set on status `completed`; soft-delete sets `deletedAt`.
- Assignment (`assignedToId`) — assignee must be in the caller's company.
- Frontend: `/work-orders` list + filters, `/work-orders/new`, `/work-orders/[id]`
  detail + status-transition buttons + assign + soft-delete.
- Critical-path tests for the transition rules (execution-process spec §3.1).

### Explicitly out of scope (later phases)
- `GET/POST/DELETE /work-orders/:id/parts` (parts consumption) → Phase 6.
- WO CSV export, stats/trends → Phase 7.
- Notifications on assignment/due-date → Phase 8.

---

## 3. Confirmed Decisions

1. **Status transition graph** (user-confirmed linear flow + on_hold + cancelled):

   ```
   open ──→ in_progress ──→ completed
               ↑↓
            on_hold
   {open, in_progress, on_hold} ──→ cancelled
   ```
   Allowed transitions:
   - `open → in_progress`
   - `in_progress ↔ on_hold`
   - `in_progress → completed` (sets `completedAt = now`)
   - `{open, in_progress, on_hold} → cancelled`
   
   `completed` and `cancelled` are terminal — no transitions out. Any
   disallowed transition → 400 with a message naming the current and requested
   statuses. This satisfies PROJECT_PLAN §497 (no `open → completed` directly)
   and is the critical-path test (exec spec §3.1).

2. **`completedAt` auto-set** when a transition lands on `completed`; never
   editable directly by the client. Cleared if a WO were ever moved back — but
   `completed` is terminal, so this is moot in practice.

3. **Soft-delete only** (PROJECT_PLAN §491, §161). `DELETE /work-orders/:id`
   sets `deletedAt = now`; the row and all its history remain. List/get exclude
   `deletedAt != null`. No hard-delete endpoint.

4. **RBAC**:
   | Action | viewer | technician | manager | admin |
   |---|---|---|---|---|
   | GET (list/detail) | ✓ | ✓ | ✓ | ✓ |
   | POST / PATCH (fields) | ✗ | ✗ | ✓ | ✓ |
   | PATCH status | ✗ | ✓ (assigned to them) | ✓ | ✓ |
   | DELETE (soft) | ✗ | ✗ | ✓ | ✓ |

   A technician may move the status **only** of a WO assigned to them
   (`assignedToId === userId`); manager/admin can transition any. This is the
   real-world workflow (a tech starts/completes their assigned work).

5. **Multi-tenancy**: every query scoped to `companyId` from `@CurrentUser()`;
   cross-tenant by id → 404 (Phase 2/3 convention). `assetId` and
   `assignedToId` validated to belong to the caller's company on create/update.

6. **Transition validation lives in the service**, not the controller. The
   service method `transition(id, target, user)` checks the current status, the
   allowed set, and the technician ownership rule, then updates (with
   `completedAt` if applicable). BadRequestException on an invalid transition;
   ForbiddenException on an ownership violation.

---

## 4. Data Model

No migration needed — `WorkOrder` exists from the `0001_init` migration
(Phase 1a): `status WorkOrderStatus @default(open)`, `priority Priority
@default(medium)`, `type WorkOrderType`, `assetId`, `assignedToId?`,
`dueDate?`, `completedAt?`, `deletedAt?`, all company-scoped. Enums:

```
WorkOrderType: preventive | corrective | inspection
WorkOrderStatus: open | in_progress | on_hold | completed | cancelled
Priority: low | medium | high | critical
```

---

## 5. Backend Architecture

### Module layout (new)
```
apps/api/src/
└── work-orders/
    ├── work-orders.module.ts
    ├── work-orders.controller.ts
    ├── work-orders.service.ts
    ├── transitions.ts        (the allowed-transition map + helper)
    └── work-orders.service.spec.ts
```
Imported by `AppModule`. Reuses `JwtAuthGuard`, `RolesGuard`, `@Roles()`,
`@CurrentUser()`, the per-route `ZodValidationPipe`.

### Transition map (`transitions.ts`)
```typescript
const ALLOWED: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};
```
Pure data + a `canTransition(from, to)` helper — unit-testable in isolation.

### Endpoint contracts

| Method & path | Body / Query | Success | Error |
|---|---|---|---|
| `GET /work-orders` | `?search=&status=&priority=&assetId=&assignedToId=&page=&limit=` | `WorkOrder[]` (excludes deleted) | 401 |
| `GET /work-orders/:id` | — | `WorkOrder` | 401; 404 (deleted / cross-tenant) |
| `POST /work-orders` | `{ title, description?, type, priority?, assetId, assignedToId?, dueDate? }` | 201 `WorkOrder` (status=open) | 401; 403; 400 (bad FK) |
| `PATCH /work-orders/:id` | partial of create body (no status) | 200 `WorkOrder` | 401; 403; 404; 400 (bad FK) |
| `PATCH /work-orders/:id/status` | `{ status }` | 200 `WorkOrder` | 401; 403 (tech not owner); 400 (invalid transition); 404 |
| `DELETE /work-orders/:id` | — | 204 (soft-delete) | 401; 403; 404 |

> `WorkOrder` response: `{ id, title, description, type, status, priority, assetId, assignedToId, dueDate, completedAt, deletedAt, companyId, createdAt, updatedAt }` — temporal fields as ISO strings (Prisma `Date` → ISO, as in Phase 3).

### Create/update FK validation
`assetId` must reference an asset in the caller's company; `assignedToId`
(if set) must reference a user in the caller's company. Foreign-tenant FK →
400 "Invalid asset or assignee". Reuses the Phase 3 `findFirst({ id, companyId })` pattern.

### Transition ownership
`transition(id, target, user)`:
1. get the WO (404 if missing/deleted/cross-tenant).
2. If `user.role` is technician → require `wo.assignedToId === user.sub`, else 403.
3. If `!canTransition(wo.status, target)` → 400 naming the invalid transition.
4. Update: `{ status: target, completedAt: target === "completed" ? now : wo.completedAt }`.

---

## 6. Shared Schemas (`packages/shared/src/work-orders.ts`)

- `workOrderTypeSchema` (enum), `workOrderStatusSchema` (enum), `prioritySchema` (enum).
- `workOrderFiltersSchema` — extends `listQuerySchema` with optional `status`, `priority`, `assetId`, `assignedToId`.
- `createWorkOrderRequestSchema` — `{ title, description?, type, priority?, assetId, assignedToId?, dueDate? }`.
- `updateWorkOrderRequestSchema` — `createWorkOrderRequestSchema.partial()` (no `status`).
- `transitionWorkOrderRequestSchema` — `{ status: workOrderStatusSchema }`.
- `workOrderResponseSchema` — full WO shape (temporal as ISO strings / null).
Re-exported from `index.ts`.

---

## 7. Frontend

### Routes (under `(dashboard)`)
- `/work-orders` — DataTable + filter bar (status, priority, asset select,
  assignee select, search) + "New work order". Rows: title, asset, status
  badge, assignee, due date.
- `/work-orders/new` — RHF + Zod form (title, description, type select,
  priority select, asset select, assignee select optional, due date).
- `/work-orders/[id]` — detail: all fields + **status-transition buttons**
  (rendered from the allowed set given the current status; disabled if the
  caller can't transition — technician sees them only if assigned to them) +
  assign dropdown + soft-delete button.

### Sidebar
Add "Work orders" link (after Assets).

### Reuse
`Button`, `FormField`, `Select`, `DataTable`, `apiJson`, the store/layout. New
tiny primitive: `StatusBadge` (colored pill per status) — hand-rolled.

---

## 8. Critical-Path Tests (TDD, written in this phase)

All on real PostgreSQL.

| # | Test | Asserts |
|---|---|---|
| 1 | create WO (status defaults open); list excludes soft-deleted; get; update fields; soft-delete hides it | full lifecycle, soft-delete behavior |
| 2 | valid transition: open → in_progress → on_hold → in_progress → completed (completedAt set) | happy-path chain + completedAt |
| 3 | invalid transition: open → completed → 400 | the §497 rule (critical-path test) |
| 4 | terminal status: completed → in_progress → 400; cancelled → open → 400 | terminal states |
| 5 | technician can transition a WO assigned to them; technician cannot transition a WO not assigned → 403 | ownership RBAC |
| 6 | viewer cannot POST/PATCH/DELETE → 403; viewer can GET | RBAC reads vs writes |
| 7 | create with foreign-tenant assetId/assignedToId → 400 | FK company scoping |
| 8 | cross-tenant WO by id → 404 | no existence leak |
| 9 | filtered list by status/priority/asset/assignee/search | filters |
| 10 | soft-deleted WO is excluded from list AND from GET (404) | soft-delete completeness |

Acceptance: all 10 pass; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

---

## 9. Risks & Mitigations

- **Technician ownership check must read `assignedToId`.** If a WO is
  unassigned, a technician cannot transition it (403) — correct, since nobody
  owns the work yet. Manager/admin can still transition unassigned WOs.
- **`completedAt` could drift if a future change allowed leaving `completed`.**
  Mitigated now by `completed` being terminal; documented in `transitions.ts`.
- **Soft-delete + uniqueness / FK.** Soft-deleted WOs remain referenced by
  assets/work-order-parts; that's fine — we never hard-delete, so FKs stay
  intact. Phase 6's parts endpoints will filter by `deletedAt: null` where it
  matters (a deleted WO shouldn't allow new part consumption).
- **Transition graph is data, not scattered if/else.** `transitions.ts` is a
  pure map + helper, unit-tested directly — the critical-path test (#3) reads
  almost identically to the unit test.
