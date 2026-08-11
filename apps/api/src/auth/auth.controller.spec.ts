import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";

describe("AuthController.logout", () => {
  it("clears the HttpOnly refresh cookie even when server-side revocation fails", async () => {
    const revocationError = new Error("Redis unavailable");
    const auth = {
      logout: vi.fn().mockRejectedValue(revocationError),
    } as unknown as AuthService;
    const controller = new AuthController(auth);
    const request = {
      cookies: { refresh_token: "refresh-token" },
      body: {},
    } as unknown as Request;
    const response = { clearCookie: vi.fn() } as unknown as Response;

    await expect(controller.logout(request, response)).rejects.toBe(
      revocationError,
    );
    expect(response.clearCookie).toHaveBeenCalledWith("refresh_token", {
      path: "/",
    });
  });

  it("scopes the production refresh cookie to the same-origin auth proxy", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const auth = {
        register: vi.fn().mockResolvedValue({
          accessToken: "access",
          refreshToken: "refresh",
          expiresIn: 900,
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "admin@example.test",
            firstName: "Ada",
            lastName: "Admin",
            role: "admin",
            companyId: "00000000-0000-4000-8000-000000000002",
            mustChangePassword: false,
          },
        }),
      } as unknown as AuthService;
      const controller = new AuthController(auth);
      const response = { cookie: vi.fn() } as unknown as Response;

      await controller.register(
        {
          company: "Example",
          email: "admin@example.test",
          password: "Password1",
          firstName: "Ada",
          lastName: "Admin",
        },
        response,
      );

      expect(response.cookie).toHaveBeenCalledWith(
        "refresh_token",
        "refresh",
        expect.objectContaining({
          path: "/api/auth",
          httpOnly: true,
          secure: true,
        }),
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
