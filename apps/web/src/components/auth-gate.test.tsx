// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../lib/auth/store";
import { AuthGate, validatedRelativePath } from "./auth-gate";

const { replace, silentRefresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  silentRefresh: vi.fn(async () => false),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/assets/00000000-0000-4000-8000-000000000001",
  useRouter: () => ({ replace }),
}));

vi.mock("../lib/auth/refresh", () => ({ silentRefresh }));

describe("validatedRelativePath", () => {
  it("keeps a local deep link", () => {
    expect(validatedRelativePath("/assets/asset-1?tab=history")).toBe(
      "/assets/asset-1?tab=history",
    );
  });

  it.each([
    "https://evil.test/steal",
    "//evil.test/steal",
    "\\evil.test",
    "login",
  ])("rejects unsafe next destination %s", (value) =>
    expect(validatedRelativePath(value)).toBe("/dashboard"),
  );
});

describe("AuthGate", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.history.replaceState({}, "", "/?tab=history");
    replace.mockClear();
    silentRefresh.mockClear();
  });

  it("redirects an expired deep link to login with a validated next value", async () => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });

    render(<AuthGate>private content</AuthGate>);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/login?next=%2Fassets%2F00000000-0000-4000-8000-000000000001%3Ftab%3Dhistory",
      ),
    );
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });

  it("owns the one initial silent refresh before rendering dashboard content", async () => {
    useAuthStore.setState({ user: null, accessToken: null, status: "idle" });

    render(<AuthGate>private content</AuthGate>);

    await waitFor(() => expect(silentRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });
});
