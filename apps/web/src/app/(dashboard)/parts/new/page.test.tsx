// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import { partsApi } from "@/lib/api/parts";
import NewPartPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/parts/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/parts", () => ({
  partsApi: { create: vi.fn() },
}));

describe("new part", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
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
  });

  afterEach(cleanup);

  it("allows only one create request while submission is pending", async () => {
    vi.mocked(partsApi.create).mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<NewPartPage />);
    await userEvent.type(screen.getByLabelText("Name"), "Bearing");
    await userEvent.type(screen.getByLabelText("SKU"), "BRG-1");
    const submit = screen.getByRole("button", { name: "Create part" });

    await userEvent.dblClick(submit);

    expect(partsApi.create).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
  });
});
