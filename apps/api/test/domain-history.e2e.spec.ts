import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { JwtPayload } from "@iam/shared";
import { AssetsService } from "../src/assets/assets.service";
import { InspectionsService } from "../src/inspections/inspections.service";
import { PartsService } from "../src/parts/parts.service";
import { WorkOrderPartsService } from "../src/work-orders/work-order-parts.service";
import { WorkOrdersService } from "../src/work-orders/work-orders.service";
import { teardown, testPrisma, truncate } from "./db";

async function seedTenant() {
  const client = testPrisma().getClient();
  const company = await client.company.create({
    data: { name: "Domain History Co" },
  });
  const manager = await client.user.create({
    data: {
      email: `manager-${randomUUID()}@example.com`,
      password: "not-used-in-service-test",
      firstName: "Domain",
      lastName: "Manager",
      role: "manager",
      companyId: company.id,
    },
  });
  const location = await client.location.create({
    data: { name: "Plant", companyId: company.id },
  });
  const category = await client.category.create({
    data: { name: "Pumps", companyId: company.id },
  });
  const asset = await client.asset.create({
    data: {
      name: "Pump A",
      qrCode: randomUUID(),
      companyId: company.id,
      locationId: location.id,
      categoryId: category.id,
    },
  });
  const user: JwtPayload = {
    sub: manager.id,
    companyId: company.id,
    role: "manager",
    ver: 0,
    sid: randomUUID(),
    jti: randomUUID(),
    typ: "access",
  };
  return { client, company, manager, asset, user };
}

describe("domain history invariants", () => {
  beforeEach(truncate);
  afterAll(teardown);

  it("keeps inventory movements after a part is archived and rejects ledger mutation", async () => {
    const { client, asset, user } = await seedTenant();
    const parts = new PartsService(testPrisma());
    const workOrderParts = new WorkOrderPartsService(testPrisma());
    const part = await parts.create(
      { name: "Bearing", sku: "BRG-1", quantity: 10, minQuantity: 2 },
      user,
    );
    const workOrder = await client.workOrder.create({
      data: {
        title: "Replace bearing",
        type: "corrective",
        assetId: asset.id,
        companyId: user.companyId,
      },
    });

    await workOrderParts.consume(
      workOrder.id,
      { partId: part.id, quantity: 3 },
      user,
    );
    await parts.remove(part.id, user.companyId);

    const archived = await client.part.findUniqueOrThrow({
      where: { id: part.id },
    });
    const movements = await client.inventoryMovement.findMany({
      where: { partId: part.id },
      orderBy: { createdAt: "asc" },
    });
    expect(archived.deletedAt).toBeInstanceOf(Date);
    expect(movements.map((movement) => movement.delta)).toEqual([10, -3]);
    expect(
      await workOrderParts.list(workOrder.id, user.companyId),
    ).toHaveLength(1);

    await expect(
      client.inventoryMovement.update({
        where: { id: movements[0]!.id },
        data: { reason: "tampered" },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      client.inventoryMovement.delete({ where: { id: movements[0]!.id } }),
    ).rejects.toThrow(/append-only/);
    expect(
      await client.inventoryMovement.count({ where: { partId: part.id } }),
    ).toBe(2);
  });

  it("preserves the exact template version and labels used for an inspection", async () => {
    const { asset, manager, user } = await seedTenant();
    const inspections = new InspectionsService(testPrisma());
    const template = await inspections.createTemplate(
      { name: "Daily", items: [{ label: "Oil level" }] },
      user.companyId,
    );

    const submitted = await inspections.submit(
      {
        assetId: asset.id,
        templateId: template.id,
        results: [{ itemId: template.items[0]!.id, value: "pass" }],
      },
      manager.id,
      user.companyId,
    );
    const edited = await inspections.updateTemplate(
      template.id,
      { items: [{ label: "Pressure" }] },
      user.companyId,
    );
    const historical = await inspections.getInspection(
      submitted.id,
      user.companyId,
    );

    expect(edited.version).toBe(2);
    expect(historical.templateVersion).toBe(1);
    expect(historical.templateSnapshot).toEqual({
      name: "Daily",
      items: template.items,
    });
  });

  it("enforces viewer denials and permits an explicit asset status transition", async () => {
    const { client, asset, user } = await seedTenant();
    const workOrders = new WorkOrdersService(testPrisma());
    const workOrderParts = new WorkOrderPartsService(testPrisma());
    const workOrder = await client.workOrder.create({
      data: {
        title: "Inspect pump",
        type: "inspection",
        assetId: asset.id,
        companyId: user.companyId,
      },
    });
    const viewer: JwtPayload = { ...user, role: "viewer" };

    await expect(
      workOrders.transition(workOrder.id, "in_progress", viewer),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      workOrderParts.consume(
        workOrder.id,
        { partId: randomUUID(), quantity: 1 },
        viewer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const assets = new AssetsService(testPrisma(), {
      get: () => undefined,
    } as never);
    const updated = await assets.updateStatus(
      asset.id,
      "maintenance",
      user.companyId,
    );
    expect(updated.status).toBe("maintenance");
  });
});
