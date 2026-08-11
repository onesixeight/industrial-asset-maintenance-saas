import type { UserRole } from "@iam/shared";

export const capabilities = {
  createAsset: ["admin", "manager"],
  manageAsset: ["admin", "manager"],
  createWorkOrder: ["admin", "manager"],
  manageWorkOrder: ["admin", "manager"],
  transitionWorkOrder: ["admin", "manager", "technician"],
  consumePart: ["admin", "manager", "technician"],
  managePart: ["admin", "manager"],
  submitInspection: ["admin", "manager", "technician"],
  manageInspectionTemplate: ["admin", "manager"],
  manageReferenceData: ["admin", "manager"],
  createUser: ["admin", "manager"],
  changeUserRole: ["admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof capabilities;

export function can(
  role: UserRole | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return (capabilities[capability] as readonly UserRole[]).includes(role);
}

const rolesCreatableByActor = {
  admin: ["admin", "manager", "technician", "viewer"],
  manager: ["manager", "technician", "viewer"],
  technician: [],
  viewer: [],
} as const satisfies Record<UserRole, readonly UserRole[]>;

export function creatableRoles(
  actorRole: UserRole | null | undefined,
): readonly UserRole[] {
  return actorRole ? rolesCreatableByActor[actorRole] : [];
}
