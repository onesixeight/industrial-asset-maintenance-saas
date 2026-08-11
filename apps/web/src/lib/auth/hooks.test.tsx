// @vitest-environment jsdom

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "@iam/shared";
import { useLogin } from "./hooks";
import { useAuthStore } from "./store";
import { apiJson } from "../api-client";

const companyBResponse: AuthResponse = {
  accessToken: "company-b-token",
  expiresIn: 900,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@company-b.test",
    firstName: "Company",
    lastName: "B",
    role: "admin",
    companyId: "00000000-0000-4000-8000-000000000002",
    mustChangePassword: false,
  },
};

vi.mock("../api/auth", () => ({
  loginApi: vi.fn(async () => companyBResponse),
  logoutApi: vi.fn(async () => ({ success: true })),
  registerApi: vi.fn(async () => companyBResponse),
}));

function LoginHarness() {
  const login = useLogin();
  return (
    <button
      type="button"
      onClick={() =>
        login.mutate({ email: "admin@company-b.test", password: "Password1" })
      }
    >
      Complete login
    </button>
  );
}

function MutationHarness({ children }: { children: ReactNode }) {
  useMutation({
    mutationKey: ["company-a-draft"],
    mutationFn: async () => undefined,
  });
  return children;
}

describe("authentication identity transitions", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("clears tenant queries and mutations before accepting a new identity", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData(["assets"], [{ id: "company-a" }]);

    render(
      <QueryClientProvider client={queryClient}>
        <MutationHarness>
          <LoginHarness />
        </MutationHarness>
      </QueryClientProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Complete login" }),
    );
    await waitFor(() =>
      expect(useAuthStore.getState().status).toBe("authenticated"),
    );

    expect(queryClient.getQueryData(["assets"])).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(useAuthStore.getState().user?.companyId).toBe(
      companyBResponse.user.companyId,
    );
  });

  it("aborts a real old-identity request before publishing the new identity", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    let requestSignal: AbortSignal | undefined;
    let finishRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve, reject) => {
          finishRequest = resolve;
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );
    useAuthStore.setState({
      user: {
        ...companyBResponse.user,
        companyId: "00000000-0000-4000-8000-00000000000a",
      },
      accessToken: "company-a-token",
      status: "authenticated",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LoginHarness />
      </QueryClientProvider>,
    );

    const oldRequest = apiJson("/api/assets").then(
      () => "resolved",
      (error: unknown) => (error as Error).name,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await userEvent.click(
      screen.getByRole("button", { name: "Complete login" }),
    );
    await waitFor(() =>
      expect(useAuthStore.getState().user?.companyId).toBe(
        companyBResponse.user.companyId,
      ),
    );

    const wasAborted = requestSignal?.aborted ?? false;
    if (!wasAborted)
      finishRequest(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    expect(wasAborted).toBe(true);
    await expect(oldRequest).resolves.toBe("AbortError");
  });
});
