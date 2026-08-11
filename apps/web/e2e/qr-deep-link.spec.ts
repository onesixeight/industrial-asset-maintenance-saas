import { expect, request, test } from "./fixtures";
import { API, registerCompany, seedAsset } from "./helpers";

test.describe("#6 QR deep link → login continuation → asset", () => {
  test("opens the asset encoded by a full QR payload after authentication", async ({
    page,
  }) => {
    const suffix = `qr-${Date.now()}`;
    const session = await registerCompany(suffix);
    const assetId = await seedAsset(session.accessToken);
    const api = await request.newContext({ baseURL: API });
    const assetResponse = await api.get(`/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(assetResponse.status()).toBe(200);
    const asset = (await assetResponse.json()) as { qrCode: string };
    await api.dispose();

    const webOrigin =
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const qrPayload = new URL(
      `/assets/qr/${encodeURIComponent(asset.qrCode)}`,
      webOrigin,
    ).toString();
    await page.goto(qrPayload);

    await expect(page).toHaveURL(/\/login\?next=%2Fassets%2Fqr%2F/);
    await page.getByLabel(/email/i).fill(`e2e-${suffix}@test.local`);
    await page.getByLabel(/password/i).fill("Password1");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    await expect(page).toHaveURL(new RegExp(`/assets/${assetId}$`));
    await expect(page.getByRole("heading", { name: "Pump 1" })).toBeVisible();
  });
});
