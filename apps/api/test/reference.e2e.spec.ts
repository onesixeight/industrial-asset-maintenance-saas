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
  // Reset the in-memory throttle counters so a test that registers/logs in
  // several times doesn't get throttled by the previous test's hits.
  const storage = app.get(ThrottlerStorage) as unknown as {
    storage?: Map<string, unknown>;
  };
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
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { accessToken: string; user: { id: string; companyId: string; role: string } };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedViewer(companyId: string, email = "viewer@acme.test", role: "viewer" | "manager" = "viewer") {
  const password = await bcrypt.hash("Viewer123", 12);
  const u = await testPrisma().getClient().user.create({
    data: { email, password, firstName: "V", lastName: "U", role, companyId },
  });
  return u;
}

// --- tests -----------------------------------------------------------------

describe("Locations CRUD + multi-tenancy + delete guard", () => {
  it("#1 create + list + get + update + delete (scoped to company)", async () => {
    const admin = await registerAdmin();

    const create = await request(app.getHttpServer())
      .post("/locations")
      .set(authHeader(admin.accessToken))
      .send({ name: "Warehouse A", description: "Main" });
    expect(create.status).toBe(201);
    expect(create.body.companyId).toBe(admin.user.companyId);
    const id = create.body.id;

    const list = await request(app.getHttpServer()).get("/locations").set(authHeader(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Warehouse A");

    const get = await request(app.getHttpServer()).get(`/locations/${id}`).set(authHeader(admin.accessToken));
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(id);

    const update = await request(app.getHttpServer())
      .patch(`/locations/${id}`)
      .set(authHeader(admin.accessToken))
      .send({ name: "Warehouse B", description: "Renamed" });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Warehouse B");

    const del = await request(app.getHttpServer()).delete(`/locations/${id}`).set(authHeader(admin.accessToken));
    expect(del.status).toBe(204);
    const after = await request(app.getHttpServer()).get("/locations").set(authHeader(admin.accessToken));
    expect(after.body).toHaveLength(0);
  });

  it("#2 cross-tenant location by id → 404", async () => {
    const a = await registerAdmin();
    const b = await registerAdmin({ company: "Beta Co", email: "b@beta.test" });

    const create = await request(app.getHttpServer())
      .post("/locations")
      .set(authHeader(a.accessToken))
      .send({ name: "A's Warehouse" });
    const idA = create.body.id;

    // Company B tries to read A's location → 404 (not 403, no existence leak)
    const res = await request(app.getHttpServer()).get(`/locations/${idA}`).set(authHeader(b.accessToken));
    expect(res.status).toBe(404);
  });

  it("#3 delete location with an asset → 409", async () => {
    const admin = await registerAdmin();
    const create = await request(app.getHttpServer())
      .post("/locations")
      .set(authHeader(admin.accessToken))
      .send({ name: "Stocked Warehouse" });
    const locId = create.body.id;

    // Seed a category + asset referencing the location (asset requires location + category + company).
    const cat = await testPrisma().getClient().category.create({
      data: { name: "Pumps", companyId: admin.user.companyId },
    });
    await testPrisma().getClient().asset.create({
      data: {
        name: "Pump 1",
        qrCode: "qr-asset-1",
        locationId: locId,
        categoryId: cat.id,
        companyId: admin.user.companyId,
      },
    });

    const del = await request(app.getHttpServer()).delete(`/locations/${locId}`).set(authHeader(admin.accessToken));
    expect(del.status).toBe(409);
  });
});

describe("Categories CRUD + multi-tenancy + delete guard", () => {
  it("#4 category CRUD mirror + cross-tenant 404 + delete-guard 409", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Gamma Co", email: "g@gamma.test" });

    const create = await request(app.getHttpServer())
      .post("/categories")
      .set(authHeader(admin.accessToken))
      .send({ name: "Pumps" });
    expect(create.status).toBe(201);
    const catId = create.body.id;

    const get = await request(app.getHttpServer()).get(`/categories/${catId}`).set(authHeader(admin.accessToken));
    expect(get.status).toBe(200);

    // cross-tenant 404
    const x = await request(app.getHttpServer()).get(`/categories/${catId}`).set(authHeader(other.accessToken));
    expect(x.status).toBe(404);

    // delete-guard 409: asset referencing the category
    const loc = await testPrisma().getClient().location.create({
      data: { name: "Wh", companyId: admin.user.companyId },
    });
    await testPrisma().getClient().asset.create({
      data: {
        name: "Asset X", qrCode: "qr-cat-1", locationId: loc.id, categoryId: catId,
        companyId: admin.user.companyId,
      },
    });
    const del = await request(app.getHttpServer()).delete(`/categories/${catId}`).set(authHeader(admin.accessToken));
    expect(del.status).toBe(409);
  });
});

describe("Users management", () => {
  it("#5 manager creates user (temp password, mustChangePassword=true, no password in body)", async () => {
    const admin = await registerAdmin();
    const res = await request(app.getHttpServer())
      .post("/users")
      .set(authHeader(admin.accessToken))
      .send({ email: "new@acme.test", firstName: "New", lastName: "User", role: "viewer", password: "TempPass1" });
    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body).not.toHaveProperty("password");

    // The new user cannot log in normally — blocked by the force-change gate.
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "new@acme.test", password: "TempPass1" });
    expect(login.status).toBe(403);
    expect(login.body?.code ?? login.body?.message?.code).toBe("MUST_CHANGE_PASSWORD");
  });

  it("#6 duplicate email on POST /users → 409", async () => {
    const admin = await registerAdmin();
    const body = { email: "dup@acme.test", firstName: "D", lastName: "U", role: "viewer", password: "TempPass1" };
    await request(app.getHttpServer()).post("/users").set(authHeader(admin.accessToken)).send(body).expect(201);
    const res = await request(app.getHttpServer()).post("/users").set(authHeader(admin.accessToken)).send(body);
    expect(res.status).toBe(409);
  });
});

