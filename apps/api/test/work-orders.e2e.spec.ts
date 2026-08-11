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
    user: { id: string; companyId: string; role: string };
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedAsset(companyId: string) {
  const loc = await testPrisma()
    .getClient()
    .location.create({ data: { name: "Wh", companyId } });
  const cat = await testPrisma()
    .getClient()
    .category.create({ data: { name: "Pumps", companyId } });
  const asset = await testPrisma()
    .getClient()
    .asset.create({
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
    title: "Inspect pump",
    type: "preventive",
    assetId,
    priority: "medium",
  };
  if (assignedToId) body.assignedToId = assignedToId;
  const res = await request(app.getHttpServer())
    .post("/work-orders")
    .set(auth(token))
    .send(body);
  if (res.status !== 201)
    throw new Error(
      `createWorkOrder failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body as { id: string; status: string };
}

async function seedRole(
  companyId: string,
  email: string,
  role: "viewer" | "technician" | "manager",
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

// --- tests -----------------------------------------------------------------

describe("Work orders lifecycle", () => {
  it("#1 create (open default); list excludes soft-deleted; get; update; soft-delete hides it", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);

    const create = await createWorkOrder(admin.accessToken, assetId);
    expect(create.status).toBe("open");

    const list = await request(app.getHttpServer())
      .get("/work-orders")
      .set(auth(admin.accessToken));
    expect(list.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(create.id);

    const update = await request(app.getHttpServer())
      .patch(`/work-orders/${create.id}`)
      .set(auth(admin.accessToken))
      .send({ title: "Inspect pump v2" });
    expect(update.status).toBe(200);
    expect(update.body.title).toBe("Inspect pump v2");

    const del = await request(app.getHttpServer())
      .delete(`/work-orders/${create.id}`)
      .set(auth(admin.accessToken));
    expect(del.status).toBe(204);

    const after = await request(app.getHttpServer())
      .get("/work-orders")
      .set(auth(admin.accessToken));
    expect(after.body).toMatchObject({ total: 0 });
    expect(after.body.items).toHaveLength(0); // soft-deleted excluded
  });

  it("#2 valid chain: open → in_progress → on_hold → in_progress → completed (completedAt set)", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);

    for (const status of [
      "in_progress",
      "on_hold",
      "in_progress",
      "completed",
    ]) {
      const res = await request(app.getHttpServer())
        .patch(`/work-orders/${wo.id}/status`)
        .set(auth(admin.accessToken))
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
    const completed = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}`)
      .set(auth(admin.accessToken));
    expect(completed.body.completedAt).toBeTruthy();
  });

  it("#3 invalid transition: open → completed → 400", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);

    const res = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "completed" });
    expect(res.status).toBe(400);
  });

  it("#4 terminal states: completed → in_progress 400; cancelled → open 400", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);

    const completed = await createWorkOrder(admin.accessToken, assetId);
    await request(app.getHttpServer())
      .patch(`/work-orders/${completed.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "in_progress" });
    await request(app.getHttpServer())
      .patch(`/work-orders/${completed.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "completed" });
    const back = await request(app.getHttpServer())
      .patch(`/work-orders/${completed.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "in_progress" });
    expect(back.status).toBe(400);

    const cancelled = await createWorkOrder(admin.accessToken, assetId);
    await request(app.getHttpServer())
      .patch(`/work-orders/${cancelled.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "cancelled" });
    const reopen = await request(app.getHttpServer())
      .patch(`/work-orders/${cancelled.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "open" });
    expect(reopen.status).toBe(400);
  });

  it("#5 technician can transition assigned WO; cannot transition unassigned → 403", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tech = await seedRole(
      admin.user.companyId,
      "tech@acme.test",
      "technician",
    );

    const assigned = await createWorkOrder(
      admin.accessToken,
      assetId,
      tech.user.id,
    );
    const ok = await request(app.getHttpServer())
      .patch(`/work-orders/${assigned.id}/status`)
      .set(auth(tech.accessToken))
      .send({ status: "in_progress" });
    expect(ok.status).toBe(200);

    const unassigned = await createWorkOrder(admin.accessToken, assetId);
    const forbidden = await request(app.getHttpServer())
      .patch(`/work-orders/${unassigned.id}/status`)
      .set(auth(tech.accessToken))
      .send({ status: "in_progress" });
    expect(forbidden.status).toBe(403);
  });

  it("#6 viewer cannot POST/PATCH/DELETE → 403; viewer can GET", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);
    const viewer = await seedRole(
      admin.user.companyId,
      "viewer@acme.test",
      "viewer",
    );

    const get = await request(app.getHttpServer())
      .get("/work-orders")
      .set(auth(viewer.accessToken));
    expect(get.status).toBe(200);

    const post = await request(app.getHttpServer())
      .post("/work-orders")
      .set(auth(viewer.accessToken))
      .send({ title: "X", type: "preventive", assetId });
    expect(post.status).toBe(403);

    const patch = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}`)
      .set(auth(viewer.accessToken))
      .send({ title: "Y" });
    expect(patch.status).toBe(403);

    const transition = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/status`)
      .set(auth(viewer.accessToken))
      .send({ status: "in_progress" });
    expect(transition.status).toBe(403);

    const del = await request(app.getHttpServer())
      .delete(`/work-orders/${wo.id}`)
      .set(auth(viewer.accessToken));
    expect(del.status).toBe(403);
  });

  it("#7 create with foreign-tenant assetId → 400", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({
      company: "Beta",
      email: "b@beta.test",
    });
    const otherAssetId = await seedAsset(other.user.companyId);

    const res = await request(app.getHttpServer())
      .post("/work-orders")
      .set(auth(admin.accessToken))
      .send({ title: "X", type: "preventive", assetId: otherAssetId });
    expect(res.status).toBe(400);
  });

  it("#8 cross-tenant WO by id → 404", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({
      company: "Gamma",
      email: "g@gamma.test",
    });
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);

    const res = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}`)
      .set(auth(other.accessToken));
    expect(res.status).toBe(404);
  });

  it("#9 filtered list by status/priority/asset/assignee/search", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tech = await seedRole(
      admin.user.companyId,
      "tech9@acme.test",
      "technician",
    );

    await createWorkOrder(admin.accessToken, assetId);
    await createWorkOrder(admin.accessToken, assetId, tech.user.id);

    const byAsset = await request(app.getHttpServer())
      .get(`/work-orders?assetId=${assetId}`)
      .set(auth(admin.accessToken));
    expect(byAsset.body).toMatchObject({ total: 2 });
    expect(byAsset.body.items).toHaveLength(2);

    const byAssignee = await request(app.getHttpServer())
      .get(`/work-orders?assignedToId=${tech.user.id}`)
      .set(auth(admin.accessToken));
    expect(byAssignee.body).toMatchObject({ total: 1 });
    expect(byAssignee.body.items).toHaveLength(1);
    expect(byAssignee.body.items[0].assignedToId).toBe(tech.user.id);

    const byStatus = await request(app.getHttpServer())
      .get(`/work-orders?status=completed`)
      .set(auth(admin.accessToken));
    expect(byStatus.body).toMatchObject({ total: 0 });
    expect(byStatus.body.items).toHaveLength(0);

    const bySearch = await request(app.getHttpServer())
      .get(`/work-orders?search=Inspect`)
      .set(auth(admin.accessToken));
    expect(bySearch.body).toMatchObject({ total: 2 });
    expect(bySearch.body.items).toHaveLength(2);
  });

  it("#10 soft-deleted WO excluded from list AND from GET (404)", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const wo = await createWorkOrder(admin.accessToken, assetId);

    await request(app.getHttpServer())
      .delete(`/work-orders/${wo.id}`)
      .set(auth(admin.accessToken))
      .expect(204);

    const list = await request(app.getHttpServer())
      .get("/work-orders")
      .set(auth(admin.accessToken));
    expect(list.body).toMatchObject({ total: 0 });
    expect(list.body.items).toHaveLength(0);

    const get = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}`)
      .set(auth(admin.accessToken));
    expect(get.status).toBe(404);
  });

  it("#11 former technician cannot transition after manager reassignment linearizes", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const manager = await seedRole(
      admin.user.companyId,
      "race-manager@acme.test",
      "manager",
    );
    const formerTech = await seedRole(
      admin.user.companyId,
      "former-transition@acme.test",
      "technician",
    );
    const newTech = await seedRole(
      admin.user.companyId,
      "new-transition@acme.test",
      "technician",
    );
    const wo = await createWorkOrder(
      admin.accessToken,
      assetId,
      formerTech.user.id,
    );
    const blocker = await holdWorkOrderLock(wo.id);

    let reassignment!: Promise<request.Response>;
    let staleTransition!: Promise<request.Response>;
    try {
      reassignment = request(app.getHttpServer())
        .patch(`/work-orders/${wo.id}`)
        .set(auth(manager.accessToken))
        .send({ assignedToId: newTech.user.id })
        .then((res) => res);
      await waitForWorkOrderLockWaiters(1);

      staleTransition = request(app.getHttpServer())
        .patch(`/work-orders/${wo.id}/status`)
        .set(auth(formerTech.accessToken))
        .send({ status: "in_progress" })
        .then((res) => res);
      await waitForWorkOrderLockWaiters(2);
    } finally {
      await blocker.release();
    }
    const [reassigned, rejected] = await Promise.all([
      reassignment,
      staleTransition,
    ]);

    expect(reassigned.status).toBe(200);
    expect(reassigned.body.assignedToId).toBe(newTech.user.id);
    expect(rejected.status).toBe(409);

    const persisted = await testPrisma()
      .getClient()
      .workOrder.findUniqueOrThrow({
        where: { id: wo.id },
        select: { assignedToId: true, status: true },
      });
    expect(persisted).toEqual({
      assignedToId: newTech.user.id,
      status: "open",
    });
  });
});
