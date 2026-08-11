// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import { partsApi } from "@/lib/api/parts";
import PartsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/parts",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const archivedPart = {
  id: "part-archived",
  name: "Archived bearing",
  sku: "OLD-1",
  description: null,
  quantity: 7,
  minQuantity: 2,
  companyId: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

vi.mock("@/lib/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));
vi.mock("@/lib/api/parts", () => ({
  partsApi: {
    page: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
    archivedPage: vi.fn(async () => ({
      items: [archivedPart],
      page: 1,
      pageSize: 20,
      total: 1,
    })),
    restore: vi.fn(async () => archivedPart),
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PartsPage />
    </QueryClientProvider>,
  );
}

describe("archived parts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "manager@example.test",
        firstName: "Manage",
        lastName: "Er",
        role: "manager",
        companyId: archivedPart.companyId,
        mustChangePassword: false,
      },
      accessToken: "token",
      status: "authenticated",
    });
  });

  afterEach(cleanup);

  it("lets a manager switch to archived inventory and restore a part", async () => {
    renderPage();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Inventory view" }),
      "archived",
    );
    expect(await screen.findByText("Archived bearing")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Restore Archived bearing" }),
    );

    expect(partsApi.archivedPage).toHaveBeenCalled();
    expect(partsApi.restore).toHaveBeenCalledWith("part-archived");
  });

  it("does not expose the archived view or restore action to a viewer", async () => {
    useAuthStore.setState((state) => ({
      ...state,
      user: state.user ? { ...state.user, role: "viewer" } : null,
    }));
    renderPage();

    expect(
      screen.queryByRole("combobox", { name: "Inventory view" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Restore / }),
    ).not.toBeInTheDocument();
  });
});
