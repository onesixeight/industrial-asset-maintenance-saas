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

1. **Access token** — JWT (`sub`, `role`, `companyId`, `jti`, `typ: "access"`).
   Held in memory on the client. Verified **statelessly**: signature + expiry
   only, no Redis lookup. Its short TTL is the accepted exposure window; an
   access-token denylist would negate statelessness (spec §4).
2. **Refresh token** — JWT (`sub`, `role`, `companyId`, `jti`, `typ: "refresh"`).
   Stored in an **httpOnly, `sameSite: "lax"`, `path: "/auth"`** cookie named
   `refresh_token`. `secure: true` in production. httpOnly keeps it out of JS;
   the cookie is sent automatically by the browser on `/auth/refresh` and
   `/auth/logout` (with `credentials: 'include'` on the fetch side).
3. **Rotation** — every `POST /auth/refresh` issues a fresh access+refresh pair
   with new `jti`s. The consumed refresh's `jti` is added to a Redis denylist
   (`auth:denylist:{jti}`) with a TTL equal to the token's remaining lifetime,
   so entries auto-expire. Reuse of a revoked refresh → 401 (a theft signal).
4. **Logout** — `POST /auth/logout` revokes the current refresh `jti` and clears
   the cookie. It is idempotent: an invalid/missing refresh is a no-op (200
   `{ success: true }`), so a flaky client retry is harmless.
5. **Token-type enforcement** — `TokenService.verify(token, typ)` rejects a
   token whose `typ` claim does not match the expected type, so an access token
   cannot be used as a refresh token and vice-versa.
6. **First admin bootstrap** — `POST /auth/register` transactionally creates a
   `Company` and its first `User` with `role: "admin"` (spec §3.2). The unique
   constraint on `User.email` is the source of truth for duplicate detection;
   a race that slips past the pre-check surfaces as Prisma `P2002`, mapped to
   409.

## Consequences

- **Stolen access token:** valid for ≤15m only; cannot be revoked without
  abandoning statelessness.
- **Stolen refresh token:** invalidated on the first legitimate refresh;
  attacker reuse of the old `jti` triggers 401, signalling compromise.
- **Production cross-origin (Vercel → Render)** will require `sameSite: "none"`
  + `secure: true` and explicit `CORS_ORIGIN` origins (credentials + wildcard
  origin is rejected by browsers). Configured in Phase 10 deployment.
- **In-memory access token** is lost on reload → triggers a silent refresh via
  the cookie. A logged-out browser (cookie cleared) correctly fails to refresh.
- **Throttler** is in-memory (single-instance) for Phase 1a; Redis-backed
  throttler storage is deferred to Phase 8/9 when multi-instance matters.
