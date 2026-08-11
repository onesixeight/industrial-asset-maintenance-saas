// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import EditPartPage from "./page";
import { partsApi } from "@/lib/api/parts";

const part = {
  id: "part-1",
  name: "Bearing",
  sku: "BRG-1",
  description: null,
  quantity: 10,
  minQuantity: 2,
  companyId: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "part-1" }),
  usePathname: () => "/parts/part-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/parts", () => ({
  partsApi: {
    get: vi.fn(async () => part),
    update: vi.fn(),
    adjust: vi.fn(async (_id: string, input: { delta: number }) => ({
      ...part,
      quantity: part.quantity + input.delta,
    })),
    remove: vi.fn(),
  },
}));

describe("part editor hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "manager@example.test",
        firstName: "Manage",
        lastName: "Er",
        role: "manager",
        companyId: part.companyId,
        mustChangePassword: false,
      },
      accessToken: "token",
      status: "authenticated",
    });
  });

  afterEach(cleanup);

  it("initializes from the loaded part without overwriting an in-progress edit", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <EditPartPage />
      </QueryClientProvider>,
    );

    const name = await screen.findByDisplayValue("Bearing");
    await userEvent.clear(name);
    await userEvent.type(name, "Draft bearing");
    client.setQueryData(["part", "part-1"], {
      ...part,
      name: "Server bearing",
    });

    expect(screen.getByDisplayValue("Draft bearing")).toBeInTheDocument();
  });

  it("uses the audited adjustment endpoint instead of generic quantity patch", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <EditPartPage />
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue("Bearing");

    await userEvent.type(screen.getByLabelText("Signed quantity change"), "5");
    await userEvent.type(screen.getByLabelText("Reason"), "Supplier restock");
    await userEvent.click(
      screen.getByRole("button", { name: "Apply adjustment" }),
    );

    expect(partsApi.adjust).toHaveBeenCalledWith("part-1", {
      delta: 5,
      reason: "Supplier restock",
    });
  });

  it("requires confirmation before archiving a part", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <EditPartPage />
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue("Bearing");

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(partsApi.remove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Archive part" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm archive" }),
    );
    expect(partsApi.remove).toHaveBeenCalledTimes(1);
  });

  it("allows only one save request while a save is pending", async () => {
    vi.mocked(partsApi.update).mockImplementation(
      () => new Promise(() => undefined),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <EditPartPage />
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue("Bearing");
    const save = screen.getByRole("button", { name: "Save" });

    await userEvent.dblClick(save);

    expect(partsApi.update).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
  });

  it("sends null when an existing description is cleared", async () => {
    vi.mocked(partsApi.get).mockResolvedValueOnce({
      ...part,
      description: "Old notes",
    });
    vi.mocked(partsApi.update).mockResolvedValueOnce({
      ...part,
      description: null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <EditPartPage />
      </QueryClientProvider>,
    );

    const description = await screen.findByDisplayValue("Old notes");
    await userEvent.clear(description);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(partsApi.update).toHaveBeenCalledWith(
      "part-1",
      expect.objectContaining({
        description: null,
      }),
    );
  });
});
