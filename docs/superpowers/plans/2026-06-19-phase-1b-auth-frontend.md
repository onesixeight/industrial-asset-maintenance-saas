# Phase 1b: Auth Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js 16 (App Router, React 19) frontend that lets a company register its first admin, log in, stay authenticated across reloads via silent refresh, reach a guarded dashboard, and log out — talking to the Phase 1a auth backend.

**Architecture:** Access token lives in memory (Zustand store). Refresh token lives in an httpOnly cookie set by the backend. In dev, a Next.js rewrite proxies `/api/*` → `http://localhost:4000/*` so the browser issues same-origin requests and the `sameSite: "lax"` refresh cookie is sent automatically. A Server Component `(dashboard)/layout.tsx` reads the refresh cookie via `next/headers` `cookies()` to gate the dashboard; no access token (which is in-memory only and never reaches the server) → redirect to `/login`. Client mutations use React Hook Form + Zod (shared schemas) and TanStack Query v5. On a 401, the fetch wrapper attempts one silent `/auth/refresh`, then logs out.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19, Tailwind CSS v4, Zustand, TanStack Query v5, React Hook Form v7, @hookform/resolvers (zod), `@iam/shared` (Zod schemas + types). UI primitives hand-rolled on Tailwind (shadcn/ui's `init` is known-broken on TW v4 — spec §7/§10; we build the few components needed directly).

**Spec:** `docs/superpowers/specs/2026-06-17-phase-1-authentication-design.md` §7 (Frontend), §9 (Acceptance: "Browser flow: register → dashboard → token refresh → logout → login").

**Backend context (Phase 1a, already shipped):** Endpoints under `/auth/*`. Register body `{ company, email, password, firstName, lastName }` → `{ user, accessToken, refreshToken, expiresIn }` + sets `refresh_token` httpOnly cookie. Login `{ email, password }` → same. `POST /auth/refresh` (reads cookie, body fallback) → `{ accessToken, refreshToken, expiresIn }`. `POST /auth/logout` (reads cookie) → `{ success: true }` + clears cookie. `GET /auth/me` (Bearer) → user. Cookie flags: `httpOnly, secure=production, sameSite=lax, path=/auth` (Task 2 widens path to `/`). CORS already allows `http://localhost:3000` with `credentials: true`.

---

## File Structure (created/modified this phase)

```
apps/api/
├── src/auth/auth.controller.ts         widen refresh cookie path /auth → /
└── test/auth.e2e.spec.ts              assert cookie path is now /
apps/web/
├── package.json                       add deps (zustand, @tanstack/react-query, react-hook-form, @hookform/resolvers)
├── next.config.ts                     rewrites /api/:path* → :4000/:path*
├── .env.local                         NEXT_PUBLIC_API_URL=/api (same-origin via proxy)
├── vitest.config.ts                   NEW — unit tests for lib/*
├── src/
│   ├── app/
│   │   ├── layout.tsx                 wrap children in Providers (QueryClient + AuthHydration)
│   │   ├── providers.tsx              NEW — client provider tree
│   │   ├── globals.css                add a few form/util tokens to @theme
│   │   ├── (auth)/
│   │   │   ├── layout.tsx             NEW — centered card shell
│   │   │   ├── login/page.tsx         NEW
│   │   │   └── register/page.tsx      NEW
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             NEW — Server Component guard (reads refresh cookie)
│   │   │   └── dashboard/page.tsx     NEW — "Welcome, {email}" + logout button
│   │   └── page.tsx                   redirect / → /dashboard (or /login)
│   ├── lib/
│   │   ├── api-client.ts              NEW — fetch wrapper: Bearer attach + 401 single-refresh-retry
│   │   ├── api/auth.ts                NEW — typed register/login/refresh/logout/me calls
│   │   ├── auth/
│   │   │   ├── store.ts               NEW — Zustand store (user, accessToken) + hydrate()
│   │   │   ├── hooks.ts               NEW — useAuth(), useLogin(), useRegister(), useLogout()
│   │   │   └── refresh.ts             NEW — silent refresh + logout-on-failure
│   │   └── query-client.ts            NEW — QueryClient factory + 401 retry
│   └── components/
│       ├── auth-form.tsx              NEW — RHF + Zod shared form for login & register
│       ├── form-field.tsx             NEW — label + input + error text
│       └── button.tsx                 NEW — minimal styled button primitive
└── src/lib/**/*.test.ts               NEW — unit tests (api-client, store, hooks logic)
```

---

## Task 1: Web dependencies + Tailwind tokens

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add runtime + dev deps**

Run from repo root:
```
pnpm --filter @iam/web add zustand @tanstack/react-query react-hook-form @hookform/resolvers
pnpm --filter @iam/web add -D vitest @vitejs/plugin-react jsdom @testing-library/react
```

- [ ] **Step 2: Add test scripts to `apps/web/package.json`**

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Extend `apps/web/src/app/globals.css` with form/util tokens**

Replace its contents:
```css
@import "tailwindcss";

@theme {
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #737373;
  --color-border: #e5e5e5;
  --color-input: #e5e5e5;
  --color-ring: #0a0a0a;
  --color-primary: #0a0a0a;
  --color-primary-foreground: #ffffff;
  --color-destructive: #b91c1c;
  --color-destructive-foreground: #ffffff;
  --radius: 0.5rem;
}
```

- [ ] **Step 4: Verify install + typecheck**
```
pnpm --filter @iam/web typecheck
```
Expected: exits 0.

- [ ] **Step 5: Commit**
```
git add apps/web/package.json pnpm-lock.yaml apps/web/src/app/globals.css
git commit -m "chore(web): add auth frontend deps (zustand, tanstack-query, rhf) + form theme tokens"
```

---

## Task 2: Backend — widen refresh cookie path `/auth` → `/`

The `(dashboard)/layout.tsx` Server Component must read the refresh cookie at `/dashboard`, so the cookie cannot be scoped to `/auth`. Widening to `/` is safe: it is httpOnly (no JS access) and only `/auth/refresh` + `/auth/logout` read it server-side. The frontend reaches those via the `/api` proxy (same-origin), so the cookie is sent.

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/test/auth.e2e.spec.ts`

- [ ] **Step 1: Change cookie path in `auth.controller.ts`**

In `setRefreshCookie`, change `path: "/auth"` → `path: "/"`. In `logout`, change `res.clearCookie(REFRESH_COOKIE, { path: "/auth" })` → `{ path: "/" }`. Update the `REFRESH_COOKIE` comment if it mentions the path.

- [ ] **Step 2: Run the auth e2e suite — must stay green**
```
pnpm --filter @iam/api test
```
Expected: 50 passed (cookie-path change is transparent to the e2e tests, which set/read the cookie explicitly).

- [ ] **Step 3: Commit**
```
git add apps/api/src/auth/auth.controller.ts
git commit -m "fix(api): widen refresh cookie path to / so server-side route guards can read it"
```

---

## Task 3: Next.js dev proxy + env

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/.env.local`

- [ ] **Step 1: Add rewrites to `apps/web/next.config.ts`**

Replace its contents:
```typescript
import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const config: NextConfig = {
  transpilePackages: ["@iam/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/:path*`,
      },
    ];
  },
};

