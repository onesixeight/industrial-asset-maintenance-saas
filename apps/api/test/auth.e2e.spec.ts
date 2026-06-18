import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { Test } from "@nestjs/testing";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { truncate, teardown, testPrisma } from "./db";
import { RedisService } from "../src/redis";
import { AppModule } from "../src/app.module";

// AppModule is imported after setup.env.ts has forced the test env, so
// ConfigModule's Zod validation sees the test DB.
let app: INestApplication;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await teardown();
});

beforeEach(async () => {
  await truncate();
  // clear redis denylist
  const redis = app.get(RedisService).client;
  const keys = await redis.keys("auth:denylist:*");
  if (keys.length) await redis.del(...keys);
});

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const nest = moduleRef.createNestApplication({ bufferLogs: false });
  // main.ts registers cookie-parser; the test harness bypasses bootstrap, so
  // wire it here too (refresh/logout read the refresh_token from req.cookies).
  nest.use(cookieParser());
  await nest.init();
  return nest;
}

const REG = {
  company: "Acme Industrial",
  email: "alice@acme.test",
  password: "Password1",
  firstName: "Ada",
  lastName: "Admin",
};

async function register(overrides: Partial<typeof REG> = {}) {
  return request(app.getHttpServer()).post("/auth/register").send({ ...REG, ...overrides });
}

describe("POST /auth/register", () => {
  it("creates company + first admin user, returns token pair + user, sets refresh cookie", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.user.email).toBe(REG.email);
    expect(res.body.user.role).toBe("admin");
    // refresh cookie set
    expect(res.headers["set-cookie"]).toBeDefined();

    const dbUser = await testPrisma()
      .getClient()
      .user.findUnique({
        where: { email: REG.email },
        include: { company: true },
      });
    expect(dbUser?.password).not.toBe(REG.password); // hashed
    expect(dbUser?.role).toBe("admin");
    expect(dbUser?.company.name).toBe(REG.company); // company created in tx
  });

  it("rejects duplicate email with 409", async () => {
    await register();
    const res = await register();
    expect(res.status).toBe(409);
  });

  it("rejects weak password (no digit) with 400", async () => {
    const res = await register({ password: "PasswordNoDigit" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("returns a token pair + user for valid credentials", async () => {
    await register();
    const res = await request(app.getHttpServer()).post("/auth/login").send({
      email: REG.email,
      password: REG.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(REG.email);
  });

  it("rejects wrong password with 401", async () => {
    await register();
    const res = await request(app.getHttpServer()).post("/auth/login").send({
      email: REG.email,
      password: "WrongPassword9",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates: new pair issued, old refresh revoked (cookie-based)", async () => {
    const reg = await register();
    const setCookie = reg.headers["set-cookie"];
    const oldRefresh = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.match(
      /refresh_token=([^;]+)/,
    )?.[1];
    expect(oldRefresh).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${oldRefresh}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(oldRefresh);

    // old refresh now revoked
    const reuse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${oldRefresh}`)
      .send();
    expect(reuse.status).toBe(401);
  });

  it("rejects an unknown/invalid refresh token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=garbage`)
      .send();
    expect(res.status).toBe(401);
  });

  it("falls back to a body refreshToken when no cookie is present", async () => {
    const reg = await register();
    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe("GET /auth/me", () => {
  it("returns the current user for a valid access token", async () => {
    const reg = await register();
    const res = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(REG.email);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app.getHttpServer()).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("RolesGuard (GET /auth/admin-probe)", () => {
  it("allows admin (200) and denies viewer (403)", async () => {
    const adminReg = await register();
    const adminRes = await request(app.getHttpServer())
      .get("/auth/admin-probe")
      .set("Authorization", `Bearer ${adminReg.body.accessToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.ok).toBe(true);

    // Seed a viewer in the same company (hashed password so login works).
    const companyId = adminReg.body.user.companyId;
    const viewerPassword = "Viewer123";
    await testPrisma().getClient().user.create({
      data: {
        email: "viewer@acme.test",
        password: await bcrypt.hash(viewerPassword, 12),
        firstName: "Vera",
        lastName: "Viewer",
        role: "viewer",
        companyId,
      },
    });
    const viewerLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "viewer@acme.test", password: viewerPassword });
    expect(viewerLogin.status).toBe(200);

    const viewerRes = await request(app.getHttpServer())
      .get("/auth/admin-probe")
      .set("Authorization", `Bearer ${viewerLogin.body.accessToken}`);
    expect(viewerRes.status).toBe(403);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app.getHttpServer()).get("/auth/admin-probe");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears the cookie (200 { success: true })", async () => {
    const reg = await register();
    const refresh = reg.body.refreshToken;
    const out = await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", `refresh_token=${refresh}`)
      .send();
    expect(out.status).toBe(200);
    expect(out.body.success).toBe(true);

    // Old refresh now revoked.
    const reuse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${refresh}`)
      .send();
    expect(reuse.status).toBe(401);
  });
});

describe("POST /auth/login throttling", () => {
  // Spec §4 / §8 Test #6: login is throttled at 10 req/min per IP. We fire 11
  // wrong-password logins against the real app; the 11th must hit the 429
  // ceiling. The in-memory ThrottlerStorage accumulates per-route hits, so we
  // reset it first to keep the assertion deterministic regardless of earlier
  // tests' login calls.
  it("returns 429 after exceeding the 10/min throttle limit", async () => {
    await register();
    resetThrottleStorage();
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: REG.email, password: "WrongPassword9" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

/**
 * Clears the in-memory ThrottlerStorage hit counters so the throttle test is
 * independent of prior login calls in the same app instance. The default
 * storage (ThrottlerStorageService) keeps its entries in an internal Map.
 */
function resetThrottleStorage(): void {
  const storage = app.get(ThrottlerStorage) as unknown as {
    storage?: Map<string, unknown>;
  };
  storage.storage?.clear();
}
