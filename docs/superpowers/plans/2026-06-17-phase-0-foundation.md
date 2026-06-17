# Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working monorepo skeleton where `docker-compose up` starts PostgreSQL + Redis, `apps/web` (Next.js) and `apps/api` (NestJS) both respond, CI runs lint+typecheck, and a GitHub repo exists with auto-push wired.

**Architecture:** pnpm workspaces monorepo orchestrated by Turborepo. Three workspaces: `apps/web` (Next.js 16 App Router), `apps/api` (NestJS 11), `packages/shared` (Zod schemas = single source of types). Docker Compose provides PostgreSQL 16 and Redis 7 for dev; a second compose file provides an isolated Postgres for tests.

**Tech Stack:** Node.js 22 LTS, pnpm 10, Turborepo, Next.js 16.2, NestJS 11.1, Prisma 7.8, Tailwind v4, shadcn/ui, Zod, PostgreSQL 16, Redis 7, Docker, GitHub Actions. (See ADR 0001 for version rationale.)

**Reference spec:** `docs/superpowers/specs/2026-06-17-execution-process-design.md`

---

## File Structure (created/modified in this phase)

```
industrial-asset-maintenance-saas/
├── .github/workflows/ci.yml              # CI: install, lint, typecheck, build
├── .gitignore                            # already exists; verify/extend
├── .nvmrc                                # Node version pin
├── DEVELOPMENT_LOG.md                    # chronological journal (start here)
├── PROJECT_PLAN.md                       # already exists; carried into repo
├── README.md                             # Quick Start + status
├── docker-compose.yml                    # postgres + redis (dev)
├── docker-compose.test.yml               # isolated postgres on :5433
├── package.json                          # root: workspaces, turbo, scripts
├── pnpm-workspace.yaml                   # workspace globs
├── turbo.json                            # task pipeline
├── .env.example                          # all env vars, documented
├── apps/
│   ├── web/                              # Next.js 16
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── postcss.config.mjs            # Tailwind v4 uses @tailwindcss/postcss
│   │   ├── src/app/layout.tsx
│   │   ├── src/app/page.tsx              # smoke-test landing
│   │   └── src/app/globals.css           # @import "tailwindcss"; @theme {}
│   └── api/                              # NestJS 11
│       ├── package.json
│       ├── nest-cli.json
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       ├── src/main.ts                   # bootstrap, CORS, Pino, /health
│       ├── src/app.module.ts
│       ├── src/app.controller.ts         # GET /health -> { status: "ok" }
│       └── src/app.controller.spec.ts    # unit test for /health
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        ├── src/index.ts                  # re-exports
        └── src/health.ts                 # trivial shared type to prove wiring
```

---

## Task 1: Verify toolchain prerequisites

**Files:**
- Create: `.nvmrc`

- [ ] **Step 1: Check Node, pnpm, Docker, git, gh**

Run (in cmd or PowerShell):
```
node -v
pnpm -v
docker --version
git --version
gh --version
```
Expected: Node `v22.x.x`, pnpm `10.x.x`, Docker `28.x.x` (any recent), git `2.4x`, gh `2.6x`.
If any are missing or below: install before continuing.
- Node 22 LTS: https://nodejs.org/
- pnpm: `npm install -g pnpm@10`
- Docker Desktop: already confirmed present
- gh CLI: https://cli.github.com/

- [ ] **Step 2: Pin Node version**

Create `.nvmrc`:
```
22
```

- [ ] **Step 3: Commit**
```
git add .nvmrc
git commit -m "chore: pin node 22 via .nvmrc"
```

---

## Task 2: Root monorepo configuration

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Modify: `.gitignore` (verify it covers `node_modules`, `.next`, `dist`, `.turbo`, `.env`)

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "industrial-asset-maintenance-saas",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write \"**/*.{ts,tsx,md,json,yml}\""
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "prettier": "^3.4.0",
    "prettier-plugin-tailwindcss": "^0.6.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 4: Verify `.gitignore`** covers at least: `node_modules/`, `dist/`, `.next/`, `.turbo/`, `*.log`, `.env`, `.env.local`, `coverage/`. (It does, from the prior commit — re-read to confirm.)

- [ ] **Step 5: Commit**
```
git add package.json pnpm-workspace.yaml turbo.json .gitignore
git commit -m "chore: configure pnpm workspaces + turborepo root"
```

---

