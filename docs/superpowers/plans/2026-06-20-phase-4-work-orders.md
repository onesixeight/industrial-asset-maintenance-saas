# Phase 4: Work Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work-order CRUD with a validated status-transition graph, technician ownership of transitions, assignment, and soft-delete — the operational core for maintenance work. Parts consumption is deferred to Phase 6.

**Architecture:** `WorkOrdersModule` (controller + service + a pure `transitions.ts` map) reusing Phase 2/3 conventions: per-service `companyId`, cross-tenant → 404, per-route `ZodValidationPipe`, `JwtAuthGuard` + `RolesGuard`. The transition graph is data (not scattered if/else), unit-tested directly. Soft-delete sets `deletedAt`; list/get exclude deleted rows.

**Tech Stack:** NestJS 11, Prisma 7, Zod, Vitest (api); Next.js 16 App Router, TanStack Query, React Hook Form (web); shared `@iam/shared` Zod schemas as SSoT.

**Spec:** `docs/superpowers/specs/2026-06-20-phase-4-work-orders-design.md`

---

## File Structure (created/modified this phase)

```
apps/api/src/
├── app.module.ts                         import WorkOrdersModule
└── work-orders/
    ├── work-orders.module.ts
    ├── work-orders.controller.ts
    ├── work-orders.service.ts
    ├── transitions.ts                    allowed-transition map + canTransition()
    ├── transitions.spec.ts               pure unit test of the graph
    └── work-orders.service.spec.ts
apps/api/test/
└── work-orders.e2e.spec.ts               10 critical-path tests
apps/web/src/
├── lib/api/work-orders.ts                NEW (typed calls)
├── components/
│   ├── status-badge.tsx                  NEW (colored pill per status)
│   └── app-sidebar.tsx                   + "Work orders" link
└── app/(dashboard)/
    ├── work-orders/page.tsx              list + filters
    ├── work-orders/new/page.tsx          create form
    └── work-orders/[id]/page.tsx         detail + transition buttons + assign + soft-delete
packages/shared/src/
├── work-orders.ts                        NEW schemas
└── index.ts                              re-export
```

---

## Task 1: Shared schemas + transitions map + unit test

**Files:**
- Create: `packages/shared/src/work-orders.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/work-orders/transitions.ts`
- Create: `apps/api/src/work-orders/transitions.spec.ts`

- [ ] **Step 1: Write `packages/shared/src/work-orders.ts`**
```typescript
import { z } from "zod";
import { listQuerySchema } from "./reference";

export const workOrderTypeSchema = z.enum(["preventive", "corrective", "inspection"]);
export type WorkOrderType = z.infer<typeof workOrderTypeSchema>;

export const workOrderStatusSchema = z.enum([
  "open", "in_progress", "on_hold", "completed", "cancelled",
]);
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

export const prioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof prioritySchema>;

export const workOrderFiltersSchema = listQuerySchema.extend({
  status: workOrderStatusSchema.optional(),
  priority: prioritySchema.optional(),
  assetId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
});
export type WorkOrderFilters = z.infer<typeof workOrderFiltersSchema>;

const dateOrNull = z.union([z.string().datetime(), z.null()]);

export const createWorkOrderRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: workOrderTypeSchema,
  priority: prioritySchema.default("medium"),
  assetId: z.string().uuid(),
  assignedToId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateWorkOrderRequest = z.infer<typeof createWorkOrderRequestSchema>;

export const updateWorkOrderRequestSchema = createWorkOrderRequestSchema.partial();
export type UpdateWorkOrderRequest = z.infer<typeof updateWorkOrderRequestSchema>;

export const transitionWorkOrderRequestSchema = z.object({ status: workOrderStatusSchema });
export type TransitionWorkOrderRequest = z.infer<typeof transitionWorkOrderRequestSchema>;

export const workOrderResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: workOrderTypeSchema,
  status: workOrderStatusSchema,
  priority: prioritySchema,
  assetId: z.string().uuid(),
  assignedToId: dateOrNull, // uuid or null (reuses the nullable shape)
  dueDate: dateOrNull,
  completedAt: dateOrNull,
  deletedAt: dateOrNull,
  companyId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkOrderResponse = z.infer<typeof workOrderResponseSchema>;
```

- [ ] **Step 2: Re-export in `packages/shared/src/index.ts`** — add `export * from "./work-orders";`.

- [ ] **Step 3: Write `apps/api/src/work-orders/transitions.ts`**
```typescript
import type { WorkOrderStatus } from "@iam/shared";

/**
 * Allowed status transitions (spec §3.1). `completed` and `cancelled` are
 * terminal — empty arrays. Data, not scattered if/else, so the graph is
 * unit-testable in isolation and the critical-path test (#3) reads almost
 * identically to the unit test.
 */
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 4: Write `transitions.spec.ts`** (pure unit test):
```typescript
import { describe, expect, it } from "vitest";
import { canTransition } from "./transitions";

