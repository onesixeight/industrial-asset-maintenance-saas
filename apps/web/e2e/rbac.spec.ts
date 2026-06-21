import { test, expect, request } from "@playwright/test";
import { registerCompany, seedAsset, loginThroughUi, API } from "./helpers";

test.describe("#5 RBAC — viewer cannot create work orders", () => {
  test("a viewer's create-work-order submission is rejected by the backend (403)", async ({ page }) => {
    const suffix = `rbac-${Date.now()}`;
    const adminSession = await registerCompany(suffix);
    const assetId = await seedAsset(adminSession.accessToken);

    // Admin creates a viewer in the same company.
    const ctx = await request.newContext({ baseURL: API });
    const viewerRes = await ctx.post("/users", {
      data: {
        email: `viewer-${suffix}@test.local`,
        firstName: "Viewer",
        lastName: "User",
        role: "viewer",
        password: "Password1",
      },
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    expect(viewerRes.ok()).toBeTruthy();
    await ctx.dispose();

    // Viewer logs in (admin-created → must-change-password gate, handled by helper).
    await loginThroughUi(page, `viewer-${suffix}@test.local`);

    // Navigate to the new-work-order form and submit. The viewer can reach the
    // form (the UI doesn't cosmetically hide it), but the backend RolesGuard
    // rejects the POST with 403 — that's the real RBAC contract.
    await page.getByRole("link", { name: /work orders/i }).first().click();
    await page.getByRole("link", { name: /new work order/i }).click();
    await expect(page).toHaveURL(/\/work-orders\/new/);

    await page.getByLabel(/title/i).fill("Viewer attempt");
    await page.getByLabel(/^asset/i).selectOption({ label: "Pump 1" });
    await page.getByRole("button", { name: /^create$/i }).click();

    // The form surfaces an error and does NOT navigate to a new WO detail page.
    await expect(page.locator("text=/destructive|forbidden|403|HTTP 403/i").or(page.locator(".text-destructive"))).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/work-orders\/new/);
  });
});
