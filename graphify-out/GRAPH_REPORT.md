# Graph Report - .  (2026-06-19)

## Corpus Check
- Corpus is ~35,373 words - fits in a single context window. You may not need a graph.

## Summary
- 513 nodes · 774 edges · 35 communities (27 shown, 8 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Web API Client Layer|Web API Client Layer]]
- [[_COMMUNITY_Backend Config & Bootstrap|Backend Config & Bootstrap]]
- [[_COMMUNITY_Auth Controller Endpoints|Auth Controller Endpoints]]
- [[_COMMUNITY_Root Tooling & Lint Config|Root Tooling & Lint Config]]
- [[_COMMUNITY_API Dev Dependencies|API Dev Dependencies]]
- [[_COMMUNITY_Auth Controller→Service Wiring|Auth Controller→Service Wiring]]
- [[_COMMUNITY_Docs, ADRs & Rationale|Docs, ADRs & Rationale]]
- [[_COMMUNITY_Web Dependencies|Web Dependencies]]
- [[_COMMUNITY_API Runtime Dependencies|API Runtime Dependencies]]
- [[_COMMUNITY_Web TSConfig|Web TSConfig]]
- [[_COMMUNITY_API TSConfig|API TSConfig]]
- [[_COMMUNITY_Shared Zod Schemas|Shared Zod Schemas]]
- [[_COMMUNITY_Shared Package Config|Shared Package Config]]
- [[_COMMUNITY_Shared TSConfig|Shared TSConfig]]
- [[_COMMUNITY_CI & Test Infra|CI & Test Infra]]
- [[_COMMUNITY_Web Root Layout & Providers|Web Root Layout & Providers]]
- [[_COMMUNITY_Nest CLI Config|Nest CLI Config]]
- [[_COMMUNITY_Prisma Config|Prisma Config]]
- [[_COMMUNITY_API Build TSConfig|API Build TSConfig]]
- [[_COMMUNITY_Web Providers (alt)|Web Providers (alt)]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]

