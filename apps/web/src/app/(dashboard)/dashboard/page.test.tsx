// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({
    user: { email: "admin@example.test" },
    status: "authenticated",
  }),
  useLogout: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/auth/session", () => ({ clearIdentity: vi.fn() }));
vi.mock("@/lib/api/reports", () => ({ downloadWorkOrdersCsv: vi.fn() }));
vi.mock("@/lib/api/dashboard", () => ({
  dashboardApi: {
    stats: vi.fn(async () => ({
      workOrders: {
        open: 2,
        inProgress: 1,
        onHold: 0,
        completed: 3,
        cancelled: 0,
        overdue: 1,
      },
      assets: { total: 4, maintenance: 1 },
      inspections: { last30Days: 2, passed: 1, passRate: 0.5 },
      parts: { lowStock: 1, outOfStock: 0 },
    })),
    trends: vi.fn(async () => ({
      windowDays: 30,
      mttrHours: 6,
      series: [
        { date: "2026-08-10", woCreated: 4, woCompleted: 2, inspections: 1 },
      ],
    })),
  },
}));

describe("dashboard trend presentation", () => {
  afterEach(cleanup);

  it("presents both work-order series with meaningful names and values", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    const chart = await screen.findByRole("figure", {
      name: "Work orders created and completed over the last 30 days",
    });
    expect(chart).toHaveTextContent("Created");
    expect(chart).toHaveTextContent("Completed");
    expect(
      screen.getByRole("group", { name: "2026-08-10: 4 created, 2 completed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Dashboard actions" }),
    ).toContainElement(
      screen.getByRole("button", { name: "Export work orders (CSV)" }),
    );
  });
});
