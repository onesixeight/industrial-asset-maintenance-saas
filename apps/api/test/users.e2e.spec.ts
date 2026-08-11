import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { truncate, teardown } from "./db";
import { resetThrottleStorage } from "./throttler";

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await teardown();
});

beforeEach(async () => {
  await truncate();
  await resetThrottleStorage(app);
});

async function registerAdmin() {
  return request(app.getHttpServer()).post("/auth/register").send({
    company: "Acme Industrial",
    email: "admin@acme.test",
    password: "Password1",
    firstName: "Ada",
    lastName: "Admin",
  });
}

describe("POST /users", () => {
  it("rejects a manager creating an admin", async () => {
    const admin = await registerAdmin();
    const managerCreate = await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${admin.body.accessToken}`)
      .send({
        email: "manager@acme.test",
        password: "TempPass1",
        firstName: "Manny",
        lastName: "Manager",
        role: "manager",
      });
    expect(managerCreate.status).toBe(201);

    await request(app.getHttpServer())
      .post("/auth/change-password")
      .send({
        email: "manager@acme.test",
        currentPassword: "TempPass1",
        newPassword: "ManagerPass2",
      })
      .expect(200);
    const managerLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "manager@acme.test",
        password: "ManagerPass2",
      });
    expect(managerLogin.status).toBe(200);

    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${managerLogin.body.accessToken}`)
      .send({
        email: "allowed-tech@acme.test",
        password: "TempPass1",
        firstName: "Allowed",
        lastName: "Tech",
        role: "technician",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${managerLogin.body.accessToken}`)
      .send({
        email: "forbidden-admin@acme.test",
        password: "TempPass1",
        firstName: "Forbidden",
        lastName: "Admin",
        role: "admin",
      })
      .expect(403);
  });

  it("rejects self-demotion so the tenant cannot lose its administrator", async () => {
    const admin = await registerAdmin();

    await request(app.getHttpServer())
      .patch(`/users/${admin.body.user.id}/role`)
      .set("Authorization", `Bearer ${admin.body.accessToken}`)
      .send({ role: "viewer" })
      .expect(403);
  });
});
