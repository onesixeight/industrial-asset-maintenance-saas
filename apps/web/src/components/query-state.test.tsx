// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryState } from "./query-state";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/work-orders/wo-1",
  useRouter: () => ({ replace }),
}));

function error(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe("QueryState", () => {
  afterEach(() => {
    cleanup();
    replace.mockClear();
  });

  it("distinguishes loading from an empty result", () => {
    const { rerender } = render(<QueryState isLoading>content</QueryState>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");

    rerender(
      <QueryState isEmpty emptyMessage="No work orders yet.">
        content
      </QueryState>,
    );
    expect(screen.getByText("No work orders yet.")).toBeInTheDocument();
  });

  it("redirects 401 errors to login with the current deep link", async () => {
    render(<QueryState error={error(401)}>content</QueryState>);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?next=%2Fwork-orders%2Fwo-1"),
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it.each([
    [403, "permission"],
    [404, "not found"],
  ])("renders a specific message for HTTP %s", (status, message) => {
    render(<QueryState error={error(status as number)}>content</QueryState>);
    expect(
      screen.getByText(new RegExp(message as string, "i")),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  it("offers retry for a retryable error", async () => {
    const retry = vi.fn();
    render(
      <QueryState error={error(503)} onRetry={retry}>
        content
      </QueryState>,
    );

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
