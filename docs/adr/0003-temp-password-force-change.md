# ADR 0003: Temp Password + Force-Change for Admin-Created Users

- **Status:** Accepted
- **Date:** 2026-06-19
- **Phase:** 2
- **Related:** spec `2026-06-19-phase-2-reference-data-design.md` §3.1; `PROJECT_PLAN.md` §7.2

## Context

Phase 2 adds user management (`POST /users`) so admins/managers can provision
colleagues. The project plan specifies the endpoint but not how credentials are
delivered. Three options were considered:

1. **Admin sets the final password** — simplest, but the admin then knows the
   user's real password, which weakens non-repudiation and reuses the burden of
   a secure channel.
2. **Invite-by-email** (token link → user sets password) — most production-ready,
   but requires an SMTP/email service that does not exist until Phase 10
   deployment. Building it now would either stub email (unshippable) or pull in
   an external dependency out of scope.
3. **Temp password + force-change** — admin sets a throwaway password; the user
   must change it on first login before receiving any tokens.

## Decision

Adopt **temp password + force-change**:

- `POST /users` creates the user with `mustChangePassword = true` and the
  admin-supplied password (already validated against the shared password policy).
- `POST /auth/login` for such a user rejects with `403 { code: "MUST_CHANGE_PASSWORD" }`
  **before** issuing any tokens.
- `POST /auth/change-password` (no Bearer — the blocked login issued none)
  accepts `email + currentPassword + newPassword`, verifies the temp password,
  stores the new hash, clears the flag, and returns a normal `AuthResponse`.
- The self-registration path (`POST /auth/register`, the first admin) keeps
  `mustChangePassword = false`; the new column defaults to `false`, so the
  Phase 1a users are unaffected.

## Consequences

- The admin never knows the user's final password; only a throwaway.
- `/auth/change-password` is a second password-verification surface (it checks
  `currentPassword`). To avoid brute-force abuse it is decorated
  `@Throttle({ limit: 10, ttl: 60_000 })` like login/register, and reuses the
  same constant-time-ish handling as `login`.
- The client must special-case the 403 `MUST_CHANGE_PASSWORD` (route to
  `/change-password?email=…`), since a generic 403 ("forbidden") would confuse
  the user. `loginApi` extracts the `code` from the 403 body so the form can
  branch.
- Email invites (no admin-set password at all) remain the long-term target for
  Phase 10 once SMTP exists; this design is a deliberate interim that ships a
  secure user-provisioning flow now without an email dependency.
