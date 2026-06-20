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

async function createWorkOrder(token: string, assetId: string, assignedToId?: string) {
  const body: Record<string, unknown> = { title: "Fix pump", type: "corrective", assetId, priority: "medium" };
  if (assignedToId) body.assignedToId = assignedToId;
  const res = await request(app.getHttpServer()).post("/work-orders").set(auth(token)).send(body);
  if (res.status !== 201) throw new Error(`createWorkOrder failed: ${res.status}`);
  return res.body as { id: string };
}

async function seedRole(companyId: string, email: string, role: "technician" | "viewer") {
  const password = await bcrypt.hash("Role1234", 12);
  await testPrisma().getClient().user.create({
    data: { email, password, firstName: "R", lastName: "U", role, companyId },
  });
  const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Role1234" });
  return login.body as { accessToken: string; user: { id: string } };
}

async function createPart(token: string, overrides: Record<string, unknown> = {}) {
  const body = { name: "Bearing", sku: "BRG-" + Math.random().toString(36).slice(2, 8), quantity: 10, minQuantity: 5, ...overrides };
  const res = await request(app.getHttpServer()).post("/parts").set(auth(token)).send(body);
  if (res.status !== 201) throw new Error(`createPart failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; quantity: number; minQuantity: number; sku: string };
}

// --- tests -----------------------------------------------------------------

describe("Parts CRUD", () => {
  it("#1 create → get → list contains it", async () => {
    const admin = await registerAdmin();
    const created = await createPart(admin.accessToken, { sku: "BRG-001" });

    const get = await request(app.getHttpServer()).get(`/parts/${created.id}`).set(auth(admin.accessToken));
    expect(get.status).toBe(200);
    expect(get.body.sku).toBe("BRG-001");

    const list = await request(app.getHttpServer()).get("/parts").set(auth(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("#2 update reflects changes", async () => {
    const admin = await registerAdmin();
    const part = await createPart(admin.accessToken);
    const res = await request(app.getHttpServer())
      .patch(`/parts/${part.id}`)
      .set(auth(admin.accessToken))
      .send({ name: "Bearing V2", quantity: 20 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Bearing V2");
    expect(res.body.quantity).toBe(20);
  });

  it("#3 duplicate sku in same company → 409", async () => {
    const admin = await registerAdmin();
    await createPart(admin.accessToken, { sku: "DUP-SKU" });
    const res = await request(app.getHttpServer())
      .post("/parts")
      .set(auth(admin.accessToken))
      .send({ name: "Other", sku: "DUP-SKU", quantity: 1, minQuantity: 0 });
    expect(res.status).toBe(409);
  });

  it("#4 cross-tenant get → 404", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    const part = await createPart(admin.accessToken);
    const res = await request(app.getHttpServer()).get(`/parts/${part.id}`).set(auth(other.accessToken));
    expect(res.status).toBe(404);
  });

  it("#5 delete → subsequent get 404", async () => {
    const admin = await registerAdmin();
    const part = await createPart(admin.accessToken);
    const del = await request(app.getHttpServer()).delete(`/parts/${part.id}`).set(auth(admin.accessToken));
    expect(del.status).toBe(204);
    const get = await request(app.getHttpServer()).get(`/parts/${part.id}`).set(auth(admin.accessToken));
    expect(get.status).toBe(404);
  });

  it("#6 technician cannot create parts → 403", async () => {
    const admin = await registerAdmin();
    const tech = await seedRole(admin.user.companyId, "tech@acme.test", "technician");
    const res = await request(app.getHttpServer())
      .post("/parts")
      .set(auth(tech.accessToken))
      .send({ name: "X", sku: "X-1", quantity: 1, minQuantity: 0 });
    expect(res.status).toBe(403);
  });
});

describe("Parts consumption (transactional)", () => {
  it("#7 consume decrements Part.quantity and creates WorkOrderPart", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, { quantity: 10 });

    const res = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(3);

    const after = await request(app.getHttpServer()).get(`/parts/${part.id}`).set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(7);
  });

  it("#8 insufficient stock → 409 and quantity unchanged", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, { quantity: 2 });

    const res = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 5 });
    expect(res.status).toBe(409);

    const after = await request(app.getHttpServer()).get(`/parts/${part.id}`).set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(2);
  });

  it("#9 restock restores quantity and removes the WorkOrderPart line", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, { quantity: 10 });

    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 4 });

    const del = await request(app.getHttpServer())
      .delete(`/work-orders/${wo.id}/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(del.status).toBe(204);

    const after = await request(app.getHttpServer()).get(`/parts/${part.id}`).set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(10);

    const lines = await request(app.getHttpServer()).get(`/work-orders/${wo.id}/parts`).set(auth(admin.accessToken));
    expect(lines.body).toHaveLength(0);
  });

  it("#10 technician not assigned to WO → 403 on consume", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tech = await seedRole(admin.user.companyId, "tech10@acme.test", "technician");
    const wo = await createWorkOrder(admin.accessToken, assetId); // unassigned
    const part = await createPart(admin.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(tech.accessToken))
      .send({ partId: part.id, quantity: 1 });
    expect(res.status).toBe(403);
  });

  it("#11 technician assigned to WO can consume", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tech = await seedRole(admin.user.companyId, "tech11@acme.test", "technician");
    const wo = await createWorkOrder(admin.accessToken, assetId, tech.user.id);
    const part = await createPart(admin.accessToken, { quantity: 5 });

    const res = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(tech.accessToken))
      .send({ partId: part.id, quantity: 2 });
    expect(res.status).toBe(201);
  });

  it("#12 lowStock=true filter returns only parts at/below min", async () => {
    const admin = await registerAdmin();
    await createPart(admin.accessToken, { sku: "LOW-1", quantity: 2, minQuantity: 5 });
    await createPart(admin.accessToken, { sku: "OK-1", quantity: 10, minQuantity: 5 });

    const res = await request(app.getHttpServer()).get("/parts?lowStock=true").set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sku).toBe("LOW-1");
  });

  it("#13 low-stock crossing creates a Notification for managers", async () => {
    const admin = await registerAdmin();
    // Seed a manager in the same company to receive the alert.
    const mgrPwd = await bcrypt.hash("Mgr12345", 12);
    const mgr = await testPrisma().getClient().user.create({
      data: { email: "mgr@acme.test", password: mgrPwd, firstName: "M", lastName: "G", role: "manager", companyId: admin.user.companyId },
    });

    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, { quantity: 6, minQuantity: 5 });

    const before = await testPrisma().getClient().notification.count({ where: { userId: mgr.id } });
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 3 }); // 6 → 3, crosses 5
    const after = await testPrisma().getClient().notification.count({ where: { userId: mgr.id } });
    expect(after).toBe(before + 1);
  });

  it("#14 repeat consumption when already low → no additional Notification (no spam)", async () => {
    const admin = await registerAdmin();
    const mgrPwd = await bcrypt.hash("Mgr12345", 12);
    const mgr = await testPrisma().getClient().user.create({
      data: { email: "mgr2@acme.test", password: mgrPwd, firstName: "M", lastName: "G", role: "manager", companyId: admin.user.companyId },
    });

    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, { quantity: 4, minQuantity: 5 }); // already low

    const before = await testPrisma().getClient().notification.count({ where: { userId: mgr.id } });
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 1 }); // 4 → 3, but no crossing
    const after = await testPrisma().getClient().notification.count({ where: { userId: mgr.id } });
    expect(after).toBe(before);
  });

  it("#15 accumulation: consume twice → WorkOrderPart.quantity adds", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, { quantity: 10 });

    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 3 });
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 2 });

    const lines = await request(app.getHttpServer()).get(`/work-orders/${wo.id}/parts`).set(auth(admin.accessToken));
    expect(lines.body).toHaveLength(1);
    expect(lines.body[0].quantity).toBe(5);

    const after = await request(app.getHttpServer()).get(`/parts/${part.id}`).set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(5);
  });

  it("#16 viewer cannot restock (DELETE) → 403", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken);
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 1 });

    const viewer = await seedRole(admin.user.companyId, "view@acme.test", "viewer");
    const res = await request(app.getHttpServer())
      .delete(`/work-orders/${wo.id}/parts/${part.id}`)
      .set(auth(viewer.accessToken));
    expect(res.status).toBe(403);
  });
});