## Task 3: `packages/shared` (single source of truth for types)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/health.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@iam/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^3.24.0" },
  "devDependencies": { "typescript": "^5.7.0" }
}
```

> Note: no build step yet — both apps import `src/index.ts` directly via TS paths. A proper build (`tsup`) is added in Phase 1 if needed for prod.

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `packages/shared/src/health.ts`**

```typescript
import { z } from "zod";

/** Shared health-check response shape, used by both apps to prove wiring. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
```

- [ ] **Step 4: Write `packages/shared/src/index.ts`**

```typescript
export * from "./health";
```

- [ ] **Step 5: Typecheck**
```
pnpm --filter @iam/shared typecheck
```
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**
```
git add packages/shared
git commit -m "feat(shared): add zod-based shared types package"
```

---

## Task 4: `apps/api` (NestJS 11 skeleton)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/app.controller.ts`
- Create: `apps/api/src/app.controller.spec.ts`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@iam/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.1.0",
    "@nestjs/platform-express": "^11.1.0",
    "nestjs-pino": "^4.1.0",
    "pino-http": "^10.3.0",
    "pino-pretty": "^11.3.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.1.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.1.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "supertest": "^7.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@iam/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "**/*.spec.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "tsConfigPath": "tsconfig.build.json" }
}
```

- [ ] **Step 5: Write the failing test `apps/api/src/app.controller.spec.ts`**

```typescript
import { Test } from "@nestjs/testing";
import { describe, it, expect } from "vitest";
import { AppController } from "./app.controller";

