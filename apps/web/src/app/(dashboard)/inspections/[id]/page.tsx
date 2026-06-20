"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { inspectionsApi, templatesApi } from "@/lib/api/inspections";
import { PassedBadge } from "@/components/passed-badge";

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: insp, isLoading } = useQuery({
    queryKey: ["inspection", params.id],
    queryFn: () => inspectionsApi.get(params.id),
  });
  const { data: template } = useQuery({
    queryKey: ["template", insp?.templateId],
    queryFn: () => templatesApi.get(insp!.templateId),
    enabled: !!insp?.templateId,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!insp) return <p>Inspection not found.</p>;

  const itemLabel = (itemId: string) => template?.items.find((i) => i.id === itemId)?.label ?? itemId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Inspection</h1>
        <PassedBadge passed={insp.passed} />
      </div>

      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Asset</dt>
        <dd>{insp.assetId}</dd>
        <dt className="text-muted-foreground">Template</dt>
        <dd>{template?.name ?? insp.templateId}</dd>
        <dt className="text-muted-foreground">Inspector</dt>
        <dd>{insp.inspectedById}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{insp.createdAt}</dd>
        <dt className="text-muted-foreground">Notes</dt>
        <dd>{insp.notes ?? "—"}</dd>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Checklist results</h2>
        {insp.results.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3 text-sm">
            <span>{itemLabel(r.itemId)}</span>
            <span className={r.value === "pass" ? "text-green-700" : "text-destructive"}>{r.value.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
