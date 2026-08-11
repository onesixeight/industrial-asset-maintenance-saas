# Contributing

Thank you for improving the project. Keep changes small enough to review,
preserve tenant and role boundaries, and add a regression test for every bug
fix.

## Prerequisites

- Node.js 22 or newer
- pnpm 10.34.3 (Corepack is recommended)
- Docker for PostgreSQL/Redis-backed integration and browser tests

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm --filter @iam/shared build
pnpm --filter @iam/api prisma:generate
pnpm --filter @iam/api exec prisma migrate deploy --schema prisma/schema.prisma
# Set ALLOW_DEMO_SEED=true in .env only for the local iam_dev demo database.
pnpm --filter @iam/api db:seed
```

Use a unique, random `JWT_SECRET` of at least 32 characters. Development service
ports are exposed only on `127.0.0.1`.

## Test loops

Use `pnpm verify:fast` while iterating. It runs lint, typechecking, and hermetic
unit tests across the workspace.

Integration tests require dedicated databases. Start both isolated services:

```bash
docker compose -f docker-compose.test.yml up -d
```

Set `DATABASE_URL_TEST` to the `iam_test` database on port 5433 and
`REDIS_URL_TEST` to Redis database 1 on port 6380. Also set `DATABASE_URL` and
`REDIS_URL` to those same values, and explicitly set
`ALLOW_DESTRUCTIVE_TEST_DATABASE=true`, before applying migrations and running:

```bash
pnpm --filter @iam/api prisma:generate
pnpm --filter @iam/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm test:integration
pnpm build
pnpm test:e2e # starts/stops the built API and web servers automatically
# Or run every command above plus coverage/audit with:
pnpm verify:full
```

Never point test commands at a development or production database. Stop the
isolated stack with `docker compose -f docker-compose.test.yml down` when done.

## Pull requests

- Explain the user-visible outcome and any schema or deployment impact.
- Include RED/GREEN evidence for defect fixes and meaningful assertions.
- Add a Prisma migration for schema changes; never edit an applied migration.
- Keep API tenant filters and service-layer role checks explicit.
- Update shared Zod contracts, API behavior, frontend consumers, and tests
  together when changing a cross-package contract.
- Run `pnpm verify:fast`, relevant integration/E2E tests, the production build,
  and the production dependency audit before requesting review.
- Do not commit `.env` files, credentials, generated reports, coverage output,
  or local database data.
