# Phase 2: Reference Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD for locations, categories, and users within a company, plus a force-change-password flow for admin-created users — all multi-tenant scoped, with critical-path tests on real PostgreSQL.

**Architecture:** Each domain module (locations/categories/users) is a NestJS module with controller + service, scoped to the caller's `companyId` (from `@CurrentUser()`). Reuse `JwtAuthGuard`, `RolesGuard`, `@Roles()`, the per-route `ZodValidationPipe`, and the shared Zod schemas from `@iam/shared`. A new `User.mustChangePassword` field gates first-login; `POST /auth/change-password` clears it. Frontend adds a sidebar + 3 dashboard pages + `/change-password`, reusing the Phase 1b store/apiClient/Button/FormField.

**Tech Stack:** NestJS 11, Prisma 7, Zod, Vitest (api); Next.js 16 App Router, TanStack Query v5, React Hook Form (web); shared `@iam/shared` Zod schemas as SSoT.

**Spec:** `docs/superpowers/specs/2026-06-19-phase-2-reference-data-design.md`

---

## File Structure (created/modified this phase)

```
apps/api/
├── prisma/
│   ├── schema.prisma                                  add User.mustChangePassword
│   └── migrations/<ts>_add_user_must_change_password/ generated
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts                         + POST /auth/change-password
│   │   ├── auth.service.ts                            + changePassword(); login force-change gate
│   │   └── auth.service.spec.ts                       + force-change tests
│   ├── app.module.ts                                  import Locations/Categories/Users modules
│   ├── locations/
│   │   ├── locations.module.ts
│   │   ├── locations.controller.ts
│   │   ├── locations.service.ts
│   │   └── locations.controller.spec.ts
│   ├── categories/  (mirrors locations)
│   └── users/
│       ├── users.module.ts
│       ├── users.controller.ts
│       ├── users.service.ts
│       └── users.controller.spec.ts
└── test/
    └── reference.e2e.spec.ts                          10 critical-path tests
apps/web/
├── src/
│   ├── app/(dashboard)/
│   │   ├── layout.tsx                                 + <AppSidebar />
│   │   ├── locations/page.tsx
│   │   ├── categories/page.tsx
│   │   └── users/page.tsx
│   ├── app/(auth)/change-password/page.tsx            NEW
│   ├── components/
│   │   ├── app-sidebar.tsx                            NEW
│   │   ├── data-table.tsx                             NEW (plain table + Tailwind)
│   │   └── modal.tsx                                  NEW (dialog element)
│   └── lib/api/
│       ├── reference.ts                               NEW (locations/categories/users calls)
│       └── auth.ts                                    + changePasswordApi
packages/shared/src/
├── reference.ts                                       NEW schemas
├── auth.ts                                            extend userResponseSchema (+mustChangePassword)
└── index.ts                                           re-export reference
```

---

## Task 1: Shared Zod schemas + `User.mustChangePassword`

**Files:**
- Create: `packages/shared/src/reference.ts`
- Modify: `packages/shared/src/auth.ts` (extend `userResponseSchema`)
- Modify: `packages/shared/src/index.ts` (re-export)
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

- [ ] **Step 1: Write `packages/shared/src/reference.ts`**
```typescript
import { z } from "zod";
import { passwordSchema, userRoleSchema } from "./auth";

/** Common list query: search + page + limit (capped). */
export const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const locationRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
export type LocationRequest = z.infer<typeof locationRequestSchema>;

export const categoryRequestSchema = locationRequestSchema;
export type CategoryRequest = z.infer<typeof categoryRequestSchema>;

export const locationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  companyId: z.string().uuid(),
});
export type LocationResponse = z.infer<typeof locationResponseSchema>;
export const categoryResponseSchema = locationResponseSchema;
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

export const createUserRequestSchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: userRoleSchema,
  password: passwordSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const changeRoleRequestSchema = z.object({ role: userRoleSchema });
export type ChangeRoleRequest = z.infer<typeof changeRoleRequestSchema>;

export const changePasswordRequestSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
```

- [ ] **Step 2: Extend `userResponseSchema` in `packages/shared/src/auth.ts`**

Add `mustChangePassword: z.boolean()` to `userResponseSchema`. (The `AuthResponse.user` embeds it, so the store + `/me` carry it.)

