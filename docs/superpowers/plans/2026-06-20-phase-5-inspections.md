# Phase 5: Inspections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inspection templates (checklist definitions) + inspection submission with server-computed `passed` logic (all items must pass), linked to assets, with a dynamic checklist form and QR→inspect flow.

**Architecture:** `InspectionsModule` (controller + service) handles both templates and inspections. Templates are `{ name, items: [{ id, label, type: "pass_fail" }] }` (ids generated server-side). `POST /inspections` accepts `{ assetId, templateId, results }`, validates results against the template, and computes `passed = every(item.value === "pass")`. Reuses Phase 2/3/4 conventions (multi-tenant, cross-tenant → 404, ZodValidationPipe, JwtAuthGuard + RolesGuard).

**Tech Stack:** NestJS 11, Prisma 7, Zod, Vitest (api); Next.js 16 App Router, TanStack Query, React Hook Form (web); shared `@iam/shared` Zod schemas as SSoT.

**Spec:** `docs/superpowers/specs/2026-06-20-phase-5-inspections-design.md`

---

## File Structure (created/modified this phase)

```
apps/api/src/
├── app.module.ts                         import InspectionsModule
└── inspections/
    ├── inspections.module.ts
    ├── inspections.controller.ts
    ├── inspections.service.ts
    ├── compute-passed.ts                 pure helper + unit test
    ├── compute-passed.spec.ts
    └── inspections.service.spec.ts
apps/api/test/
└── inspections.e2e.spec.ts               10 critical-path tests
apps/web/src/
├── lib/api/inspections.ts                NEW (typed calls)
├── components/
│   ├── passed-badge.tsx                  NEW (green "Passed" / red "Failed")
│   └── app-sidebar.tsx                   + "Inspections" + "Templates"
└── app/(dashboard)/
    ├── inspections/page.tsx              list + filters
    ├── inspections/new/page.tsx          asset+template select → dynamic checklist
    ├── inspections/[id]/page.tsx         read-only detail
    └── inspections/templates/page.tsx    template editor (list + create/edit modal + delete)
packages/shared/src/
├── inspections.ts                        NEW schemas
└── index.ts                              re-export
```

---

## Task 1: Shared inspection schemas

**Files:**
- Create: `packages/shared/src/inspections.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write `packages/shared/src/inspections.ts`**
```typescript
import { z } from "zod";
import { listQuerySchema } from "./reference";

// --- Template items (pass_fail only — spec §3.1) --------------------------

export const inspectionItemTypeSchema = z.literal("pass_fail");

/** Request shape: client sends only the label; id/type are added server-side. */
export const templateItemInputSchema = z.object({
  label: z.string().min(1).max(300),
});

/** Response shape: full item with server-generated id and type. */
export const templateItemResponseSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: inspectionItemTypeSchema,
});
export type TemplateItemResponse = z.infer<typeof templateItemResponseSchema>;

// --- Templates -------------------------------------------------------------

export const createTemplateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  items: z.array(templateItemInputSchema).min(1),
});
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

export const updateTemplateRequestSchema = createTemplateRequestSchema.partial();
export type UpdateTemplateRequest = z.infer<typeof updateTemplateRequestSchema>;

export const templateResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  items: z.array(templateItemResponseSchema),
  companyId: z.string().uuid(),
  createdAt: z.string(),
});
export type TemplateResponse = z.infer<typeof templateResponseSchema>;

// --- Inspections -----------------------------------------------------------

export const inspectionResultSchema = z.object({
  itemId: z.string(),
  value: z.enum(["pass", "fail"]),
});
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

export const submitInspectionRequestSchema = z.object({
  assetId: z.string().uuid(),
  templateId: z.string().uuid(),
  results: z.array(inspectionResultSchema),
  notes: z.string().max(2000).optional(),
});
export type SubmitInspectionRequest = z.infer<typeof submitInspectionRequestSchema>;

export const inspectionResponseSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  templateId: z.string().uuid(),
  results: z.array(inspectionResultSchema),
  passed: z.boolean(),
  notes: z.string().nullable(),
  inspectedById: z.string().uuid(),
  companyId: z.string().uuid(),
  createdAt: z.string(),
});
export type InspectionResponse = z.infer<typeof inspectionResponseSchema>;