export default config;
```

> The browser calls `/api/auth/login` etc. Next rewrites to `http://localhost:4000/auth/login`. Same-origin → the `sameSite: "lax"` refresh cookie is sent and accepted. In prod (Phase 10) `API_ORIGIN` points at the deployed API and the cookie uses `sameSite: "none"; secure: true`.

- [ ] **Step 2: Create `apps/web/.env.local`**
```
NEXT_PUBLIC_API_URL=/api
API_ORIGIN=http://localhost:4000
```

> `NEXT_PUBLIC_API_URL` is the base the client fetches against (same-origin `/api`). `API_ORIGIN` is server-side only (used by the rewrite destination). Add `.env.local` is gitignored by default; also document in `.env.example`.

- [ ] **Step 3: Document in `.env.example`**

Append to repo-root `.env.example` (the `# --- Web ---` section):
```
NEXT_PUBLIC_API_URL=/api
API_ORIGIN=http://localhost:4000
```

- [ ] **Step 4: Verify build still passes**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
Expected: both exit 0.

- [ ] **Step 5: Commit**
```
git add apps/web/next.config.ts .env.example
git commit -m "feat(web): dev proxy /api → :4000 + NEXT_PUBLIC_API_URL env"
```

---

## Task 4: `lib/api/auth.ts` — typed auth API calls

