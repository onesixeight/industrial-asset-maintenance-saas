import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { truncate, teardown, testPrisma } from "./db";
import { RedisService } from "../src/redis";
import { AppModule } from "../src/app.module";
import { resetThrottleStorage } from "./throttler";
import {
  holdWorkOrderLock,
  waitForWorkOrderLockWaiters,
} from "./work-order-lock";

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
  await resetThrottleStorage(app);
});

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
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
  return res.body as {
    accessToken: string;
    user: { id: string; companyId: string };
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedAsset(companyId: string) {
  const c = testPrisma().getClient();
  const loc = await c.location.create({ data: { name: "Wh", companyId } });
  const cat = await c.category.create({ data: { name: "Pumps", companyId } });
  const asset = await c.asset.create({
    data: {
      name: "Pump 1",
      qrCode: "qr-" + Math.random().toString(36).slice(2),
      locationId: loc.id,
      categoryId: cat.id,
      companyId,
    },
  });
  return asset.id;
}

async function createWorkOrder(
  token: string,
  assetId: string,
  assignedToId?: string,
) {
  const body: Record<string, unknown> = {
    title: "Fix pump",
    type: "corrective",
    assetId,
    priority: "medium",
  };
  if (assignedToId) body.assignedToId = assignedToId;
  const res = await request(app.getHttpServer())
    .post("/work-orders")
    .set(auth(token))
    .send(body);
  if (res.status !== 201)
    throw new Error(`createWorkOrder failed: ${res.status}`);
  return res.body as { id: string };
}

async function seedRole(
  companyId: string,
  email: string,
  role: "technician" | "viewer" | "manager",
) {
  const password = await bcrypt.hash("Role1234", 12);
  await testPrisma()
    .getClient()
    .user.create({
      data: { email, password, firstName: "R", lastName: "U", role, companyId },
    });
  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email, password: "Role1234" });
  return login.body as { accessToken: string; user: { id: string } };
}

