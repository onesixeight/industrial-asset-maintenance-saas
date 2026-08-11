// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import ChangePasswordPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  search: "",
  changePassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/api/auth", () => ({
  changePasswordApi: mocks.changePassword,
}));

const identity = {
  accessToken: "access-token",
  expiresIn: 900,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "tech@example.com",
    firstName: "Terry",
    lastName: "Technician",
    role: "technician" as const,
    companyId: "00000000-0000-4000-8000-000000000002",
    mustChangePassword: false,
  },
};

describe("ChangePasswordPage next destination", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.changePassword.mockReset().mockResolvedValue(identity);
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clear();
  });

  async function submitChangePassword(next: string): Promise<void> {
    mocks.search = `email=tech%40example.com&next=${encodeURIComponent(next)}`;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ChangePasswordPage />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Email")).toHaveValue("tech@example.com");
    await userEvent.type(
      screen.getByLabelText("Current (temporary) password"),
      "temporary1",
    );
    await userEvent.type(screen.getByLabelText("New password"), "replacement2");
    await userEvent.click(
      screen.getByRole("button", { name: "Set new password" }),
    );
  }

  it("continues to the validated QR deep link after a successful password change", async () => {
    await submitChangePassword("/assets/qr/asset-token");

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/assets/qr/asset-token"),
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: "access-token",
      status: "authenticated",
    });
  });

  it("falls back to the dashboard when the supplied continuation is external", async () => {
    await submitChangePassword("https://evil.example/steal");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: "access-token",
      status: "authenticated",
    });
  });
});
