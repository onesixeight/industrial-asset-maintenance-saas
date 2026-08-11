# ADR 0002: Refresh-Token Rotation + httpOnly Cookie

- **Status:** Accepted
- **Date:** 2026-06-18
- **Phase:** 1a
- **Related:** `PROJECT_PLAN.md` §7.1; spec `2026-06-17-phase-1-authentication-design.md` §3, §4

## Context

JWT access tokens are short-lived (`JWT_ACCESS_TTL`, default 15m) and verified
statelessly. Refresh tokens (`JWT_REFRESH_TTL`, default 7d) must be revocable so
that logout and theft-detection work. Storing either token in `localStorage`
exposes it to XSS. The frontend (Phase 1b) will keep the access token in memory
only and rely on a silent refresh, so the refresh token needs a storage strategy
that survives page reloads without being readable by JavaScript.

## Decision

1. **Access token** — JWT (`sub`, `role`, `companyId`, `ver`, `sid`, `jti`,
   `typ: "access"`).
   Held in memory on the client. Verified **statelessly**: signature + expiry
   only, no Redis lookup. Its short TTL is the accepted exposure window; an
   access-token denylist would negate statelessness (spec §4).
2. **Refresh token** — JWT (`sub`, `role`, `companyId`, `ver`, `sid`, `jti`,
   `typ: "refresh"`). `sid` is a cryptographically random token-family id and
   `ver` is the user's session version. Stored in an **httpOnly,
   `sameSite: "lax"`** cookie named
   `refresh_token`. `secure: true` in production. httpOnly keeps it out of JS;
   production scopes it to the documented same-origin `/api/auth` proxy path
   (test/development direct-API flows retain `/`).
   the cookie is sent automatically by the browser on `/auth/refresh` and
   `/auth/logout` (with `credentials: 'include'` on the fetch side).
3. **Rotation and reuse detection** — every `POST /auth/refresh` issues a fresh
   pair with new `jti`s and the same `sid`. Redis atomically claims the consumed
   `jti` (`auth:denylist:{jti}`). If that claim collides, the Lua operation also
   revokes `auth:family:{sid}` for the full refresh lifetime. Every successor in
   that family then fails verification; this closes the stolen-token-wins race.
4. **Logout** — `POST /auth/logout` authenticates the presented refresh token's
   signature even if its `jti` was consumed, revokes `auth:family:{sid}`, and
   clears the cookie. It is idempotent: an invalid/missing refresh is a no-op
   (200 `{ success: true }`), so a flaky client retry is harmless.
5. **JWT trust domain and token type** — signing and verification are pinned to
   `HS256`, issuer `industrial-asset-maintenance-api`, and audience
   `industrial-asset-maintenance-web`. Verified claims must also pass the
   shared `jwtPayloadSchema`. `TokenService.verify(token, typ)` rejects a token
   whose `typ` claim does not match the expected type, so an access token cannot
   be used as a refresh token and vice-versa.
6. **First admin bootstrap** — `POST /auth/register` transactionally creates a
   `Company` and its first `User` with `role: "admin"` (spec §3.2). The unique
   constraint on `User.email` is the source of truth for duplicate detection;
   a race that slips past the pre-check surfaces as Prisma `P2002`, mapped to 409.

## Consequences

- **Stolen access token:** valid for ≤15m only; cannot be revoked without
  abandoning statelessness.
- **Stolen refresh token:** whichever side rotates first may briefly receive a
  successor. When the other side reuses the old `jti`, the entire family is
  revoked. Already-issued access tokens remain valid for their short TTL.
- **Production browser traffic** uses the Vercel same-origin `/api/*` rewrite
  to Render. This preserves `sameSite: "lax"`, permits the narrow `/api/auth`
  cookie path, and avoids exposing the refresh cookie on unrelated page routes.
- **In-memory access token** is lost on reload → triggers a silent refresh via
  the cookie. A logged-out browser (cookie cleared) correctly fails to refresh.
- **Throttler state** is Redis-backed so limits are consistent across API
  instances.
