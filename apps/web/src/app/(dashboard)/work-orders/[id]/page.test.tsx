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
import WorkOrderDetailPage from "./page";

const { getWorkOrder, updateWorkOrder, userPage, userGet } = vi.hoisted(() => ({
  getWorkOrder: vi.fn(async () => ({
    id: "work-order-1",
    title: "Inspect pump",
    description: null,
    type: "inspection",
    status: "open",
    priority: "medium",
    assetId: "asset-1",
    assignedToId: "00000000-0000-4000-8000-000000000001",
    dueDate: null,
    completedAt: null,
    deletedAt: null,
    companyId: "00000000-0000-4000-8000-000000000002",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  })),
  updateWorkOrder: vi.fn(),
  userPage: vi.fn(),
  userGet: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    email: "current@example.test",
    firstName: "Current",
    lastName: "Assignee",
    role: "technician",
    companyId: "00000000-0000-4000-8000-000000000002",
    mustChangePassword: false,
  })),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "work-order-1" }),
  usePathname: () => "/work-orders/work-order-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/work-orders", () => ({
  workOrdersApi: {
    get: getWorkOrder,
    transition: vi.fn(),
    update: updateWorkOrder,
    remove: vi.fn(),
  },
}));
vi.mock("@/lib/api/reference", () => ({
  usersApi: { page: userPage, get: userGet },
}));
vi.mock("@/lib/api/parts", () => ({
  partsApi: {
    page: vi.fn(async () => ({ items: [], page: 1, pageSize: 50, total: 0 })),
  },
  workOrderPartsApi: {
    list: vi.fn(async () => []),
    consume: vi.fn(),
    restock: vi.fn(),
  },
}));

describe("work-order detail auxiliary authorization", () => {
  beforeEach(() => {
    getWorkOrder.mockClear();
    updateWorkOrder.mockReset();
    userPage.mockReset().mockResolvedValue({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          email: "tech@example.test",
          firstName: "Tech",
          lastName: "Nician",
          role: "technician",
          companyId: "00000000-0000-4000-8000-000000000002",
          mustChangePassword: false,
          createdAt: "2026-08-11T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    userGet.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(["viewer", "technician"] as const)(
    "does not request users for a %s",
    async (role) => {
      useAuthStore.setState({
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "worker@example.test",
          firstName: "Work",
          lastName: "Er",
          role,
          companyId: "00000000-0000-4000-8000-000000000002",
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
          <WorkOrderDetailPage />
        </QueryClientProvider>,
      );

      await waitFor(() => expect(getWorkOrder).toHaveBeenCalled());
      expect(userPage).not.toHaveBeenCalled();
      expect(userGet).not.toHaveBeenCalled();
    },
  );

  it("serializes assignee changes while an update is pending", async () => {
    updateWorkOrder.mockImplementation(() => new Promise(() => undefined));
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000004",
        email: "manager@example.test",
        firstName: "Manage",
        lastName: "Er",
        role: "manager",
        companyId: "00000000-0000-4000-8000-000000000002",
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
        <WorkOrderDetailPage />
      </QueryClientProvider>,
    );
    const assignee = await screen.findByRole("combobox", { name: "Assignee" });
    await screen.findByRole("option", { name: "tech@example.test" });

    fireEvent.change(assignee, {
      target: { value: "00000000-0000-4000-8000-000000000003" },
    });
    fireEvent.change(assignee, { target: { value: "" } });

    await waitFor(() => expect(updateWorkOrder).toHaveBeenCalledTimes(1));
    expect(assignee).toBeDisabled();
  });

  it("loads the current assignee and preserves it while server-searching other users", async () => {
    userPage.mockImplementation(
      async (_request: unknown, _signal: unknown, search?: string) => ({
        items:
          search === "remote"
            ? [
                {
                  id: "00000000-0000-4000-8000-000000000005",
                  email: "remote@example.test",
                  firstName: "Remote",
                  lastName: "Tech",
                  role: "technician",
                  companyId: "00000000-0000-4000-8000-000000000002",
                  mustChangePassword: false,
                  createdAt: "2026-08-11T00:00:00.000Z",
                },
              ]
            : [],
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
        companyId: "00000000-0000-4000-8000-000000000002",
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
        <WorkOrderDetailPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("option", { name: "current@example.test" }),
    ).toBeInTheDocument();
    expect(userGet).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.anything(),
    );
    vi.useFakeTimers();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search assignees" }),
      { target: { value: "remote" } },
    );
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(userPage).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 50 },
      expect.anything(),
      "remote",
    );
    expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveValue(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(
      screen.getByRole("option", { name: "current@example.test" }),
    ).toBeInTheDocument();
  });
});
