import { describe, expect, it } from "vitest";
import { dateOnlyToIsoSchema } from "./dates";

describe("dateOnlyToIsoSchema", () => {
  it("normalizes a real calendar date without local-time ambiguity", () => {
    expect(dateOnlyToIsoSchema.parse("2026-08-11")).toBe(
      "2026-08-11T00:00:00.000Z",
    );
  });

  it("rejects an impossible calendar date", () => {
    expect(dateOnlyToIsoSchema.safeParse("2026-02-30").success).toBe(false);
  });
});
