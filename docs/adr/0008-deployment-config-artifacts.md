# ADR 0008: Ship deployment config artifacts, not live deployments

**Date:** 2026-06-21
**Status:** Accepted
**Context:** Phase 10 (Deployment + Docs) targets "Vercel + Render + Upstash + R2" deployment per exec spec §7. Actually executing a live deploy requires authenticated cloud accounts, paid plans, API tokens, and real DNS — none of which can be autonomously provisioned or verified in this development environment.

**Options considered:**

1. **Config artifacts + documented commands (chosen)** — ship `render.yaml`, `vercel.json`, a seed script, and a README Deployment section with exact commands. You execute the deploy when ready; the configs make it a one-click process.
2. **Live deploy via CLI** — run `vercel deploy` / `render deploy` from this environment. Blocked: no cloud credentials, no way to verify the live URL responds.
3. **Defer Phase 10 to when accounts exist** — lose the documentation + seed value now.

**Decision:** Option 1 (config artifacts + documentation).

**Rationale:**
- The deliverable's user-facing value is "I can deploy this in minutes" — that's satisfied by correct configs + docs. Whether the deploy executes today or next week is environment-dependent, not a code decision.
- Configs are **verifiable by inspection**: `render.yaml` references the real build/start commands; `vercel.json` has the correct rewrite rule; the seed runs locally and creates a login-able demo dataset.
- Option 2 is impossible without credentials; pretending otherwise would be dishonest reporting.
- The seed script is the single most useful artifact for portfolio reviewers — it lets anyone clone + `db:seed` + log in as `demo@acme.test` / `Password1` immediately, no deploy required.

**Consequences:**
- `render.yaml` + `vercel.json` live in the repo as the source of truth for deployment shape.
- Upstash Redis and CORS origins are documented as manual steps (provider-specific, account-bound).
- R2 is not included anywhere — per ADR 0005 the CSV report is generated synchronously; no object storage is in use.
- When you deploy: follow README §Deployment; the configs + env var list map 1:1 to provider dashboard fields.