## God Nodes (most connected - your core abstractions)
1. `useAuthStore` - 20 edges
2. `compilerOptions` - 16 edges
3. `compilerOptions` - 16 edges
4. `Phase 1a: Auth Backend (COMPLETE)` - 15 edges
5. `AuthService` - 12 edges
6. `PrismaService` - 12 edges
7. `scripts` - 11 edges
8. `JwtPayload` - 11 edges
9. `AuthController` - 10 edges
10. `RedisService` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Spec: Phase 1 — Authentication Design` --conceptually_related_to--> `Logout is idempotent`  [AMBIGUOUS]
  docs/superpowers/specs/2026-06-17-phase-1-authentication-design.md → DEVELOPMENT_LOG.md
- `registerRequestSchema` --shares_data_with--> `AuthForm`  [INFERRED]
  packages/shared/src/auth.ts → apps/web/src/components/auth-form.tsx
- `loginRequestSchema` --shares_data_with--> `AuthForm`  [INFERRED]
  packages/shared/src/auth.ts → apps/web/src/components/auth-form.tsx
- `ADR 0002: Refresh-Token Rotation + httpOnly Cookie` --conceptually_related_to--> `Access-token statelessness preserved`  [INFERRED]
  docs/adr/0002-refresh-rotation-httponly-cookie.md → DEVELOPMENT_LOG.md
- `Phase 1b: Auth Frontend Implementation Plan` --shares_data_with--> `Phase 1b: Auth Frontend (COMPLETE)`  [INFERRED]
  docs/superpowers/plans/2026-06-19-phase-1b-auth-frontend.md → DEVELOPMENT_LOG.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Auth flow: register → login → refresh (rotate) → logout** — phase1a_auth_backend, refresh_token_rotation, httponly_refresh_cookie, jti_denylist_redis, critical_path_tests_11, phase1b_auth_frontend [INFERRED 0.90]
- **Refresh-token security design (ADR 0002)** — adr0002_refresh_rotation, refresh_token_rotation, httponly_refresh_cookie, access_token_in_memory, access_token_stateless, jti_denylist_redis, logout_idempotency, token_type_enforcement [INFERRED 0.90]
- **Completed phase progression: 0 → 1a → 1b** — phase0_foundation, phase1a_auth_backend, phase1b_auth_frontend [INFERRED 0.85]
- **refresh rotation flow** — authservice_refresh, token_service_verify, token_service_revoke, token_service_issue_pair [EXTRACTED 1.00]
- **register transaction flow (company + first-admin user + token pair)** — authservice_register, prisma_transaction, bcrypt_hash, prisma_p2002_409, token_service_issue_pair [EXTRACTED 1.00]
- **refresh denylist verify/revoke flow** — token_service_verify, token_service_is_revoked, token_service_revoke, redis_client_set, redis_client_get [EXTRACTED 1.00]
- **silent refresh flow** — refresh_silentrefresh, auth_refreshapi, auth_meapi, store_setauth, store_clear [EXTRACTED 1.00]
- **auth mutation flow** — hooks_uselogin, hooks_useregister, hooks_uselogout, auth_loginapi, auth_registerapi, auth_logoutapi, store_setauth, store_clear [EXTRACTED 1.00]
- **401 token retry flow** — apiclient_apifetch, refresh_silentrefresh, store_useauthstore, store_clear [EXTRACTED 1.00]
- **browser auth flow (register page -> AuthForm -> useRegister -> dashboard)** — register_page, authform, hooks_useregister, dashboard_page, refresh_silentrefresh, dashboard_layout_guard [INFERRED 0.80]
- **test gate (e2e spec + setup.env + db helpers + compose postgres-test)** — e2e_spec, setup_env, test_prisma, truncate, teardown, compose_postgres_test, app_module [EXTRACTED 0.95]
- **shared auth schemas single source of truth (api + web)** — shared_index, shared_registerrequestschema, shared_loginrequestschema, shared_authresponseschema, shared_tokenresponseschema, shared_userresponseschema, api_auth_endpoints, authform [EXTRACTED 0.90]

## Communities (35 total, 8 thin omitted)

### Community 0 - "Web API Client Layer"
Cohesion: 0.06
Nodes (49): base(), loginApi(), logoutApi(), meApi(), refreshApi(), registerApi(), apiFetch, apiJson (+41 more)

### Community 1 - "Backend Config & Bootstrap"
Cohesion: 0.06
Nodes (27): bootstrap, buildValidatedEnv(), ConfigModule, Env, envSchema, validEnv, validateEnv(), buildValidatedEnv (+19 more)

### Community 2 - "Auth Controller Endpoints"
Cohesion: 0.07
Nodes (19): AuthController, readRefresh(), AuthService, CurrentUser, JwtAuthGuard, JwtStrategy, Roles(), RolesGuard (+11 more)

### Community 3 - "Root Tooling & Lint Config"
Cohesion: 0.05
Nodes (37): devDependencies, eslint, eslint-config-prettier, @eslint/js, prettier, prettier-plugin-tailwindcss, prisma, turbo (+29 more)

### Community 4 - "API Dev Dependencies"
Cohesion: 0.06
Nodes (35): devDependencies, eslint, @iam/shared, @nestjs/cli, @nestjs/schematics, @nestjs/testing, prisma, supertest (+27 more)

### Community 5 - "Auth Controller→Service Wiring"
Cohesion: 0.07
Nodes (32): AuthModule, AuthController.login, AuthController.logout, AuthController.me, readRefresh, AuthController.refresh, AuthController.register, AuthController.setRefreshCookie (+24 more)

### Community 6 - "Docs, ADRs & Rationale"
Cohesion: 0.14
Nodes (30): Access token held in memory only (Zustand), Access-token statelessness preserved, ADR 0001: Technology Stack Versions (June 2026), ADR 0002: Refresh-Token Rotation + httpOnly Cookie, Refresh cookie path widened /auth → /, 11 critical-path tests (TDD, real Postgres), Dev proxy: /api/* → API_ORIGIN (default :4000), Development Log — Phase 0: Foundation (+22 more)

### Community 7 - "Web Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @hookform/resolvers, @iam/shared, next, react, react-dom, react-hook-form, @tanstack/react-query (+22 more)

### Community 8 - "API Runtime Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, bcrypt, cookie-parser, dotenv, ioredis, @nestjs/common, @nestjs/config, @nestjs/core (+16 more)

### Community 9 - "Web TSConfig"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "API TSConfig"
Cohesion: 0.11
Nodes (17): compilerOptions, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, lib, module (+9 more)

### Community 11 - "Shared Zod Schemas"
Cohesion: 0.21
Nodes (14): API /auth endpoints, shared index barrel, userRoleSchema / USER_ROLES, authResponseSchema, jwtPayloadSchema, loginRequestSchema, RefreshRequest, refreshRequestSchema (+6 more)

### Community 12 - "Shared Package Config"
Cohesion: 0.12
Nodes (15): dependencies, zod, devDependencies, typescript, vitest, main, name, private (+7 more)

### Community 13 - "Shared TSConfig"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, esModuleInterop, module, moduleResolution, noEmit, skipLibCheck, strict (+2 more)

### Community 14 - "CI & Test Infra"
Cohesion: 0.28
Nodes (9): DATABASE_URL_TEST env, prisma migrate deploy (test DB), CI workflow, postgres-test service (:5433), Company model, User.company onDelete Cascade, User model, setup.env.ts global setup (+1 more)

### Community 15 - "Web Root Layout & Providers"
Cohesion: 0.38
Nodes (3): metadata, Providers(), makeQueryClient()

### Community 16 - "Nest CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, tsConfigPath, $schema, sourceRoot

### Community 19 - "Web Providers (alt)"
Cohesion: 0.67
Nodes (3): Providers, makeQueryClient, RootLayout

## Ambiguous Edges - Review These
- `Spec: Phase 1 — Authentication Design` → `Logout is idempotent`  [AMBIGUOUS]
  docs/superpowers/specs/2026-06-17-phase-1-authentication-design.md · relation: conceptually_related_to

## Knowledge Gaps
- **215 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `tsConfigPath`, `name` (+210 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Spec: Phase 1 — Authentication Design` and `Logout is idempotent`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `useAuthStore` connect `Web API Client Layer` to `Auth Controller Endpoints`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `AuthModule` connect `Auth Controller→Service Wiring` to `Backend Config & Bootstrap`, `Auth Controller Endpoints`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `RedisService` connect `Backend Config & Bootstrap` to `Auth Controller→Service Wiring`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _218 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web API Client Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.06340326340326341 - nodes in this community are weakly interconnected._
- **Should `Backend Config & Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.057859703020993344 - nodes in this community are weakly interconnected._