Pure functions over `fetch`. No token logic here (the api-client handles Bearer + refresh); these are the typed shapes the rest of the app imports.

**Files:**
- Create: `apps/web/src/lib/api/auth.ts`
- Create: `apps/web/src/lib/api/auth.test.ts`

- [ ] **Step 1: Write `apps/web/src/lib/api/auth.ts`**
```typescript
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UserResponse,
} from "@iam/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function registerApi(input: RegisterRequest): Promise<AuthResponse> {
  return fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  }).then(json<AuthResponse>);
}

export function loginApi(input: LoginRequest): Promise<AuthResponse> {
  return fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  }).then(json<AuthResponse>);
}

export function refreshApi(): Promise<TokenResponse> {
  return fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  }).then(json<TokenResponse>);
}

export function logoutApi(): Promise<{ success: boolean }> {
  return fetch(`${BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).then(json<{ success: boolean }>);
}

export function meApi(accessToken: string): Promise<UserResponse> {
  return fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  }).then(json<UserResponse>);
}
```

- [ ] **Step 2: Create `apps/web/vitest.config.ts`**
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Write failing test `apps/web/src/lib/api/auth.test.ts`**
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginApi, meApi, refreshApi, registerApi } from "./auth";

const OK = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.NEXT_PUBLIC_API_URL = "/api";
});
afterEach(() => vi.unstubAllGlobals());

describe("auth api calls", () => {
  it("login posts credentials with credentials:include and returns AuthResponse", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ user: { id: "u" }, accessToken: "a", refreshToken: "r", expiresIn: 900 }),
    );
    const res = await loginApi({ email: "a@b.test", password: "Password1" });
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
    expect(res.accessToken).toBe("a");
  });

  it("register posts the full register body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ user: { id: "u" }, accessToken: "a", refreshToken: "r", expiresIn: 900 }),
    );
    await registerApi({
      company: "Acme", email: "a@b.test", password: "Password1",
      firstName: "A", lastName: "B",
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ company: "Acme", email: "a@b.test" });
  });

  it("refresh sends no body and uses credentials:include", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ accessToken: "a2", refreshToken: "r2", expiresIn: 900 }),
    );
    const res = await refreshApi();
    expect(res.accessToken).toBe("a2");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it("me attaches a Bearer token", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(OK({ id: "u", email: "a@b.test" }));
    await meApi("tok");
    expect(fetch).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({
      headers: { Authorization: "Bearer tok" },
    }));
  });

  it("throws an error carrying the status on non-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(null, { status: 401 }));
    await expect(meApi("tok")).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 4: Run the test**
```
pnpm --filter @iam/web test
```
Expected: 5 passed.

- [ ] **Step 5: Commit**
```
git add apps/web/src/lib/api/auth.ts apps/web/src/lib/api/auth.test.ts apps/web/vitest.config.ts
git commit -m "feat(web): typed auth api calls (register/login/refresh/logout/me) + tests"
```

---

## Task 5: `lib/auth/store.ts` — Zustand in-memory token store

Holds the access token + cached user in memory only. On load, attempts a silent refresh to repopulate (the refresh token is in the httpOnly cookie, not readable by JS).

**Files:**
- Create: `apps/web/src/lib/auth/store.ts`
- Create: `apps/web/src/lib/auth/store.test.ts`

- [ ] **Step 1: Write `apps/web/src/lib/auth/store.ts`**
```typescript
import { create } from "zustand";
import type { UserResponse } from "@iam/shared";

interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setAuth: (user: UserResponse, accessToken: string) => void;
  setToken: (accessToken: string) => void;
  clear: () => void;
  setStatus: (s: AuthState["status"]) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "idle",
  setAuth: (user, accessToken) => set({ user, accessToken, status: "authenticated" }),
  setToken: (accessToken) => set({ accessToken }),
  clear: () => set({ user: null, accessToken: null, status: "unauthenticated" }),
  setStatus: (status) => set({ status }),
}));

