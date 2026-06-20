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
  const redis = app.get(RedisService).client;
  const keys = await redis.keys("auth:denylist:*");
  if (keys.length) await redis.del(...keys);
  const storage = app.get(ThrottlerStorage) as unknown as { storage?: Map<string, unknown> };
  storage.storage?.clear();
});

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const nest = moduleRef.createNestApplication({ bufferLogs: false });
  nest.use(cookieParser());
  await nest.init();
  return nest;
}

// --- helpers ---------------------------------------------------------------

const ADMIN = {
  company: "Acme Industrial",
  email: "alice@acme.test",
  password: "Password1",
  firstName: "Ada",
  lastName: "Admin",
};

async function registerAdmin(overrides: Partial<typeof ADMIN> = {}) {
  const res = await request(app.getHttpServer())
    .post("/auth/register")
    .send({ ...ADMIN, ...overrides });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return res.body as { accessToken: string; user: { id: string; companyId: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedAsset(companyId: string) {
  const c = testPrisma().getClient();
  const loc = await c.location.create({ data: { name: "Wh", companyId } });
  const cat = await c.category.create({ data: { name: "Pumps", companyId } });
  const asset = await c.asset.create({
    data: { name: "Pump 1", qrCode: "qr-" + Math.random().toString(36).slice(2), locationId: loc.id, categoryId: cat.id, companyId },
  });
  return asset.id;
}

async function login(email: string, password = ADMIN.password) {
  const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.body as { accessToken: string; user: { id: string } };
}

// --- tests -----------------------------------------------------------------

describe("Notifications", () => {
  it("#1 empty list + unread-count 0 for a fresh user", async () => {
    const admin = await registerAdmin();
    const list = await request(app.getHttpServer()).get("/notifications").set(auth(admin.accessToken));
    const count = await request(app.getHttpServer()).get("/notifications/unread-count").set(auth(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    expect(count.body).toEqual({ count: 0 });
  });

  it("#2 a low-stock crossing produces a notification the manager sees (Phase 6 → 8 loop)", async () => {
    const admin = await registerAdmin();
    // Seed a manager in the same company to receive the alert.
    const mgrPwd = await bcrypt.hash("Mgr12345", 12);
    const mgr = await testPrisma().getClient().user.create({
      data: { email: "mgr@acme.test", password: mgrPwd, firstName: "M", lastName: "G", role: "manager", companyId: admin.user.companyId, mustChangePassword: false },
    });

    const assetId = await seedAsset(admin.user.companyId);
    const c = testPrisma().getClient();
    const wo = await c.workOrder.create({
      data: { title: "Fix", type: "corrective", status: "open", priority: "medium", assetId, companyId: admin.user.companyId },
    });
    const part = await c.part.create({
      data: { name: "Bearing", sku: "BRG-1", quantity: 6, minQuantity: 5, companyId: admin.user.companyId },
    });

    // Consume 3 → quantity 3, crosses the min=5 threshold → low-stock fires for the manager.
    const consume = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 3 });
    expect(consume.status).toBe(201);

    // Manager logs in and sees the notification.
    const mgrSession = await login("mgr@acme.test", "Mgr12345");
    const list = await request(app.getHttpServer()).get("/notifications").set(auth(mgrSession.accessToken));
    const count = await request(app.getHttpServer()).get("/notifications/unread-count").set(auth(mgrSession.accessToken));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe("Low stock alert");
    expect(list.body[0].userId).toBe(mgr.id);
    expect(count.body).toEqual({ count: 1 });
  });

  it("#3 mark-one-read flips read and decrements unread-count", async () => {
    const admin = await registerAdmin();
    const n = await testPrisma().getClient().notification.create({
      data: { userId: admin.user.id, title: "T", message: "M" },
    });
    const markRead = await request(app.getHttpServer())
      .patch(`/notifications/${n.id}/read`)
      .set(auth(admin.accessToken));
    expect(markRead.status).toBe(200);
    expect(markRead.body.read).toBe(true);

    const count = await request(app.getHttpServer()).get("/notifications/unread-count").set(auth(admin.accessToken));
    expect(count.body).toEqual({ count: 0 });
  });

  it("#4 mark-all-read zeroes the count and returns the update count", async () => {
    const admin = await registerAdmin();
    const c = testPrisma().getClient();
    await c.notification.create({ data: { userId: admin.user.id, title: "T1", message: "M" } });
    await c.notification.create({ data: { userId: admin.user.id, title: "T2", message: "M" } });

    const markAll = await request(app.getHttpServer())
      .patch("/notifications/read-all")
      .set(auth(admin.accessToken));
    expect(markAll.status).toBe(200);
    expect(markAll.body).toEqual({ updated: 2 });

    const count = await request(app.getHttpServer()).get("/notifications/unread-count").set(auth(admin.accessToken));
    expect(count.body).toEqual({ count: 0 });
  });

  it("#5 IDOR: user cannot read another user's notification → 404", async () => {
    const a = await registerAdmin();
    const b = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    const n = await testPrisma().getClient().notification.create({
      data: { userId: a.user.id, title: "T", message: "M" },
    });
    const res = await request(app.getHttpServer())
      .patch(`/notifications/${n.id}/read`)
      .set(auth(b.accessToken));
    expect(res.status).toBe(404);
    // a's notification is still unread
    const count = await request(app.getHttpServer()).get("/notifications/unread-count").set(auth(a.accessToken));
    expect(count.body).toEqual({ count: 1 });
  });

  it("#6 unauthenticated → 401", async () => {
    const list = await request(app.getHttpServer()).get("/notifications");
    const count = await request(app.getHttpServer()).get("/notifications/unread-count");
    expect(list.status).toBe(401);
    expect(count.status).toBe(401);
  });

  it("#7 static routes don't collide with :id (read-all is not treated as an id)", async () => {
    const admin = await registerAdmin();
    const res = await request(app.getHttpServer())
      .patch("/notifications/read-all")
      .set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 0 });
  });

  it("#8 list is scoped to the requesting user only", async () => {
    const a = await registerAdmin();
    const b = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    await testPrisma().getClient().notification.create({
      data: { userId: a.user.id, title: "A-only", message: "M" },
    });

    const listA = await request(app.getHttpServer()).get("/notifications").set(auth(a.accessToken));
    const listB = await request(app.getHttpServer()).get("/notifications").set(auth(b.accessToken));
    expect(listA.body).toHaveLength(1);
    expect(listB.body).toEqual([]);
  });
});
