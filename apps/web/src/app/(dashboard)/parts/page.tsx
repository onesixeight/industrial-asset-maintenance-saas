"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PartResponse } from "@iam/shared";
import { partsApi } from "@/lib/api/parts";
import { Button, buttonClassName } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const PAGE_SIZE = 20;

const LOW_STOCK_FILTER = [
  { value: "", label: "All" },
  { value: "true", label: "Low stock" },
];

const INVENTORY_VIEW_FILTER = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

function stockStatus(p: PartResponse): { label: string; className: string } {
  if (p.quantity <= 0) return { label: "Out", className: "text-destructive" };
  if (p.quantity <= p.minQuantity)
    return { label: "Low", className: "text-amber-700" };
  return { label: "OK", className: "text-green-700" };
}

export default function PartsPage() {
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [inventoryView, setInventoryView] = useState<"active" | "archived">(
    "active",
  );
  const [page, setPage] = useState(1);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const debouncedSearch = useDebouncedValue(search);
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = can(user?.role, "managePart");

  const query = useQuery({
    queryKey: ["parts", inventoryView, debouncedSearch, lowStock, page],
    queryFn: ({ signal }) =>
      (inventoryView === "archived" ? partsApi.archivedPage : partsApi.page)(
        {
          search: debouncedSearch || undefined,
          lowStock: lowStock === "" ? undefined : lowStock === "true",
        },
        { page, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  async function restorePart(part: PartResponse) {
    if (restoringId) return;
    setRestoringId(part.id);
    setActionError(null);
    try {
      await partsApi.restore(part.id);
      await qc.invalidateQueries({ queryKey: ["parts"] });
    } catch (error) {
      setActionError(error as Error);
    } finally {
      setRestoringId(null);
    }
  }

  const columns: DataTableColumn<PartResponse>[] = [
    {
      key: "name",
      header: "Name",
      render: (p) =>
        inventoryView === "active" ? (
          <Link href={`/parts/${p.id}`} className="underline">
            {p.name}
          </Link>
        ) : (
          p.name
        ),
    },
    { key: "sku", header: "SKU" },
    { key: "quantity", header: "On hand" },
    { key: "minQuantity", header: "Min" },
    {
      key: "status",
      header: "Status",
      render: (p) => {
        if (inventoryView === "archived") {
          return (
            <span className="text-sm font-medium text-muted-foreground">
              Archived
            </span>
          );
        }
        const s = stockStatus(p);
        return (
          <span className={`text-sm font-medium ${s.className}`}>
            {s.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (p) =>
        canManage ? (
          inventoryView === "archived" ? (
            <Button
              variant="ghost"
              onClick={() => restorePart(p)}
              disabled={restoringId !== null}
              aria-label={`Restore ${p.name}`}
            >
              {restoringId === p.id ? "Restoring…" : "Restore"}
            </Button>
          ) : (
            <Link
              href={`/parts/${p.id}`}
              className="text-sm font-medium underline"
            >
              Edit
            </Link>
          )
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Parts</h1>
        {canManage ? (
          <Link href="/parts/new" className={buttonClassName()}>
            New part
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {canManage ? (
          <Select
            label="Inventory view"
            id="inventoryView"
            value={inventoryView}
            onChange={(e) => {
              setInventoryView(e.target.value as "active" | "archived");
              setPage(1);
              setActionError(null);
            }}
            options={INVENTORY_VIEW_FILTER}
          />
        ) : null}
        <input
          aria-label="Search parts"
          placeholder="Search name or SKU…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-64 rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Select
          label=""
          aria-label="Filter by stock level"
          id="lowStock"
          value={lowStock}
          onChange={(e) => {
            setLowStock(e.target.value);
            setPage(1);
          }}
          options={LOW_STOCK_FILTER}
        />
      </div>

      <QueryState
        isLoading={query.isLoading}
        error={query.error ?? actionError}
        onRetry={() => {
          setActionError(null);
          void query.refetch();
        }}
        isEmpty={query.data?.total === 0}
        emptyMessage={
          inventoryView === "archived" ? "No archived parts." : "No parts yet."
        }
      >
        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          page={page}
          pageSize={PAGE_SIZE}
          total={query.data?.total ?? 0}
          onPageChange={setPage}
        />
      </QueryState>
    </div>
  );
}
