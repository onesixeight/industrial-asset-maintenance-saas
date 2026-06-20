# Phase 3: Assets + QR Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asset CRUD plus opaque-token QR generation, scanning, and rotation — multi-tenant, with the QR surface that work orders (Phase 4) and inspections (Phase 5) will attach to.

**Architecture:** Single `AssetsModule` (controller + service) reusing the Phase 2 conventions: per-service `companyId` from `@CurrentUser()`, cross-tenant → 404, per-route `ZodValidationPipe`, `JwtAuthGuard` + `RolesGuard`. QR tokens are opaque `randomBytes(24).toString("base64url")` generated server-side on create; rotation overwrites. The `qrcode` lib renders SVG server-side; the web embeds it and uses `html5-qrcode` for camera scanning.

**Tech Stack:** NestJS 11, Prisma 7, `qrcode` lib (SVG), Zod, Vitest (api); Next.js 16 App Router, TanStack Query, React Hook Form, `html5-qrcode` (web); shared `@iam/shared` Zod schemas as SSoT.

**Spec:** `docs/superpowers/specs/2026-06-20-phase-3-assets-qr-design.md`

---

## File Structure (created/modified this phase)

```
apps/api/
├── package.json                         add qrcode + @types/qrcode
├── src/
│   ├── config/env.config.ts             add PUBLIC_SCAN_BASE (default localhost:3000)
│   ├── app.module.ts                    import AssetsModule
│   └── assets/
│       ├── assets.module.ts
│       ├── assets.controller.ts
│       ├── assets.service.ts
│       └── assets.service.spec.ts
└── test/
    └── assets.e2e.spec.ts               10 critical-path tests
apps/web/
├── package.json                         add html5-qrcode
├── src/
│   ├── components/
│   │   ├── select.tsx                   NEW (styled <select>)
│   │   ├── qr-code-display.tsx          NEW (embeds SVG, download, rotate)
│   │   └── qr-scanner.tsx               NEW (html5-qrcode camera)
│   ├── lib/api/assets.ts                NEW (typed calls)
│   └── app/(dashboard)/
│       ├── assets/page.tsx              list + filters
│       ├── assets/new/page.tsx          create form
│       ├── assets/[id]/page.tsx         detail + QR + rotate
│       └── assets/scan/page.tsx         scanner
packages/shared/src/
├── assets.ts                            NEW schemas
└── index.ts                             re-export
```

---

## Task 1: Shared asset schemas + deps + env

**Files:**
- Create: `packages/shared/src/assets.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/package.json` (add `qrcode`, `@types/qrcode`)
- Modify: `apps/web/package.json` (add `html5-qrcode`)
- Modify: `apps/api/src/config/env.config.ts` (add `PUBLIC_SCAN_BASE`)
- Modify: `.env.example` (document `PUBLIC_SCAN_BASE`)

- [ ] **Step 1: Write `packages/shared/src/assets.ts`**
```typescript
import { z } from "zod";
import { listQuerySchema } from "./reference";

export const assetStatusSchema = z.enum(["active", "maintenance", "retired", "lost"]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetFiltersSchema = listQuerySchema.extend({
  status: assetStatusSchema.optional(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});
export type AssetFilters = z.infer<typeof assetFiltersSchema>;

const dateOrNull = z.union([z.string().datetime(), z.null()]);

export const createAssetRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  serialNumber: z.string().max(100).optional(),
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  purchaseDate: z.string().datetime().optional(),
  warrantyDate: z.string().datetime().optional(),
});
export type CreateAssetRequest = z.infer<typeof createAssetRequestSchema>;

export const updateAssetRequestSchema = createAssetRequestSchema.partial();
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;

export const assetResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  serialNumber: z.string().nullable(),
  qrCode: z.string(),
  status: assetStatusSchema,
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  companyId: z.string().uuid(),
  purchaseDate: dateOrNull,
  warrantyDate: dateOrNull,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AssetResponse = z.infer<typeof assetResponseSchema>;
```

- [ ] **Step 2: Re-export in `packages/shared/src/index.ts`** — add `export * from "./assets";`.

