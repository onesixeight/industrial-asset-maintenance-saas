"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { WorkOrderResponse, WorkOrderStatus, Priority } from "@iam/shared";
import { workOrdersApi } from "@/lib/api/work-orders";
import { assetsApi } from "@/lib/api/assets";
import { usersApi } from "@/lib/api/reference";
import { buttonClassName } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { SearchableSelect } from "@/components/searchable-select";

const PAGE_SIZE = 20;

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
const PRIORITIES: { value: string; label: string }[] = [
  { value: "", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export default function WorkOrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assetId, setAssetId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const debouncedAssetSearch = useDebouncedValue(assetSearch);
  const debouncedAssigneeSearch = useDebouncedValue(assigneeSearch);
  const { user } = useAuth();
  const canManageWorkOrders = can(user?.role, "manageWorkOrder");

  const assetsQuery = useQuery({
    queryKey: ["assets", "selector", debouncedAssetSearch],
    queryFn: ({ signal }) =>
      assetsApi.page(
        { search: debouncedAssetSearch || undefined },
        { page: 1, pageSize: 50 },
        signal,
      ),
  });
  const usersQuery = useQuery({
    queryKey: ["users", "selector", debouncedAssigneeSearch],
    queryFn: ({ signal }) =>
      usersApi.page(
        { page: 1, pageSize: 50 },
        signal,
        debouncedAssigneeSearch || undefined,
      ),
    enabled: canManageWorkOrders,
  });
  const assets = assetsQuery.data?.items;
  const users = usersQuery.data?.items;

  const query = useQuery({
    queryKey: [
      "work-orders",
      debouncedSearch,
      status,
      priority,
      assetId,
      assignedToId,
      page,
    ],
    queryFn: ({ signal }) =>
      workOrdersApi.page(
        {
          search: debouncedSearch || undefined,
          status: (status || undefined) as WorkOrderStatus | undefined,
          priority: (priority || undefined) as Priority | undefined,
          assetId: assetId || undefined,
          assignedToId: assignedToId || undefined,
        },
        { page, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  const assetName = (id: string) =>
    assets?.find((a) => a.id === id)?.name ?? id;
  const userName = (id: string | null) => {
    if (!id) return "—";
    if (!canManageWorkOrders) return id === user?.id ? user.email : "Assigned";
    return users?.find((candidate) => candidate.id === id)?.email ?? id;
  };

  const columns: DataTableColumn<WorkOrderResponse>[] = [
    { key: "title", header: "Title" },
    { key: "asset", header: "Asset", render: (r) => assetName(r.assetId) },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => <PriorityBadge priority={r.priority} />,
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (r) => userName(r.assignedToId),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link
          href={`/work-orders/${row.id}`}
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
        <h1 className="text-2xl font-bold">Work orders</h1>
        {can(user?.role, "createWorkOrder") ? (
          <Link href="/work-orders/new" className={buttonClassName()}>
            New work order
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search work orders"
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
          aria-label="Filter by work-order status"
          id="status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={STATUSES}
        />
        <Select
          label=""
          aria-label="Filter by priority"
          id="priority"
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          options={PRIORITIES}
        />
        <SearchableSelect
          label=""
          searchLabel="Search assets for work-order filter"
          searchValue={assetSearch}
          onSearchChange={setAssetSearch}
          aria-label="Filter by asset"
          id="asset"
          value={assetId}
          onChange={(e) => {
            setAssetId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All assets" },
            ...(assets ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        {canManageWorkOrders ? (
          <SearchableSelect
            label=""
            searchLabel="Search assignees for work-order filter"
            searchValue={assigneeSearch}
            onSearchChange={setAssigneeSearch}
            aria-label="Filter by assignee"
            id="assignee"
            value={assignedToId}
            onChange={(e) => {
              setAssignedToId(e.target.value);
              setPage(1);
            }}
            options={[
              { value: "", label: "All assignees" },
              ...(users ?? []).map((u) => ({ value: u.id, label: u.email })),
            ]}
          />
        ) : null}
      </div>

      {assetsQuery.error ? (
        <p role="alert" className="text-sm text-destructive">
          Asset names and filters are unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => assetsQuery.refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}
      {canManageWorkOrders && usersQuery.error ? (
        <p role="alert" className="text-sm text-destructive">
          Assignee names and filters are unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => usersQuery.refetch()}
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
        emptyMessage="No work orders yet."
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
