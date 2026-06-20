# Spec: Phase 5 — Inspections

> **Date:** 2026-06-20
> **Status:** Approved (pending user spec review)
> **Phase:** 5 of 11
> **Depends on:** Phase 4 (Work Orders) — complete
> **Related:** `PROJECT_PLAN.md` §7.7 (inspections), §6 (Inspection/InspectionTemplate models), §510-512 (items/results/passed logic); execution-process spec §3.1 (`passed` critical-path test)

---

## 1. Goal

Inspection templates (checklist definitions) + inspection submission (filled
checklists) with derived `passed` logic, linked to an asset (typically reached
via QR scan). Inspections are the quality/safety gate before work orders close
out and feed the dashboard (Phase 7).

## 2. Scope

### In scope
- `InspectionTemplate` CRUD (`/inspections/templates`).
- `POST /inspections` — submit a filled checklist; server computes `passed`.
- `GET /inspections`, `GET /inspections/:id` — list/detail (filtered by asset/template).
- `passed` = true **only if every item's result is `"pass"`** (PROJECT_PLAN §512,
  critical-path test exec spec §3.1).
- Frontend: template editor, inspection submission via a dynamic checklist form
  (`<InspectionForm />`), inspection history, QR→scan→inspect flow.
- Items strictly `pass_fail` (user-confirmed; PROJECT_PLAN §510).

### Explicitly out of scope (later)
- `measurement` / `text` item types → Phase 9 polish.
- Inspection PDF export → Phase 7/10.
- Auto-create inspections from a schedule → future.
- Re-running / superseding an inspection → future (immutable history for now).

---

## 3. Confirmed Decisions

1. **Item type = `pass_fail` only** (user-confirmed). A template item is
   `{ id: string, label: string, type: "pass_fail" }`. A result is
   `{ itemId: string, value: "pass" | "fail" }`. No measurements, no free text —
   keeps the `passed` rule unambiguous and matches PROJECT_PLAN §510. Other types
   are a Phase 9 addition.
2. **`passed` is computed server-side, never trusted from the client.**
   `POST /inspections` accepts `{ assetId, templateId, results, notes? }` and the
   service derives `passed`: true iff `results` has exactly one entry per template
   item, each with `value === "pass"`. Mismatched/missing results → 400. This is
   the critical-path test (exec spec §3.1): a single `fail` → `passed=false`.
3. **Results validated against the template.** Every `itemId` in `results` must
   match an item in the referenced template, and every template item must have a
   result. Extra/unknown `itemId`s or missing ones → 400. This is how the server
   computes `passed` reliably.
4. **`inspectedById` = the submitter** (from `@CurrentUser()` `sub`). Not
   client-supplied — the inspector is whoever is authenticated.
5. **Multi-tenancy**: every query scoped to `companyId`; cross-tenant → 404
   (Phase 2 convention). `assetId` and `templateId` validated to the caller's
   company on submit.
6. **RBAC**:
   | Action | viewer | technician | manager | admin |
   |---|---|---|---|---|
   | GET inspections (list/detail) | ✓ | ✓ | ✓ | ✓ |
   | GET templates | ✓ | ✓ | ✓ | ✓ |
   | POST inspections (submit) | ✗ | ✓ | ✓ | ✓ |
   | POST/PATCH templates (create/edit) | ✗ | ✗ | ✓ | ✓ |
   | DELETE templates | ✗ | ✗ | ✓ | ✓ |

   Technicians run inspections in the field; templates are managed by
   manager/admin (the people defining the checklists).
7. **Templates and inspections are immutable history once submitted.** No `PATCH
   /inspections/:id` — an inspection is a snapshot. Templates can be edited
   (renamed, items changed) but a submitted inspection references the template
   row at submit time (its `items` JSON is read then); editing a template later
   does not retroactively change past inspections' `passed` (we read `items` at
   submit, compute `passed`, and store `results` + `passed` on the inspection —
   past inspections are self-contained).

---

## 4. Data Model

No migration — both models exist from `0001_init`:
- `InspectionTemplate { id, name, items Json, companyId, createdAt }`.
- `Inspection { id, assetId, templateId, results Json, passed Boolean, notes?, inspectedById, companyId, createdAt }`.

The shape of `items` / `results` is enforced by the shared Zod schemas + the
service, not by the DB column type (`Json`).

---

## 5. Backend Architecture

### Module layout (new)
```
apps/api/src/
└── inspections/
    ├── inspections.module.ts
    ├── inspections.controller.ts
    ├── inspections.service.ts
    └── inspections.service.spec.ts
```
Imported by `AppModule`. Reuses `JwtAuthGuard`, `RolesGuard`, `@Roles()`,
`@CurrentUser()`, the per-route `ZodValidationPipe`.

### Endpoint contracts

| Method & path | Body / Query | Success | Error |
|---|---|---|---|
| `GET /inspections/templates` | `?search=&page=&limit=` | `Template[]` (scoped) | 401 |
| `GET /inspections/templates/:id` | — | `Template` | 401; 404 |
| `POST /inspections/templates` | `{ name, items: [{ label }] }` | 201 `Template` (ids generated server-side) | 401; 403; 400 |
| `PATCH /inspections/templates/:id` | `{ name?, items?: [{ label }] }` | 200 `Template` | 401; 403; 404 |
| `DELETE /inspections/templates/:id` | — | 204 | 401; 403; 404; 409 (if inspections reference it) |
| `GET /inspections` | `?assetId=&templateId=&passed=&page=&limit=` | `Inspection[]` | 401 |
| `GET /inspections/:id` | — | `Inspection` | 401; 404 |
| `POST /inspections` | `{ assetId, templateId, results: [{ itemId, value }], notes? }` | 201 `Inspection` (with computed `passed`) | 401; 403; 400 (bad FK / malformed results); 404 (template/asset cross-tenant) |

