import { expect, request, test } from "./fixtures";
import {
  registerCompany,
  loginThroughUi,
  navigateViaSidebar,
  API,
} from "./helpers";

test.describe("#5 RBAC — viewer cannot create work orders", () => {
  test("the create action is hidden and a direct form URL stays unavailable", async ({
    page,
  }) => {
    const suffix = `rbac-${Date.now()}`;
    const adminSession = await registerCompany(suffix);

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
    expect(viewerRes.status()).toBe(201);
    await ctx.dispose();

    // Viewer logs in (admin-created → must-change-password gate, handled by helper).
    await loginThroughUi(page, `viewer-${suffix}@test.local`);

    // The UI capability map hides the unauthorized action. Backend RolesGuard
    // coverage remains authoritative in the API integration suite.
    await navigateViaSidebar(page, /^work orders$/i, /\/work-orders/);
    await expect(
      page.getByRole("link", { name: /new work order/i }),
    ).toHaveCount(0);

    await page.goto("/work-orders/new");
    await expect(page.getByText(/do not have permission/i)).toBeVisible();
    await expect(page).toHaveURL(/\/work-orders\/new/);
  });
});