async function createPart(
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const body = {
    name: "Bearing",
    sku: "BRG-" + Math.random().toString(36).slice(2, 8),
    quantity: 10,
    minQuantity: 5,
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post("/parts")
    .set(auth(token))
    .send(body);
  if (res.status !== 201)
    throw new Error(
      `createPart failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body as {
    id: string;
    quantity: number;
    minQuantity: number;
    sku: string;
  };
}

// --- tests -----------------------------------------------------------------

describe("Parts CRUD", () => {
  it("#1 create → get → list contains it", async () => {
    const admin = await registerAdmin();
    const created = await createPart(admin.accessToken, { sku: "BRG-001" });

    const get = await request(app.getHttpServer())
      .get(`/parts/${created.id}`)
      .set(auth(admin.accessToken));
    expect(get.status).toBe(200);
    expect(get.body.sku).toBe("BRG-001");

    const list = await request(app.getHttpServer())
      .get("/parts")
      .set(auth(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(created.id);
  });

  it("#2 metadata update preserves stock; audited adjustment changes it", async () => {
    const admin = await registerAdmin();
    const part = await createPart(admin.accessToken, {
      description: "Old notes",
    });
    const res = await request(app.getHttpServer())
      .patch(`/parts/${part.id}`)
      .set(auth(admin.accessToken))
      .send({ name: "Bearing V2", description: null });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Bearing V2");
    expect(res.body.description).toBeNull();
    expect(res.body.quantity).toBe(10);

    const adjusted = await request(app.getHttpServer())
      .post(`/parts/${part.id}/adjustments`)
      .set(auth(admin.accessToken))
      .send({ delta: 10, reason: "Supplier restock" });
    expect(adjusted.status).toBe(201);
    expect(adjusted.body.quantity).toBe(20);
    const movement = await testPrisma()
      .getClient()
      .inventoryMovement.findFirst({
        where: { partId: part.id, kind: "adjustment" },
      });
    expect(movement).toMatchObject({ delta: 10, reason: "Supplier restock" });
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
    const other = await registerAdmin({
      company: "Beta",
      email: "b@beta.test",
    });
    const part = await createPart(admin.accessToken);
    const res = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(other.accessToken));
    expect(res.status).toBe(404);
  });

  it("#5 delete → subsequent get 404", async () => {
    const admin = await registerAdmin();
    const part = await createPart(admin.accessToken);
    const del = await request(app.getHttpServer())
      .delete(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(del.status).toBe(204);
    const get = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(get.status).toBe(404);
  });

  it("#6 technician cannot create parts → 403", async () => {
    const admin = await registerAdmin();
    const tech = await seedRole(
      admin.user.companyId,
      "tech@acme.test",
      "technician",
    );
    const res = await request(app.getHttpServer())
      .post("/parts")
      .set(auth(tech.accessToken))
      .send({ name: "X", sku: "X-1", quantity: 1, minQuantity: 0 });
    expect(res.status).toBe(403);
  });

  it("#7 archive → hidden → archived view → restore preserves the part and ledger", async () => {
    const admin = await registerAdmin();
    const part = await createPart(admin.accessToken, {
      sku: "RESTORE-1",
      quantity: 7,
    });
    const movementsBefore = await testPrisma()
      .getClient()
      .inventoryMovement.findMany({
        where: { partId: part.id },
        orderBy: { createdAt: "asc" },
      });

    const archived = await request(app.getHttpServer())
      .delete(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(archived.status).toBe(204);

    const activeList = await request(app.getHttpServer())
      .get("/parts")
      .set(auth(admin.accessToken));
    expect(activeList.body).toMatchObject({ total: 0, items: [] });

    const archivedList = await request(app.getHttpServer())
      .get("/parts/archived")
      .set(auth(admin.accessToken));
    expect(archivedList.status).toBe(200);
    expect(archivedList.body).toMatchObject({ total: 1 });
    expect(archivedList.body.items[0]).toMatchObject({
      id: part.id,
      sku: "RESTORE-1",
      quantity: 7,
    });

    const restored = await request(app.getHttpServer())
      .post(`/parts/${part.id}/restore`)
      .set(auth(admin.accessToken));
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      id: part.id,
      sku: "RESTORE-1",
      quantity: 7,
    });

    const activeGet = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(activeGet.status).toBe(200);

    const movementsAfter = await testPrisma()
      .getClient()
      .inventoryMovement.findMany({
        where: { partId: part.id },
        orderBy: { createdAt: "asc" },
      });
    expect(movementsAfter).toEqual(movementsBefore);
  });

  it("#8 archived inventory and restore are manager/admin-only and tenant-scoped", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({
      company: "Beta",
      email: "restore@beta.test",
    });
    const viewer = await seedRole(
      admin.user.companyId,
      "restore-viewer@acme.test",
      "viewer",
    );
    const part = await createPart(admin.accessToken);
    await request(app.getHttpServer())
      .delete(`/parts/${part.id}`)
      .set(auth(admin.accessToken));

    const viewerList = await request(app.getHttpServer())
      .get("/parts/archived")
      .set(auth(viewer.accessToken));
    expect(viewerList.status).toBe(403);

    const viewerRestore = await request(app.getHttpServer())
      .post(`/parts/${part.id}/restore`)
      .set(auth(viewer.accessToken));
    expect(viewerRestore.status).toBe(403);

    const crossTenantRestore = await request(app.getHttpServer())
      .post(`/parts/${part.id}/restore`)
      .set(auth(other.accessToken));
    expect(crossTenantRestore.status).toBe(404);
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

    const after = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
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

    const after = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
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

    const after = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(10);

    const lines = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken));
    expect(lines.body).toHaveLength(0);
  });

  it("#10 technician not assigned to WO → 403 on consume", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tech = await seedRole(
      admin.user.companyId,
      "tech10@acme.test",
      "technician",
    );
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
    const tech = await seedRole(
      admin.user.companyId,
      "tech11@acme.test",
      "technician",
    );
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
    await createPart(admin.accessToken, {
      sku: "LOW-1",
      quantity: 2,
      minQuantity: 5,
    });
    await createPart(admin.accessToken, {
      sku: "OK-1",
      quantity: 10,
      minQuantity: 5,
    });

    const res = await request(app.getHttpServer())
      .get("/parts?lowStock=true")
      .set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].sku).toBe("LOW-1");
  });

  it("#13 low-stock crossing creates a Notification for managers", async () => {
    const admin = await registerAdmin();
    // Seed a manager in the same company to receive the alert.
    const mgrPwd = await bcrypt.hash("Mgr12345", 12);
    const mgr = await testPrisma()
      .getClient()
      .user.create({
        data: {
          email: "mgr@acme.test",
          password: mgrPwd,
          firstName: "M",
          lastName: "G",
          role: "manager",
          companyId: admin.user.companyId,
        },
      });

    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, {
      quantity: 6,
      minQuantity: 5,
    });

    const before = await testPrisma()
      .getClient()
      .notification.count({ where: { userId: mgr.id } });
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 3 }); // 6 → 3, crosses 5
    const after = await testPrisma()
      .getClient()
      .notification.count({ where: { userId: mgr.id } });
    expect(after).toBe(before + 1);
  });

  it("#14 repeat consumption when already low → no additional Notification (no spam)", async () => {
    const admin = await registerAdmin();
    const mgrPwd = await bcrypt.hash("Mgr12345", 12);
    const mgr = await testPrisma()
      .getClient()
      .user.create({
        data: {
          email: "mgr2@acme.test",
          password: mgrPwd,
          firstName: "M",
          lastName: "G",
          role: "manager",
          companyId: admin.user.companyId,
        },
      });

    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, {
      quantity: 4,
      minQuantity: 5,
    }); // already low

    const before = await testPrisma()
      .getClient()
      .notification.count({ where: { userId: mgr.id } });
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 1 }); // 4 → 3, but no crossing
    const after = await testPrisma()
      .getClient()
      .notification.count({ where: { userId: mgr.id } });
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

    const lines = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken));
    expect(lines.body).toHaveLength(1);
    expect(lines.body[0].quantity).toBe(5);

    const after = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(5);
  });

  it("#16 viewer cannot consume or restock inventory → 403", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken);
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(admin.accessToken))
      .send({ partId: part.id, quantity: 1 });

    const viewer = await seedRole(
      admin.user.companyId,
      "view@acme.test",
      "viewer",
    );
    const consume = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts`)
      .set(auth(viewer.accessToken))
      .send({ partId: part.id, quantity: 1 });
    expect(consume.status).toBe(403);

    const restock = await request(app.getHttpServer())
      .delete(`/work-orders/${wo.id}/parts/${part.id}`)
      .set(auth(viewer.accessToken));
    expect(restock.status).toBe(403);
  });

  it("#17 concurrent consumption allows only available stock", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const firstWo = await createWorkOrder(admin.accessToken, assetId);
    const secondWo = await createWorkOrder(admin.accessToken, assetId);
    const part = await createPart(admin.accessToken, {
      quantity: 5,
      minQuantity: 1,
    });

    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post(`/work-orders/${firstWo.id}/parts`)
        .set(auth(admin.accessToken))
        .send({ partId: part.id, quantity: 3 }),
      request(app.getHttpServer())
        .post(`/work-orders/${secondWo.id}/parts`)
        .set(auth(admin.accessToken))
        .send({ partId: part.id, quantity: 3 }),
    ]);

    expect(attempts.map((res) => res.status).sort()).toEqual([201, 409]);

    const after = await request(app.getHttpServer())
      .get(`/parts/${part.id}`)
      .set(auth(admin.accessToken));
    expect(after.body.quantity).toBe(2);
  });

  it("#18 former technician cannot consume after manager reassignment linearizes", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const manager = await seedRole(
      admin.user.companyId,
      "consume-race-manager@acme.test",
      "manager",
    );
    const formerTech = await seedRole(
      admin.user.companyId,
      "former-consume@acme.test",
      "technician",
    );
    const newTech = await seedRole(
      admin.user.companyId,
      "new-consume@acme.test",
      "technician",
    );
    const wo = await createWorkOrder(
      admin.accessToken,
      assetId,
      formerTech.user.id,
    );
    const part = await createPart(admin.accessToken, {
      quantity: 8,
      minQuantity: 2,
    });
    const blocker = await holdWorkOrderLock(wo.id);

    let reassignment!: Promise<request.Response>;
    let staleConsumption!: Promise<request.Response>;
    try {
      reassignment = request(app.getHttpServer())
        .patch(`/work-orders/${wo.id}`)
        .set(auth(manager.accessToken))
        .send({ assignedToId: newTech.user.id })
        .then((res) => res);
      await waitForWorkOrderLockWaiters(1);

      staleConsumption = request(app.getHttpServer())
        .post(`/work-orders/${wo.id}/parts`)
        .set(auth(formerTech.accessToken))
        .send({ partId: part.id, quantity: 3 })
        .then((res) => res);
      await waitForWorkOrderLockWaiters(2);
    } finally {
      await blocker.release();
    }
    const [reassigned, rejected] = await Promise.all([
      reassignment,
      staleConsumption,
    ]);

    expect(reassigned.status).toBe(200);
    expect(reassigned.body.assignedToId).toBe(newTech.user.id);
    expect(rejected.status).toBe(403);

    const [persistedPart, lineCount, consumptionCount] = await Promise.all([
      testPrisma()
        .getClient()
        .part.findUniqueOrThrow({
          where: { id: part.id },
          select: { quantity: true },
        }),
      testPrisma()
        .getClient()
        .workOrderPart.count({
          where: { workOrderId: wo.id, partId: part.id },
        }),
      testPrisma()
        .getClient()
        .inventoryMovement.count({
          where: { workOrderId: wo.id, partId: part.id, kind: "consumption" },
        }),
    ]);
    expect(persistedPart.quantity).toBe(8);
    expect(lineCount).toBe(0);
    expect(consumptionCount).toBe(0);
  });
});
