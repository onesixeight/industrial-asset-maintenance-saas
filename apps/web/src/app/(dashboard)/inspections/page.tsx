"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { InspectionResponse } from "@iam/shared";
import { inspectionsApi } from "@/lib/api/inspections";
import { assetsApi } from "@/lib/api/assets";
import { templatesApi } from "@/lib/api/inspections";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PassedBadge } from "@/components/passed-badge";

const PASSED_FILTER = [
  { value: "", label: "All" },
  { value: "true", label: "Passed" },
  { value: "false", label: "Failed" },
];

export default function InspectionsPage() {
  const [assetId, setAssetId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [passed, setPassed] = useState("");

  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesApi.list() });

  const { data, isLoading } = useQuery({
    queryKey: ["inspections", assetId, templateId, passed],
    queryFn: () =>
      inspectionsApi.list({
        assetId: assetId || undefined,
        templateId: templateId || undefined,
        passed: passed === "" ? undefined : passed === "true",
      }),
  });

  const assetName = (id: string) => assets?.find((a) => a.id === id)?.name ?? id;
  const tplName = (id: string) => templates?.find((t) => t.id === id)?.name ?? id;

  const columns: DataTableColumn<InspectionResponse>[] = [
    { key: "asset", header: "Asset", render: (r) => assetName(r.assetId) },
    { key: "template", header: "Template", render: (r) => tplName(r.templateId) },
    { key: "passed", header: "Result", render: (r) => <PassedBadge passed={r.passed} /> },
    { key: "createdAt", header: "Date" },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link href={`/inspections/${row.id}`} className="text-sm font-medium underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inspections</h1>
        <Link href="/inspections/new">
          <Button>New inspection</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          label=""
          id="asset"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          options={[{ value: "", label: "All assets" }, ...(assets ?? []).map((a) => ({ value: a.id, label: a.name }))]}
        />
        <Select
          label=""
          id="template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          options={[{ value: "", label: "All templates" }, ...(templates ?? []).map((t) => ({ value: t.id, label: t.name }))]}
        />
        <Select label="" id="passed" value={passed} onChange={(e) => setPassed(e.target.value)} options={PASSED_FILTER} />
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable columns={columns} rows={data ?? []} empty="No inspections yet." />}
    </div>
  );
}
