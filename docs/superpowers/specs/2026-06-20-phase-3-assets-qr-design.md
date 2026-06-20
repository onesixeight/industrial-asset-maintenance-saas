# Spec: Phase 3 — Assets + QR Codes

> **Date:** 2026-06-20
> **Status:** Approved (pending user spec review)
> **Phase:** 3 of 11
> **Depends on:** Phase 2 (Reference Data) — complete
> **Related:** `PROJECT_PLAN.md` §7.5 (assets), §8 (security: opaque QR), §10 (risks); spec `2026-06-19-phase-2-reference-data-design.md` (RBAC conventions, multi-tenancy)

---

## 1. Goal

Add asset CRUD plus opaque-token QR generation/scanning/rotation. Assets are
the core entity that work orders (Phase 4) and inspections (Phase 5) attach to,
so they must exist with stable identifiers and a secure QR surface first.

## 2. Scope

### In scope
- `Asset` CRUD (`/assets`) — multi-tenant, filtered list (status/location/category/search).
- Opaque QR token: generated server-side on create (24-byte base32), stored in
  `Asset.qrCode @unique`, never the UUID.
- `GET /assets/:id/qr` → QR as SVG (`image/svg+xml`) for printing.
- `GET /assets/qr/:token` → scan: resolve token → asset (authed; cross-tenant → 404).
- `POST /assets/:id/qr/rotate` → new token (invalidates the printed sticker).
- Frontend: `/assets` list, `/assets/[id]` detail with QR display + rotate,
  `/assets/scan` camera scanner (`html5-qrcode`), sidebar links.

### Explicitly out of scope
- Bulk asset import — later.
- Asset photos/attachments — later.
- Asset history/audit view (work-order/inspection timeline) — Phase 7 dashboard.
- QR printing layout/PDF — SVG download is enough; layout is operational.

---

## 3. Confirmed Decisions

1. **QR token = opaque 24-byte base32** (`crypto.randomBytes(24)` → base32), stored
   in `Asset.qrCode @unique` (PROJECT_PLAN §8). Not the UUID (enumerable). The
   client never derives the asset id from the QR; only the server resolves
   token → asset, so a leaked QR grants access to one asset, not the list.
2. **Token generated server-side on create.** `POST /assets` does NOT accept a
   `qrCode` — the service generates it. Clients read it back via the asset body
   (but never need it except to render the QR image).
3. **Rotation** = generate a new token, overwrite `qrCode`. The old printed
   sticker's token then 404s on scan. No denylist/TTL — the token is a stable
   pointer, not a session; rotation is the invalidation mechanism.
4. **RBAC** (PROJECT_PLAN §7.5 + the role model; user-confirmed):
   | Action | viewer | technician | manager | admin |
   |---|---|---|---|---|
   | GET /assets (list + filters) | ✓ | ✓ | ✓ | ✓ |
   | GET /assets/:id | ✓ | ✓ | ✓ | ✓ |
   | GET /assets/qr/:token (scan) | ✓ | ✓ | ✓ | ✓ |
   | POST /assets, PATCH, DELETE | ✗ | ✗ | ✓ | ✓ |
   | GET /assets/:id/qr (SVG) | ✗ | ✗ | ✓ | ✓ |
   | POST /assets/:id/qr/rotate | ✗ | ✗ | ✓ | ✓ |
   Scanning is an everyday action for technicians/inspectors; generation and
   rotation are admin/manager.
5. **Multi-tenancy**: every query scoped to `companyId` from `@CurrentUser()`,
   as in Phase 2. Cross-tenant lookups (by id or by QR token) → 404.
6. **Delete guard** (PROJECT_PLAN §884 pattern): `DELETE /assets/:id` returns
   409 if any WorkOrder or Inspection references the asset — protects audit
   history. An asset with no history can be hard-deleted.
7. **QR rendered as SVG** server-side via the `qrcode` library — vector, prints
   crisply, no client-side generation needed. The web client just embeds the
   SVG (`<img src="/api/.../qr">` or fetches bytes).

---

## 4. Data Model

No migration needed — the `Asset` model already exists from the `0001_init`
migration (Phase 1a): `qrCode String @unique`, `status AssetStatus` (enum:
active/maintenance/retired/lost), `serialNumber String?`, location/category/company
FKs with `onDelete: Cascade` on company. Phase 3 adds no columns.

