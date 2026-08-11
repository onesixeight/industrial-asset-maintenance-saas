import { z } from "zod";
import { describe, expect, it } from "vitest";
import { paginatedResponseSchema } from "./pagination";

describe("paginatedResponseSchema", () => {
  it("accepts exact list metadata and rejects totals smaller than zero", () => {
    const schema = paginatedResponseSchema(z.object({ id: z.string() }));
    expect(
      schema.parse({ items: [{ id: "a" }], page: 2, pageSize: 20, total: 21 }),
    ).toEqual({ items: [{ id: "a" }], page: 2, pageSize: 20, total: 21 });
    expect(
      schema.safeParse({ items: [], page: 1, pageSize: 20, total: -1 }).success,
    ).toBe(false);
  });
});