> `Template` response: `{ id, name, items: [{ id, label, type }], companyId, createdAt }`.
> `Inspection` response: `{ id, assetId, templateId, results: [{ itemId, value }], passed, notes, inspectedById, companyId, createdAt }` — `createdAt` as ISO.

### `passed` computation (the critical-path rule)
```typescript
function computePassed(templateItems: { id: string }[], results: { itemId: string; value: "pass" | "fail" }[]): boolean {
  const byItem = new Map(results.map((r) => [r.itemId, r.value]));
  if (byItem.size !== templateItems.length) return false; // missing/duplicate/extra
  return templateItems.every((it) => byItem.get(it.id) === "pass");
}
```
Validated against the template (all items present, no unknowns); `passed` is
`true` iff every item is `"pass"`. One `"fail"` (or any mismatch) → `false`.

### Template delete guard
`DELETE /inspections/templates/:id` → 409 if any `Inspection` references it
(audit history: don't orphan submitted inspections). Reuses the Phase 2/3 pattern.

---

## 6. Shared Schemas (`packages/shared/src/inspections.ts`)

- `inspectionItemTypeSchema` — `z.literal("pass_fail")`.
- `templateItemSchema` — `{ label: z.string().min(1).max(300) }` (request shape; `id`/`type` added server-side).
- `templateItemResponseSchema` — `{ id: string, label: string, type: "pass_fail" }`.
- `createTemplateRequestSchema` — `{ name, items: [templateItemSchema] }` (≥1 item).
- `updateTemplateRequestSchema` — partial of create.
- `templateResponseSchema` — `{ id, name, items: [templateItemResponseSchema], companyId, createdAt }`.
- `inspectionResultSchema` — `{ itemId: string, value: z.enum(["pass","fail"]) }`.
- `submitInspectionRequestSchema` — `{ assetId, templateId, results: [inspectionResultSchema], notes?: string }`.
- `inspectionResponseSchema` — full inspection shape (`passed: boolean`, temporal ISO).
- `inspectionFiltersSchema` — `listQuerySchema` + optional `assetId`, `templateId`, `passed` (boolean).
Re-exported from `index.ts`.

---

## 7. Frontend

### Routes (under `(dashboard)`)
- `/inspections` — list (DataTable: asset, template, `passed` badge, inspector, date) + filters (asset, template, passed) + "New inspection".
- `/inspections/new` — pick asset (select or "scan QR" link) + template select → renders `<InspectionForm />` (dynamic checklist from the template's items; pass/fail radio per item; notes). Submit → computed `passed` shown.
- `/inspections/templates` — template list + editor (create/edit: name + dynamic item rows; delete with 409 surfaced).
- `/inspections/[id]` — detail (read-only checklist + `passed` badge + notes + inspector + date).

### Sidebar
Add "Inspections" + "Templates" (Templates manager/admin-only like Users).

### Reuse
`Button`, `FormField`, `Select`, `DataTable`, `apiJson`, the store/layout, the
Phase 3 `QrScanner` (the "scan to inspect" entry: scan asset QR → land on
`/assets/[id]` → "Inspect" button → `/inspections/new?assetId=...`). New primitive:
`PassedBadge` (green "Passed" / red "Failed") — tiny, like `StatusBadge`.

---

## 8. Critical-Path Tests (TDD, written in this phase)

All on real PostgreSQL.

| # | Test | Asserts |
|---|---|---|
| 1 | create template (items get server-generated ids); list + get + edit + delete happy path (scoped) | template CRUD, server-side item ids |
| 2 | submit inspection: all-pass → `passed=true`; one fail → `passed=false` | the §512 rule (critical-path test) |
| 3 | submit with a missing item result → 400; extra/unknown itemId → 400 | results validated against template |
| 4 | submit with foreign-tenant assetId/templateId → 404 | FK company scoping |
| 5 | `inspectedById` = the authenticated submitter (not client-supplied) | inspector attribution |
| 6 | delete template with inspections referencing it → 409; no refs → 204 | template delete guard |
| 7 | cross-tenant inspection/template by id → 404 | no existence leak |
| 8 | RBAC: viewer cannot submit → 403; technician can submit; viewer cannot create template → 403; manager can | RBAC split |
| 9 | filtered list by asset/template/passed | filters |
| 10 | `passed=false` inspection appears in list filtered by `passed=false`, not `passed=true` | filter correctness + immutability |

Acceptance: all 10 pass; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

---

## 9. Risks & Mitigations

- **Template edited after an inspection is submitted.** The inspection is
  self-contained (`results` + computed `passed` stored on the row), so editing a
  template later cannot retroactively change a past inspection's outcome. The
  template `items` are read only at submit time. Documented in the service.
- **`items`/`results` are `Json` columns** — shape enforced by Zod in the service
  (template items validated on write; results validated against the template on
  submit). No unstructured JSON reaches the client without validation.
- **Item id collisions** across template edits: server regenerates ids on every
  template write, so old inspection `results` (keyed by the old ids) stay valid
  against the stored `results` (they don't re-resolve against the edited template).
- **Technician submits for an asset not in their company.** `assetId` validated
  against `companyId` → 404 (cross-tenant, no leak).