export const inspectionFiltersSchema = listQuerySchema.extend({
  assetId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  passed: z.coerce.boolean().optional(),
});
export type InspectionFilters = z.infer<typeof inspectionFiltersSchema>;
```

- [ ] **Step 2: Re-export in `packages/shared/src/index.ts`** — add `export * from "./inspections";`.

- [ ] **Step 3: Typecheck**
```
pnpm --filter @iam/shared typecheck
pnpm --filter @iam/api typecheck
```

- [ ] **Step 4: Commit**
```
git add packages/shared
git commit -m "feat(shared): phase 5 inspection schemas (templates, results, passed filter)"
```

---

## Task 2: `computePassed` helper + unit test

**Files:**
- Create: `apps/api/src/inspections/compute-passed.ts`
- Create: `apps/api/src/inspections/compute-passed.spec.ts`

- [ ] **Step 1: Write `compute-passed.ts`**
```typescript
import type { InspectionResult } from "@iam/shared";

/**
 * `passed` = true only if every template item has exactly one result with
 * value "pass" (PROJECT_PLAN §512, critical-path test). Missing, duplicate,
 * extra, or any "fail" → false. Returns null if the results are malformed
 * (wrong count / unknown ids) — the caller surfaces that as 400.
 */
export function validateResults(
  templateItemIds: string[],
  results: InspectionResult[],
): { ok: true; passed: boolean } | { ok: false; reason: string } {
  const seen = new Map<string, "pass" | "fail">();
  for (const r of results) {
    if (!templateItemIds.includes(r.itemId)) {
      return { ok: false, reason: `Unknown item id: ${r.itemId}` };
    }
    if (seen.has(r.itemId)) {
      return { ok: false, reason: `Duplicate result for item: ${r.itemId}` };
    }
    seen.set(r.itemId, r.value);
  }
  for (const id of templateItemIds) {
    if (!seen.has(id)) {
      return { ok: false, reason: `Missing result for item: ${id}` };
    }
  }
  return { ok: true, passed: templateItemIds.every((id) => seen.get(id) === "pass") };
}
```

- [ ] **Step 2: Write `compute-passed.spec.ts`** (pure unit test):
```typescript
import { describe, expect, it } from "vitest";
import { validateResults } from "./compute-passed";

