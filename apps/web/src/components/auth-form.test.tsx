// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/auth/hooks", () => ({
  useLogin: () => ({ mutateAsync: mocks.login }),
  useRegister: () => ({ mutateAsync: mocks.register }),
}));

describe("AuthForm next destination", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.login.mockReset().mockResolvedValue(undefined);
    mocks.register.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  async function submitLogin(): Promise<void> {
    await userEvent.type(screen.getByLabelText("Email"), "tech@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  }

  it("continues to a validated QR deep link after login", async () => {
    window.history.replaceState(
      {},
      "",
      "/login?next=%2Fassets%2Fqr%2Fasset-token",
    );
    render(<AuthForm mode="login" />);

    await submitLogin();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/assets/qr/asset-token"),
    );
  });

  it("falls back to the dashboard for an external next destination", async () => {
    window.history.replaceState(
      {},
      "",
      "/login?next=https%3A%2F%2Fevil.example%2Fsteal",
    );
    render(<AuthForm mode="login" />);

    await submitLogin();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
  });

  it.each([
    {
      name: "a validated QR deep link",
      next: "/assets/qr/asset-token",
      expected:
        "/change-password?email=tech%40example.com&next=%2Fassets%2Fqr%2Fasset-token",
    },
    {
      name: "an external destination",
      next: "https://evil.example/steal",
      expected: "/change-password?email=tech%40example.com&next=%2Fdashboard",
    },
  ])(
    "carries the safe continuation through forced password change for $name",
    async ({ next, expected }) => {
      window.history.replaceState(
        {},
        "",
        `/login?next=${encodeURIComponent(next)}`,
      );
      mocks.login.mockRejectedValueOnce({
        status: 403,
        code: "MUST_CHANGE_PASSWORD",
      });
      render(<AuthForm mode="login" />);

      await submitLogin();

      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expected));
    },
  );
});