- [ ] **Step 3: Add deps**
```
pnpm --filter @iam/api add qrcode
pnpm --filter @iam/api add -D @types/qrcode
pnpm --filter @iam/web add html5-qrcode
```

- [ ] **Step 4: Add `PUBLIC_SCAN_BASE` to env config**

In `apps/api/src/config/env.config.ts`, add to the Zod env schema:
```typescript
PUBLIC_SCAN_BASE: z.string().url().default("http://localhost:3000"),
```
This is the web origin the QR payload points at (a scanned QR opens this URL + `/assets/qr/:token`). Default dev localhost; prod sets the deployed web URL.

- [ ] **Step 5: Document in `.env.example`**
```
# Origin the QR code payload points at (a scanned QR opens this + /assets/qr/:token).
PUBLIC_SCAN_BASE=http://localhost:3000
```

- [ ] **Step 6: Typecheck + shared tests**
```
pnpm --filter @iam/shared typecheck
pnpm --filter @iam/shared test
pnpm --filter @iam/api typecheck
```
Expected: all green.

- [ ] **Step 7: Commit**
```
git add packages/shared apps/api/package.json apps/web/package.json pnpm-lock.yaml apps/api/src/config/env.config.ts .env.example
git commit -m "feat(shared): phase 3 asset schemas + qrcode/html5-qrcode deps + PUBLIC_SCAN_BASE env"
```

---

## Task 2: AssetsService (CRUD + multi-tenancy + delete guard + QR)

**Files:**
- Create: `apps/api/src/assets/assets.service.ts`

- [ ] **Step 1: Write the service**
```typescript
import { randomBytes } from "node:crypto";
import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as QRCode from "qrcode";
import type { AssetFilters, AssetResponse, CreateAssetRequest, UpdateAssetRequest } from "@iam/shared";
import { PrismaService } from "../prisma";

/** Opaque, URL-safe, scan-stable token (192 bits of entropy). */
function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // --- CRUD ---------------------------------------------------------------

  async list(companyId: string, filters: AssetFilters): Promise<AssetResponse[]> {
    return this.prisma.getClient().asset.findMany({
      where: {
        companyId,
        name: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
        status: filters.status,
        locationId: filters.locationId,
        categoryId: filters.categoryId,
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });
  }

  async get(id: string, companyId: string): Promise<AssetResponse> {
    const asset = await this.prisma.getClient().asset.findFirst({ where: { id, companyId } });
    if (!asset) throw new NotFoundException();
    return asset;
  }

  async create(input: CreateAssetRequest, companyId: string): Promise<AssetResponse> {
    await this.validateFks(input.locationId, input.categoryId, companyId);
    // Generate an opaque token; on the astronomically-unlikely P2002, retry once.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.prisma.getClient().asset.create({
          data: { ...input, qrCode: generateQrToken(), companyId },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002" && attempt === 0) continue; // qrCode collision — retry
        throw err;
      }
    }
    throw new Error("Unreachable: qrCode generation failed twice");
  }

  async update(id: string, input: UpdateAssetRequest, companyId: string): Promise<AssetResponse> {
    const existing = await this.get(id, companyId);
    // qrCode is read-only: never accept it from the client. (Update schema already omits it.)
    if (input.locationId || input.categoryId) {
      await this.validateFks(
        input.locationId ?? existing.locationId,
        input.categoryId ?? existing.categoryId,
        companyId,
      );
    }
    return this.prisma.getClient().asset.update({ where: { id }, data: input });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    const [workOrders, inspections] = await Promise.all([
      this.prisma.getClient().workOrder.count({ where: { assetId: id, companyId } }),
      this.prisma.getClient().inspection.count({ where: { assetId: id, companyId } }),
    ]);
    if (workOrders + inspections > 0) {
      throw new ConflictException("Asset has work orders or inspections");
    }
    await this.prisma.getClient().asset.delete({ where: { id } });
  }

  // --- QR -----------------------------------------------------------------

  /** Returns the raw asset for a scanned token (authed; cross-tenant → 404). */
  async findByQr(token: string, companyId: string): Promise<AssetResponse> {
    const asset = await this.prisma.getClient().asset.findFirst({
      where: { qrCode: token, companyId },
    });
    if (!asset) throw new NotFoundException();
    return asset;
  }

  async rotateQr(id: string, companyId: string): Promise<AssetResponse> {
    await this.get(id, companyId);
    return this.prisma.getClient().asset.update({
      where: { id },
      data: { qrCode: generateQrToken() },
    });
  }

  /** Returns SVG markup encoding the public scan URL for the asset's QR token. */
  async getQrSvg(id: string, companyId: string): Promise<string> {
    const asset = await this.get(id, companyId);
    const base = this.config.get<string>("PUBLIC_SCAN_BASE") ?? "http://localhost:3000";
    const payload = `${base}/assets/qr/${asset.qrCode}`;
    return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M" });
  }

  // --- helpers ------------------------------------------------------------

  /** locationId and categoryId must belong to the caller's company. */
  private async validateFks(locationId: string, categoryId: string, companyId: string): Promise<void> {
    const [loc, cat] = await Promise.all([
      this.prisma.getClient().location.findFirst({ where: { id: locationId, companyId } }),
      this.prisma.getClient().category.findFirst({ where: { id: categoryId, companyId } }),
    ]);
    if (!loc || !cat) {
      throw new BadRequestException("Invalid location or category for this company");
    }
  }
}
```