describe("Force-change-password flow", () => {
  it("#7 blocked login → change-password clears flag + returns tokens", async () => {
    const admin = await registerAdmin();
    await request(app.getHttpServer())
      .post("/users")
      .set(authHeader(admin.accessToken))
      .send({ email: "fc@acme.test", firstName: "F", lastName: "C", role: "viewer", password: "TempPass1" })
      .expect(201);

    // change-password (no Bearer) with the temp password
    const change = await request(app.getHttpServer())
      .post("/auth/change-password")
      .send({ email: "fc@acme.test", currentPassword: "TempPass1", newPassword: "NewPass1" });
    expect(change.status).toBe(200);
    expect(change.body.accessToken).toBeTruthy();
    expect(change.body.user.mustChangePassword).toBe(false);

    // Normal login now works with the new password
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "fc@acme.test", password: "NewPass1" });
    expect(login.status).toBe(200);
  });
});

describe("RBAC on users + reference data", () => {
  it("#8 role-change: admin → ok; manager → 403", async () => {
    const admin = await registerAdmin();
    const manager = await seedViewer(admin.user.companyId, "mgr@acme.test", "manager");
    const mgrLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "mgr@acme.test", password: "Viewer123" });

    // admin changes a role → 200
    const ok = await request(app.getHttpServer())
      .patch(`/users/${manager.id}/role`)
      .set(authHeader(admin.accessToken))
      .send({ role: "technician" });
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe("technician");

    // manager cannot change roles → 403
    const forbidden = await request(app.getHttpServer())
      .patch(`/users/${manager.id}/role`)
      .set(authHeader(mgrLogin.body.accessToken))
      .send({ role: "viewer" });
    expect(forbidden.status).toBe(403);
  });

  it("#9 viewer cannot POST /locations → 403", async () => {
    const admin = await registerAdmin();
    await seedViewer(admin.user.companyId, "vw@acme.test", "viewer");
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "vw@acme.test", password: "Viewer123" });

    const res = await request(app.getHttpServer())
      .post("/locations")
      .set(authHeader(login.body.accessToken))
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });

  it("#10 change-password rejects a weak new password → 400", async () => {
    const admin = await registerAdmin();
    await request(app.getHttpServer())
      .post("/users")
      .set(authHeader(admin.accessToken))
      .send({ email: "wk@acme.test", firstName: "W", lastName: "K", role: "viewer", password: "TempPass1" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/auth/change-password")
      .send({ email: "wk@acme.test", currentPassword: "TempPass1", newPassword: "weak" });
    expect(res.status).toBe(400);
  });
});
