import type { Priority } from "@iam/shared";

const STYLES: Record<Priority, string> = {
  low: "bg-neutral-100 text-neutral-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[priority]}`}>
      {LABELS[priority]}
    </span>
  );
}
