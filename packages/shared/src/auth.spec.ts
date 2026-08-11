import { describe, expect, it } from "vitest";
import {
  registerRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  tokenResponseSchema,
  userResponseSchema,
  authResponseSchema,
  jwtPayloadSchema,
  userRoleSchema,
} from "./auth";

const UUID = "12345678-1234-1234-1234-123456789012";

describe("userRoleSchema", () => {
  it("accepts the 4 canonical roles", () => {
    for (const r of ["admin", "manager", "technician", "viewer"]) {
      expect(userRoleSchema.parse(r)).toBe(r);
    }
  });
  it("rejects an unknown role", () => {
    expect(() => userRoleSchema.parse("superadmin")).toThrow();
  });
});

describe("registerRequestSchema", () => {
  const valid = {
    email: "alice@example.com",
    password: "Password1",
    firstName: "Alice",
    lastName: "Smith",
    company: "Acme Industrial",
  };
  it("accepts a valid registration", () => {
    expect(registerRequestSchema.parse(valid)).toEqual(valid);
  });
  it("rejects a weak password (no digit)", () => {
    expect(() =>
      registerRequestSchema.parse({ ...valid, password: "Password" }),
    ).toThrow(/digit/);
  });
  it("rejects a short password", () => {
    expect(() =>
      registerRequestSchema.parse({ ...valid, password: "Ab1" }),
    ).toThrow();
  });
  it("rejects an invalid email", () => {
    expect(() =>
      registerRequestSchema.parse({ ...valid, email: "nope" }),
    ).toThrow();
  });
  it("rejects an empty company name", () => {
    expect(() =>
      registerRequestSchema.parse({ ...valid, company: "" }),
    ).toThrow();
  });
});

describe("loginRequestSchema", () => {
  it("accepts valid credentials", () => {
    const out = loginRequestSchema.parse({
      email: "a@b.com",
      password: "anything",
    });
    expect(out.email).toBe("a@b.com");
  });
  it("rejects an empty password", () => {
    expect(() =>
      loginRequestSchema.parse({ email: "a@b.com", password: "" }),
    ).toThrow();
  });
});

describe("refreshRequestSchema", () => {
  it("requires a non-empty refreshToken", () => {
    expect(() => refreshRequestSchema.parse({ refreshToken: "" })).toThrow();
    expect(
      refreshRequestSchema.parse({ refreshToken: "xyz" }).refreshToken,
    ).toBe("xyz");
  });
});

describe("tokenResponseSchema", () => {
  it("parses only the public access-token response", () => {
    const parsed = tokenResponseSchema.parse({
      accessToken: "a",
      expiresIn: 900,
    });
    expect(parsed).toEqual({ accessToken: "a", expiresIn: 900 });
    expect(parsed).not.toHaveProperty("refreshToken");
  });
  it("rejects a response that would expose refreshToken", () => {
    expect(() =>
      tokenResponseSchema.parse({
        accessToken: "a",
        refreshToken: "r",
        expiresIn: 900,
      }),
    ).toThrow();
  });
  it("rejects a non-positive expiresIn", () => {
    expect(() =>
      tokenResponseSchema.parse({ accessToken: "a", expiresIn: 0 }),
    ).toThrow();
  });
});

describe("userResponseSchema", () => {
  it("accepts a valid user response", () => {
    const u = {
      id: UUID,
      email: "a@b.com",
      firstName: "A",
      lastName: "B",
      role: "viewer",
      companyId: UUID,
      mustChangePassword: false,
    };
    expect(userResponseSchema.parse(u)).toEqual(u);
  });
});

describe("authResponseSchema", () => {
  it("parses a user plus the public access-token response", () => {
    const r = {
      user: {
        id: UUID,
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        role: "admin",
        companyId: UUID,
        mustChangePassword: false,
      },
      accessToken: "a",
      expiresIn: 900,
    };
    const parsed = authResponseSchema.parse(r);
    expect(parsed.user.role).toBe("admin");
    expect(parsed).not.toHaveProperty("refreshToken");
  });
  it("rejects an auth response that would expose refreshToken", () => {
    expect(() =>
      authResponseSchema.parse({
        user: {
          id: UUID,
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
          role: "admin",
          companyId: UUID,
          mustChangePassword: false,
        },
        accessToken: "a",
        refreshToken: "r",
        expiresIn: 900,
      }),
    ).toThrow();
  });
});

describe("jwtPayloadSchema", () => {
  it("accepts a valid access payload", () => {
    const p = {
      sub: UUID,
      companyId: UUID,
      role: "manager",
      ver: 0,
      sid: UUID,
      jti: UUID,
      typ: "access",
    };
    expect(jwtPayloadSchema.parse(p).typ).toBe("access");
  });
  it("rejects a payload without a session version", () => {
    expect(() =>
      jwtPayloadSchema.parse({
        sub: UUID,
        companyId: UUID,
        role: "manager",
        sid: UUID,
        jti: UUID,
        typ: "access",
      }),
    ).toThrow();
  });
  it("rejects a payload without a refresh-token family id", () => {
    expect(() =>
      jwtPayloadSchema.parse({
        sub: UUID,
        companyId: UUID,
        role: "manager",
        ver: 0,
        jti: UUID,
        typ: "access",
      }),
    ).toThrow();
  });
  it("rejects typ other than access/refresh", () => {
    expect(() =>
      jwtPayloadSchema.parse({
        sub: UUID,
        companyId: UUID,
        role: "manager",
        ver: 0,
        sid: UUID,
        jti: UUID,
        typ: "id",
      }),
    ).toThrow();
  });
});
