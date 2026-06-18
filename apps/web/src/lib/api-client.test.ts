import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";
import { useAuthStore } from "./auth/store";

const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  useAuthStore.setState({ user: null, accessToken: "old", status: "authenticated" });
  process.env.NEXT_PUBLIC_API_URL = "/api";
});
afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("attaches the in-memory Bearer token", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(ok({}));
    await apiFetch("/api/anything");
    const [req, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req).toBe("/api/anything");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer old");
  });

  it("on 401 refreshes once and retries with the new token", async () => {
    // original 401 → refresh returns a new access token → retry succeeds
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(ok({ accessToken: "new", refreshToken: "r", expiresIn: 900 }))
      .mockResolvedValueOnce(ok({ ok: true }));
    const res = await apiFetch("/api/anything");
    expect(res.ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe("new");
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it("clears auth and returns the 401 if refresh fails", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // refresh fails
    const res = await apiFetch("/api/anything");
    expect(res.status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
