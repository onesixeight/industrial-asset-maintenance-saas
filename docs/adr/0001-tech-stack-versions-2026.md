# ADR 0001: Technology Stack Versions (June 2026)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Phase:** 0 (Foundation)

## Context

`PROJECT_PLAN.md` (section 3) pins the stack to versions current at the time of
writing: Next.js 14, NestJS 10, Prisma (unspecified), Tailwind CSS v3. Between
the plan's authoring and the start of implementation (June 2026), every one of
these majors has been superseded. Shipping a portfolio project in mid-2026 on
2024-era majors would be a red flag for reviewers and would force painful
upgrades mid-project.

## Decision

Adopt the current stable majors as of 2026-06-17:

| Layer | Plan said | We use | Why |
|---|---|---|---|
| Frontend framework | Next.js 14 | **Next.js 16.2.x** | Current stable; React 19, Turbopack default, App Router mature |
| UI framework | React 18 | **React 19** | Bundled with Next.js 16 |
| Backend framework | NestJS 10 | **NestJS 11.1.x** | Current stable; Express 5 default |
| ORM | Prisma (unpinned) | **Prisma 7.8.x** | Rust-free, faster, driver adapters |
| Styling | Tailwind CSS v3 | **Tailwind CSS v4** | Current; CSS-based config (no `tailwind.config.js`) |
| Components | shadcn/ui | **shadcn/ui** (Next 16 + TW v4 path) | Still the right call; mind known install issues |
| Monorepo | Turborepo | **pnpm workspaces + Turborepo** | 2026 best practice; Project References for shared types |
| Node runtime | — | **Node.js 22 LTS** | Required by Next.js 16 / NestJS 11 |

## Consequences

- **Tailwind v4 changes:** config lives in CSS via `@theme`, no
  `tailwind.config.js`. shadcn/ui must be installed via its Tailwind-v4 path.
  Known install issues exist (shadcn-ui/ui#6522) — if `npx shadcn init` fails,
  fall back to the manual registry setup documented in shadcn's TW v4 guide.
- **Prisma 7 changes:** uses driver adapters for PostgreSQL; client is no longer
  Rust-backed. Migration from any prior schema uses the v7 CLI.
- **Next.js 16:** Server Components by default; Server Actions stable. The plan's
  "Server Components by default, `'use client'` only when needed" still holds.
- **Versions are pinned** in each app's `package.json`; a `pnpm-lock.yaml` at the
  root guarantees reproducibility. Versions are revisited at the start of each
  phase, not silently.
- **React 19 + form libs:** React Hook Form v7+ and Zod v3+ support React 19;
  confirm at Phase 1 when auth forms are built.
