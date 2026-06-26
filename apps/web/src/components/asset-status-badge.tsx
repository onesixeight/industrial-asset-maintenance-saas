import type { AssetStatus } from "@iam/shared";

const STYLES: Record<AssetStatus, string> = {
  active: "bg-green-100 text-green-700",
  maintenance: "bg-amber-100 text-amber-700",
  retired: "bg-neutral-100 text-neutral-500",
};

const LABELS: Record<AssetStatus, string> = {
  active: "Active",
  maintenance: "Maintenance",
  retired: "Retired",
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