describe("work-order transitions", () => {
  it("allows the linear happy path", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });
  it("allows in_progress <-> on_hold", () => {
    expect(canTransition("in_progress", "on_hold")).toBe(true);
    expect(canTransition("on_hold", "in_progress")).toBe(true);
  });
  it("allows cancelling from any non-terminal state", () => {
    expect(canTransition("open", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("on_hold", "cancelled")).toBe(true);
  });
  it("rejects open -> completed directly (the §497 rule)", () => {
    expect(canTransition("open", "completed")).toBe(false);
  });
  it("treats completed and cancelled as terminal", () => {
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("completed", "open")).toBe(false);
    expect(canTransition("cancelled", "open")).toBe(false);
    expect(canTransition("cancelled", "in_progress")).toBe(false);
  });
  it("rejects backward transitions", () => {
    expect(canTransition("in_progress", "open")).toBe(false);
    expect(canTransition("on_hold", "open")).toBe(false);
  });
});
```

- [ ] **Step 5: Typecheck + test**
```
pnpm --filter @iam/shared typecheck
pnpm --filter @iam/api exec vitest run src/work-orders/transitions.spec.ts
```
Expected: shared typechecks; transitions test passes (6 tests).

- [ ] **Step 6: Commit**
```
git add packages/shared apps/api/src/work-orders
git commit -m "feat(shared): phase 4 work-order schemas + transitions map + unit test"
```

---

## Task 2: WorkOrdersService (CRUD + soft-delete + transition + ownership + FK)

**Files:**
- Create: `apps/api/src/work-orders/work-orders.service.ts`

- [ ] **Step 1: Write the service** following spec §5. Methods: `list` (filters + exclude deleted + paginate), `get` (404 if deleted/cross-tenant), `create` (validate assetId/assignedToId in company, status defaults open), `update` (fields, no status; re-validate FKs if changed), `transition(id, target, user)` (ownership check for technicians, canTransition, completedAt on completed), `remove` (soft-delete: set deletedAt). Map Prisma `Date`→ISO via `toWorkOrderResponse` (Phase 3 pattern). `validateFks(assetId, assignedToId|null, companyId)` → 400 on foreign-tenant.

  `transition` ownership: if `user.role === "technician"` and `wo.assignedToId !== user.sub` → `ForbiddenException`. Import `JwtPayload` from `@iam/shared` for the user shape (`sub`, `role`, `companyId`).

- [ ] **Step 2: Typecheck**
```
pnpm --filter @iam/api typecheck
```

- [ ] **Step 3: Commit**
```
git add apps/api/src/work-orders/work-orders.service.ts
git commit -m "feat(api): WorkOrdersService (CRUD, soft-delete, transition+ownership, FK validation)"
```

---

## Task 3: WorkOrdersController + module + wire + unit tests

**Files:**
- Create: `apps/api/src/work-orders/work-orders.controller.ts`
- Create: `apps/api/src/work-orders/work-orders.module.ts`
- Create: `apps/api/src/work-orders/work-orders.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the controller** per spec §5 contracts. Class-level `@UseGuards(JwtAuthGuard)`. Reads open to all; writes (create/update/delete) `@Roles("admin","manager")`; `PATCH :id/status` has NO class-level role restriction — the service enforces technician-ownership + manager/admin (the guard can't express "technician if owner", so it's a service-layer check). Use `@HttpCode(200)` on PATCH routes; `@HttpCode(204)` on DELETE.

- [ ] **Step 2: Write the module** + import `WorkOrdersModule` in `app.module.ts`.

- [ ] **Step 3: Write `work-orders.service.spec.ts`** (mock PrismaService): list excludes deleted + filters by companyId; get 404 when deleted/cross-tenant; create validates FKs (BadRequestException on foreign-tenant asset); transition rejects invalid (open→completed → BadRequestException); transition sets completedAt on completed; transition 403 when technician not owner; soft-delete sets deletedAt. (7-8 unit tests.)

- [ ] **Step 4: Typecheck + test**
```
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api test -- src/work-orders
```

- [ ] **Step 5: Commit**
```
git add apps/api/src/work-orders/work-orders.controller.ts apps/api/src/work-orders/work-orders.module.ts apps/api/src/work-orders/work-orders.service.spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): WorkOrders controller + module (CRUD, status transition, soft-delete) wired into AppModule"
```

---

## Task 4: E2E 10 critical-path tests

**Files:**
- Create: `apps/api/test/work-orders.e2e.spec.ts`

