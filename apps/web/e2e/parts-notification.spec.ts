import { test, expect, request } from "@playwright/test";
import { registerCompany, seedAsset, loginThroughUi, API } from "./helpers";

test.describe("#4 parts consume → notification (Phase 6→8 loop)", () => {
  test("consuming a part past its low-stock threshold makes the bell badge increment", async ({ page, browser }) => {
    const suffix = `pn-${Date.now()}`;
    const adminSession = await registerCompany(suffix);
    const assetId = await seedAsset(adminSession.accessToken);

    // Seed a manager in the same company who will receive the notification.
    const ctx = await request.newContext({ baseURL: API });
    // Create the manager via the users endpoint (admin-only).
    const mgrRes = await ctx.post("/users", {
      data: {
        email: `mgr-${suffix}@test.local`,
        firstName: "Mgr",
        lastName: "User",
        role: "manager",
        password: "Password1",
      },
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    expect(mgrRes.ok()).toBeTruthy();
    await ctx.dispose();

    // --- Admin creates a part + a WO, then we consume past the threshold. ---
    const adminCtx = await request.newContext({ baseURL: API });
    const h = { Authorization: `Bearer ${adminSession.accessToken}` };
    const partRes = await adminCtx.post("/parts", {
      data: { name: "Bearing", sku: `BRG-${suffix}`, quantity: 6, minQuantity: 5 },
      headers: h,
    });
    const part = await partRes.json();
    const woRes = await adminCtx.post("/work-orders", {
      data: { title: "Consume test", type: "corrective", assetId, priority: "medium" },
      headers: h,
    });
    const wo = await woRes.json();
    await adminCtx.dispose();

    // Log the MANAGER in via the browser (admin-created → must-change-password
    // gate, handled by loginThroughUi; refresh cookie set in the process).
    await loginThroughUi(page, `mgr-${suffix}@test.local`);

    // The bell badge should start at 0 (no notification).
    await expect(page.getByRole("button", { name: /notifications/i })).toBeVisible();

    // --- Now consume 3 (6 → 3, crosses min 5) as the admin via the API. ---
    const consumeCtx = await request.newContext({ baseURL: API });
    const consumeRes = await consumeCtx.post(`/work-orders/${wo.id}/parts`, {
      data: { partId: part.id, quantity: 3 },
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    expect(consumeRes.ok(), `consume failed: ${consumeRes.status()}`).toBeTruthy();
    await consumeCtx.dispose();

    // The manager's unread-count is polled every 60s, but we force a reload to
    // trigger an immediate refetch. The badge should now show "1".
    await page.reload();
    // Scope to the notifications badge so we don't match an unrelated "1".
    await expect(
      page.locator('button[aria-label="Notifications"] .text-\\[10px\\]', { hasText: "1" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
