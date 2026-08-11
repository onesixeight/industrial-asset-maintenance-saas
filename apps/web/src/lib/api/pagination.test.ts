import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetsApi } from "./assets";
import { useAuthStore } from "../auth/store";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("server-backed list pagination", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    useAuthStore.setState({
      user: null,
      accessToken: "token",
      status: "authenticated",
    });
    process.env.NEXT_PUBLIC_API_URL = "/api";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses exactly one request when a server page contains exactly 100 records", async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
    }));
    vi.mocked(fetch).mockResolvedValue(
      ok({ items, page: 1, pageSize: 100, total: 100 }),
    );

    const result = await assetsApi.page({}, { page: 1, pageSize: 100 });

    expect(result).toEqual({ items, page: 1, pageSize: 100, total: 100 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets?page=1&limit=100",
      expect.any(Object),
    );
  });

  it("uses exactly one request for a page in a large tenant list", async () => {
    const response = {
      items: [{ id: "401" }],
      page: 5,
      pageSize: 100,
      total: 10_000,
    };
    vi.mocked(fetch).mockResolvedValue(ok(response));

    await expect(
      assetsApi.page({ search: "pump" }, { page: 5, pageSize: 100 }),
    ).resolves.toEqual(response);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets?search=pump&page=5&limit=100",
      expect.any(Object),
    );
  });

  it("aborts a superseded bounded search request", async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const staleSearch = assetsApi.page(
      { search: "old" },
      { page: 1, pageSize: 50 },
      controller.signal,
    );
    controller.abort();

    expect(observedSignal?.aborted).toBe(true);
    await expect(staleSearch).rejects.toMatchObject({ name: "AbortError" });
  });
});
