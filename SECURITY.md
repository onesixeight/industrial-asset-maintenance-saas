# Security policy

## Supported version

Security fixes are applied to the latest revision of the default branch. Older
commits, forks, and private deployments are not maintained by this repository.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/onesixeight/industrial-asset-maintenance-saas/security/advisories/new)
and include:

- the affected endpoint, component, or commit;
- reproducible steps or a minimal proof of concept;
- the expected and observed security boundary;
- impact, prerequisites, and any suggested mitigation;
- whether the report contains secrets or personal data.

Do not access data that is not yours, degrade a running service, or retain
sensitive data while researching. We will aim to acknowledge a complete report
within three business days, provide a triage decision within ten business days,
and coordinate disclosure after a fix is available. These are targets rather
than a guarantee for this portfolio project.

## Security controls in this repository

The CI gate runs unit and integration tests, production builds, coverage floors,
browser E2E, and `pnpm audit --prod --audit-level high`. Authentication and
multi-tenant authorization changes require regression tests. Secrets belong in
local or deployment environment variables and must never be committed.
