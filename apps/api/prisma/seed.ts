/**
 * Idempotent seed for local development only.
 *
 * Creates a demo company (Acme Industrial Maintenance) with admin/manager/
 * technician accounts (all password "Password1"), reference data, three
 * assets with QR tokens, three work orders across statuses, and two ledger-
 * backed parts.
 *
 * Run: `pnpm --filter @iam/api db:seed`
 *   (configured as the `prisma.seed` command in package.json).
 *
 * Safe to run repeatedly — if the demo company already exists it logs and exits.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

// Load the monorepo root .env (apps/api is two levels below) so DATABASE_URL is
// present when PrismaClient is constructed. Mirrors prisma.config.ts.
const rootEnv = resolve(import.meta.dirname, "../../.env");
config({ path: rootEnv });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

function assertDemoSeedEnvironment(): void {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Set ALLOW_DEMO_SEED=true to opt in to the fixed-credential local demo seed",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("The fixed-credential demo seed is disabled in production");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("The demo seed requires a valid local DATABASE_URL");
  }
  const queryEntries = [...databaseUrl.searchParams.entries()];
  const hasCanonicalQuery =
    queryEntries.length <= 1 &&
    queryEntries.every(
      ([key, value]) => key === "schema" && value === "public",
    );
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl.hostname.toLowerCase(),
    ) ||
    databaseUrl.pathname.replace(/^\/+/, "") !== "iam_dev" ||
    !hasCanonicalQuery ||
    databaseUrl.hash
  ) {
    throw new Error(
      "The demo seed may target only the canonical loopback iam_dev database",
    );
  }
}

assertDemoSeedEnvironment();

// Prisma 7 driver-adapter pattern (matches PrismaService — ADR 0001). The
// generated client requires an adapter; without it construction throws.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const BCRYPT_ROUNDS = 12;
const DEMO_EMAIL = "demo@acme.test";
const PASSWORD = "Password1";

async function main(): Promise<void> {
  const existing = await prisma.company.findFirst({
    where: { users: { some: { email: DEMO_EMAIL } } },
  });
  if (existing) {
    console.log(
      `Seed: demo company already exists (id=${existing.id}). Nothing to do.`,
    );
    return;
  }

  const password = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  const seeded = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: "Acme Industrial Maintenance" },
    });
    const companyId = company.id;

    // Fixed credentials are convenient for local UI work; production execution
    // is rejected above before the first database query.
    const admin = await tx.user.create({
      data: {
        email: DEMO_EMAIL,
        password,
        firstName: "Ada",
        lastName: "Admin",
        role: "admin",
        companyId,
        mustChangePassword: false,
      },
    });
    const manager = await tx.user.create({
      data: {
        email: "manager@acme.test",
        password,
        firstName: "Mac",
        lastName: "Manager",
        role: "manager",
        companyId,
        mustChangePassword: false,
      },
    });
    const tech = await tx.user.create({
      data: {
        email: "tech@acme.test",
        password,
        firstName: "Tara",
        lastName: "Tech",
        role: "technician",
        companyId,
        mustChangePassword: false,
      },
    });

    const locWarehouse = await tx.location.create({
      data: { name: "Warehouse A", companyId },
    });
    const locPlant = await tx.location.create({
      data: { name: "Plant Floor", companyId },
    });
    const catPumps = await tx.category.create({
      data: { name: "Pumps", companyId },
    });
    const catMotors = await tx.category.create({
      data: { name: "Motors", companyId },
    });

    const qr = () => randomBytes(18).toString("base64url");
    const pump1 = await tx.asset.create({
      data: {
        name: "Centrifugal Pump P-100",
        qrCode: qr(),
        locationId: locPlant.id,
        categoryId: catPumps.id,
        companyId,
      },
    });
    const pump2 = await tx.asset.create({
      data: {
        name: "Booster Pump P-200",
        qrCode: qr(),
        locationId: locPlant.id,
        categoryId: catPumps.id,
        companyId,
      },
    });
    const motor1 = await tx.asset.create({
      data: {
        name: "Conveyor Motor M-10",
        qrCode: qr(),
        locationId: locWarehouse.id,
        categoryId: catMotors.id,
        companyId,
      },
    });

    await tx.workOrder.create({
      data: {
        title: "Quarterly inspection — P-100",
        type: "preventive",
        status: "open",
        priority: "medium",
        assetId: pump1.id,
        companyId,
      },
    });
    await tx.workOrder.create({
      data: {
        title: "Replace seal — P-200",
        type: "corrective",
        status: "in_progress",
        priority: "high",
        assetId: pump2.id,
        assignedToId: tech.id,
        companyId,
      },
    });
    await tx.workOrder.create({
      data: {
        title: "Bearing swap — M-10",
        type: "corrective",
        status: "completed",
        priority: "medium",
        assetId: motor1.id,
        assignedToId: tech.id,
        completedAt: new Date(),
        companyId,
      },
    });

    // Initial balances and ledger entries are created in the same transaction,
    // preserving the reconstructable-inventory invariant even for demo data.
    const seal = await tx.part.create({
      data: {
        name: "Mechanical Seal 50mm",
        sku: "SEAL-050",
        quantity: 24,
        minQuantity: 5,
        companyId,
      },
    });
    const bearing = await tx.part.create({
      data: {
        name: "Roller Bearing 6204",
        sku: "BRG-6204",
        quantity: 2,
        minQuantity: 5,
        companyId,
      },
    });
    await tx.inventoryMovement.createMany({
      data: [
        {
          partId: seal.id,
          actorId: admin.id,
          companyId,
          delta: 24,
          kind: "initial_stock",
          reason: "Local demo seed opening balance",
        },
        {
          partId: bearing.id,
          actorId: admin.id,
          companyId,
          delta: 2,
          kind: "initial_stock",
          reason: "Local demo seed opening balance",
        },
      ],
    });

    return { company, companyId, admin, manager, tech };
  });

  const { company, companyId, admin, manager, tech } = seeded;

  console.log(`Seed complete.`);
  console.log(`  Company: ${company.name} (${companyId})`);
  console.log(
    `  Users:   admin=${admin.email}, manager=${manager.email}, tech=${tech.email}`,
  );
  console.log(`  Login:   ${DEMO_EMAIL} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
