// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { AssetResponse, UserResponse } from "@iam/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import AssetDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  remove: vi.fn(),
  updateStatus: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  usePathname: () => "/assets/11111111-1111-4111-8111-111111111111",
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));

vi.mock("@/lib/api/assets", () => ({
  assetsApi: {
    get: mocks.get,
    remove: mocks.remove,
    updateStatus: mocks.updateStatus,
  },
}));

vi.mock("@/components/qr-code-display", () => ({
  QrCodeDisplay: () => <div />,
}));

const asset: AssetResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Cooling pump",
  description: null,
  serialNumber: "PUMP-1",
  qrCode: "asset-token",
  status: "active",
  locationId: "22222222-2222-4222-8222-222222222222",
  categoryId: "33333333-3333-4333-8333-333333333333",
  companyId: "44444444-4444-4444-8444-444444444444",
  purchaseDate: null,
  warrantyDate: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

function user(role: UserResponse["role"]): UserResponse {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    email: `${role}@example.com`,
    firstName: "Test",
    lastName: "User",
    role,
    companyId: asset.companyId,
    mustChangePassword: false,
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AssetDetailPage />
    </QueryClientProvider>,
  );
}

describe("AssetDetailPage inspection action", () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue(asset);
    mocks.remove.mockReset();
    mocks.updateStatus.mockReset();
    mocks.push.mockReset();
  });

  afterEach(cleanup);

  it("lets a technician start an inspection for the scanned asset", async () => {
    useAuthStore.setState({
      user: user("technician"),
      accessToken: "token",
      status: "authenticated",
    });
    renderPage();

    const inspect = await screen.findByRole("link", { name: /inspect asset/i });
    expect(inspect).toHaveAttribute(
      "href",
      `/inspections/new?assetId=${asset.id}`,
    );
  });

  it("does not offer inspection submission to a viewer", async () => {
    useAuthStore.setState({
      user: user("viewer"),
      accessToken: "token",
      status: "authenticated",
    });
    renderPage();

    await screen.findByRole("heading", { name: asset.name });
    expect(
      screen.queryByRole("link", { name: /inspect asset/i }),
    ).not.toBeInTheDocument();
  });

  it("lets a manager transition the asset status and updates the detail", async () => {
    const userActions = userEvent.setup();
    mocks.updateStatus.mockResolvedValue({ ...asset, status: "maintenance" });
    useAuthStore.setState({
      user: user("manager"),
      accessToken: "token",
      status: "authenticated",
    });
    renderPage();

    await userActions.selectOptions(
      await screen.findByRole("combobox", { name: /asset status/i }),
      "maintenance",
    );
    await userActions.click(
      screen.getByRole("button", { name: /update status/i }),
    );

    expect(mocks.updateStatus).toHaveBeenCalledWith(asset.id, {
      status: "maintenance",
    });
    expect(
      await screen.findByText("Maintenance", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("does not expose status management to a viewer", async () => {
    useAuthStore.setState({
      user: user("viewer"),
      accessToken: "token",
      status: "authenticated",
    });
    renderPage();

    await screen.findByRole("heading", { name: asset.name });
    expect(
      screen.queryByRole("combobox", { name: /asset status/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update status/i }),
    ).not.toBeInTheDocument();
  });
});
