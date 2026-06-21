# ADR 0007: Playwright authenticates via the real login flow, not token injection

**Date:** 2026-06-21
**Status:** Accepted
**Context:** Phase 9 adds Playwright browser E2E specs. Each spec needs an authenticated browser session to test the dashboard / work-order / parts flows. The auth model (Phase 1): access token in-memory in a Zustand store; refresh token in an httpOnly cookie; silent-refresh on dashboard load.

**Options considered:**

1. **Real login flow (chosen)** — each spec `POST /auth/login` through the browser (Playwright's page context stores the httpOnly cookie), then navigates to /dashboard where the client-side silent refresh hydrates auth.
2. **Token injection** — generate a token server-side and inject it into localStorage / a cookie / the Zustand store before navigating.
3. **API-request context only** — skip the browser entirely, drive everything via `request.newContext()`.

**Decision:** Option 1 (real login flow).

**Rationale:**
- The access token is **in-memory only** (Zustand) — it cannot be injected into a fresh browser context, and the store is hydrated by a silent refresh that reads the httpOnly cookie. There is no injectable token surface by design (Phase 1 security decision).
- The refresh token is **httpOnly** — JavaScript (and Playwright's `page.evaluate`) cannot read or write it. Only an HTTP response from `/auth/login` / `/auth/refresh` can set it, so the login flow is the only way.
- Option 1 exercises the **real auth path** including the silent refresh, cookie handling, and the force-change-password gate — which is exactly what browser E2E is for. Injecting a token (option 2) would test a path that doesn't exist in production.
- Option 3 isn't browser E2E — it's API testing, which the vitest e2e suite already covers thoroughly (230 api tests).

**Consequences:**
- Specs are slightly slower (each does a real `POST /auth/login` + optional change-password) than a token-injection setup. Acceptable for 5 specs; the trade is real coverage.
- The `loginThroughUi` helper centralizes the login + must-change-password handling so specs stay readable.
- Admin-created users (viewer/manager/technician seeded via `/users`) hit the force-change-password gate; the helper completes it. Freshly registered companies log straight in.
- This is the correct long-term choice: if auth changes (token rotation, cookie attributes), the E2E specs surface it; an injection-based suite would silently keep passing against a broken real flow.
