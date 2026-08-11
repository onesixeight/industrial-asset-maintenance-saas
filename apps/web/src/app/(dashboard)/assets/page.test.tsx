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
import AssetsPage from "./page";

const { assetPage, locationPage, categoryPage } = vi.hoisted(() => ({
  assetPage: vi.fn(),
  locationPage: vi.fn(),
  categoryPage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/assets",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/api/assets", () => ({ assetsApi: { page: assetPage } }));
vi.mock("@/lib/api/reference", () => ({
  locationsApi: { page: locationPage },
  categoriesApi: { page: categoryPage },
}));

const pump = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "Boiler pump",
  description: null,
  serialNumber: "BP-1",
  qrCode: "qr-token",
  status: "active" as const,
  locationId: "00000000-0000-4000-8000-000000000014",
  categoryId: "00000000-0000-4000-8000-000000000015",
  companyId: "00000000-0000-4000-8000-000000000010",
  purchaseDate: null,
  warrantyDate: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const basement = {
  id: pump.locationId,
  name: "Basement",
  description: null,
  companyId: pump.companyId,
};

const mechanical = {
  id: pump.categoryId,
  name: "Mechanical",
  description: null,
  companyId: pump.companyId,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AssetsPage />
    </QueryClientProvider>,
  );
}

describe("asset list filters", () => {
  beforeEach(() => {
    assetPage
      .mockReset()
      .mockImplementation(async (filters: { search?: string }) =>
        filters.search === "boiler"
          ? { items: [pump], page: 1, pageSize: 20, total: 1 }
          : { items: [], page: 1, pageSize: 20, total: 0 },
      );
    locationPage.mockReset().mockImplementation(async (search?: string) => ({
      items:
        search === "roof"
          ? [
              {
                ...basement,
                id: "00000000-0000-4000-8000-000000000016",
                name: "Roof",
              },
            ]
          : [basement],
      page: 1,
      pageSize: 50,
      total: 1,
    }));
    categoryPage.mockReset().mockImplementation(async (search?: string) => ({
      items:
        search === "electrical"
          ? [
              {
                ...mechanical,
                id: "00000000-0000-4000-8000-000000000017",
                name: "Electrical",
              },
            ]
          : [mechanical],
      page: 1,
      pageSize: 50,
      total: 1,
    }));
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "viewer@example.test",
        firstName: "View",
        lastName: "Er",
        role: "viewer",
        companyId: pump.companyId,
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

  it("gives search and filter controls explicit accessible names", () => {
    renderPage();

    expect(
      screen.getByRole("textbox", { name: "Search assets" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by asset status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by location" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by category" }),
    ).toBeInTheDocument();
  });

  it("waits for the search quiet period before requesting matching assets", async () => {
    vi.useFakeTimers();
    renderPage();
    await act(async () => {
      await Promise.resolve();
    });
    expect(assetPage).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "boiler" },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(assetPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Boiler pump")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });
    expect(assetPage).toHaveBeenCalledTimes(2);
    expect(assetPage.mock.calls[1]?.[0]).toMatchObject({ search: "boiler" });
  });

  it("searches location and category options on the server without dropping selected filters", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Basement" });
    await screen.findByRole("option", { name: "Mechanical" });
    vi.useFakeTimers();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by location" }),
      {
        target: { value: basement.id },
      },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by category" }),
      {
        target: { value: mechanical.id },
      },
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search locations" }),
      {
        target: { value: "roof" },
      },
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search categories" }),
      {
        target: { value: "electrical" },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(locationPage).toHaveBeenLastCalledWith(
      "roof",
      { page: 1, pageSize: 50 },
      expect.anything(),
    );
    expect(categoryPage).toHaveBeenLastCalledWith(
      "electrical",
      { page: 1, pageSize: 50 },
      expect.anything(),
    );
    expect(
      screen.getByRole("combobox", { name: "Filter by location" }),
    ).toHaveValue(basement.id);
    expect(
      screen.getByRole("option", { name: "Basement" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by category" }),
    ).toHaveValue(mechanical.id);
    expect(
      screen.getByRole("option", { name: "Mechanical" }),
    ).toBeInTheDocument();
  });
});
