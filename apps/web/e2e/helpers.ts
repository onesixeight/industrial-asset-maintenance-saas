import {
  request,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const API = publicApiUrl.startsWith("http")
  ? new URL(publicApiUrl).origin
  : (process.env.API_ORIGIN ?? "http://localhost:4000");

export type Session = {
  accessToken: string;
  user: { id: string; companyId: string; role: string };
};

/**
 * Register a fresh company + admin via the public auth endpoint. Each spec
 * gets a unique email suffix so registrations don't collide on the shared DB.
 */
export async function registerCompany(suffix: string): Promise<Session> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post("/auth/register", {
    data: {
      company: `E2E Co ${suffix}`,
      email: `e2e-${suffix}@test.local`,
      password: "Password1",
      firstName: "E2E",
      lastName: "User",
    },
  });
  expect(res.status(), "register must create one company administrator").toBe(
    201,
  );
  const body = await res.json();
  await ctx.dispose();
  return body as Session;
}

/**
 * Login (real flow — populates the httpOnly refresh cookie via the response,
 * which Playwright stores in the browser context when called through a page).
 * Returns the session body. Call inside a page-context `request` so the cookie
 * is shared with subsequent page navigations.
 */
export async function loginViaPage(
  page: Page,
  email: string,
  password = "Password1",
): Promise<Session> {
  const res = await page.request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status(), "login must return the authenticated session").toBe(200);
  return (await res.json()) as Session;
}

/**
 * Seed a location + category + asset directly via the api (authed), returning
 * the asset id. Reuses the caller's access token.
 */
export async function seedAsset(accessToken: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API });
  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    const loc = await ctx.post("/locations", { data: { name: "Wh" }, headers });
    const cat = await ctx.post("/categories", {
      data: { name: "Pumps" },
      headers,
    });
    expect(loc.status(), "location seed failed").toBe(201);
    expect(cat.status(), "category seed failed").toBe(201);
    const locId = (await loc.json()).id;
    const catId = (await cat.json()).id;
    const asset = await ctx.post("/assets", {
      data: { name: "Pump 1", locationId: locId, categoryId: catId },
      headers,
    });
    expect(asset.status(), "asset seed failed").toBe(201);
    return (await asset.json()).id;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Set the in-memory access token in the browser so client-side apiFetch is
 * authenticated. We can't write to httpOnly cookies, but the auth store is
 * hydrated by a silent refresh on dashboard load — so just navigating to
 * /dashboard after login (cookie present) is enough. This helper is a no-op
 * placeholder kept for clarity; tests rely on the silent-refresh path.
 */
export async function hydrateAuth(page: Page): Promise<void> {
  // The dashboard page calls silentRefresh() on mount using the httpOnly
  // refresh cookie Playwright already holds — nothing to inject.
  await page.goto("/dashboard");
}

/**
 * Log a user in through the browser UI, navigating past the force-change-
 * password gate (Phase 1a) when present. Users created via the /users admin
 * endpoint ship with mustChangePassword=true; freshly registered companies
 * log straight in. Returns once we're on /dashboard.
 */
export async function loginThroughUi(
  page: Page,
  email: string,
  password = "Password1",
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();

  // After login the user lands on either /dashboard (registered company,
  // no gate) or /change-password (admin-created → must-change-password).
  // Wait for either, then handle the gate if present.
  await Promise.race([
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
    page.waitForURL(/\/change-password/, { timeout: 15_000 }),
  ]);

  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(password);
    await page.locator("#newPassword").fill(password);
    await page.getByRole("button", { name: "Set new password" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }
}

/** Navigate through the responsive sidebar in both desktop and mobile layouts. */
export async function navigateViaSidebar(
  page: Page,
  linkName: RegExp,
  expectedUrl: RegExp,
): Promise<void> {
  const openNavigation = page.getByRole("button", { name: /open navigation/i });
  const usesMobileNavigation = (page.viewportSize()?.width ?? 1024) < 1024;

  if (usesMobileNavigation) {
    await expect(openNavigation).toBeVisible();
    await openNavigation.click();
    const drawer = page.getByRole("dialog", { name: /mobile navigation/i });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: linkName }).click();
  } else {
    await page.getByRole("link", { name: linkName }).click();
  }

  await expect(page).toHaveURL(expectedUrl);
}
