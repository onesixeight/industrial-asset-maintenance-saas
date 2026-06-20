import { describe, expect, it } from "vitest";
import { computeMttr } from "./mttr";

describe("computeMttr", () => {
  it("returns null when nothing is completed", () => {
    expect(computeMttr([{ createdAt: new Date("2026-01-01T00:00:00Z"), completedAt: null }])).toBeNull();
    expect(computeMttr([])).toBeNull();
  });

  it("returns the exact delta (hours) for a single completed WO", () => {
    const result = computeMttr([
      { createdAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T05:00:00Z") },
    ]);
    expect(result).toBe(5);
  });

  it("excludes incomplete items from the mean", () => {
    const result = computeMttr([
      { createdAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T10:00:00Z") }, // 10h
      { createdAt: new Date("2026-01-02T00:00:00Z"), completedAt: null }, // excluded
    ]);
    expect(result).toBe(10);
  });

  it("averages across multiple completed WOs", () => {
    const result = computeMttr([
      { createdAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T04:00:00Z") }, // 4h
      { createdAt: new Date("2026-01-02T00:00:00Z"), completedAt: new Date("2026-01-02T10:00:00Z") }, // 10h
    ]);
    expect(result).toBe(7);
  });

  it("preserves fractional hours", () => {
    const result = computeMttr([
      { createdAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T01:30:00Z") }, // 1.5h
    ]);
    expect(result).toBe(1.5);
  });
});
