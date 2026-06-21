import { test, expect } from "@playwright/test";
import { registerCompany, API } from "./helpers";

test.describe("#1 register → dashboard", () => {
  test("registering a fresh company lands on the dashboard with KPI cards", async ({ page }) => {
    const suffix = `reg-${Date.now()}`;
    // Go to register and submit the form through the UI.
    await page.goto("/register");
    await page.getByLabel(/company/i).fill(`E2E Co ${suffix}`);
    await page.getByLabel(/email/i).fill(`e2e-${suffix}@test.local`);
    await page.getByLabel(/^first name/i).fill("E2E");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/password/i).fill("Password1");
    await page.getByRole("button", { name: /register|sign up|create/i }).click();

    // Should redirect to /dashboard and render KPI cards.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/open work orders/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });
});
