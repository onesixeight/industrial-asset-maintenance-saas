import { expect, test } from "./fixtures";
import { registerCompany } from "./helpers";

test.describe("#2 login → reload (silent refresh)", () => {
  test("an expired private deep link returns to the same validated path after login", async ({
    page,
  }) => {
    const suffix = `deep-${Date.now()}`;
    await registerCompany(suffix);

    await page.goto("/work-orders?status=open");
    await expect(page).toHaveURL(
      /\/login\?next=%2Fwork-orders%3Fstatus%3Dopen/,
    );

    await page.getByLabel(/email/i).fill(`e2e-${suffix}@test.local`);
    await page.getByLabel(/password/i).fill("Password1");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    await expect(page).toHaveURL(/\/work-orders\?status=open/);
  });

  test("after login, a page reload keeps the user authenticated", async ({
    page,
  }) => {
    const suffix = `sr-${Date.now()}`;
    await registerCompany(suffix);

    // Log in via the UI form so the httpOnly refresh cookie is set by the browser.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(`e2e-${suffix}@test.local`);
    await page.getByLabel(/password/i).fill("Password1");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible();

    // Reload — the in-memory token is gone; silent refresh must repopulate it
    // from the httpOnly cookie and keep us on /dashboard (not redirect to /login).
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible();
  });
});