> Note: `Asset.location`/`Asset.category` use plain FKs (no `onDelete` specified),
> so deleting a Location/Category with assets is blocked by Postgres FK constraint —
> which is why the Phase 2 delete guards count assets first. Asset delete itself
> guards on WorkOrder/Inspection (§3.6).

---

## 5. Backend Architecture

### Module layout (new)
```
apps/api/src/
└── assets/
    ├── assets.module.ts
    ├── assets.controller.ts
    ├── assets.service.ts
    └── assets.service.spec.ts
```
Imported by `AppModule`. Reuses `JwtAuthGuard`, `RolesGuard`, `@Roles()`,
`@CurrentUser()`, the per-route `ZodValidationPipe`. Adds the `qrcode` lib
dependency for SVG generation.

### QR token helper
```typescript
import { randomBytes } from "node:crypto";
// base32 alphabet (RFC 4648, no padding) — URL-safe, scan-stable.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function generateQrToken(): string {
  const bytes = randomBytes(24);
  let out = "";
  for (const b of bytes) out += BASE32[(b >> 3) & 31] + BASE32[((b & 7) << 2)];
  // simpler: randomBytes(24).toString("base64url") is also opaque+url-safe;
  // we use a custom base32 to keep tokens visually consistent and scan-safe.
  return out.slice(0, 38); // ~24 bytes of entropy
}
```
Practical version: `randomBytes(24).toString("base64url")` — 32 chars, URL-safe,
opaque, sufficient entropy. The exact alphabet is not load-bearing; opacity +
uniqueness + scan-stability are. (The plan calls it "base32" but the property
that matters is opaque+random+unique; base64url satisfies it and is simpler.)

### Endpoint contracts

| Method & path | Body / Query | Success | Error |
|---|---|---|---|
| `GET /assets` | `?search=&status=&locationId=&categoryId=&page=&limit=` | `Asset[]` (scoped) | 401 |
| `GET /assets/:id` | — | `Asset` | 401; 404 (cross-tenant / missing) |
| `POST /assets` | `{ name, description?, serialNumber?, locationId, categoryId, purchaseDate?, warrantyDate? }` | 201 `Asset` (with generated `qrCode`) | 401; 403; 400 (bad FK → 404 if location/category not in company) |
| `PATCH /assets/:id` | partial of create body | 200 `Asset` | 401; 403; 404 |
| `DELETE /assets/:id` | — | 204 | 401; 403; 404; 409 (work orders/inspections exist) |
| `GET /assets/:id/qr` | — | 200 `image/svg+xml` | 401; 403; 404 |
| `GET /assets/qr/:token` | — | 200 `Asset` | 401; 404 (unknown / cross-tenant) |
| `POST /assets/:id/qr/rotate` | — | 200 `Asset` (new `qrCode`) | 401; 403; 404 |

> `Asset` response: `{ id, name, description, serialNumber, qrCode, status, locationId, categoryId, companyId, purchaseDate, warrantyDate, createdAt, updatedAt }`.

### Create validation
`locationId` and `categoryId` must belong to the caller's company. The service
validates this (findFirst `{ id, companyId }`) before create — a foreign-tenant
FK → 400/404 (we use 400 "Invalid location/category" to distinguish from a
missing asset 404). Reuses Phase 2's multi-tenant invariant.

### QR SVG generation
`AssetsService.getQrSvg(id, companyId)`:
1. `get(id, companyId)` (404 if missing/cross-tenant).
2. The QR encodes the **scan URL** the browser will open: `${PUBLIC_SCAN_BASE}/assets/qr/${asset.qrCode}`.
   - In dev, the Next.js rewrite proxies `/api/assets/qr/:token` → api, and the
     web `/assets/scan` handles the scanned text. For printing, the QR points to
     the web origin so scanning with a phone camera opens the app and the scan
     route resolves it. `PUBLIC_SCAN_BASE` defaults to `http://localhost:3000`
     (configurable; prod = deployed web URL).
3. `await QRCode.toString(payload, { type: "svg" })` → return the SVG string.
   Controller sets `Content-Type: image/svg+xml` (use `@Header` or `res.set`).

### Delete guard
```typescript
async remove(id, companyId) {
  await this.get(id, companyId);
  const [wo, insp] = await Promise.all([
    this.prisma.workOrder.count({ where: { assetId: id, companyId } }),
    this.prisma.inspection.count({ where: { assetId: id, companyId } }),
  ]);
  if (wo + insp > 0) throw new ConflictException("Asset has work orders or inspections");
  await this.prisma.asset.delete({ where: { id } });
}
```

