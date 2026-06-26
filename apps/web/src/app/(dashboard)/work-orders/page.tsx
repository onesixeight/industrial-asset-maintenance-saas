"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { WorkOrderResponse, WorkOrderStatus, Priority } from "@iam/shared";
import { workOrdersApi } from "@/lib/api/work-orders";
import { assetsApi } from "@/lib/api/assets";
import { usersApi } from "@/lib/api/reference";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";

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

  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list() });

  const { data, isLoading } = useQuery({
    queryKey: ["work-orders", search, status, priority, assetId, assignedToId],
    queryFn: () =>
      workOrdersApi.list({
        search: search || undefined,
        status: (status || undefined) as WorkOrderStatus | undefined,
        priority: (priority || undefined) as Priority | undefined,
        assetId: assetId || undefined,
        assignedToId: assignedToId || undefined,
      }),
  });

  const assetName = (id: string) => assets?.find((a) => a.id === id)?.name ?? id;
  const userName = (id: string | null) => (id ? users?.find((u) => u.id === id)?.email ?? id : "—");

  const columns: DataTableColumn<WorkOrderResponse>[] = [
    { key: "title", header: "Title" },
    { key: "asset", header: "Asset", render: (r) => assetName(r.assetId) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "priority", header: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "assignee", header: "Assignee", render: (r) => userName(r.assignedToId) },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link href={`/work-orders/${row.id}`} className="text-sm font-medium underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Work orders</h1>
        <Link href="/work-orders/new">
          <Button>New work order</Button>
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
        <Select label="" id="priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES} />
        <Select
          label=""
          id="asset"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          options={[{ value: "", label: "All assets" }, ...(assets ?? []).map((a) => ({ value: a.id, label: a.name }))]}
        />
        <Select
          label=""
          id="assignee"
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          options={[{ value: "", label: "All assignees" }, ...(users ?? []).map((u) => ({ value: u.id, label: u.email }))]}
        />
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable columns={columns} rows={data ?? []} empty="No work orders yet." />}
    </div>
  );
}
