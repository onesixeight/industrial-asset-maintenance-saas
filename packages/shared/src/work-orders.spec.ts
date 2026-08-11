import { describe, expect, it } from "vitest";
import { createWorkOrderRequestSchema } from "./work-orders";

const validWorkOrder = {
  title: "Inspect pump",
  type: "inspection" as const,
  priority: "medium" as const,
  assetId: "00000000-0000-4000-8000-000000000001",
};

describe("createWorkOrderRequestSchema date form values", () => {
  it("accepts a date-only due date and normalizes it to UTC midnight", () => {
    const parsed = createWorkOrderRequestSchema.parse({
      ...validWorkOrder,
      dueDate: "2026-08-11",
    });

    expect(parsed.dueDate).toBe("2026-08-11T00:00:00.000Z");
  });

  it("treats an empty optional due date as null", () => {
    const parsed = createWorkOrderRequestSchema.parse({
      ...validWorkOrder,
      dueDate: "",
    });
    expect(parsed.dueDate).toBeNull();
  });
});
