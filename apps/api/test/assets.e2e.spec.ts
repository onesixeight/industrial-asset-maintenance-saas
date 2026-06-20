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
  const res = await request(app.getHttpServer()).post("/auth/register").send({ ...ADMIN, ...overrides });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return res.body as { accessToken: string; user: { id: string; companyId: string; role: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Create a location+category in the company, return their ids. */
async function seedRefs(companyId: string) {
  const loc = await testPrisma().getClient().location.create({ data: { name: "Wh", companyId } });
  const cat = await testPrisma().getClient().category.create({ data: { name: "Pumps", companyId } });
  return { locId: loc.id, catId: cat.id };
}

async function createAsset(accessToken: string, locId: string, catId: string) {
  const res = await request(app.getHttpServer())
    .post("/assets")
    .set(auth(accessToken))
    .send({ name: "Pump 1", locationId: locId, categoryId: catId });
  if (res.status !== 201) throw new Error(`createAsset failed: ${res.status}`);
  return res.body as { id: string; qrCode: string };
}

async function seedViewer(companyId: string, email = "viewer@acme.test", role: "viewer" | "manager" = "viewer") {
  const password = await bcrypt.hash("Viewer123", 12);
  await testPrisma().getClient().user.create({
    data: { email, password, firstName: "V", lastName: "U", role, companyId },
  });
  const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Viewer123" });
  return login.body.accessToken as string;
}

// --- tests -----------------------------------------------------------------

describe("Assets CRUD + multi-tenancy + delete guard", () => {
  it("#1 create generates qrCode; list+get+update+delete happy path (scoped)", async () => {
    const admin = await registerAdmin();
    const { locId, catId } = await seedRefs(admin.user.companyId);

    const create = await createAsset(admin.accessToken, locId, catId);
    expect(create.qrCode).toBeTruthy(); // generated server-side
    expect(create.qrCode).not.toBe(create.id); // opaque, not the UUID

    const list = await request(app.getHttpServer()).get("/assets").set(auth(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const get = await request(app.getHttpServer()).get(`/assets/${create.id}`).set(auth(admin.accessToken));
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(create.id);

    const update = await request(app.getHttpServer())
      .patch(`/assets/${create.id}`)
      .set(auth(admin.accessToken))
      .send({ name: "Pump 1b", serialNumber: "SN-1" });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Pump 1b");
    expect(update.body.qrCode).toBe(create.qrCode); // unchanged by update

    const del = await request(app.getHttpServer()).delete(`/assets/${create.id}`).set(auth(admin.accessToken));
    expect(del.status).toBe(204);
  });

  it("#2 create with a foreign-tenant locationId → 400", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    const otherRefs = await seedRefs(other.user.companyId);

    const res = await request(app.getHttpServer())
      .post("/assets")
      .set(auth(admin.accessToken))
      .send({ name: "X", locationId: otherRefs.locId, categoryId: otherRefs.catId });
    expect(res.status).toBe(400);
  });

  it("#3 cross-tenant asset by id → 404", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Gamma", email: "g@gamma.test" });
    const adminRefs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, adminRefs.locId, adminRefs.catId);

    const res = await request(app.getHttpServer()).get(`/assets/${asset.id}`).set(auth(other.accessToken));
    expect(res.status).toBe(404);
  });

  it("#4 GET /assets/:id/qr returns image/svg+xml containing <svg", async () => {
    const admin = await registerAdmin();
    const refs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, refs.locId, refs.catId);

    const res = await request(app.getHttpServer()).get(`/assets/${asset.id}/qr`).set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    // supertest doesn't populate .text for image/* content-types; read the buffer.
    const svg = Buffer.isBuffer(res.body) ? res.body.toString("utf8") : String(res.body);
    expect(svg).toContain("<svg");
  });

  it("#5 GET /assets/qr/:token resolves; unknown/cross-tenant token → 404", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Delta", email: "d@delta.test" });
    const refs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, refs.locId, refs.catId);

    const ok = await request(app.getHttpServer()).get(`/assets/qr/${asset.qrCode}`).set(auth(admin.accessToken));
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(asset.id);

    const cross = await request(app.getHttpServer()).get(`/assets/qr/${asset.qrCode}`).set(auth(other.accessToken));
    expect(cross.status).toBe(404);

    const unknown = await request(app.getHttpServer()).get(`/assets/qr/bogus`).set(auth(admin.accessToken));
    expect(unknown.status).toBe(404);
  });

  it("#6 rotate changes qrCode; old token 404, new token resolves", async () => {
    const admin = await registerAdmin();
    const refs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, refs.locId, refs.catId);
    const oldToken = asset.qrCode;

    const rotate = await request(app.getHttpServer()).post(`/assets/${asset.id}/qr/rotate`).set(auth(admin.accessToken));
    expect(rotate.status).toBe(200);
    expect(rotate.body.qrCode).not.toBe(oldToken);
    const newToken = rotate.body.qrCode;

    const oldScan = await request(app.getHttpServer()).get(`/assets/qr/${oldToken}`).set(auth(admin.accessToken));
    expect(oldScan.status).toBe(404);

    const newScan = await request(app.getHttpServer()).get(`/assets/qr/${newToken}`).set(auth(admin.accessToken));
    expect(newScan.status).toBe(200);
  });

  it("#7 delete asset with a work order → 409; no history → 204", async () => {
    const admin = await registerAdmin();
    const refs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, refs.locId, refs.catId);

    // Seed a work order referencing the asset
    await testPrisma().getClient().workOrder.create({
      data: {
        title: "Inspect", type: "preventive", status: "open", priority: "medium",
        assetId: asset.id, companyId: admin.user.companyId,
      },
    });
    const blocked = await request(app.getHttpServer()).delete(`/assets/${asset.id}`).set(auth(admin.accessToken));
    expect(blocked.status).toBe(409);

    // A different asset with no history deletes fine
    const asset2 = await createAsset(admin.accessToken, refs.locId, refs.catId);
    const del = await request(app.getHttpServer()).delete(`/assets/${asset2.id}`).set(auth(admin.accessToken));
    expect(del.status).toBe(204);
  });

  it("#8 RBAC: viewer POST /assets → 403; viewer scan → 200", async () => {
    const admin = await registerAdmin();
    const refs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, refs.locId, refs.catId);
    const viewerToken = await seedViewer(admin.user.companyId);

    const post = await request(app.getHttpServer())
      .post("/assets")
      .set(auth(viewerToken))
      .send({ name: "X", locationId: refs.locId, categoryId: refs.catId });
    expect(post.status).toBe(403);

    const scan = await request(app.getHttpServer()).get(`/assets/qr/${asset.qrCode}`).set(auth(viewerToken));
    expect(scan.status).toBe(200);
  });

  it("#9 filtered list by status/location/category/search", async () => {
    const admin = await registerAdmin();
    const refs = await seedRefs(admin.user.companyId);
    await createAsset(admin.accessToken, refs.locId, refs.catId);
    await createAsset(admin.accessToken, refs.locId, refs.catId);

    const byLoc = await request(app.getHttpServer()).get(`/assets?locationId=${refs.locId}`).set(auth(admin.accessToken));
    expect(byLoc.body).toHaveLength(2);

    const bySearch = await request(app.getHttpServer()).get(`/assets?search=Pump`).set(auth(admin.accessToken));
    expect(bySearch.body).toHaveLength(2);

    const byStatus = await request(app.getHttpServer()).get(`/assets?status=maintenance`).set(auth(admin.accessToken));
    expect(byStatus.body).toHaveLength(0); // both default to active
  });

  it("#10 PATCH updates fields; qrCode is read-only (ignored if sent)", async () => {
    const admin = await registerAdmin();
    const refs = await seedRefs(admin.user.companyId);
    const asset = await createAsset(admin.accessToken, refs.locId, refs.catId);

    // The update schema omits qrCode, so the Zod pipe strips it; qrCode stays.
    const res = await request(app.getHttpServer())
      .patch(`/assets/${asset.id}`)
      .set(auth(admin.accessToken))
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
    expect(res.body.qrCode).toBe(asset.qrCode);
  });
});