describe("validateResults / computePassed", () => {
  it("all pass → passed=true", () => {
    expect(validateResults(["a", "b"], [
      { itemId: "a", value: "pass" }, { itemId: "b", value: "pass" },
    ])).toEqual({ ok: true, passed: true });
  });
  it("one fail → passed=false", () => {
    expect(validateResults(["a", "b"], [
      { itemId: "a", value: "pass" }, { itemId: "b", value: "fail" },
    ])).toEqual({ ok: true, passed: false });
  });
  it("missing item → ok=false", () => {
    expect(validateResults(["a", "b"], [{ itemId: "a", value: "pass" }]).ok).toBe(false);
  });
  it("unknown itemId → ok=false", () => {
    expect(validateResults(["a"], [{ itemId: "z", value: "pass" }]).ok).toBe(false);
  });
  it("duplicate result → ok=false", () => {
    expect(validateResults(["a"], [
      { itemId: "a", value: "pass" }, { itemId: "a", value: "fail" },
    ]).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test**
```
pnpm --filter @iam/api exec vitest run src/inspections/compute-passed.spec.ts
```

- [ ] **Step 4: Commit**
```
git add apps/api/src/inspections/compute-passed.ts apps/api/src/inspections/compute-passed.spec.ts
git commit -m "feat(api): inspection validateResults helper + unit test (passed logic)"
```

---

## Task 3: InspectionsService + controller + module + wire

**Files:**
- Create: `apps/api/src/inspections/inspections.service.ts`
- Create: `apps/api/src/inspections/inspections.controller.ts`
- Create: `apps/api/src/inspections/inspections.module.ts`
- Create: `apps/api/src/inspections/inspections.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the service** — template CRUD (create generates item ids via `randomUUID()`; multi-tenant; delete guard 409 if inspections reference); inspection submit (validate asset/template in company, `validateResults`, compute `passed`, set `inspectedById = user.sub`); list/get with filters. Map `createdAt`→ISO, `items`/`results` are already JSON (pass through). Controller class-level `@UseGuards(JwtAuthGuard)`; template writes `@Roles("admin","manager")`; inspection submit `@Roles("technician","manager","admin")`. Route ordering: `/templates` static segments before `:id` (same as Phase 3 QR).

- [ ] **Step 2: Write the module** + import in `app.module.ts`.

- [ ] **Step 3: Write `inspections.service.spec.ts`** (mock Prisma): template create generates item ids; submit all-pass → passed=true; submit one-fail → passed=false; submit with missing item → BadRequest; template delete 409 when inspections reference; cross-tenant get → 404. (6-8 unit tests.)

- [ ] **Step 4: Typecheck + test**
```
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api test -- src/inspections
```

- [ ] **Step 5: Commit**
```
git add apps/api/src/inspections apps/api/src/app.module.ts
git commit -m "feat(api): Inspections module (templates CRUD, inspection submit, server-computed passed)"
```

---

## Task 4: E2E 10 critical-path tests

**Files:**
- Create: `apps/api/test/inspections.e2e.spec.ts`

- [ ] **Step 1: Write the e2e** covering the 10 tests from spec §8. Reuse the harness. Helpers: `registerAdmin()`, `seedAsset(companyId)`, `seedTemplate(token, items)` (POST /inspections/templates), `seedViewer/seedTechnician`, `auth(token)`. For the critical `passed` test (#2): create a 3-item template, submit all-pass → passed=true; submit one-fail → passed=false. For validation (#3): submit with a missing itemId → 400; extra itemId → 400. Reset ThrottlerStorage per test.

- [ ] **Step 2: Run**
```
pnpm --filter @iam/api test -- test/inspections.e2e.spec.ts
```

- [ ] **Step 3: Commit**
```
git commit -m "test(api): phase 5 inspections critical-path e2e (10 tests)"
```

---

## Task 5: Frontend — api client + PassedBadge + sidebar

**Files:**
- Create: `apps/web/src/lib/api/inspections.ts`
- Create: `apps/web/src/components/passed-badge.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx` (+ Inspections + Templates)

- [ ] **Step 1: `lib/api/inspections.ts`** — typed `templatesApi` (list/get/create/update/remove) + `inspectionsApi` (list/get/submit).
- [ ] **Step 2: `passed-badge.tsx`** — green "Passed" / red "Failed" pill.
- [ ] **Step 3: Sidebar** — add "Inspections" (`/inspections`) + "Templates" (`/inspections/templates`, admin/manager-only).
- [ ] **Step 4: Typecheck + build**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
- [ ] **Step 5: Commit**
```
git commit -m "feat(web): inspections api client + PassedBadge + sidebar links"
```

---

## Task 6: Frontend — pages

**Files:**
- Create: `apps/web/src/app/(dashboard)/inspections/page.tsx`
- Create: `apps/web/src/app/(dashboard)/inspections/new/page.tsx`
- Create: `apps/web/src/app/(dashboard)/inspections/[id]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/inspections/templates/page.tsx`

- [ ] **Step 1: `/inspections`** — DataTable (asset, template, `<PassedBadge>`, inspector, date) + filters (asset, template, passed) + "New inspection".
- [ ] **Step 2: `/inspections/new`** — select asset + template → fetch template items → render dynamic checklist (pass/fail radio per item) + notes → submit → show `passed` result.
- [ ] **Step 3: `/inspections/[id]`** — read-only detail: checklist results + `<PassedBadge>` + notes + inspector + date.
- [ ] **Step 4: `/inspections/templates`** — template list + create/edit modal (name + dynamic item rows with add/remove) + delete with 409 surfaced. Manager/admin only.
- [ ] **Step 5: Build**
```
pnpm --filter @iam/web build
```
- [ ] **Step 6: Commit**
```
git commit -m "feat(web): /inspections list+new+[id] + /inspections/templates editor"
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

- [ ] **Step 2: Manual smoke**: create template → submit inspection all-pass → passed; one-fail → failed; viewer blocked; templates manager-only. Record in DEVELOPMENT_LOG.

- [ ] **Step 3: DEVELOPMENT_LOG.md** — append Phase 5 entry.

- [ ] **Step 4: `docs/progress.md`** — mark Phase 5 ✅.

- [ ] **Step 5: Commit + push**
```
git add DEVELOPMENT_LOG.md docs/progress.md
git commit -m "docs: phase 5 inspections (dev log, progress)"
git push -u origin feat/phase-5-inspections
```

---

## Verification Gate (Phase 5)

- [ ] `pnpm lint` — pass
- [ ] `pnpm typecheck` — pass
- [ ] `pnpm test` — pass (api incl. 10 Phase 5 e2e; shared; web)
- [ ] `pnpm build` — both apps build
- [ ] Manual: template → submit all-pass → passed; one-fail → failed; RBAC
- [ ] CI green on `main`
