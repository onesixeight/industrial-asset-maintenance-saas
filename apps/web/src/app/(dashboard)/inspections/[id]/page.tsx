"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { inspectionsApi } from "@/lib/api/inspections";
import { fmtDate } from "@/lib/format";
import { PassedBadge } from "@/components/passed-badge";
import { QueryState } from "@/components/query-state";

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const inspectionQuery = useQuery({
    queryKey: ["inspection", params.id],
    queryFn: ({ signal }) => inspectionsApi.get(params.id, signal),
  });
  const insp = inspectionQuery.data;
  if (!insp)
    return (
      <QueryState
        isLoading={inspectionQuery.isLoading}
        error={inspectionQuery.error}
        onRetry={() => inspectionQuery.refetch()}
        isEmpty={!inspectionQuery.isLoading && !inspectionQuery.error}
        emptyMessage="Inspection not found."
      >
        content
      </QueryState>
    );

  const itemLabel = (itemId: string) =>
    insp.templateSnapshot.items.find((item) => item.id === itemId)?.label ??
    itemId;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/inspections"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to inspections
      </Link>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Inspection</h1>
        <PassedBadge passed={insp.passed} />
      </div>

      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Asset</dt>
        <dd>{insp.assetId}</dd>
        <dt className="text-muted-foreground">Template</dt>
        <dd>
          {insp.templateSnapshot.name} (version {insp.templateVersion})
        </dd>
        <dt className="text-muted-foreground">Inspector</dt>
        <dd>{insp.inspectedById}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{fmtDate(insp.createdAt)}</dd>
        <dt className="text-muted-foreground">Notes</dt>
        <dd>{insp.notes ?? "—"}</dd>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Checklist results</h2>
        {insp.results.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3 text-sm"
          >
            <span>{itemLabel(r.itemId)}</span>
            <span
              className={
                r.value === "pass" ? "text-green-700" : "text-destructive"
              }
            >
              {r.value.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
