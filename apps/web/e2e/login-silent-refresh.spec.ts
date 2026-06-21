import { test, expect } from "@playwright/test";
import { registerCompany, loginViaPage } from "./helpers";

test.describe("#2 login → reload (silent refresh)", () => {
  test("after login, a page reload keeps the user authenticated", async ({ page }) => {
    const suffix = `sr-${Date.now()}`;
    const session = await registerCompany(suffix);

    // Log in via the UI form so the httpOnly refresh cookie is set by the browser.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(`e2e-${suffix}@test.local`);
    await page.getByLabel(/password/i).fill("Password1");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

    // Reload — the in-memory token is gone; silent refresh must repopulate it
    // from the httpOnly cookie and keep us on /dashboard (not redirect to /login).
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });
});
