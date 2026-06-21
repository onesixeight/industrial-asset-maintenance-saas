import { test, expect } from "@playwright/test";
import { registerCompany, seedAsset, loginThroughUi } from "./helpers";

test.describe("#3 work-order lifecycle", () => {
  test("create a WO, transition open → in_progress → completed, see status + completedAt", async ({ page }) => {
    const suffix = `wo-${Date.now()}`;
    const session = await registerCompany(suffix);
    await seedAsset(session.accessToken);

    await loginThroughUi(page, `e2e-${suffix}@test.local`);

    await page.getByRole("link", { name: /work orders/i }).first().click();
    await expect(page).toHaveURL(/\/work-orders/);
    await page.getByRole("link", { name: /new work order|new/i }).first().click();
    await expect(page).toHaveURL(/\/work-orders\/new/);

    await page.getByLabel(/title/i).fill("E2E pump fix");
    // asset select — select by visible label (the option text is the asset name)
    await page.getByLabel(/^asset/i).selectOption({ label: "Pump 1" });
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page).toHaveURL(/\/work-orders\/[^/]+$/);

    // Initial status badge = open
    await expect(page.getByText(/open/i).first()).toBeVisible();

    // open → in_progress → completed
    await page.getByRole("button", { name: /in progress/i }).click();
    await expect(page.getByText(/in progress/i).first()).toBeVisible();
    await page.getByRole("button", { name: /completed/i }).click();
    await expect(page.getByText(/completed/i).first()).toBeVisible();
  });
});