- [ ] **Step 1: Write the e2e** covering the 10 tests from spec §8. Reuse the harness. Helpers: `registerAdmin()`, `seedAsset(prisma, companyId)` (location+category+asset), `seedWorkOrder(token, assetId)` (POST), `seedViewer(...)` + `seedTechnician(...)` (for RBAC #5/#6), `auth(token)`. For transition tests: create WO (open), PATCH status in_progress/on_hold/in_progress/completed asserting completedAt set on the last; assert open→completed → 400; assert terminal states → 400. For ownership: seed a technician, create a WO assigned to them (manager creates), technician transitions it → 200; technician transitions a WO assigned to someone else → 403. Reset ThrottlerStorage per test.

- [ ] **Step 2: Run**
```
pnpm --filter @iam/api test -- test/work-orders.e2e.spec.ts
```
Expected: 10 passed.

- [ ] **Step 3: Commit**
```
git commit -m "test(api): phase 4 work-orders critical-path e2e (10 tests)"
```

---

## Task 5: Frontend — api client + StatusBadge + sidebar

**Files:**
- Create: `apps/web/src/lib/api/work-orders.ts`
- Create: `apps/web/src/components/status-badge.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx` (+ "Work orders")

- [ ] **Step 1: `lib/api/work-orders.ts`** — typed `workOrdersApi` (list with filters, get, create, update, transition, remove soft-delete).
- [ ] **Step 2: `status-badge.tsx`** — colored pill mapping each `WorkOrderStatus` to a Tailwind class (open=neutral, in_progress=blue, on_hold=amber, completed=green, cancelled=red). Tiny.
- [ ] **Step 3: Sidebar** — add "Work orders" (`/work-orders`) after "Assets".
- [ ] **Step 4: Typecheck + build**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
- [ ] **Step 5: Commit**
```
git commit -m "feat(web): work-orders api client + StatusBadge + sidebar link"
```

---

## Task 6: Frontend — /work-orders list + /work-orders/new + /work-orders/[id]

**Files:**
- Create: `apps/web/src/app/(dashboard)/work-orders/page.tsx`
- Create: `apps/web/src/app/(dashboard)/work-orders/new/page.tsx`
- Create: `apps/web/src/app/(dashboard)/work-orders/[id]/page.tsx`

- [ ] **Step 1: `/work-orders`** — DataTable + filter bar (status Select, priority Select, asset Select from `assetsApi.list()`, assignee Select from `usersApi.list()`, search) + "New work order". Columns: title, asset, `<StatusBadge status>`, assignee, due date.
- [ ] **Step 2: `/work-orders/new`** — RHF + Zod form (title, description, type Select, priority Select, asset Select, assignee Select optional with "Unassigned", due date). On create → redirect `/work-orders/[id]`.
- [ ] **Step 3: `/work-orders/[id]`** — detail: all fields + `<StatusBadge>` + **transition buttons**: compute the allowed next statuses client-side (mirror `ALLOWED_TRANSITIONS` — or fetch from the api; simplest: hardcode the same map in a small `lib/work-orders/transitions.ts` on web). Render a button per allowed target. Disable all transition buttons if the caller lacks permission (viewer → none; technician → only if `wo.assignedToId === user.id`; manager/admin → all). On click → `workOrdersApi.transition(id, target)` → invalidate. Assign dropdown (change `assignedToId` via PATCH). Soft-delete button (manager/admin) with confirm.
- [ ] **Step 4: Build**
```
pnpm --filter @iam/web build
```
- [ ] **Step 5: Commit**
```
git commit -m "feat(web): /work-orders list+filters, /work-orders/new, /work-orders/[id] detail + transitions + assign + soft-delete"
```

---

## Task 7: Verification gate + docs + commit + push

- [ ] **Step 1: Full gate**
```
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.yml up -d redis
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: all green.

- [ ] **Step 2: Manual smoke** (dev servers): register → create asset → create WO on it → transition open→in_progress→completed (completedAt appears) → try open→completed on a fresh WO (400) → as technician assigned, transition; unassigned → 403 → soft-delete → gone from list. Record in DEVELOPMENT_LOG.

- [ ] **Step 3: DEVELOPMENT_LOG.md** — append "## 2026-06-20 — Phase 4: Work Orders": done, decisions (transition graph, technician ownership, soft-delete, parts deferred to Phase 6), verified outputs, next (Phase 5).

- [ ] **Step 4: `docs/progress.md`** — mark Phase 4 ✅; check its critical-path line.

- [ ] **Step 5: Commit + push**
```
git add DEVELOPMENT_LOG.md docs/progress.md
git commit -m "docs: phase 4 work orders (dev log, progress)"
git push -u origin feat/phase-4-work-orders
```

---

## Verification Gate (Phase 4)

- [ ] `pnpm lint` — pass
- [ ] `pnpm typecheck` — pass
- [ ] `pnpm test` — pass (api incl. 10 Phase 4 critical-path e2e; shared; web)
- [ ] `pnpm build` — both apps build
- [ ] Manual: create WO → transition chain → invalid transition 400 → RBAC → soft-delete
- [ ] CI green on `main`
