import { describe, expect, it } from "vitest";
import { adjustPartRequestSchema, updatePartRequestSchema } from "./parts";

describe("part inventory mutation schemas", () => {
  it("rejects quantity changes through the generic part patch", () => {
    expect(updatePartRequestSchema.safeParse({ quantity: 999 }).success).toBe(
      false,
    );
  });

  it("accepts a signed non-zero adjustment with an audit reason", () => {
    expect(
      adjustPartRequestSchema.parse({
        delta: -3,
        reason: "Damaged during count",
      }),
    ).toEqual({ delta: -3, reason: "Damaged during count" });
  });

  it.each([0, 1.5])("rejects invalid adjustment delta %s", (delta) => {
    expect(
      adjustPartRequestSchema.safeParse({ delta, reason: "Count correction" })
        .success,
    ).toBe(false);
  });

  it("requires a non-empty adjustment reason", () => {
    expect(
      adjustPartRequestSchema.safeParse({ delta: 1, reason: "" }).success,
    ).toBe(false);
  });

  it("accepts null to explicitly clear a part description", () => {
    expect(updatePartRequestSchema.parse({ description: null })).toEqual({
      description: null,
    });
  });
});
