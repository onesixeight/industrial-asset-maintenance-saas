import { describe, expect, it } from "vitest";
import { canTransition } from "./transitions";

describe("work-order transitions", () => {
  it("allows the linear happy path", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });

  it("allows in_progress <-> on_hold", () => {
    expect(canTransition("in_progress", "on_hold")).toBe(true);
    expect(canTransition("on_hold", "in_progress")).toBe(true);
  });

  it("allows cancelling from any non-terminal state", () => {
    expect(canTransition("open", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("on_hold", "cancelled")).toBe(true);
  });

  it("rejects open -> completed directly (the §497 rule)", () => {
    expect(canTransition("open", "completed")).toBe(false);
  });

  it("treats completed and cancelled as terminal", () => {
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("completed", "open")).toBe(false);
    expect(canTransition("cancelled", "open")).toBe(false);
    expect(canTransition("cancelled", "in_progress")).toBe(false);
  });

  it("rejects backward transitions", () => {
    expect(canTransition("in_progress", "open")).toBe(false);
    expect(canTransition("on_hold", "open")).toBe(false);
  });
});