- [ ] **Step 3: Re-export in `packages/shared/src/index.ts`**
```typescript
export * from "./health";
export * from "./auth";
export * from "./reference";
```

- [ ] **Step 4: Add `mustChangePassword` to Prisma schema**

In `apps/api/prisma/schema.prisma`, `model User`:
```prisma
  role           UserRole @default(viewer)
  mustChangePassword Boolean @default(false)
  companyId      String
```

- [ ] **Step 5: Create the migration**
```
DATABASE_URL="postgresql://iam:iam@localhost:5433/iam_test?schema=public" \
  pnpm --filter @iam/api exec prisma migrate dev --name add_user_must_change_password --schema prisma/schema.prisma
pnpm --filter @iam/api exec prisma generate --schema prisma/schema.prisma
```
Expected: migration `..._add_user_must_change_password/migration.sql` with `ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;`.

- [ ] **Step 6: Typecheck + shared tests**
```
pnpm --filter @iam/shared typecheck
pnpm --filter @iam/shared test
pnpm --filter @iam/api typecheck
```
Expected: all green. (Existing Phase 1 tests that assert `userResponseSchema` shape will need the new field if they compare full objects — update them.)

- [ ] **Step 7: Commit**
```
git add packages/shared apps/api/prisma
git commit -m "feat(shared): phase 2 reference schemas + User.mustChangePassword field"
```

---

## Task 2: `AuthService` force-change gate + `changePassword`

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Add `mustChangePassword` gate to `login`**

In `AuthService.login`, after `bcrypt.compare` succeeds and before `issuePair`, check the flag:
```typescript
if (user.mustChangePassword) {
  throw new ForbiddenException({ code: "MUST_CHANGE_PASSWORD" });
}
```
Import `ForbiddenException` from `@nestjs/common`.

- [ ] **Step 2: Add `changePassword` to `AuthService`**
```typescript
async changePassword(input: ChangePasswordRequest): Promise<AuthResponse> {
  const user = await this.prisma.getClient().user.findUnique({
    where: { email: input.email },
  });
  if (!user) throw new UnauthorizedException("Invalid credentials");
  const ok = await bcrypt.compare(input.currentPassword, user.password);
  if (!ok) throw new UnauthorizedException("Invalid credentials");
  const password = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  const updated = await this.prisma.getClient().user.update({
    where: { id: user.id },
    data: { password, mustChangePassword: false },
  });
  const userResponse = this.toUserResponse(updated);
  const pair = await this.tokens.issuePair({
    userId: updated.id, companyId: updated.companyId, role: updated.role,
  });
  return { ...pair, user: userResponse };
}
```
`ChangePasswordRequest` + `AuthResponse` imported from `@iam/shared`. `newPassword` is already validated by the shared `passwordSchema` via the controller pipe, so no extra check needed.

- [ ] **Step 3: Wire `POST /auth/change-password` in `auth.controller.ts`**
```typescript
@Post("change-password")
@HttpCode(HttpStatus.OK)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
changePassword(@Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest) {
  return this.auth.changePassword(body);
}
```
Imports: `ChangePasswordRequest`, `changePasswordRequestSchema` from `@iam/shared`.

- [ ] **Step 4: Update `auth.service.spec.ts`**

Add tests:
- `login` of a `mustChangePassword=true` user → rejects with `ForbiddenException` (and does NOT return tokens). Seed such a user directly via prisma.
- `changePassword` with correct current → clears flag, returns `AuthResponse` with `user.mustChangePassword === false`.
- `changePassword` with wrong current → `UnauthorizedException`.
- `changePassword` reuses the existing duplicate of `passwordSchema` enforcement implicitly (controller pipe handles 400; unit test the service path only).

- [ ] **Step 5: Run tests**
```
pnpm --filter @iam/api test -- src/auth/auth.service.spec.ts
```
Expected: green (existing + new).

- [ ] **Step 6: Commit**
```
git add apps/api/src/auth
git commit -m "feat(api): force-change-password gate on login + POST /auth/change-password"
```

---

## Task 3: `LocationsModule` (CRUD + multi-tenancy + delete guard)

