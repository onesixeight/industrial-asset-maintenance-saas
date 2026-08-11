import { describe, expect, it } from "vitest";
import { can, creatableRoles } from "./capabilities";

describe("central UI capability map", () => {
  it("hides management actions from viewers", () => {
    expect(can("viewer", "createAsset")).toBe(false);
    expect(can("viewer", "createWorkOrder")).toBe(false);
    expect(can("viewer", "submitInspection")).toBe(false);
  });

  it("allows technicians to submit inspections but not create work orders", () => {
    expect(can("technician", "submitInspection")).toBe(true);
    expect(can("technician", "createWorkOrder")).toBe(false);
  });

  it("reserves role changes for admins", () => {
    expect(can("manager", "changeUserRole")).toBe(false);
    expect(can("admin", "changeUserRole")).toBe(true);
  });

  it.each([
    ["admin", ["admin", "manager", "technician", "viewer"]],
    ["manager", ["manager", "technician", "viewer"]],
    ["technician", []],
    ["viewer", []],
  ] as const)("limits the roles %s may create", (actorRole, expected) => {
    expect(creatableRoles(actorRole)).toEqual(expected);
  });
});
