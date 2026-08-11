import { expect, test } from "./fixtures";
import {
  registerCompany,
  seedAsset,
  loginThroughUi,
  navigateViaSidebar,
  API,
} from "./helpers";

test.describe("#3 work-order lifecycle", () => {
  test("create a WO, transition open → in_progress → completed, see status + completedAt", async ({
    page,
  }) => {
    const suffix = `wo-${Date.now()}`;
    const session = await registerCompany(suffix);
    await seedAsset(session.accessToken);

    await loginThroughUi(page, `e2e-${suffix}@test.local`);

    await navigateViaSidebar(page, /^work orders$/i, /\/work-orders/);
    await page
      .getByRole("link", { name: /new work order|new/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/work-orders\/new/);

    await page.getByLabel(/title/i).fill("E2E pump fix");
    // asset select — select by visible label (the option text is the asset name)
    await page.getByLabel(/^asset/i).selectOption({ label: "Pump 1" });
    await page.getByRole("button", { name: /^create$/i }).click();
    await page.waitForURL(
      (url) =>
        url.pathname !== "/work-orders/new" &&
        /^\/work-orders\/[^/]+$/.test(url.pathname),
    );

    const workOrderId = new URL(page.url()).pathname.split("/").at(-1);
    expect(workOrderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Initial status badge = open.
    await expect(page.getByText(/^Open$/).first()).toBeVisible();

    // open → in_progress → completed
    await page.getByRole("button", { name: /in progress/i }).click();
    await expect(page.getByText(/^In progress$/).first()).toBeVisible();

    await page.getByRole("button", { name: /completed/i }).click();
    await expect(page.getByText(/^Completed$/).first()).toBeVisible();
    await expect(
      page
        .locator("dt", { hasText: /^Completed at$/ })
        .locator("xpath=following-sibling::dd[1]"),
    ).not.toHaveText("—");

    // Verify the persisted server state independently of React Query's
    // refetch timing and browser response-event URL rewriting.
    const completed = await page.request.get(
      `${API}/work-orders/${workOrderId}`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    );
    expect(completed.status()).toBe(200);
    const completedBody = await completed.json();
    expect(completedBody.status).toBe("completed");
    expect(Number.isNaN(Date.parse(completedBody.completedAt))).toBe(false);
  });
});
