-- CreateEnum
CREATE TYPE "InventoryMovementKind" AS ENUM ('initial_stock', 'adjustment', 'consumption', 'restock');

-- DropForeignKey
ALTER TABLE "WorkOrderPart" DROP CONSTRAINT "WorkOrderPart_partId_fkey";

-- AlterTable
ALTER TABLE "InspectionTemplate" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Add the snapshot columns as nullable, backfill existing inspections from the
-- template they were submitted against, and only then enforce the invariant.
ALTER TABLE "Inspection" ADD COLUMN "templateSnapshot" JSONB,
ADD COLUMN "templateVersion" INTEGER;

UPDATE "Inspection" AS inspection
SET "templateSnapshot" = jsonb_build_object(
      'name', template.name,
      'items', template.items
    ),
    "templateVersion" = template.version
FROM "InspectionTemplate" AS template
WHERE template.id = inspection."templateId";

ALTER TABLE "Inspection" ALTER COLUMN "templateSnapshot" SET NOT NULL,
ALTER COLUMN "templateVersion" SET NOT NULL;

-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "actorId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" "InventoryMovementKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- Existing balances become the opening ledger entry so every post-migration
-- quantity remains reconstructable. A company with inventory necessarily has
-- at least one user in the current product model; choose the oldest one.
INSERT INTO "InventoryMovement" (
    id, "partId", "workOrderId", "actorId", "companyId", delta, kind, reason
)
SELECT
    md5(part.id || ':opening-balance'),
    part.id,
    NULL,
    actor.id,
    part."companyId",
    part.quantity,
    'initial_stock'::"InventoryMovementKind",
    'Migration backfill: opening balance'
FROM "Part" AS part
JOIN LATERAL (
    SELECT "User".id
    FROM "User"
    WHERE "User"."companyId" = part."companyId"
    ORDER BY "User"."createdAt" ASC, "User".id ASC
    LIMIT 1
) AS actor ON TRUE
WHERE part.quantity <> 0;

ALTER TABLE "Part"
ADD CONSTRAINT "Part_quantity_nonnegative" CHECK (quantity >= 0);

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_delta_nonzero" CHECK (delta <> 0);

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_createdAt_idx" ON "InventoryMovement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_partId_createdAt_idx" ON "InventoryMovement"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_workOrderId_createdAt_idx" ON "InventoryMovement"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_companyId_status_idx" ON "Asset"("companyId", "status");

-- CreateIndex
CREATE INDEX "Asset_companyId_createdAt_idx" ON "Asset"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Inspection_companyId_createdAt_idx" ON "Inspection"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Inspection_companyId_assetId_createdAt_idx" ON "Inspection"("companyId", "assetId", "createdAt");

-- CreateIndex
CREATE INDEX "Inspection_companyId_templateId_createdAt_idx" ON "Inspection"("companyId", "templateId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Part_companyId_deletedAt_createdAt_idx" ON "Part"("companyId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_status_deletedAt_idx" ON "WorkOrder"("companyId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_createdAt_idx" ON "WorkOrder"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_assignedToId_status_deletedAt_idx" ON "WorkOrder"("companyId", "assignedToId", "status", "deletedAt");

-- AddForeignKey
ALTER TABLE "WorkOrderPart" ADD CONSTRAINT "WorkOrderPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The inventory ledger is append-only even for privileged application code.
CREATE FUNCTION prevent_inventory_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'InventoryMovement is append-only';
END;
$$;

CREATE TRIGGER "InventoryMovement_append_only"
BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