/** Read-only selector hook for components. */
export const useAuth = () =>
  useAuthStore((s) => ({
    user: s.user,
    accessToken: s.accessToken,
    status: s.status,
  }));
```

- [ ] **Step 2: Write failing test `apps/web/src/lib/auth/store.test.ts`**
```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./store";

beforeEach(() => useAuthStore.getState().clear());

describe("auth store", () => {
  it("starts idle with no user/token", () => {
    const s = useAuthStore.getState();
    expect(s.status).toBe("idle");
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
  });

  it("setAuth populates user+token and flips to authenticated", () => {
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.test" } as never, "tok");
    const s = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.accessToken).toBe("tok");
    expect(s.user?.email).toBe("a@b.test");
  });

  it("clear resets to unauthenticated with no credentials", () => {
    useAuthStore.getState().setAuth({ id: "u" } as never, "tok");
    useAuthStore.getState().clear();
    const s = useAuthStore.getState();
    expect(s.status).toBe("unauthenticated");
    expect(s.accessToken).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test**
```
pnpm --filter @iam/web test
```
Expected: store tests pass (3) + auth api tests (5) = 8 passed.

- [ ] **Step 4: Commit**
```
git add apps/web/src/lib/auth/store.ts apps/web/src/lib/auth/store.test.ts
git commit -m "feat(web): Zustand in-memory auth store (user, accessToken, status)"
```

---

## Task 6: `lib/auth/refresh.ts` + `lib/api-client.ts` — silent refresh & Bearer attach

The api-client is the single fetch wrapper the app uses for authenticated requests (other than the auth endpoints themselves). It attaches `Authorization: Bearer <accessToken>`, and on a 401 performs exactly one silent `/auth/refresh`, stores the new token, and retries the original request once. A second 401 logs out.

**Files:**
- Create: `apps/web/src/lib/auth/refresh.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/api-client.test.ts`

- [ ] **Step 1: Write `apps/web/src/lib/auth/refresh.ts`**
```typescript
import { refreshApi } from "../api/auth";
import { useAuthStore } from "./store";

let refreshing: Promise<boolean> | null = null;

/**
 * Attempt one silent refresh. Returns true on success (store updated), false
 * on failure (caller should log out). Concurrent callers share the single
 * in-flight refresh promise.
 */
export function silentRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const { accessToken } = await refreshApi();
      useAuthStore.getState().setToken(accessToken);
      return true;
    } catch {
      useAuthStore.getState().clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function logoutOnFailure(): void {
  useAuthStore.getState().clear();
}
```

- [ ] **Step 2: Write `apps/web/src/lib/api-client.ts`**
```typescript
import { useAuthStore } from "./auth/store";
import { silentRefresh } from "./auth/refresh";

export interface ApiError extends Error {
  status: number;
}

function toError(res: Response): ApiError {
  const err = new Error(`HTTP ${res.status}`) as ApiError;
  err.status = res.status;
  return err;
}

/**
 * Authenticated fetch. Attaches the in-memory access token; on a 401 it
 * attempts one silent refresh and retries the request once. A second failure
 * (or a refresh failure) throws and clears auth.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers, credentials: "include" });
  if (res.status !== 401) return res;

  const refreshed = await silentRefresh();
  if (!refreshed) throw toError(res);

  const newToken = useAuthStore.getState().accessToken;
  headers.set("Authorization", `Bearer ${newToken}`);
  const retry = await fetch(input, { ...init, headers, credentials: "include" });
  if (retry.status === 401) {
    useAuthStore.getState().clear();
  }
  return retry;
}

/** JSON helper for authenticated GET/POST/etc. Throws ApiError on non-ok. */
export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) throw toError(res);
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3: Write failing test `apps/web/src/lib/api-client.test.ts`**
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";
import { useAuthStore } from "./auth/store";

const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  useAuthStore.setState({ accessToken: "old", user: null, status: "authenticated" });
  process.env.NEXT_PUBLIC_API_URL = "/api";
});
afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("attaches the in-memory Bearer token", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(ok({}));
    await apiFetch("/api/anything");
    const [req, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req).toBe("/api/anything");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer old");
  });

  it("on 401 refreshes once and retries with the new token", async () => {
    // refresh returns a new access token; the retry succeeds
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // original
      .mockResolvedValueOnce(ok({ accessToken: "new", refreshToken: "r", expiresIn: 900 })) // refresh
      .mockResolvedValueOnce(ok({ ok: true })); // retry
    const res = await apiFetch("/api/anything");
    expect(res.ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe("new");
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it("clears auth and returns the 401 if refresh fails", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // original
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // refresh fails
    const res = await apiFetch("/api/anything");
    expect(res.status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
```

> Note: the second test relies on the refresh path calling `refreshApi()` which itself calls `fetch`. Because `fetch` is stubbed sequentially, the second mock response is consumed by the refresh call. This is intentional and keeps the test dependency-free.

- [ ] **Step 4: Run the tests**
```
pnpm --filter @iam/web test
```
Expected: api-client (3) + store (3) + auth api (5) = 11 passed.

- [ ] **Step 5: Commit**
```
git add apps/web/src/lib/auth/refresh.ts apps/web/src/lib/api-client.ts apps/web/src/lib/api-client.test.ts
git commit -m "feat(web): api-client with Bearer attach + single silent-refresh retry on 401"
```

---

## Task 7: Providers (QueryClient + auth hydration) in root layout

**Files:**
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/app/providers.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Write `apps/web/src/lib/query-client.ts`**
```typescript
import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}
```

- [ ] **Step 2: Write `apps/web/src/app/providers.tsx`**
```typescript
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { makeQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: Wrap the root layout in Providers**

Replace `apps/web/src/app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Industrial Asset & Maintenance SaaS",
  description: "B2B SaaS for industrial equipment, maintenance, and inspections.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify build**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
Expected: both exit 0.

- [ ] **Step 5: Commit**
```
git add apps/web/src/lib/query-client.ts apps/web/src/app/providers.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): QueryClientProvider in root layout"
```

---

## Task 8: Auth hooks (`useLogin`, `useRegister`, `useLogout`, `useAuth`)

TanStack Query mutations that call the typed API, then update the Zustand store.

**Files:**
- Create: `apps/web/src/lib/auth/hooks.ts`

- [ ] **Step 1: Write `apps/web/src/lib/auth/hooks.ts`**
```typescript
"use client";

import { useMutation } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest } from "@iam/shared";
import { loginApi, logoutApi, registerApi } from "../api/auth";
import { useAuthStore } from "./store";

export { useAuth } from "./store";

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: LoginRequest) => loginApi(input),
    onSuccess: ({ user, accessToken }) => setAuth(user, accessToken),
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: RegisterRequest) => registerApi(input),
    onSuccess: ({ user, accessToken }) => setAuth(user, accessToken),
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: () => logoutApi(),
    onSuccess: () => clear(),
  });
}
```

- [ ] **Step 2: Verify typecheck**
```
pnpm --filter @iam/web typecheck
```
Expected: exits 0.

- [ ] **Step 3: Commit**
```
git add apps/web/src/lib/auth/hooks.ts
git commit -m "feat(web): auth hooks (useLogin/useRegister/useLogout) via TanStack Query"
```

---

## Task 9: UI primitives (`button`, `form-field`, `auth-form`)

Hand-rolled on Tailwind v4 (shadcn `init` is broken on TW v4 — spec §7/§10). The `auth-form` is a shared RHF + Zod form parameterised by mode.

**Files:**
- Create: `apps/web/src/components/button.tsx`
- Create: `apps/web/src/components/form-field.tsx`
- Create: `apps/web/src/components/auth-form.tsx`

- [ ] **Step 1: Write `apps/web/src/components/button.tsx`**
```typescript
import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "ghost";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  ghost: "bg-transparent hover:bg-muted",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-4 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
```

- [ ] **Step 2: Write `apps/web/src/components/form-field.tsx`**
```typescript
import { forwardRef, type InputHTMLAttributes } from "react";

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, id, className = "", ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={`h-10 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring ${className}`}
        aria-invalid={!!error}
        {...props}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  ),
);
FormField.displayName = "FormField";
```

- [ ] **Step 3: Write `apps/web/src/components/auth-form.tsx`**
```typescript
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { LoginRequest, RegisterRequest } from "@iam/shared";
import { loginRequestSchema, registerRequestSchema } from "@iam/shared";
import { useLogin, useRegister } from "@/lib/auth/hooks";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { FormField } from "./form-field";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const login = useLogin();
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);

  const isRegister = mode === "register";
  const schema = isRegister ? registerRequestSchema : loginRequestSchema;

  const form = useForm<RegisterRequest | LoginRequest>({
    resolver: zodResolver(schema as never),
    defaultValues: isRegister
      ? { company: "", email: "", password: "", firstName: "", lastName: "" }
      : { email: "", password: "" },
  });

  async function onSubmit(values: RegisterRequest | LoginRequest) {
    setServerError(null);
    try {
      if (isRegister) await register.mutateAsync(values as RegisterRequest);
      else await login.mutateAsync(values as LoginRequest);
      router.push("/dashboard");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) setServerError("Invalid email or password.");
      else if (status === 409) setServerError("Email already registered.");
      else setServerError("Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {isRegister ? (
        <FormField
          id="company"
          label="Company name"
          error={form.formState.errors.company?.message as string | undefined}
          {...form.register("company" as never)}
        />
      ) : null}
      <FormField
        id="email"
        label="Email"
        type="email"
        error={form.formState.errors.email?.message as string | undefined}
        {...form.register("email")}
      />
      {isRegister ? (
        <>
          <FormField
            id="firstName"
            label="First name"
            error={form.formState.errors.firstName?.message as string | undefined}
            {...form.register("firstName" as never)}
          />
          <FormField
            id="lastName"
            label="Last name"
            error={form.formState.errors.lastName?.message as string | undefined}
            {...form.register("lastName" as never)}
          />
        </>
      ) : null}
      <FormField
        id="password"
        label="Password"
        type="password"
        error={form.formState.errors.password?.message as string | undefined}
        {...form.register("password")}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {isRegister ? "Create account" : "Log in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Verify typecheck + build**
```
pnpm --filter @iam/web typecheck
pnpm --filter @iam/web build
```
Expected: both exit 0.

- [ ] **Step 5: Commit**
```
git add apps/web/src/components/button.tsx apps/web/src/components/form-field.tsx apps/web/src/components/auth-form.tsx
git commit -m "feat(web): auth UI primitives (button, form-field, auth-form) on Tailwind v4"
```

---

## Task 10: `(auth)` routes — login + register pages

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/(auth)/layout.tsx`**
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-background p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/app/(auth)/login/page.tsx`**
```typescript
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium underline">
            Register
          </Link>
        </p>
      </div>
      <AuthForm mode="login" />
    </div>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/app/(auth)/register/page.tsx`**
```typescript
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>
        </p>
      </div>
      <AuthForm mode="register" />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**
```
pnpm --filter @iam/web build
```
Expected: exits 0; `/login` and `/register` routes emitted.

- [ ] **Step 5: Commit**
```
git add "apps/web/src/app/(auth)"
git commit -m "feat(web): /login and /register pages (RHF + Zod shared schemas)"
```

---

## Task 11: `(dashboard)` guarded layout + dashboard page + `/` redirect

The guard is a **Server Component** that reads the refresh cookie via `next/headers`. Presence of the cookie ≠ validity, but it is the correct gate for "can the browser attempt a silent refresh?": no cookie → no possible session → redirect to `/login`. The in-memory access token is hydrated client-side via a silent refresh on first render of the dashboard.

**Files:**
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/(dashboard)/layout.tsx`**
```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const hasRefresh = store.has("refresh_token");
  if (!hasRefresh) redirect("/login");
  return <>{children}</>;
}
```

- [ ] **Step 2: Write `apps/web/src/app/(dashboard)/dashboard/page.tsx`**
```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { meApi } from "@/lib/api/auth";
import { apiJson } from "@/lib/api-client";
import { silentRefresh } from "@/lib/auth/refresh";
import { useAuth, useLogout } from "@/lib/auth/hooks";
import { Button } from "@/components/button";
import { useAuthStore } from "@/lib/auth/store";

export default function DashboardPage() {
  const router = useRouter();
  const { user, status, accessToken } = useAuth();
  const logout = useLogout();

  // On first load the access token is in memory = empty. Attempt one silent
  // refresh (uses the httpOnly refresh cookie) to repopulate it.
  useEffect(() => {
    if (status === "idle") void silentRefresh();
  }, [status]);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi(useAuthStore.getState().accessToken ?? ""),
    enabled: !!accessToken,
  });

  const email = user?.email ?? me.data?.email;
  const loading = status === "idle" || (status === "loading" && !email);

  async function onLogout() {
    await logout.mutateAsync();
    router.push("/login");
  }

  if (loading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="ghost" onClick={onLogout}>
          Log out
        </Button>
      </div>
      <p className="text-muted-foreground">
        Welcome, {email ?? "user"}. (Full UI lands in Phase 7.)
      </p>
    </main>
  );
}
```

> `apiJson` is imported to keep the authenticated-fetch path exercised; if unused after wiring, drop it in Task 12 cleanup. Prefer keeping it: future dashboard queries use it.

- [ ] **Step 3: Replace `apps/web/src/app/page.tsx` (redirect `/` → `/dashboard`)**
```typescript
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
```

- [ ] **Step 4: Verify build**
```
pnpm --filter @iam/web build
```
Expected: exits 0; `/dashboard` guarded route present.

- [ ] **Step 5: Commit**
```
git add "apps/web/src/app/(dashboard)" apps/web/src/app/page.tsx
git commit -m "feat(web): guarded (dashboard) layout + dashboard page + / redirect"
```

---

## Task 12: Verification gate + manual smoke + docs

- [ ] **Step 1: Full monorepo gate**
```
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.yml up -d redis
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: all green. `pnpm test` includes the new web unit tests (11+) alongside api (50) and shared (16).

