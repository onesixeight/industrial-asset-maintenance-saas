import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { truncate, teardown, testPrisma } from "./db";
import { RedisService } from "../src/redis";

// AppModule is imported for side-effect (decorator metadata) only after env
// is set by setup.env.ts. Use a dynamic import so this file does not pull the
// whole app graph at module-eval time under vite-node.
let app: INestApplication;

beforeAll(async () => {
  const { AppModule } = await import("../src/app.module");
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication({ bufferLogs: false });
  await app.init();
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

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";

async function seedCompany() {
  await testPrisma().getClient().company.create({ data: { id: COMPANY_ID, name: "Acme" } });
}

describe("auth e2e critical path", () => {
  beforeEach(async () => {
    await seedCompany();
  });

  it("POST /auth/register → 201 with token pair", async () => {
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email: "alice@acme.test",
      password: "Password1",
      firstName: "Alice",
      lastName: "Smith",
      companyId: COMPANY_ID,
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.expiresIn).toBe(900);
  });

  it("POST /auth/register rejects weak password with 400", async () => {
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email: "bob@acme.test",
      password: "weak",
      firstName: "Bob",
      lastName: "B",
      companyId: COMPANY_ID,
    });
    expect(res.status).toBe(400);
  });

  it("POST /auth/register → 409 on duplicate email", async () => {
    const body = {
      email: "carol@acme.test",
      password: "Password1",
      firstName: "Carol",
      lastName: "C",
      companyId: COMPANY_ID,
    };
    await request(app.getHttpServer()).post("/auth/register").send(body).expect(201);
    const res = await request(app.getHttpServer()).post("/auth/register").send(body);
    expect(res.status).toBe(409);
  });

  it("full flow: register → login → me → refresh → logout", async () => {
    const regBody = {
      email: "dave@acme.test",
      password: "Password1",
      firstName: "Dave",
      lastName: "D",
      companyId: COMPANY_ID,
    };
    const reg = await request(app.getHttpServer()).post("/auth/register").send(regBody);
    expect(reg.status).toBe(201);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: regBody.email, password: regBody.password });
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = login.body;

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(regBody.email);

    const refresh = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();

    const logout = await request(app.getHttpServer())
      .post("/auth/logout")
      .send({ refreshToken });
    expect(logout.status).toBe(204);

    // Old refresh now revoked.
    const reuse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("GET /auth/me without token → 401", async () => {
    const res = await request(app.getHttpServer()).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("POST /auth/login with wrong password → 401", async () => {
    await request(app.getHttpServer()).post("/auth/register").send({
      email: "eve@acme.test",
      password: "Password1",
      firstName: "Eve",
      lastName: "E",
      companyId: COMPANY_ID,
    });
    const res = await request(app.getHttpServer()).post("/auth/login").send({
      email: "eve@acme.test",
      password: "wrong",
    });
    expect(res.status).toBe(401);
  });
});
