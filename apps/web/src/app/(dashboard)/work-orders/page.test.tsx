// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import WorkOrdersPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/work-orders",
  useRouter: () => ({ replace: vi.fn() }),
}));

const { workOrderPage, assetPage, userList, userPage } = vi.hoisted(() => ({
  workOrderPage: vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  })),
  assetPage: vi.fn(),
  userList: vi.fn(async () => []),
  userPage: vi.fn(),
}));

const companyId = "00000000-0000-4000-8000-000000000002";
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

vi.mock("@/lib/api/work-orders", () => ({
  workOrdersApi: { page: workOrderPage },
}));
vi.mock("@/lib/api/assets", () => ({
  assetsApi: { page: assetPage, all: assetPage },
}));
vi.mock("@/lib/api/reference", () => ({
  usersApi: { list: userList, page: userPage },
}));

describe("work-order auxiliary authorization", () => {
  beforeEach(() => {
    workOrderPage.mockClear();
    assetPage
      .mockReset()
      .mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    userList.mockClear();
    userPage
      .mockReset()
      .mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "viewer@example.test",
        firstName: "View",
        lastName: "Er",
        role: "viewer",
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

  it.each(["viewer", "technician"] as const)(
    "does not request the admin-only users list for a %s",
    async (role) => {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, role } : null,
      }));
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <WorkOrdersPage />
        </QueryClientProvider>,
      );

      await waitFor(() => expect(workOrderPage).toHaveBeenCalled());
      expect(userList).not.toHaveBeenCalled();
      expect(userPage).not.toHaveBeenCalled();
    },
  );

  it("searches asset and assignee filters on the server without dropping selected options", async () => {
    assetPage.mockImplementation(async (filters: { search?: string }) => ({
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
    userPage.mockImplementation(
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
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WorkOrdersPage />
      </QueryClientProvider>,
    );
    await screen.findByRole("option", { name: "Boiler pump" });
    await screen.findByRole("option", { name: "tech@example.test" });
    vi.useFakeTimers();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by asset" }),
      { target: { value: asset.id } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by assignee" }),
      { target: { value: technician.id } },
    );
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search assets for work-order filter",
      }),
      { target: { value: "roof" } },
    );
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search assignees for work-order filter",
      }),
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
    expect(
      screen.getByRole("combobox", { name: "Filter by asset" }),
    ).toHaveValue(asset.id);
    expect(
      screen.getByRole("option", { name: "Boiler pump" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by assignee" }),
    ).toHaveValue(technician.id);
    expect(
      screen.getByRole("option", { name: "tech@example.test" }),
    ).toBeInTheDocument();
  });
});