- [ ] **Step 2: Manual smoke (dev servers)**

In two terminals:
```
# terminal 1 — backend
docker compose up -d          # dev postgres + redis
pnpm --filter @iam/api dev    # :4000
# terminal 2 — frontend
pnpm --filter @iam/web dev    # :3000
```
Then in the browser at `http://localhost:3000`:
1. `/` redirects to `/dashboard`, which (no refresh cookie yet) redirects to `/login`.
2. Register → lands on `/dashboard` showing "Welcome, {email}".
3. Hard reload `/dashboard` → still authenticated (silent refresh via cookie repopulates the in-memory access token).
4. Log out → back to `/login`; `/dashboard` now redirects to `/login`.
5. Log in → `/dashboard`.

Record results in the DEVELOPMENT_LOG.

- [ ] **Step 3: Append to `DEVELOPMENT_LOG.md`**

Add a "## 2026-06-19 — Phase 1b: Auth Frontend" section: what was built (pages, store, api-client, silent refresh, guard), decisions (dev proxy for same-origin cookie, server-side cookie guard, hand-rolled UI primitives over shadcn), verified commands (real outputs), "Next: Phase 2".

- [ ] **Step 4: Update `docs/progress.md`**

Mark Phase 1 fully complete (1a ✅ + 1b ✅); check the Phase 1b critical-path checkbox.

- [ ] **Step 5: Commit + push**
```
git add DEVELOPMENT_LOG.md docs/progress.md
git commit -m "docs: phase 1b auth frontend (dev log + progress)"
git push -u origin feat/phase-1b-auth-frontend
```

---

## Verification Gate (Phase 1b)

- [ ] `pnpm lint` — pass (all workspaces)
- [ ] `pnpm typecheck` — pass (all workspaces)
- [ ] `pnpm test` — pass (api 50 + shared 16 + web unit tests)
- [ ] `pnpm build` — both apps build
- [ ] Manual browser flow: register → dashboard → reload (silent refresh) → logout → login
- [ ] CI green on `main`

If any step fails, fix it in this phase before reporting completion.
