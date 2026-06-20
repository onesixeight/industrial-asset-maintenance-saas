"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { PartResponse } from "@iam/shared";
import { partsApi } from "@/lib/api/parts";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";

const LOW_STOCK_FILTER = [
  { value: "", label: "All" },
  { value: "true", label: "Low stock" },
];

function stockStatus(p: PartResponse): { label: string; className: string } {
  if (p.quantity <= 0) return { label: "Out", className: "text-destructive" };
  if (p.quantity <= p.minQuantity) return { label: "Low", className: "text-amber-700" };
  return { label: "OK", className: "text-green-700" };
}

export default function PartsPage() {
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["parts", search, lowStock],
    queryFn: () =>
      partsApi.list({
        search: search || undefined,
        lowStock: lowStock === "" ? undefined : lowStock === "true",
      }),
  });

  const columns: DataTableColumn<PartResponse>[] = [
    { key: "name", header: "Name", render: (p) => <Link href={`/parts/${p.id}`} className="underline">{p.name}</Link> },
    { key: "sku", header: "SKU" },
    { key: "quantity", header: "On hand" },
    { key: "minQuantity", header: "Min" },
    {
      key: "status",
      header: "Status",
      render: (p) => {
        const s = stockStatus(p);
        return <span className={`text-sm font-medium ${s.className}`}>{s.label}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <Link href={`/parts/${p.id}`} className="text-sm font-medium underline">
          Edit
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Parts</h1>
        <Link href="/parts/new">
          <Button>New part</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-64 rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Select
          label=""
          id="lowStock"
          value={lowStock}
          onChange={(e) => setLowStock(e.target.value)}
          options={LOW_STOCK_FILTER}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <DataTable columns={columns} rows={data ?? []} empty="No parts yet." />
      )}
    </div>
  );
}
