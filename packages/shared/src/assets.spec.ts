import { describe, expect, it } from "vitest";
import {
  createAssetRequestSchema,
  updateAssetStatusRequestSchema,
} from "./assets";

const validAsset = {
  name: "Pump 1",
  locationId: "00000000-0000-4000-8000-000000000001",
  categoryId: "00000000-0000-4000-8000-000000000002",
};

describe("createAssetRequestSchema date form values", () => {
  it("accepts a date-only purchase date and normalizes it to UTC midnight", () => {
    const parsed = createAssetRequestSchema.parse({
      ...validAsset,
      purchaseDate: "2026-08-11",
    });

    expect(parsed.purchaseDate).toBe("2026-08-11T00:00:00.000Z");
  });

  it("does not accept impossible calendar dates", () => {
    expect(
      createAssetRequestSchema.safeParse({
        ...validAsset,
        purchaseDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  it("treats an empty optional date input as omitted", () => {
    const parsed = createAssetRequestSchema.parse({
      ...validAsset,
      warrantyDate: "",
    });
    expect(parsed.warrantyDate).toBeUndefined();
  });
});

describe("updateAssetStatusRequestSchema", () => {
  it.each(["active", "maintenance", "retired"] as const)(
    "accepts lifecycle status %s",
    (status) => {
      expect(updateAssetStatusRequestSchema.parse({ status })).toEqual({
        status,
      });
    },
  );

  it("rejects unknown lifecycle statuses", () => {
    expect(
      updateAssetStatusRequestSchema.safeParse({ status: "deleted" }).success,
    ).toBe(false);
  });
});
