// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import InspectionDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "inspection-1" }),
  usePathname: () => "/inspections/inspection-1",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/api/inspections", () => ({
  inspectionsApi: {
    get: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      assetId: "00000000-0000-4000-8000-000000000002",
      templateId: "00000000-0000-4000-8000-000000000003",
      templateVersion: 1,
      templateSnapshot: {
        name: "Daily v1",
        items: [{ id: "item-1", label: "Oil level", type: "pass_fail" }],
      },
      results: [{ itemId: "item-1", value: "pass" }],
      passed: true,
      notes: null,
      inspectedById: "00000000-0000-4000-8000-000000000004",
      companyId: "00000000-0000-4000-8000-000000000005",
      createdAt: "2026-08-11T00:00:00.000Z",
    })),
  },
  templatesApi: {
    get: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000003",
      name: "Daily v2",
      version: 2,
      items: [{ id: "item-2", label: "Pressure", type: "pass_fail" }],
      companyId: "00000000-0000-4000-8000-000000000005",
      createdAt: "2026-08-11T01:00:00.000Z",
    })),
  },
}));

describe("inspection history detail", () => {
  it("renders labels from the immutable submitted template snapshot", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <InspectionDetailPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Oil level")).toBeInTheDocument();
    expect(screen.getByText("Daily v1 (version 1)")).toBeInTheDocument();
    expect(screen.queryByText("Pressure")).not.toBeInTheDocument();
  });
});
