import { describe, expect, it } from "vitest";
import {
  inspectionResponseSchema,
  templateResponseSchema,
  updateTemplateRequestSchema,
} from "./inspections";

const item = { id: "item-1", label: "Oil level", type: "pass_fail" as const };

describe("versioned inspection contracts", () => {
  it("exposes the current template version", () => {
    const parsed = templateResponseSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Daily",
      version: 3,
      items: [item],
      companyId: "00000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-11T00:00:00.000Z",
    });
    expect(parsed.version).toBe(3);
  });

  it("requires a versioned template snapshot on submitted inspections", () => {
    const parsed = inspectionResponseSchema.parse({
      id: "00000000-0000-4000-8000-000000000003",
      assetId: "00000000-0000-4000-8000-000000000004",
      templateId: "00000000-0000-4000-8000-000000000001",
      templateVersion: 3,
      templateSnapshot: { name: "Daily", items: [item] },
      results: [{ itemId: "item-1", value: "pass" }],
      passed: true,
      notes: null,
      inspectedById: "00000000-0000-4000-8000-000000000005",
      companyId: "00000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-11T00:00:00.000Z",
    });
    expect(parsed.templateSnapshot.items[0]?.label).toBe("Oil level");
  });

  it("rejects an empty template update that would create a phantom version", () => {
    expect(updateTemplateRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateTemplateRequestSchema.safeParse({ name: "Weekly" }).success,
    ).toBe(true);
  });
});
