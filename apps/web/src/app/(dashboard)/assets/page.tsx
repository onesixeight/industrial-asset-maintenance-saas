"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AssetStatus } from "@iam/shared";
import { assetsApi } from "@/lib/api/assets";
import { locationsApi } from "@/lib/api/reference";
import { categoriesApi } from "@/lib/api/reference";
import { buttonClassName } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { AssetStatusBadge } from "@/components/asset-status-badge";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import type { AssetResponse } from "@iam/shared";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { SearchableSelect } from "@/components/searchable-select";

const PAGE_SIZE = 20;

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
  const [locationSearch, setLocationSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const debouncedLocationSearch = useDebouncedValue(locationSearch);
  const debouncedCategorySearch = useDebouncedValue(categorySearch);
  const { user } = useAuth();

  const locationsQuery = useQuery({
    queryKey: ["locations", "selector", debouncedLocationSearch],
    queryFn: ({ signal }) =>
      locationsApi.page(
        debouncedLocationSearch || undefined,
        { page: 1, pageSize: 50 },
        signal,
      ),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", "selector", debouncedCategorySearch],
    queryFn: ({ signal }) =>
      categoriesApi.page(
        debouncedCategorySearch || undefined,
        { page: 1, pageSize: 50 },
        signal,
      ),
  });
  const locations = locationsQuery.data?.items;
  const categories = categoriesQuery.data?.items;

  const query = useQuery({
    queryKey: ["assets", debouncedSearch, status, locationId, categoryId, page],
    queryFn: ({ signal }) =>
      assetsApi.page(
        {
          search: debouncedSearch || undefined,
          status: (status || undefined) as AssetStatus | undefined,
          locationId: locationId || undefined,
          categoryId: categoryId || undefined,
        },
        { page, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  const columns: DataTableColumn<AssetResponse>[] = [
    { key: "name", header: "Name" },
    {
      key: "serialNumber",
      header: "Serial",
      render: (r) => r.serialNumber ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <AssetStatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link
          href={`/assets/${row.id}`}
          className="text-sm font-medium underline"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assets</h1>
        {can(user?.role, "createAsset") ? (
          <Link href="/assets/new" className={buttonClassName()}>
            New asset
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search assets"
          placeholder="Search…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-10 flex-1 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Select
          label=""
          aria-label="Filter by asset status"
          id="status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={STATUSES}
        />
        <SearchableSelect
          label=""
          searchLabel="Search locations"
          searchValue={locationSearch}
          onSearchChange={setLocationSearch}
          aria-label="Filter by location"
          id="location"
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All locations" },
            ...(locations ?? []).map((l) => ({ value: l.id, label: l.name })),
          ]}
        />
        <SearchableSelect
          label=""
          searchLabel="Search categories"
          searchValue={categorySearch}
          onSearchChange={setCategorySearch}
          aria-label="Filter by category"
          id="category"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All categories" },
            ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {locationsQuery.error || categoriesQuery.error ? (
        <p role="alert" className="text-sm text-destructive">
          Some asset filters are unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void locationsQuery.refetch();
              void categoriesQuery.refetch();
            }}
          >
            Retry
          </button>
        </p>
      ) : null}

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        isEmpty={query.data?.total === 0}
        emptyMessage="No assets yet."
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
