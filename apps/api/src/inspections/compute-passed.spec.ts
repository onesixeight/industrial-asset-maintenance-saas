import { describe, expect, it } from "vitest";
import { validateResults } from "./compute-passed";

describe("validateResults / computePassed", () => {
  it("all pass → passed=true", () => {
    expect(
      validateResults(["a", "b"], [
        { itemId: "a", value: "pass" },
        { itemId: "b", value: "pass" },
      ]),
    ).toEqual({ ok: true, passed: true });
  });

  it("one fail → passed=false", () => {
    expect(
      validateResults(["a", "b"], [
        { itemId: "a", value: "pass" },
        { itemId: "b", value: "fail" },
      ]),
    ).toEqual({ ok: true, passed: false });
  });

  it("missing item → ok=false", () => {
    expect(validateResults(["a", "b"], [{ itemId: "a", value: "pass" }]).ok).toBe(false);
  });

  it("unknown itemId → ok=false", () => {
    expect(validateResults(["a"], [{ itemId: "z", value: "pass" }]).ok).toBe(false);
  });

  it("duplicate result → ok=false", () => {
    expect(
      validateResults(["a"], [
        { itemId: "a", value: "pass" },
        { itemId: "a", value: "fail" },
      ]).ok,
    ).toBe(false);
  });
});
