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

const ADMIN = { company: "Acme", email: "alice@acme.test", password: "Password1", firstName: "Ada", lastName: "Admin" };

async function registerAdmin(overrides: Partial<typeof ADMIN> = {}) {
  const res = await request(app.getHttpServer()).post("/auth/register").send({ ...ADMIN, ...overrides });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return res.body as { accessToken: string; user: { id: string; companyId: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedAsset(companyId: string) {
  const loc = await testPrisma().getClient().location.create({ data: { name: "Wh", companyId } });
  const cat = await testPrisma().getClient().category.create({ data: { name: "Pumps", companyId } });
  const asset = await testPrisma().getClient().asset.create({
    data: { name: "Pump", qrCode: "qr-" + Math.random().toString(36).slice(2), locationId: loc.id, categoryId: cat.id, companyId },
  });
  return asset.id;
}

async function createTemplate(token: string, labels: string[]) {
  const res = await request(app.getHttpServer())
    .post("/inspections/templates")
    .set(auth(token))
    .send({ name: "Daily", items: labels.map((l) => ({ label: l })) });
  if (res.status !== 201) throw new Error(`createTemplate failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; items: { id: string; label: string }[] };
}

async function seedRole(companyId: string, email: string, role: "viewer" | "technician") {
  const password = await bcrypt.hash("Role1234", 12);
  await testPrisma().getClient().user.create({ data: { email, password, firstName: "R", lastName: "U", role, companyId } });
  const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Role1234" });
  return login.body as { accessToken: string };
}

// --- tests -----------------------------------------------------------------

describe("Inspections templates + submissions", () => {
  it("#1 template CRUD (server-generated item ids) + scoped list", async () => {
    const admin = await registerAdmin();
    const tpl = await createTemplate(admin.accessToken, ["Oil", "Belt"]);
    expect(tpl.items).toHaveLength(2);
    expect(tpl.items[0].id).toBeTruthy();

    const list = await request(app.getHttpServer()).get("/inspections/templates").set(auth(admin.accessToken));
    expect(list.body).toHaveLength(1);

    const get = await request(app.getHttpServer()).get(`/inspections/templates/${tpl.id}`).set(auth(admin.accessToken));
    expect(get.body.id).toBe(tpl.id);

    const edit = await request(app.getHttpServer())
      .patch(`/inspections/templates/${tpl.id}`)
      .set(auth(admin.accessToken))
      .send({ name: "Weekly" });
    expect(edit.body.name).toBe("Weekly");

    const del = await request(app.getHttpServer()).delete(`/inspections/templates/${tpl.id}`).set(auth(admin.accessToken));
    expect(del.status).toBe(204);
  });

  it("#2 all-pass → passed=true; one-fail → passed=false (critical-path test)", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A", "B", "C"]);

    const allPass = await request(app.getHttpServer())
      .post("/inspections")
      .set(auth(admin.accessToken))
      .send({
        assetId, templateId: tpl.id,
        results: tpl.items.map((it) => ({ itemId: it.id, value: "pass" })),
      });
    expect(allPass.status).toBe(201);
    expect(allPass.body.passed).toBe(true);

    const oneFail = await request(app.getHttpServer())
      .post("/inspections")
      .set(auth(admin.accessToken))
      .send({
        assetId, templateId: tpl.id,
        results: tpl.items.map((it, i) => ({ itemId: it.id, value: i === 1 ? "fail" : "pass" })),
      });
    expect(oneFail.status).toBe(201);
    expect(oneFail.body.passed).toBe(false);
  });

  it("#3 missing item result → 400; unknown itemId → 400", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A", "B"]);

    const missing = await request(app.getHttpServer())
      .post("/inspections")
      .set(auth(admin.accessToken))
      .send({ assetId, templateId: tpl.id, results: [{ itemId: tpl.items[0].id, value: "pass" }] });
    expect(missing.status).toBe(400);

    const unknown = await request(app.getHttpServer())
      .post("/inspections")
      .set(auth(admin.accessToken))
      .send({ assetId, templateId: tpl.id, results: [{ itemId: "bogus", value: "pass" }, { itemId: tpl.items[1].id, value: "pass" }] });
    expect(unknown.status).toBe(400);
  });

  it("#4 submit with foreign-tenant assetId/templateId → 404", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Beta", email: "b@beta.test" });
    const otherAssetId = await seedAsset(other.user.companyId);
    const otherTpl = await createTemplate(other.accessToken, ["X"]);

    const res = await request(app.getHttpServer())
      .post("/inspections")
      .set(auth(admin.accessToken))
      .send({ assetId: otherAssetId, templateId: otherTpl.id, results: [{ itemId: otherTpl.items[0].id, value: "pass" }] });
    expect(res.status).toBe(404);
  });

  it("#5 inspectedById = the submitter", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A"]);
    const res = await request(app.getHttpServer())
      .post("/inspections")
      .set(auth(admin.accessToken))
      .send({ assetId, templateId: tpl.id, results: [{ itemId: tpl.items[0].id, value: "pass" }] });
    expect(res.body.inspectedById).toBe(admin.user.id);
  });

  it("#6 delete template with inspections → 409; no refs → 204", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);

    const withInsp = await createTemplate(admin.accessToken, ["A"]);
    await request(app.getHttpServer()).post("/inspections").set(auth(admin.accessToken)).send({ assetId, templateId: withInsp.id, results: [{ itemId: withInsp.items[0].id, value: "pass" }] }).expect(201);
    const blocked = await request(app.getHttpServer()).delete(`/inspections/templates/${withInsp.id}`).set(auth(admin.accessToken));
    expect(blocked.status).toBe(409);

    const empty = await createTemplate(admin.accessToken, ["B"]);
    const del = await request(app.getHttpServer()).delete(`/inspections/templates/${empty.id}`).set(auth(admin.accessToken));
    expect(del.status).toBe(204);
  });

  it("#7 cross-tenant inspection/template by id → 404", async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin({ company: "Gamma", email: "g@gamma.test" });
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A"]);
    const insp = await request(app.getHttpServer()).post("/inspections").set(auth(admin.accessToken)).send({ assetId, templateId: tpl.id, results: [{ itemId: tpl.items[0].id, value: "pass" }] });

    const tplX = await request(app.getHttpServer()).get(`/inspections/templates/${tpl.id}`).set(auth(other.accessToken));
    expect(tplX.status).toBe(404);
    const inspX = await request(app.getHttpServer()).get(`/inspections/${insp.body.id}`).set(auth(other.accessToken));
    expect(inspX.status).toBe(404);
  });

  it("#8 RBAC: viewer cannot submit or create template → 403; technician can submit, cannot create template", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A"]);
    const viewer = await seedRole(admin.user.companyId, "vw@acme.test", "viewer");
    const tech = await seedRole(admin.user.companyId, "tech@acme.test", "technician");

    // viewer submit → 403
    const vSubmit = await request(app.getHttpServer()).post("/inspections").set(auth(viewer.accessToken)).send({ assetId, templateId: tpl.id, results: [{ itemId: tpl.items[0].id, value: "pass" }] });
    expect(vSubmit.status).toBe(403);
    // viewer create template → 403
    const vTpl = await request(app.getHttpServer()).post("/inspections/templates").set(auth(viewer.accessToken)).send({ name: "X", items: [{ label: "Y" }] });
    expect(vTpl.status).toBe(403);
    // technician submit → 201
    const tSubmit = await request(app.getHttpServer()).post("/inspections").set(auth(tech.accessToken)).send({ assetId, templateId: tpl.id, results: [{ itemId: tpl.items[0].id, value: "pass" }] });
    expect(tSubmit.status).toBe(201);
    // technician create template → 403
    const tTpl = await request(app.getHttpServer()).post("/inspections/templates").set(auth(tech.accessToken)).send({ name: "X", items: [{ label: "Y" }] });
    expect(tTpl.status).toBe(403);
  });

  it("#9 filtered list by asset/template/passed", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A", "B"]);

    await request(app.getHttpServer()).post("/inspections").set(auth(admin.accessToken)).send({ assetId, templateId: tpl.id, results: tpl.items.map((it) => ({ itemId: it.id, value: "pass" })) }).expect(201);
    await request(app.getHttpServer()).post("/inspections").set(auth(admin.accessToken)).send({ assetId, templateId: tpl.id, results: tpl.items.map((it, i) => ({ itemId: it.id, value: i === 0 ? "fail" : "pass" })) }).expect(201);

    const byAsset = await request(app.getHttpServer()).get(`/inspections?assetId=${assetId}`).set(auth(admin.accessToken));
    expect(byAsset.body).toHaveLength(2);

    const byPassed = await request(app.getHttpServer()).get(`/inspections?passed=true`).set(auth(admin.accessToken));
    expect(byPassed.body).toHaveLength(1);
  });

  it("#10 passed=false inspection in filtered=false, not in filtered=true", async () => {
    const admin = await registerAdmin();
    const assetId = await seedAsset(admin.user.companyId);
    const tpl = await createTemplate(admin.accessToken, ["A"]);
    const failed = await request(app.getHttpServer()).post("/inspections").set(auth(admin.accessToken)).send({ assetId, templateId: tpl.id, results: [{ itemId: tpl.items[0].id, value: "fail" }] });
    expect(failed.body.passed).toBe(false);

    const inFalse = await request(app.getHttpServer()).get(`/inspections?passed=false`).set(auth(admin.accessToken));
    expect(inFalse.body).toHaveLength(1);
    const inTrue = await request(app.getHttpServer()).get(`/inspections?passed=true`).set(auth(admin.accessToken));
    expect(inTrue.body).toHaveLength(0);
  });
});
