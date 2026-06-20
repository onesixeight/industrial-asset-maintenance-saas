import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { Test } from "@nestjs/testing";
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

async function createWorkOrder(token: string, assetId: string, overrides: Record<string, unknown> = {}) {
  const body = { title: "Inspect pump", type: "preventive", assetId, priority: "medium", ...overrides };
  const res = await request(app.getHttpServer()).post("/work-orders").set(auth(token)).send(body);
  if (res.status !== 201) throw new Error(`createWorkOrder failed: ${res.status}`);
  return res.body as { id: string };
}

async function transition(token: string, id: string, status: string) {
  const res = await request(app.getHttpServer())
    .patch(`/work-orders/${id}/status`)
    .set(auth(token))
    .send({ status });
  if (res.status !== 200) throw new Error(`transition to ${status} failed: ${res.status}`);
}

// --- tests -----------------------------------------------------------------

describe("Dashboard stats", () => {
  it("#1 stats for an empty company are all zeros/nulls", async () => {
    const admin = await registerAdmin();
    const res = await request(app.getHttpServer()).get("/dashboard/stats").set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      workOrders: { open: 0, inProgress: 0, onHold: 0, completed: 0, cancelled: 0, overdue: 0 },
      assets: { total: 0, maintenance: 0 },
      inspections: { last30Days: 0, passed: 0, passRate: null },
      parts: { lowStock: 0, outOfStock: 0 },
    });
  });

  it("#2 stats reflect seeded work orders and assets", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    await createWorkOrder(admin.accessToken, assetId); // open
    const wo2 = await createWorkOrder(admin.accessToken, assetId);
    await transition(admin.accessToken, wo2.id, "in_progress");
    await transition(admin.accessToken, wo2.id, "completed");

    const res = await request(app.getHttpServer()).get("/dashboard/stats").set(auth(admin.accessToken));
    expect(res.body.workOrders.open).toBe(1);
    expect(res.body.workOrders.completed).toBe(1);
    expect(res.body.assets.total).toBe(1);
  });

  it("#3 unauthenticated → 401", async () => {
    const res = await request(app.getHttpServer()).get("/dashboard/stats");
    expect(res.status).toBe(401);
  });

  it("#4 cross-tenant isolation — two companies see only their own stats", async () => {
    const a = await registerAdmin();
    const b = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    const aAsset = await seedAsset(a.user.companyId);
    await createWorkOrder(a.accessToken, aAsset);

    const statsA = await request(app.getHttpServer()).get("/dashboard/stats").set(auth(a.accessToken));
    const statsB = await request(app.getHttpServer()).get("/dashboard/stats").set(auth(b.accessToken));
    expect(statsA.body.workOrders.open).toBe(1);
    expect(statsB.body.workOrders.open).toBe(0);
  });
});

describe("Dashboard trends", () => {
  it("#5 trends over a 30-day window bucket a created+completed WO by day", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    await transition(admin.accessToken, wo.id, "in_progress");
    await transition(admin.accessToken, wo.id, "completed");

    const res = await request(app.getHttpServer()).get("/dashboard/trends?days=30").set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(30);
    expect(res.body.series.length).toBeGreaterThan(0);
    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = res.body.series.find((p: { date: string }) => p.date === today);
    expect(todayPoint.woCreated).toBe(1);
    expect(todayPoint.woCompleted).toBe(1);
  });

  it("#6 MTTR reflects a completed WO (hours)", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    // Seed a WO created 10h ago, completed now — directly via prisma for control.
    const c = testPrisma().getClient();
    const createdAt = new Date(Date.now() - 10 * 3_600_000);
    await c.workOrder.create({
      data: {
        title: "Old",
        type: "corrective",
        status: "completed",
        priority: "medium",
        assetId,
        companyId: admin.user.companyId,
        createdAt,
        updatedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer()).get("/dashboard/trends?days=30").set(auth(admin.accessToken));
    expect(res.body.mttrHours).toBeGreaterThan(9);
    expect(res.body.mttrHours).toBeLessThan(11);
  });

  it("#7 trends days validation rejects out-of-range", async () => {
    const admin = await registerAdmin();
    const res = await request(app.getHttpServer()).get("/dashboard/trends?days=999").set(auth(admin.accessToken));
    expect(res.status).toBe(400);
  });
});

describe("Reports CSV export", () => {
  it("#8 export → 200 text/csv with attachment disposition and a body row", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    await createWorkOrder(admin.accessToken, assetId, { title: "Pump service" });

    const res = await request(app.getHttpServer())
      .get("/reports/work-orders.csv")
      .set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain('filename="work-orders.csv"');
    expect(res.text).toContain("Pump service");
  });

  it("#9 CSV escapes a title containing a comma/quote", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    await createWorkOrder(admin.accessToken, assetId, { title: 'Fix pump, "urgent"' });

    const res = await request(app.getHttpServer())
      .get("/reports/work-orders.csv")
      .set(auth(admin.accessToken));
    // RFC 4180: the field must be quoted and embedded quotes doubled.
    expect(res.text).toContain('"Fix pump, ""urgent"""');
  });

  it("#10 CSV export is tenant-scoped (no cross-tenant rows)", async () => {
    const a = await registerAdmin();
    const b = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    const aAsset = await seedAsset(a.user.companyId);
    await createWorkOrder(a.accessToken, aAsset, { title: "ACME-ONLY" });

    const res = await request(app.getHttpServer())
      .get("/reports/work-orders.csv")
      .set(auth(b.accessToken));
    expect(res.text).not.toContain("ACME-ONLY");
  });
});
