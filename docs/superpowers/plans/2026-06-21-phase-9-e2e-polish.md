# Phase 9 — E2E + Polish Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-21-phase-9-e2e-polish-design.md`
**Branch:** `feat/phase-9-e2e-polish`

## Task 1 — Commit spec + plan
- [ ] Commit the two docs files.

## Task 2 — Swagger setup
- [ ] `pnpm --filter api add @nestjs/swagger`
- [ ] `nest-cli.json`: enable swagger plugin (auto introspection)
- [ ] `src/main.ts`: DocumentBuilder + `SwaggerModule.setup("docs", ...)`
- [ ] Add `@ApiTags("...")` to each controller (auth, users, locations, categories, assets, work-orders, inspections, parts, dashboard, reports, notifications)
- [ ] Verify `GET /docs` returns 200; api tests still green.

## Task 3 — Error/loading polish
- [ ] `apps/web/src/app/not-found.tsx`
- [ ] `apps/web/src/app/error.tsx` (client boundary with retry button)
- [ ] `pnpm --filter web build` → green

## Task 4 — Playwright install + config
- [ ] `pnpm --filter web add -D @playwright/test`
- [ ] `pnpm exec playwright install chromium`
- [ ] `apps/web/playwright.config.ts`: baseURL :3000, webServer (web :3000 + assume api :4000 external), screenshot=only-on-failure, trace=on-first-retry, retries 0 (local)
- [ ] `apps/web/package.json`: `"e2e": "playwright test"`, `"e2e:install": "playwright install chromium"`

## Task 5 — Playwright helpers + 5 specs
- [ ] `apps/web/e2e/helpers.ts`: `registerCompany(page)` (POST /auth/register via request context), `login(page, email)` (POST /auth/login → cookie auto-stored), `seedAsset(token)`, truncate helper
- [ ] `e2e/register-dashboard.spec.ts`
- [ ] `e2e/login-silent-refresh.spec.ts`
- [ ] `e2e/work-order-lifecycle.spec.ts`
- [ ] `e2e/parts-notification.spec.ts`
- [ ] `e2e/rbac.spec.ts`

## Task 6 — Live run (the browser demo)
- [ ] `docker compose up -d` (postgres :5432 + redis :6379)
- [ ] migrate dev DB; ensure `iam_e2e` DB exists (or reuse iam_dev truncated)
- [ ] start api on :4000, web on :3000 in background
- [ ] `pnpm --filter web e2e` — capture pass/fail + screenshots
- [ ] Take manual screenshots via Playwright MCP for the user

## Task 7 — CI playwright job
- [ ] `.github/workflows/ci.yml`: add `playwright` job (services or docker compose, upload artifacts)

## Task 8 — Verification gate
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` (257 vitest), `pnpm build` — all green
- [ ] Playwright 5 specs green against live stack

## Task 9 — Docs + commit + push
- [ ] `docs/progress.md` Phase 9 → done
- [ ] `DEVELOPMENT_LOG.md` Phase 9 entry
- [ ] `docs/adr/0007-playwright-real-login.md` (why we login via API, not inject tokens)
- [ ] Commit swagger → polish → playwright → ci → docs; push to `feat/phase-9-e2e-polish`

## Risk notes
- **Playwright browser install** can be large (~150MB chromium). Acceptable; needed for the demo.
- **Live stack ports**: api :4000, web :3000, postgres :5432 (dev DB), redis :6379. Verify nothing else holds these.
- **Test isolation**: truncate `iam_dev` between Playwright specs (or use a dedicated `iam_e2e` DB). Decide based on what's simplest to set up live.
- **CI minutes**: Playwright is slow; gate the job to `main` + PRs if minutes are a concern (defer — just add the job).