describe("AppController /health", () => {
  it("returns { status: 'ok', timestamp: <iso> }", () => {
    const before = Date.now();
    return Test.createTestingModule({ controllers: [AppController] })
      .compile()
      .then((moduleRef) => {
        const controller = moduleRef.get(AppController);
        const result = controller.health();
        expect(result.status).toBe("ok");
        const parsed = Date.parse(result.timestamp);
        expect(Number.isNaN(parsed)).toBe(false);
        expect(parsed).toBeGreaterThanOrEqual(before);
      });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```
pnpm --filter @iam/api test
```
Expected: FAIL with "Cannot find module './app.controller'" (file doesn't exist yet).

- [ ] **Step 7: Write `apps/api/src/app.controller.ts`**

```typescript
import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@iam/shared";

@Controller()
export class AppController {
  @Get("health")
  health(): HealthResponse {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

```
pnpm --filter @iam/api test
```
Expected: 1 passed.

- [ ] **Step 9: Write `apps/api/src/app.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";

@Module({ controllers: [AppController] })
export class AppModule {}
```

- [ ] **Step 10: Write `apps/api/src/main.ts`**

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
```

> Pino logger wiring is referenced but the PinoModule import is intentionally
> minimal here; full structured logging config arrives in Phase 1. This bootstrap
> is enough to start and serve `/health`. If `app.get(Logger)` throws because
> PinoModule isn't registered, replace with `app.useLogger(["log", "error"])`
> for Phase 0 and file an ADR note. (Verification step below catches this.)

- [ ] **Step 11: Install deps and typecheck**

```
pnpm install
pnpm --filter @iam/api typecheck
```
Expected: installs cleanly; typecheck exits 0.

- [ ] **Step 12: Smoke-run the server**

In one terminal:
```
pnpm --filter @iam/api dev
```
In another (or via curl):
```
curl http://localhost:4000/health
```
Expected: `{"status":"ok","timestamp":"2026-06-17T..."}`.
If Pino wiring errors, apply the fallback from Step 10 and re-run.

- [ ] **Step 13: Commit**
```
git add apps/api
git commit -m "feat(api): nestjs 11 skeleton with /health endpoint (TDD)"
```

---

## Task 5: `apps/web` (Next.js 16 skeleton + Tailwind v4)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@iam/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.2.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@iam/shared": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.17.0",
    "eslint-config-next": "^16.2.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@iam/shared"],
};

export default config;
```

- [ ] **Step 4: Write `apps/web/postcss.config.mjs`** (Tailwind v4)

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

- [ ] **Step 5: Write `apps/web/src/app/globals.css`** (Tailwind v4 CSS config)

```css
@import "tailwindcss";

@theme {
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
}
```

- [ ] **Step 6: Write `apps/web/src/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Industrial Asset & Maintenance SaaS",
  description: "B2B SaaS for industrial equipment, maintenance, and inspections.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write `apps/web/src/app/page.tsx`** (proves shared-types wiring + Tailwind)

```typescript
import type { HealthResponse } from "@iam/shared";

export default function HomePage() {
  const probe: HealthResponse = { status: "ok", timestamp: new Date().toISOString() };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Industrial Asset &amp; Maintenance SaaS</h1>
      <p className="text-sm text-neutral-600">Phase 0 — foundation skeleton is up.</p>
      <pre className="rounded bg-neutral-100 p-3 text-xs">
        {JSON.stringify(probe, null, 2)}
      </pre>
    </main>
  );
}
```

- [ ] **Step 8: Install + typecheck + build**

```
pnpm install
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
Expected: typecheck exits 0; `next build` succeeds.

- [ ] **Step 9: Smoke-run**

```
pnpm --filter @iam/web dev
```
Open http://localhost:3000. Expected: page renders with heading, subtitle, and a JSON block.

- [ ] **Step 10: Commit**
```
git add apps/web
git commit -m "feat(web): next.js 16 + tailwind v4 skeleton (shared types wired)"
```

---

## Task 6: Docker Compose (PostgreSQL + Redis) and env validation

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.test.yml`
- Create: `.env.example`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: iam-postgres
    environment:
      POSTGRES_USER: iam
      POSTGRES_PASSWORD: iam
      POSTGRES_DB: iam_dev
    ports:
      - "5432:5432"
    volumes:
      - iam_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iam -d iam_dev"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: iam-redis
    ports:
      - "6379:6379"
    volumes:
      - iam_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  iam_pgdata:
  iam_redis:
```

- [ ] **Step 2: Write `docker-compose.test.yml`**

```yaml
# Isolated Postgres on port 5433 for integration tests.
# Started by CI and locally with: docker compose -f docker-compose.test.yml up -d
services:
  postgres-test:
    image: postgres:16-alpine
    container_name: iam-postgres-test
    environment:
      POSTGRES_USER: iam
      POSTGRES_PASSWORD: iam
      POSTGRES_DB: iam_test
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iam -d iam_test"]
      interval: 5s
      timeout: 3s
      retries: 10
```

- [ ] **Step 3: Write `.env.example`**

```bash
# --- API ---
PORT=4000
CORS_ORIGIN=http://localhost:3000

# --- Database (dev) ---
DATABASE_URL=postgresql://iam:iam@localhost:5432/iam_dev?schema=public
DATABASE_URL_TEST=postgresql://iam:iam@localhost:5433/iam_test?schema=public

# --- Redis ---
REDIS_URL=redis://localhost:6379

# --- Auth (Phase 1) ---
JWT_SECRET=change-me-in-real-env
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# --- Web ---
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 4: Start services and verify**

```
docker compose up -d
docker compose ps
```
Expected: both `postgres` and `redis` show status `healthy` within ~15s.

```
docker compose exec postgres psql -U iam -d iam_dev -c "SELECT version();"
docker compose exec redis redis-cli ping
```
Expected: Postgres prints `PostgreSQL 16.x ...`; Redis prints `PONG`.

- [ ] **Step 5: Commit**
```
git add docker-compose.yml docker-compose.test.yml .env.example
git commit -m "chore: add docker-compose for postgres+redis and env example"
```

---

## Task 7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: iam
          POSTGRES_PASSWORD: iam
          POSTGRES_DB: iam_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U iam -d iam_test"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      DATABASE_URL_TEST: postgresql://iam:iam@localhost:5432/iam_test?schema=public
      REDIS_URL: redis://localhost:6379

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2: Commit (CI runs on push)**
```
git add .github/workflows/ci.yml
git commit -m "chore(ci): github actions for lint/typecheck/test/build"
```

---

## Task 8: GitHub repository + remote push

**Files:** none (git operations only)

- [ ] **Step 1: Verify gh auth**

```
gh auth status
```
Expected: logged in. If not: `gh auth login` (follow prompts).

- [ ] **Step 2: Create public repo and push**

```
gh repo create industrial-asset-maintenance-saas --public --source=. --remote=origin --push --description "B2B SaaS for industrial asset tracking, maintenance scheduling, QR inspections, and spare-parts inventory. NestJS + Next.js + Prisma + PostgreSQL portfolio project."
```
Expected: repo created at github.com/<you>/industrial-asset-maintenance-saas, all commits pushed.

- [ ] **Step 3: Confirm CI triggered**

Open the repo's Actions tab. Expected: a workflow run starts on the `main` push.

- [ ] **Step 4: Record git identity used** (so future phases auto-push consistently)
```
git config user.name
git config user.email
```
Note the output in DEVELOPMENT_LOG (Task 9).

---

## Task 9: Documentation deliverables

**Files:**
- Create: `README.md`
- Create: `DEVELOPMENT_LOG.md`
- Create: `docs/progress.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Industrial Asset & Maintenance SaaS

B2B SaaS for tracking industrial equipment, scheduling maintenance, managing
spare-parts inventory, and running QR-based inspections. Portfolio project
targeting the Kazakhstan IT job market.

> **Status:** Phase 0 (Foundation) complete. See `docs/progress.md`.

## Stack
Next.js 16, React 19, NestJS 11, Prisma 7, PostgreSQL 16, Redis 7, Tailwind v4,
shadcn/ui, Zod, Turborepo + pnpm workspaces, Vitest, Playwright, Docker, GitHub Actions.

## Quick start
```bash
git clone <repo-url>
cd industrial-asset-maintenance-saas
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
```
- Web: http://localhost:3000
- API: http://localhost:4000/health

## Docs
- Product & technical plan: `PROJECT_PLAN.md`
- Execution process: `docs/superpowers/specs/2026-06-17-execution-process-design.md`
- Decisions: `docs/adr/`
- Progress: `docs/progress.md`
- Development log: `DEVELOPMENT_LOG.md`
```

- [ ] **Step 2: Write `docs/progress.md`**

```markdown
# Phase Progress

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation | ✅ Complete |
| 1 | Authentication | ⬜ Pending |
| 2 | Reference data (locations, categories, users) | ⬜ Pending |
| 3 | Assets + QR codes | ⬜ Pending |
| 4 | Work orders | ⬜ Pending |
| 5 | Inspections | ⬜ Pending |
| 6 | Parts inventory | ⬜ Pending |
| 7 | Dashboard + reports | ⬜ Pending |
| 8 | Notifications | ⬜ Pending |
| 9 | E2E + polish | ⬜ Pending |
| 10 | Deployment + docs | ⬜ Pending |
| 11 | Buffer | ⬜ Pending |

Critical-path test coverage (per execution-process spec §3.1):
- [ ] Phase 1: register, login, refresh, role guard
- [ ] Phase 4: work-order status transitions
- [ ] Phase 5: inspection `passed` logic
- [ ] Phase 6: parts consumption, restock, low-stock trigger
```

- [ ] **Step 3: Write `DEVELOPMENT_LOG.md`**

```markdown
# Development Log

## 2026-06-17 — Phase 0: Foundation

**Done:**
- pnpm workspaces + Turborepo root configured.
- `packages/shared` created as Zod-based single source of truth for types.
- `apps/api`: NestJS 11 skeleton with `/health` endpoint, written TDD (1 passing test).
- `apps/web`: Next.js 16 + Tailwind v4 skeleton; shared-types wiring proven.
- `docker-compose.yml` (postgres:16 + redis:7) and `docker-compose.test.yml` (isolated :5433).
- `.env.example` documented; `@nestjs/config` + Zod env validation deferred to Phase 1 (it needs env shapes that don't exist until Phase 1 auth vars are used).
- GitHub Actions CI: lint, typecheck, test, build.
- Public GitHub repo created and pushed.
- ADR 0001 (tech-stack versions, June 2026) recorded.

**Decisions:**
- Adopted current stable majors (ADR 0001): Next 16, NestJS 11, Prisma 7, Tailwind v4 — superseding the plan's pinned versions.

**Verified:**
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass locally.
- `curl http://localhost:4000/health` returns `{"status":"ok",...}`.
- `docker compose ps` shows postgres + redis healthy.
- Web renders at http://localhost:3000.

**Git identity used:** <fill from `git config user.name` / `user.email`>

**Next:** Phase 1 — Authentication (JWT with `jti`, refresh + Redis revocation, throttler on login/register, roles/guard, login/register UI).
```

- [ ] **Step 4: Commit + push**

```
git add README.md DEVELOPMENT_LOG.md docs/progress.md
git commit -m "docs: readme, development log, phase progress tracker"
git push
```
Expected: pushed; CI green.

---

## Verification Gate (run before declaring Phase 0 done)

Run every command and paste real output into the report:

- [ ] `node -v && pnpm -v && docker --version` — versions as expected
- [ ] `pnpm install` — clean, no peer-dep errors
- [ ] `pnpm lint` — passes across all workspaces
- [ ] `pnpm typecheck` — passes across all workspaces
- [ ] `pnpm test` — `apps/api` `/health` test passes
- [ ] `pnpm build` — both apps build
- [ ] `docker compose up -d && docker compose ps` — both healthy
- [ ] `curl http://localhost:4000/health` — returns ok JSON
- [ ] Web renders at http://localhost:3000
- [ ] GitHub Actions run on `main` is green

If any step fails, fix it in this phase before reporting completion (per
verification-before-completion).
