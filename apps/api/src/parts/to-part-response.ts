import type { PartResponse } from "@iam/shared";

/** Prisma returns Date for temporal fields; the API contract uses ISO strings. */
type PartRow = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  quantity: number;
  minQuantity: number;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toPartResponse(p: PartRow): PartResponse {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description,
    quantity: p.quantity,
    minQuantity: p.minQuantity,
    companyId: p.companyId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
