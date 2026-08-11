// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import { NotificationsMenu } from "./notifications-menu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}));

const { page, list } = vi.hoisted(() => ({
  page: vi.fn(
    async (_query: unknown, request: { page: number; pageSize: number }) => ({
      items: [
        {
          id: request.page === 1 ? "new" : "old",
          title: request.page === 1 ? "Newest notice" : "Older notice",
          message: "Message",
          read: true,
          createdAt: "2026-08-11T00:00:00.000Z",
        },
      ],
      page: request.page,
      pageSize: request.pageSize,
      total: 11,
    }),
  ),
  list: vi.fn(async () => [
    {
      id: "new",
      title: "Newest notice",
      message: "Message",
      read: true,
      createdAt: "2026-08-11T00:00:00.000Z",
    },
  ]),
}));

vi.mock("@/lib/api/notifications", () => ({
  notificationsApi: {
    page,
    list,
    unreadCount: vi.fn(async () => ({ count: 0 })),
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => ({ count: 0 })),
  },
}));

describe("NotificationsMenu pagination", () => {
  beforeEach(() => {
    page.mockClear();
    list.mockClear();
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "viewer@example.test",
        firstName: "View",
        lastName: "Er",
        role: "viewer",
        companyId: "00000000-0000-4000-8000-000000000002",
        mustChangePassword: false,
      },
      accessToken: "token",
      status: "authenticated",
    });
  });

  afterEach(cleanup);

  it("lets the user reach an older notification page", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <NotificationsMenu />
      </QueryClientProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Notifications" }),
    );
    expect(await screen.findByText("Newest notice")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Older notifications" }),
    );

    expect(await screen.findByText("Older notice")).toBeInTheDocument();
    await waitFor(() =>
      expect(page).toHaveBeenLastCalledWith(
        {},
        { page: 2, pageSize: 10 },
        expect.any(AbortSignal),
      ),
    );
  });
});
