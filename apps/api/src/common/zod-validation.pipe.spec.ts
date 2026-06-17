import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z.object({ email: z.string().email(), n: z.number().int() });
const pipe = new ZodValidationPipe(schema);

describe("ZodValidationPipe", () => {
  it("returns parsed data on valid input", () => {
    const out = pipe.transform({ email: "a@b.com", n: 3 }, {} as never);
    expect(out).toEqual({ email: "a@b.com", n: 3 });
  });

  it("throws BadRequestException with joined messages on invalid input", () => {
    try {
      pipe.transform({ email: "nope", n: "x" }, {} as never);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const msg = (e as BadRequestException).message;
      expect(msg).toMatch(/email/);
    }
  });

  it("accepts arrays and primitives", () => {
    const p = new ZodValidationPipe(z.array(z.string()));
    expect(p.transform(["a", "b"], {} as never)).toEqual(["a", "b"]);
  });
});
