# Phase 9 — E2E + Polish Design

**Date:** 2026-06-21
**Branch:** `feat/phase-9-e2e-polish`
**Predecessor:** Phase 8 (Notifications) — `feat/phase-8-notifications`

## 1. Goal

Per exec spec §3.1, Phase 9 carries **only** browser-level E2E (Playwright), Swagger docs, error/loading polish, and edge cases — unit/integration tests already live in Phases 1–8. This phase also delivers the in-browser demo: a live stack run with screenshots proving the full critical path.

## 2. Scope

### In scope
1. **Playwright** — install, config, 5 critical-path specs, run once live (with screenshots), package scripts, CI job
2. **Swagger** — `@nestjs/swagger` DocumentBuilder at `GET /docs`, basic controller annotation (DTO auto-schemas)
3. **Error/loading polish** — `not-found.tsx`, `error.tsx` boundary, consistent loading states
4. **Edge cases** — empty states (already mostly via DataTable `empty`), token-expiry UX (api-client already silent-refreshes)

### Out of scope (deferred)
- Full per-DTO Swagger annotation exhaustiveness → Phase 10 polish
- Visual regression testing → unscheduled
- Mobile-responsive overhaul → Phase 11 buffer
- Performance optimization → Phase 11 buffer

## 3. Playwright critical paths

Each spec runs against a live stack (postgres + redis + api :4000 + web :3000). Specs authenticate via real `POST /auth/login` (httpOnly cookie + in-memory token can't be injected) then navigate.

1. **register → dashboard** — register a fresh company, land on /dashboard, see KPI cards render
2. **login → reload (silent refresh)** — login, reload, remain authenticated (Phase 1b critical path)
3. **work-order lifecycle** — create WO, transition open→in_progress→completed, see status badge update + completedAt
4. **parts consume + notification** — create part, consume on WO (crosses low-stock), manager sees the bell badge increment (Phase 6→8 loop in the browser)
5. **RBAC** — viewer login, "New work order" button absent/disabled, create attempt blocked

**Config:** `playwright.config.ts` with `webServer` for both api + web (or assume externally started for the live demo), `baseURL: http://localhost:3000`, screenshot on failure, trace on-first-retry.

**Test DB:** specs hit a dedicated `iam_e2e` database (not dev `iam_dev`, not the vitest `iam_test`), truncated between specs via a setup hook. This keeps browser E2E isolated from the vitest e2e suite.

## 4. Swagger

- `@nestjs/swagger` peer-installed on api; `DocumentBuilder` with title/version/description; `SwaggerModule.setup("docs", app, doc)`.
- Enable the Swagger CLI plugin in `nest-cli.json` for auto DTO inference from TS types (avoids hand-annotating every endpoint).
- Add `@ApiTags` per controller for grouping. No per-field `@ApiProperty` initially — the plugin infers from Zod-validated shapes where possible; where it can't, the schema is `{}` (still browsable).
- `GET /docs` serves the UI; `GET /docs-json` the raw spec. Disabled in production via env (keep enabled for now).

## 5. Error/loading polish

- `apps/web/src/app/not-found.tsx` — global 404 with a link home
- `apps/web/src/app/error.tsx` — client error boundary with retry
- Audit pages for consistent loading states (most already show "Loading…"); no spinners library — keep the hand-rolled-primatives decision

## 6. CI

Update `.github/workflows/ci.yml`:
- Add `playwright` job: checkout, pnpm install, `docker compose up -d postgres redis`, run api + web in background, run db migrate + seed test company, `pnpm --filter web exec playwright test`, `actions/upload-artifact@v4` for `playwright-report/` + `test-results/` on failure.

## 7. Testing & verification

- Playwright specs must pass against the live stack (the 5 critical paths).
- Existing 257 vitest tests remain green (Playwright doesn't replace them).
- `GET /docs` returns 200 with the Swagger UI HTML.
- Lint + typecheck + build green.

## 8. Success criteria

- 5 Playwright specs green against a live docker-compose stack; screenshots captured.
- `GET /docs` serves Swagger UI.
- Error/loading polish pages exist and render.
- CI playwright job added (may run only on PR/main to save minutes).
- DEVELOPMENT_LOG + progress.md + ADR 0007 (Playwright via real login, not token injection) updated.
- Conventional commit + push to `feat/phase-9-e2e-polish`.
