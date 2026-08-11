// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import NewWorkOrderPage from "./page";

const { assetPage, userPage, createWorkOrder, push } = vi.hoisted(() => ({
  assetPage: vi.fn(),
  userPage: vi.fn(),
  createWorkOrder: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/work-orders/new",
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/api/assets", () => ({ assetsApi: { page: assetPage } }));
vi.mock("@/lib/api/reference", () => ({ usersApi: { page: userPage } }));
vi.mock("@/lib/api/work-orders", () => ({
  workOrdersApi: { create: createWorkOrder },
}));

const companyId = "00000000-0000-4000-8000-000000000010";
const asset = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "Boiler pump",
  description: null,
  serialNumber: null,
  qrCode: "qr-token",
  status: "active" as const,
  locationId: "00000000-0000-4000-8000-000000000012",
  categoryId: "00000000-0000-4000-8000-000000000013",
  companyId,
  purchaseDate: null,
  warrantyDate: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};
const technician = {
  id: "00000000-0000-4000-8000-000000000014",
  email: "tech@example.test",
  firstName: "Tech",
  lastName: "Nician",
  role: "technician" as const,
  companyId,
  mustChangePassword: false,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewWorkOrderPage />
    </QueryClientProvider>,
  );
}

describe("new work-order relationship selectors", () => {
  beforeEach(() => {
    assetPage
      .mockReset()
      .mockImplementation(async (filters: { search?: string }) => ({
        items:
          filters.search === "roof"
            ? [
                {
                  ...asset,
                  id: "00000000-0000-4000-8000-000000000015",
                  name: "Roof unit",
                },
              ]
            : [asset],
        page: 1,
        pageSize: 50,
        total: 1,
      }));
    userPage
      .mockReset()
      .mockImplementation(
        async (_request: unknown, _signal: unknown, search?: string) => ({
          items:
            search === "remote"
              ? [
                  {
                    ...technician,
                    id: "00000000-0000-4000-8000-000000000016",
                    email: "remote@example.test",
                  },
                ]
              : [technician],
          page: 1,
          pageSize: 50,
          total: 1,
        }),
      );
    createWorkOrder.mockReset();
    push.mockReset();
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000004",
        email: "manager@example.test",
        firstName: "Manage",
        lastName: "Er",
        role: "manager",
        companyId,
        mustChangePassword: false,
      },
      accessToken: "token",
      status: "authenticated",
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("searches assets and assignees on the server while keeping current form selections", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Boiler pump" });
    await screen.findByRole("option", { name: "tech@example.test" });
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("combobox", { name: "Asset" }), {
      target: { value: asset.id },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Assignee (optional)" }),
      { target: { value: technician.id } },
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search assets" }), {
      target: { value: "roof" },
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search assignees" }),
      { target: { value: "remote" } },
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(assetPage).toHaveBeenLastCalledWith(
      { search: "roof" },
      { page: 1, pageSize: 50 },
      expect.anything(),
    );
    expect(userPage).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 50 },
      expect.anything(),
      "remote",
    );
    expect(screen.getByRole("combobox", { name: "Asset" })).toHaveValue(
      asset.id,
    );
    expect(
      screen.getByRole("option", { name: "Boiler pump" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Assignee (optional)" }),
    ).toHaveValue(technician.id);
    expect(
      screen.getByRole("option", { name: "tech@example.test" }),
    ).toBeInTheDocument();
  });
});
