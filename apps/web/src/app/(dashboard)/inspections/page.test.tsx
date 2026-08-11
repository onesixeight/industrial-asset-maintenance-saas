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
import InspectionsPage from "./page";

const { inspectionPage, assetPage, templatePage } = vi.hoisted(() => ({
  inspectionPage: vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  })),
  assetPage: vi.fn(),
  templatePage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/inspections",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/api/assets", () => ({ assetsApi: { page: assetPage } }));
vi.mock("@/lib/api/inspections", () => ({
  inspectionsApi: { page: inspectionPage },
  templatesApi: { page: templatePage },
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
const template = {
  id: "00000000-0000-4000-8000-000000000014",
  name: "Monthly check",
  version: 1,
  items: [{ id: "item-1", label: "Oil level", type: "pass_fail" as const }],
  companyId,
  createdAt: "2026-08-11T00:00:00.000Z",
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InspectionsPage />
    </QueryClientProvider>,
  );
}

describe("inspection relationship filters", () => {
  beforeEach(() => {
    inspectionPage.mockClear();
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
    templatePage.mockReset().mockImplementation(async (search?: string) => ({
      items:
        search === "annual"
          ? [
              {
                ...template,
                id: "00000000-0000-4000-8000-000000000016",
                name: "Annual check",
              },
            ]
          : [template],
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

  it("searches asset and template options on the server without dropping selected filters", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Boiler pump" });
    await screen.findByRole("option", { name: "Monthly check" });
    vi.useFakeTimers();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by asset" }),
      { target: { value: asset.id } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by inspection template" }),
      { target: { value: template.id } },
    );
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search assets for inspection filter",
      }),
      { target: { value: "roof" } },
    );
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search templates for inspection filter",
      }),
      { target: { value: "annual" } },
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
    expect(templatePage).toHaveBeenLastCalledWith(
      "annual",
      { page: 1, pageSize: 50 },
      expect.anything(),
    );
    expect(
      screen.getByRole("combobox", { name: "Filter by asset" }),
    ).toHaveValue(asset.id);
    expect(
      screen.getByRole("option", { name: "Boiler pump" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by inspection template" }),
    ).toHaveValue(template.id);
    expect(
      screen.getByRole("option", { name: "Monthly check" }),
    ).toBeInTheDocument();
  });
});
