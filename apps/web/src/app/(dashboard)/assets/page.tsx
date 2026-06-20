"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AssetStatus } from "@iam/shared";
import { assetsApi } from "@/lib/api/assets";
import { locationsApi } from "@/lib/api/reference";
import { categoriesApi } from "@/lib/api/reference";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import type { AssetResponse } from "@iam/shared";

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

export default function AssetsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => locationsApi.list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });

  const { data, isLoading } = useQuery({
    queryKey: ["assets", search, status, locationId, categoryId],
    queryFn: () =>
      assetsApi.list({
        search: search || undefined,
        status: (status || undefined) as AssetStatus | undefined,
        locationId: locationId || undefined,
        categoryId: categoryId || undefined,
      }),
  });

  const columns: DataTableColumn<AssetResponse>[] = [
    { key: "name", header: "Name" },
    { key: "serialNumber", header: "Serial", render: (r) => r.serialNumber ?? "—" },
    { key: "status", header: "Status" },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link href={`/assets/${row.id}`} className="text-sm font-medium underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assets</h1>
        <Link href="/assets/new">
          <Button>New asset</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 flex-1 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Select label="" id="status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES} />
        <Select
          label=""
          id="location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          options={[{ value: "", label: "All locations" }, ...(locations ?? []).map((l) => ({ value: l.id, label: l.name }))]}
        />
        <Select
          label=""
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={[{ value: "", label: "All categories" }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable columns={columns} rows={data ?? []} empty="No assets yet." />}
    </div>
  );
}