---

## 6. Shared Schemas (`packages/shared/src/assets.ts`)

- `assetStatusSchema` — enum `active | maintenance | retired | lost`.
- `assetFiltersSchema` — extends `listQuerySchema` with optional `status?`, `locationId?`, `categoryId?`.
- `createAssetRequestSchema` — `{ name, description?, serialNumber?, locationId, categoryId, purchaseDate?(ISO), warrantyDate?(ISO) }`.
- `updateAssetRequestSchema` — `createAssetRequestSchema.partial()`.
- `assetResponseSchema` — full asset shape (id, qrCode, status, dates, FKs).
Re-exported from `index.ts`. Password-style: `qrCode` is read-only (never in
request schemas).

---

## 7. Frontend

### Routes (all under `(dashboard)`, Server Component cookie guard from Phase 1b)
- `/assets` — list: `<DataTable>` + filter bar (status `<select>`, location
  `<select>`, category `<select>`, search input) + "New asset" button.
- `/assets/new` — RHF + Zod form (name, description, serialNumber, locationId
  select, categoryId select, purchase/warranty dates). On create → redirect
  `/assets/[id]`.
- `/assets/[id]` — detail: fields + `<QrCodeDisplay />` (embeds
  `GET /assets/:id/qr` SVG; "Download SVG" link; "Rotate QR" button for
  admin/manager with confirm: "This invalidates the old printed sticker").
- `/assets/scan` — `<QrScanner />` (`html5-qrcode`): on decode → `assetsApi.scan(token)`
  → success → `router.push('/assets/[id]')`; failure (404) → toast "Unknown QR".

### Sidebar
Add "Assets" + "Scan QR" links (Phase 2 sidebar already exists; just append).

### New deps
- web: `html5-qrcode` (camera scan). No `qrcode.react` (the api emits SVG; web
  embeds it). No `qrcode` on web.

### Reuse from Phase 1b/2
`Button`, `FormField`, `Modal`, `DataTable`, `apiJson` (401-retry), the store,
the dashboard layout/sidebar. New primitives: `Select` (a styled `<select>`,
hand-rolled) + `QrCodeDisplay` + `QrScanner`.

---

## 8. Critical-Path Tests (TDD, written in this phase)

All on real PostgreSQL, same harness as Phase 1/2.

| # | Test | Asserts |
|---|---|---|
| 1 | create asset generates an opaque qrCode; list + get + update + delete happy path (scoped) | qrCode present + unique-ish; full CRUD; list scoped to company |
| 2 | create with a foreign-tenant locationId/categoryId → 400 | FK company scoping |
| 3 | cross-tenant asset by id → 404 | no existence leak |
| 4 | GET /assets/:id/qr returns image/svg+xml with the token payload | QR SVG generation |
| 5 | GET /assets/qr/:token resolves to the asset; unknown/cross-tenant token → 404 | scan flow |
| 6 | rotate changes qrCode; old token now 404, new token resolves | rotation invalidation |
| 7 | delete asset with a work order → 409; delete with no history → 204 | delete guard |
| 8 | RBAC: viewer POST /assets → 403; viewer can GET /assets/qr/:token (scan) → 200 | RBAC split (write vs scan) |
| 9 | filter list by status/location/category/search returns only matching assets | filtered list |
| 10 | PATCH updates fields; qrCode is read-only (ignored if sent) | update + qrCode immutability |

Acceptance: all 10 pass; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

---

## 9. Risks & Mitigations

- **QR payload points at the web origin.** A scanned QR opens the app; if the
  user isn't logged in, the `(dashboard)` Server Component guard redirects to
  `/login`, then back after auth. The token alone never reveals the asset
  (server-side resolution + auth required).
- **Collision on `qrCode @unique`.** 24 bytes of entropy (base64url ≈ 192 bits)
  makes collision astronomically unlikely; on a P2002 at create we retry once
  with a fresh token, then surface 500 if it recurs (defensive, not expected).
- **`html5-qrcode` camera permissions.** The scan page must be served over
  HTTPS in prod (camera API requires secure context); dev is `localhost` which
  is treated as secure. Documented; Phase 10 deployment ensures HTTPS.
- **Delete FK to location/category.** Already handled in Phase 2 (those delete
  guards count assets). Asset delete here guards on work orders/inspections only.
- **`PUBLIC_SCAN_BASE` config.** Defaults to `http://localhost:3000`; prod sets
  it to the deployed web URL. One env var, validated by the existing Zod config.
