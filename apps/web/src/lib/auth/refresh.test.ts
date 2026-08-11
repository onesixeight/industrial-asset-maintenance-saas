import { QueryClient } from "@tanstack/react-query";
import type { AuthResponse, UserResponse } from "@iam/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshApi, meApi } from "../api/auth";
import { silentRefresh } from "./refresh";
import { acceptIdentity } from "./session";
import { useAuthStore } from "./store";
import { apiJson } from "../api-client";

const companyA: UserResponse = {
  id: "00000000-0000-4000-8000-00000000000a",
  email: "a@company.test",
  firstName: "Company",
  lastName: "A",
  role: "admin",
  companyId: "00000000-0000-4000-8000-00000000000a",
  mustChangePassword: false,
};

const companyB: AuthResponse = {
  accessToken: "company-b-token",
  expiresIn: 900,
  user: {
    ...companyA,
    id: "00000000-0000-4000-8000-00000000000b",
    email: "b@company.test",
    companyId: "00000000-0000-4000-8000-00000000000b",
  },
};

const authMocks = vi.hoisted(() => ({
  refreshApi: vi.fn(),
  meApi: vi.fn(),
}));

vi.mock("../api/auth", () => authMocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("silent refresh identity generation", () => {
  beforeEach(() => {
    vi.mocked(refreshApi).mockReset();
    vi.mocked(meApi).mockReset();
    useAuthStore.setState({
      user: companyA,
      accessToken: "company-a-token",
      status: "authenticated",
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("ignores a stale refresh success after account B logs in", async () => {
    const queryClient = new QueryClient();
    const refresh = deferred<{ accessToken: string; expiresIn: number }>();
    vi.mocked(refreshApi).mockReturnValue(refresh.promise);
    vi.mocked(meApi).mockResolvedValue(companyA);

    const staleRefresh = silentRefresh();
    await acceptIdentity(companyB, queryClient);
    queryClient.setQueryData(["assets"], [{ id: "company-b-asset" }]);

    refresh.resolve({ accessToken: "stale-a-token", expiresIn: 900 });
    await staleRefresh;

    expect(useAuthStore.getState()).toMatchObject({
      user: { companyId: companyB.user.companyId },
      accessToken: companyB.accessToken,
      status: "authenticated",
    });
    expect(queryClient.getQueryData(["assets"])).toEqual([
      { id: "company-b-asset" },
    ]);
  });

  it("ignores a stale refresh failure after account B logs in", async () => {
    const queryClient = new QueryClient();
    const refresh = deferred<{ accessToken: string; expiresIn: number }>();
    vi.mocked(refreshApi).mockReturnValue(refresh.promise);

    const staleRefresh = silentRefresh();
    await acceptIdentity(companyB, queryClient);
    queryClient.setQueryData(["assets"], [{ id: "company-b-asset" }]);

    refresh.reject(new Error("company A refresh expired"));
    await staleRefresh;

    expect(useAuthStore.getState()).toMatchObject({
      user: { companyId: companyB.user.companyId },
      accessToken: companyB.accessToken,
      status: "authenticated",
    });
    expect(queryClient.getQueryData(["assets"])).toEqual([
      { id: "company-b-asset" },
    ]);
  });

  it("aborts old-identity requests before a current refresh failure clears identity", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );
    vi.mocked(refreshApi).mockRejectedValue(new Error("expired"));
    const oldRequest = apiJson("/api/assets").catch(
      (error: unknown) => (error as Error).name,
    );

    await silentRefresh();

    expect(requestSignal?.aborted).toBe(true);
    await expect(oldRequest).resolves.toBe("AbortError");
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("aborts old-identity requests before publishing a different refreshed identity", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );
    vi.mocked(refreshApi).mockResolvedValue({
      accessToken: companyB.accessToken,
      expiresIn: 900,
    });
    vi.mocked(meApi).mockResolvedValue(companyB.user);
    const oldRequest = apiJson("/api/assets").catch(
      (error: unknown) => (error as Error).name,
    );

    await silentRefresh();

    expect(requestSignal?.aborted).toBe(true);
    await expect(oldRequest).resolves.toBe("AbortError");
    expect(useAuthStore.getState()).toMatchObject({
      user: { companyId: companyB.user.companyId },
      accessToken: companyB.accessToken,
      status: "authenticated",
    });
  });
});
