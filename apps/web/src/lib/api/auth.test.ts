import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginApi, meApi, refreshApi, registerApi } from "./auth";

const OK = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.NEXT_PUBLIC_API_URL = "/api";
});
afterEach(() => vi.unstubAllGlobals());

describe("auth api calls", () => {
  it("login posts credentials with credentials:include and returns AuthResponse", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ user: { id: "u" }, accessToken: "a", refreshToken: "r", expiresIn: 900 }),
    );
    const res = await loginApi({ email: "a@b.test", password: "Password1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(res.accessToken).toBe("a");
  });

  it("register posts the full register body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ user: { id: "u" }, accessToken: "a", refreshToken: "r", expiresIn: 900 }),
    );
    await registerApi({
      company: "Acme",
      email: "a@b.test",
      password: "Password1",
      firstName: "A",
      lastName: "B",
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ company: "Acme", email: "a@b.test" });
  });

  it("refresh sends no body and uses credentials:include", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ accessToken: "a2", refreshToken: "r2", expiresIn: 900 }),
    );
    const res = await refreshApi();
    expect(res.accessToken).toBe("a2");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it("me attaches a Bearer token", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      OK({ id: "u", email: "a@b.test" }),
    );
    await meApi("tok");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("throws an error carrying the status on non-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    await expect(meApi("tok")).rejects.toMatchObject({ status: 401 });
  });
});
