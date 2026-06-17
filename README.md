# Industrial Asset & Maintenance SaaS

[![CI](https://github.com/onesixeight/industrial-asset-maintenance-saas/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/onesixeight/industrial-asset-maintenance-saas/actions/workflows/ci.yml)

B2B SaaS for tracking industrial equipment, scheduling maintenance, managing
spare-parts inventory, and running QR-based inspections. Portfolio project
targeting the Kazakhstan IT job market.

> **Status:** Phase 0 (Foundation) complete. See `docs/progress.md`.

## Stack

Next.js 16 (React 19, Turbopack, App Router), NestJS 11 (Express 5), Prisma 7,
PostgreSQL 16, Redis 7, Tailwind CSS v4, shadcn/ui, Zod, pnpm workspaces +
Turborepo, Vitest, Playwright, Docker, GitHub Actions.

## Quick start

```bash
git clone https://github.com/onesixeight/industrial-asset-maintenance-saas.git
cd industrial-asset-maintenance-saas
cp .env.example .env
docker compose up -d        # postgres:16 + redis:7
pnpm install
pnpm dev                    # web on :3000, api on :4000
```

- Web:  http://localhost:3000
- API:  http://localhost:4000/health

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start web + api in dev mode (Turborepo) |
| `pnpm build` | Production build of all workspaces |
| `pnpm lint` | ESLint (flat config) across all workspaces |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |
| `pnpm test` | Vitest unit/integration tests |
| `pnpm format` | Prettier write |

## Documentation

- **Product & technical plan:** [`PROJECT_PLAN.md`](./PROJECT_PLAN.md)
- **Execution process (phases, memory, gates):** [`docs/superpowers/specs/2026-06-17-execution-process-design.md`](./docs/superpowers/specs/2026-06-17-execution-process-design.md)
- **Architecture Decision Records:** [`docs/adr/`](./docs/adr/)
  - [ADR 0001 — Technology stack versions (June 2026)](./docs/adr/0001-tech-stack-versions-2026.md)
- **Phase plan:** [`docs/superpowers/plans/2026-06-17-phase-0-foundation.md`](./docs/superpowers/plans/2026-06-17-phase-0-foundation.md)
- **Progress:** [`docs/progress.md`](./docs/progress.md)
- **Development log:** [`DEVELOPMENT_LOG.md`](./DEVELOPMENT_LOG.md)

## Workspace layout

```
apps/
  web/        Next.js 16 + Tailwind v4
  api/        NestJS 11 + Pino
packages/
  shared/     Zod schemas = single source of truth for types
```