- [ ] **Step 2: Typecheck**
```
pnpm --filter @iam/api typecheck
```
Expected: exits 0.

- [ ] **Step 3: Commit**
```
git add apps/api/src/assets/assets.service.ts
git commit -m "feat(api): AssetsService (CRUD, multi-tenant, delete guard, opaque QR + scan + rotate)"
```

---

## Task 3: AssetsController + module + wire AppModule

**Files:**
- Create: `apps/api/src/assets/assets.controller.ts`
- Create: `apps/api/src/assets/assets.module.ts`
- Create: `apps/api/src/assets/assets.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the controller**
```typescript
import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AssetFilters, AssetResponse, CreateAssetRequest, UpdateAssetRequest } from "@iam/shared";
import { assetFiltersSchema, createAssetRequestSchema, updateAssetRequestSchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AssetsService } from "./assets.service";

@Controller("assets")
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@CurrentUser() user: { companyId: string }, @Query(new ZodValidationPipe(assetFiltersSchema)) q: AssetFilters) {
    return this.assets.list(user.companyId, q);
  }

  @Get("qr/:token")
  scan(@CurrentUser() user: { companyId: string }, @Param("token") token: string): Promise<AssetResponse> {
    // scan is open to any authenticated user (everyday action for technicians)
    return this.assets.findByQr(token, user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: { companyId: string }, @Param("id") id: string) {
    return this.assets.get(id, user.companyId);
  }

  @Get(":id/qr")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @Header("Content-Type", "image/svg+xml")
  async getQr(@CurrentUser() user: { companyId: string }, @Param("id") id: string, @Res() res: Response) {
    const svg = await this.assets.getQrSvg(id, user.companyId);
    res.send(svg);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: { companyId: string }, @Body(new ZodValidationPipe(createAssetRequestSchema)) body: CreateAssetRequest) {
    return this.assets.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(@CurrentUser() user: { companyId: string }, @Param("id") id: string, @Body(new ZodValidationPipe(updateAssetRequestSchema)) body: UpdateAssetRequest) {
    return this.assets.update(id, body, user.companyId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: { companyId: string }, @Param("id") id: string) {
    await this.assets.remove(id, user.companyId);
  }

  @Post(":id/qr/rotate")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  rotateQr(@CurrentUser() user: { companyId: string }, @Param("id") id: string) {
    return this.assets.rotateQr(id, user.companyId);
  }
}
```

> Note the route ordering: `GET qr/:token` is declared BEFORE `GET :id` so the static `qr` segment isn't captured by the `:id` param. `GET :id/qr` and `POST :id/qr/rotate` are fine after since they have a second segment.

- [ ] **Step 2: Write the module**
```typescript
import { Module } from "@nestjs/common";
import { ConfigModule } from "../config";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [ConfigModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
```
> `AssetsService` injects `ConfigService` (for `PUBLIC_SCAN_BASE`). `ConfigModule` is `@Global()` so the import may be redundant — check the Phase 1a `config.module.ts`; if global, omit the imports line. (If omitted, drop this note in the commit.)

- [ ] **Step 3: Wire `AssetsModule` into `app.module.ts` imports.**

- [ ] **Step 4: Write `assets.service.spec.ts`** (mock PrismaService + ConfigService) covering: list filters by companyId; get 404 cross-tenant; create validates FKs (BadRequestException on foreign-tenant location); create generates a qrCode; delete 409 when workOrders/inspections exist; rotate changes qrCode; findByQr 404 cross-tenant. (7-8 unit tests, mirror Phase 2 service spec style.)

- [ ] **Step 5: Typecheck + test**
```
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api test -- src/assets
```

- [ ] **Step 6: Commit**
```
git add apps/api/src/assets apps/api/src/app.module.ts
git commit -m "feat(api): Assets controller + module (CRUD, QR SVG, scan, rotate) wired into AppModule"
```

---

## Task 4: E2E 10 critical-path tests

**Files:**
- Create: `apps/api/test/assets.e2e.spec.ts`

- [ ] **Step 1: Write the e2e** covering the 10 tests from spec §8. Reuse the `buildApp`/`truncate`/`testPrisma` harness. Helpers: `registerAdmin()`, `seedLocation(prisma, companyId)` + `seedCategory(...)` (reference data needed before an asset can exist), `authHeader(token)`. For the QR-SVG test, assert `res.headers["content-type"]` starts with `image/svg+xml` and the body contains `<svg`. For rotate, capture the old qrCode, rotate, assert the response differs, then `GET /assets/qr/oldToken` → 404 and `GET /assets/qr/newToken` → 200. For delete-guard 409, seed a WorkOrder on the asset. For RBAC, seed a viewer and assert POST → 403 but GET scan → 200.

- [ ] **Step 2: Run**
```
pnpm --filter @iam/api test -- test/assets.e2e.spec.ts
```
Expected: 10 passed.

- [ ] **Step 3: Commit**
```
git commit -m "test(api): phase 3 assets critical-path e2e (10 tests)"
```

---

## Task 5: Frontend — api client + Select primitive

**Files:**
- Create: `apps/web/src/lib/api/assets.ts`
- Create: `apps/web/src/components/select.tsx`

- [ ] **Step 1: `lib/api/assets.ts`** — typed `assetsApi` (list with filters, get, create, update, remove, scan, rotate) + `qrSvgUrl(id)` helper returning the URL to embed as `<img src>` (the SVG endpoint needs the Bearer token, so fetch the bytes via `apiFetch` and create an object URL, or — simpler — since the QR is also viewable to admin/manager only, fetch the SVG text and render via `dangerouslySetInnerHTML` OR render an `<img>` with a token-bearing blob). Simplest correct: a `getQrSvg(id)` that does `apiFetch` and returns the SVG text; `QrCodeDisplay` renders it inline.
- [ ] **Step 2: `components/select.tsx`** — a styled `<select>` + label (mirror `FormField`).
- [ ] **Step 3: Typecheck + build**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
- [ ] **Step 4: Commit**
```
git commit -m "feat(web): assets api client + Select primitive"
```

---

## Task 6: Frontend — /assets list + /assets/new + /assets/[id] + QR display

**Files:**
- Create: `apps/web/src/app/(dashboard)/assets/page.tsx`
- Create: `apps/web/src/app/(dashboard)/assets/new/page.tsx`
- Create: `apps/web/src/app/(dashboard)/assets/[id]/page.tsx`
- Create: `apps/web/src/components/qr-code-display.tsx`

- [ ] **Step 1: `/assets`** — DataTable + filter bar (status Select, location Select populated from `locationsApi.list()`, category Select from `categoriesApi.list()`, search input) + "New asset" link. `useQuery(["assets", filters])`.
- [ ] **Step 2: `/assets/new`** — RHF + Zod form (name, description, serialNumber, locationId Select, categoryId Select, purchase/warranty date inputs). On create → `router.push("/assets/" + id)`.
- [ ] **Step 3: `/assets/[id]`** — detail view (all fields) + `<QrCodeDisplay id={id} />`. Edit inline or via modal (reuse Phase 2 pattern). "Rotate QR" button (admin/manager; `useAuth().user.role`) with confirm dialog.
- [ ] **Step 4: `QrCodeDisplay`** — client component: fetches SVG via `assetsApi.getQrSvg(id)`, renders inline (`<div dangerouslySetInnerHTML>` — the SVG comes from our own trusted api, not user input). "Download SVG" (Blob). "Rotate" button → mutation → invalidate `["asset", id]`.
- [ ] **Step 5: Build**
```
pnpm --filter @iam/web build
```
- [ ] **Step 6: Commit**
```
git commit -m "feat(web): /assets list+filters, /assets/new, /assets/[id] detail + QR display + rotate"
```

---

## Task 7: Frontend — /assets/scan + sidebar links

**Files:**
- Create: `apps/web/src/app/(dashboard)/assets/scan/page.tsx`
- Create: `apps/web/src/components/qr-scanner.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx` (add Assets + Scan QR links)

- [ ] **Step 1: `QrScanner`** — client component wrapping `html5-qrcode`'s `Html5Qrcode`: starts camera on mount, calls `onDecode(text)` on a successful scan, cleans up on unmount. The scanned text is the full scan URL (`${PUBLIC_SCAN_BASE}/assets/qr/:token`) — extract the trailing token.
- [ ] **Step 2: `/assets/scan`** — renders `<QrScanner onDecode={...} />`: on decode, `assetsApi.scan(token)` → success → `router.push('/assets/' + id)`; 404 → toast/inline "Unknown QR code". Suspense-wrap if it uses `useSearchParams`.
- [ ] **Step 3: Sidebar** — add "Assets" (`/assets`) and "Scan QR" (`/assets/scan`) links (before Users).
- [ ] **Step 4: Build**
```
pnpm --filter @iam/web build
```
- [ ] **Step 5: Commit**
```
git commit -m "feat(web): /assets/scan camera scanner (html5-qrcode) + sidebar links"
```

---

## Task 8: Verification gate + docs + commit + push

- [ ] **Step 1: Full gate**
```
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.yml up -d redis
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: all green. `pnpm test` = api (Phase 1+2 + Phase 3) + shared + web.

- [ ] **Step 2: Manual smoke** (two terminals: `pnpm --filter @iam/api dev` + `pnpm --filter @iam/web dev`)
  1. Register → dashboard. Sidebar has Assets + Scan QR.
  2. Create a location + category, then create an asset → detail shows a QR.
  3. Download the QR SVG; rotate it; confirm the QR image changed.
  4. Go to /assets/scan (needs camera; if no camera in the env, skip and note).
  5. As viewer, attempt create → 403; scan (if possible) → allowed.
  Record results in DEVELOPMENT_LOG.

- [ ] **Step 3: DEVELOPMENT_LOG.md** — append "## 2026-06-20 — Phase 3: Assets + QR Codes": done, decisions (opaque token, base64url, RBAC split, delete guard), verified outputs, next (Phase 4).

- [ ] **Step 4: `docs/progress.md`** — mark Phase 3 ✅; check its critical-path line (add a Phase 3 bullet if the template has per-phase lines).

- [ ] **Step 5: Commit + push**
```
git add DEVELOPMENT_LOG.md docs/progress.md
git commit -m "docs: phase 3 assets + QR codes (dev log, progress)"
git push -u origin feat/phase-3-assets-qr
```

---

## Verification Gate (Phase 3)

- [ ] `pnpm lint` — pass (all workspaces)
- [ ] `pnpm typecheck` — pass (all workspaces)
- [ ] `pnpm test` — pass (api incl. 10 Phase 3 critical-path e2e; shared; web)
- [ ] `pnpm build` — both apps build
- [ ] Manual: create asset → see QR → rotate → scan (if camera) → RBAC enforced
- [ ] CI green on `main`

If any step fails, fix it in this phase before reporting completion.