**Files:**
- Create: `apps/api/src/locations/locations.module.ts`
- Create: `apps/api/src/locations/locations.controller.ts`
- Create: `apps/api/src/locations/locations.service.ts`
- Create: `apps/api/src/locations/locations.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import)

- [ ] **Step 1: Write `locations.service.ts`**
```typescript
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { LocationRequest, LocationResponse } from "@iam/shared";
import { PrismaService } from "../prisma";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, search?: string): Promise<LocationResponse[]> {
    return this.prisma.getClient().location.findMany({
      where: { companyId, name: search ? { contains: search, mode: "insensitive" } : undefined },
      orderBy: { name: "asc" },
    });
  }

  async get(id: string, companyId: string): Promise<LocationResponse> {
    const loc = await this.prisma.getClient().location.findFirst({ where: { id, companyId } });
    if (!loc) throw new NotFoundException();
    return loc;
  }

  create(input: LocationRequest, companyId: string): Promise<LocationResponse> {
    return this.prisma.getClient().location.create({ data: { ...input, companyId } });
  }

  async update(id: string, input: LocationRequest, companyId: string): Promise<LocationResponse> {
    await this.get(id, companyId); // 404 if missing/other tenant
    return this.prisma.getClient().location.update({ where: { id }, data: input });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    const assets = await this.prisma.getClient().asset.count({ where: { locationId: id, companyId } });
    if (assets > 0) throw new ConflictException("Location has assets; remove them first");
    await this.prisma.getClient().location.delete({ where: { id } });
  }
}
```

- [ ] **Step 2: Write `locations.controller.ts`**
```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { JwtPayload, LocationRequest } from "@iam/shared";
import { locationRequestSchema, listQuerySchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { LocationsService } from "./locations.service";

@Controller("locations")
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query(new ZodValidationPipe(listQuerySchema)) q: { search?: string }) {
    return this.locations.list(user.companyId, q.search);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.locations.get(id, user.companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  create(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(locationRequestSchema)) body: LocationRequest) {
    return this.locations.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body(new ZodValidationPipe(locationRequestSchema)) body: LocationRequest) {
    return this.locations.update(id, body, user.companyId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.locations.remove(id, user.companyId);
  }
}
```
Imports `HttpCode, HttpStatus` from `@nestjs/common`.

- [ ] **Step 3: Write `locations.module.ts`**
```typescript
import { Module } from "@nestjs/common";
import { LocationsController } from "./locations.controller";
import { LocationsService } from "./locations.service";

@Module({ controllers: [LocationsController], providers: [LocationsService] })
export class LocationsModule {}
```

- [ ] **Step 4: Import in `app.module.ts`** — add `LocationsModule` to imports.

- [ ] **Step 5: Write `locations.controller.spec.ts`** — unit test the service with a mock PrismaService (list scoped, get 404 cross-tenant, create, update, remove 409 when assets>0). Mirror the style of `auth.service.spec.ts`.

- [ ] **Step 6: Typecheck + test**
```
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api test -- src/locations
```

- [ ] **Step 7: Commit**
```
git add apps/api/src/locations apps/api/src/app.module.ts
git commit -m "feat(api): Locations module (CRUD, multi-tenant, delete guard)"
```

---

## Task 4: `CategoriesModule` (mirror of Locations)

**Files:** same structure under `apps/api/src/categories/`.

- [ ] **Step 1–6:** Identical to Task 3, substituting `Location→Category`, `locationRequestSchema→categoryRequestSchema`, delete guard counts `asset` by `categoryId`. Import `CategoriesModule` in `app.module.ts`.

- [ ] **Step 7: Commit**
```
git commit -m "feat(api): Categories module (CRUD, multi-tenant, delete guard)"
```

---

## Task 5: `UsersModule` (list + create + role-change)

**Files:**
- Create: `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write `users.service.ts`**
```typescript
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import type { CreateUserRequest, UserResponse } from "@iam/shared";
import { PrismaService } from "../prisma";

const BCRYPT_ROUNDS = 12;

function toUserResponse(u: { id: string; email: string; firstName: string; lastName: string; role: string; companyId: string; mustChangePassword: boolean }): UserResponse {
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role as UserResponse["role"], companyId: u.companyId, mustChangePassword: u.mustChangePassword };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string): Promise<UserResponse[]> {
    return this.prisma.getClient().user.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    }).then((us) => us.map(toUserResponse));
  }

  async create(input: CreateUserRequest, companyId: string): Promise<UserResponse> {
    const password = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const u = await this.prisma.getClient().user.create({
        data: { email: input.email, password, firstName: input.firstName, lastName: input.lastName, role: input.role, mustChangePassword: true, companyId },
      });
      return toUserResponse(u);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Email already registered");
      }
      throw err;
    }
  }

  async changeRole(id: string, role: UserResponse["role"], companyId: string): Promise<UserResponse> {
    const u = await this.prisma.getClient().user.findFirst({ where: { id, companyId } });
    if (!u) throw new NotFoundException();
    const updated = await this.prisma.getClient().user.update({ where: { id }, data: { role } });
    return toUserResponse(updated);
  }
}
```

- [ ] **Step 2: Write `users.controller.ts`**
```typescript
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "manager")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) { return this.users.list(user.companyId); }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(createUserRequestSchema)) body: CreateUserRequest) {
    return this.users.create(body, user.companyId);
  }

  @Patch(":id/role")
  @Roles("admin")
  changeRole(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body(new ZodValidationPipe(changeRoleRequestSchema)) body: ChangeRoleRequest) {
    return this.users.changeRole(id, body.role, user.companyId);
  }
}
```
(Imports as usual. Class-level `@Roles("admin","manager")` gates the whole controller; the role-change route narrows to `@Roles("admin")`.)

- [ ] **Step 3: Write `users.module.ts`** + import in `app.module.ts`.

- [ ] **Step 4: Write `users.controller.spec.ts`** — create sets `mustChangePassword=true` and omits password; duplicate email → ConflictException (mock Prisma throwing P2002); changeRole 404 cross-tenant.

- [ ] **Step 5: Typecheck + test**
```
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api test -- src/users
```

- [ ] **Step 6: Commit**
```
git commit -m "feat(api): Users module (list, create w/ temp password, role-change)"
```

---

## Task 6: E2E critical-path tests (the 10 from spec §8)

**Files:**
- Create: `apps/api/test/reference.e2e.spec.ts`

- [ ] **Step 1: Write the e2e spec** covering all 10 tests from spec §8. Reuse the `buildApp`/`truncate`/`testPrisma` harness from `auth.e2e.spec.ts`. Helpers:
  - `registerAdmin()` — POST /auth/register, returns `{ accessToken, user }`.
  - `createViewer(prisma, companyId)` — seed a viewer directly with a bcrypt-hashed password (for RBAC test #9).
  - `login(email, password)` — POST /auth/login.
  - `authHeader(token)` — `{ Authorization: \`Bearer ${token}\` }`.

  Tests (1:1 with spec §8 table): location CRUD scoped; cross-tenant location 404; delete location 409 (seed an asset); category mirror; manager creates user (mustChangePassword=true, no password in body); duplicate email 409; force-change flow (403 → change-password → 200 tokens); role-change admin ok / manager 403; viewer POST /locations 403; change-password weak new → 400.

  For cross-tenant: register a second company+admin, create a location in company A, then GET it with company B's token → 404.

- [ ] **Step 2: Run**
```
pnpm --filter @iam/api test -- test/reference.e2e.spec.ts
```
Expected: 10 passed.

- [ ] **Step 3: Commit**
```
git commit -m "test(api): phase 2 reference-data critical-path e2e (10 tests)"
```

---

## Task 7: Frontend — shared api calls + sidebar + DataTable/Modal

**Files:**
- Create: `apps/web/src/lib/api/reference.ts`
- Modify: `apps/web/src/lib/api/auth.ts` (+ `changePasswordApi`)
- Create: `apps/web/src/components/app-sidebar.tsx`
- Create: `apps/web/src/components/data-table.tsx`
- Create: `apps/web/src/components/modal.tsx`
- Modify: `apps/web/src/app/(dashboard)/layout.tsx` (render sidebar)
- Create: `apps/web/src/app/(auth)/change-password/page.tsx`

- [ ] **Step 1: `lib/api/reference.ts`** — typed `locationsApi`/`categoriesApi`/`usersApi` (list/create/update/remove/changeRole) using `apiJson` (the 401-retry wrapper). Mirror `lib/api/auth.ts` style.
- [ ] **Step 2: `lib/api/auth.ts`** — add `changePasswordApi(input)` (POST /auth/change-password).
- [ ] **Step 3: `components/data-table.tsx`** — generic `<DataTable columns rows />` (plain `<table>` + Tailwind, sorting optional). Keep tiny.
- [ ] **Step 4: `components/modal.tsx`** — `<Modal open onClose>` wrapping `<dialog>`.
- [ ] **Step 5: `components/app-sidebar.tsx`** — nav links (Dashboard, Locations, Categories, Users). Client component; hide Users link when `user.role !== "admin"` (cosmetic — backend enforces).
- [ ] **Step 6: `(dashboard)/layout.tsx`** — render `<AppSidebar />` beside `{children}` in a flex row.
- [ ] **Step 7: `(auth)/change-password/page.tsx`** — form (email prefilled from `?email=`, currentPassword, newPassword); on success `setAuth` + redirect `/dashboard`. On 401 show "wrong current password".
- [ ] **Step 8: Wire force-change in `AuthForm`** — if login mutation rejects with status 403 and body `code === "MUST_CHANGE_PASSWORD"`, `router.push('/change-password?email=...')`.
- [ ] **Step 9: Typecheck + build**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
- [ ] **Step 10: Commit**
```
git commit -m "feat(web): reference-data api client, sidebar, DataTable/Modal, /change-password"
```

---

## Task 8: Frontend — locations/categories/users pages

**Files:**
- Create: `apps/web/src/app/(dashboard)/locations/page.tsx`
- Create: `apps/web/src/app/(dashboard)/categories/page.tsx`
- Create: `apps/web/src/app/(dashboard)/users/page.tsx`

- [ ] **Step 1: `locations/page.tsx`** — client component: `useQuery(['locations'])` list in `<DataTable>`; "New" button opens `<Modal>` with RHF form (name, description); edit inline or modal; delete with confirm, surfacing 409 as "Has assets; remove them first." Reuse `Button`/`FormField`.
- [ ] **Step 2: `categories/page.tsx`** — mirror of locations.
- [ ] **Step 3: `users/page.tsx`** — list (no password column); "New user" modal (email, firstName, lastName, role select, password); per-row role-change dropdown. Non-admin → `redirect('/dashboard')` (server check on the page or client guard).
- [ ] **Step 4: Build**
```
pnpm --filter @iam/web build
```
Expected: `/locations`, `/categories`, `/users`, `/change-password` routes emitted.
- [ ] **Step 5: Commit**
```
git commit -m "feat(web): locations/categories/users dashboard pages"
```

---

## Task 9: Verification gate + docs + commit + push

- [ ] **Step 1: Full gate**
```
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.yml up -d redis
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: all green. `pnpm test` = api (Phase 1 + Phase 2: 50 + new) + shared + web.

- [ ] **Step 2: Manual smoke** (two terminals: `pnpm --filter @iam/api dev` + `pnpm --filter @iam/web dev`)
  1. Register → dashboard. Sidebar shows Locations/Categories/Users.
  2. Create a location + a category via UI; they appear in the list.
  3. Create a user (viewer) → log out → log in as viewer → 403 MUST_CHANGE_PASSWORD → /change-password → set new password → dashboard.
  4. As viewer, /locations visible; "New" hidden/403.
  5. As admin, change a user's role.
  Record results in DEVELOPMENT_LOG.

- [ ] **Step 3: ADR 0003** — `docs/adr/0003-temp-password-force-change.md`: context (no SMTP in Phase 2), decision (temp password + force-change + 403 gate), consequences (admin never knows final password; change-password is a second password-verify surface → throttled).

- [ ] **Step 4: DEVELOPMENT_LOG.md** — append "## 2026-06-19 — Phase 2: Reference Data": done, decisions, verified outputs, next (Phase 3).

- [ ] **Step 5: `docs/progress.md`** — mark Phase 2 ✅; check its critical-path line.

- [ ] **Step 6: Commit + push**
```
git add docs .
git commit -m "docs: phase 2 reference data (ADR 0003, dev log, progress)"
git push -u origin feat/phase-2-reference-data
```

---

## Verification Gate (Phase 2)

- [ ] `pnpm lint` — pass (all workspaces)
- [ ] `pnpm typecheck` — pass (all workspaces)
- [ ] `pnpm test` — pass (api incl. 10 Phase 2 critical-path e2e; shared; web)
- [ ] `pnpm build` — both apps build
- [ ] Manual browser flow: register → create location/category → create user → force-change → role-change → RBAC enforced
- [ ] CI green on `main`

If any step fails, fix it in this phase before reporting completion.
