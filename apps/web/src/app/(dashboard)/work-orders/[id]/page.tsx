"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { WorkOrderStatus } from "@iam/shared";
import { workOrdersApi } from "@/lib/api/work-orders";
import { partsApi, workOrderPartsApi } from "@/lib/api/parts";
import { usersApi } from "@/lib/api/reference";
import { useAuth } from "@/lib/auth/hooks";
import { fmtDate, fmtEnum } from "@/lib/format";
import { ALLOWED_TRANSITIONS } from "@/lib/work-orders/transitions";
import { Button } from "@/components/button";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Select } from "@/components/select";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { SearchableSelect } from "@/components/searchable-select";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [consumePartId, setConsumePartId] = useState("");
  const [consumeQty, setConsumeQty] = useState("1");
  const [partsError, setPartsError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const assignInFlight = useRef(false);
  const debouncedPartSearch = useDebouncedValue(partSearch);
  const debouncedAssigneeSearch = useDebouncedValue(assigneeSearch);
  const isManager = can(user?.role, "manageWorkOrder");
  const mayConsumeParts = can(user?.role, "consumePart");

  const workOrderQuery = useQuery({
    queryKey: ["work-order", id],
    queryFn: ({ signal }) => workOrdersApi.get(id, signal),
  });
  const wo = workOrderQuery.data;
  const usersQuery = useQuery({
    queryKey: ["users", "selector", debouncedAssigneeSearch],
    queryFn: ({ signal }) =>
      usersApi.page(
        { page: 1, pageSize: 50 },
        signal,
        debouncedAssigneeSearch || undefined,
      ),
    enabled: isManager,
  });
  const currentAssigneeQuery = useQuery({
    queryKey: ["user", "selector-current", wo?.assignedToId],
    queryFn: ({ signal }) => usersApi.get(wo!.assignedToId!, signal),
    enabled: isManager && !!wo?.assignedToId,
  });
  const partsQuery = useQuery({
    queryKey: ["parts", "selector", debouncedPartSearch],
    queryFn: ({ signal }) =>
      partsApi.page(
        { search: debouncedPartSearch || undefined },
        { page: 1, pageSize: 50 },
        signal,
      ),
    enabled: mayConsumeParts,
  });
  const woPartsQuery = useQuery({
    queryKey: ["work-order-parts", id],
    queryFn: ({ signal }) => workOrderPartsApi.list(id, signal),
  });
  const users = usersQuery.data?.items;
  const parts = partsQuery.data?.items;
  const woParts = woPartsQuery.data;

  // technician may transition only their own assigned WO; viewer none; manager/admin any.
  const canTransition =
    !!wo &&
    can(user?.role, "transitionWorkOrder") &&
    (isManager || (user?.role === "technician" && wo.assignedToId === user.id));
  const allowedNext: WorkOrderStatus[] = wo
    ? ALLOWED_TRANSITIONS[wo.status]
    : [];

  const transitionMutation = useMutation({
    mutationFn: (status: WorkOrderStatus) =>
      workOrdersApi.transition(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-order", id] }),
    onError: (e: unknown) => setErrorMsg((e as Error).message),
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToId: string | null) =>
      workOrdersApi.update(id, { assignedToId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-order", id] }),
    onError: (e: unknown) => setErrorMsg((e as Error).message),
    onSettled: () => {
      assignInFlight.current = false;
    },
  });

  function onAssign(assignedToId: string | null): void {
    if (assignInFlight.current) return;
    assignInFlight.current = true;
    setErrorMsg(null);
    assignMutation.mutate(assignedToId);
  }

  const deleteMutation = useMutation({
    mutationFn: () => workOrdersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      router.push("/work-orders");
    },
  });

  const consumeMutation = useMutation({
    mutationFn: () =>
      workOrderPartsApi.consume(id, {
        partId: consumePartId,
        quantity: Number(consumeQty),
      }),
    onSuccess: () => {
      setPartsError(null);
      setConsumePartId("");
      setConsumeQty("1");
      qc.invalidateQueries({ queryKey: ["work-order-parts", id] });
      qc.invalidateQueries({ queryKey: ["parts"] });
    },
    onError: (e: unknown) => {
      const status = (e as { status?: number }).status;
      setPartsError(
        status === 409
          ? "Insufficient stock."
          : status === 403
            ? "You can only consume parts on work orders assigned to you."
            : (e as Error).message,
      );
    },
  });

  const restockMutation = useMutation({
    mutationFn: (partId: string) => workOrderPartsApi.restock(id, partId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-order-parts", id] });
      qc.invalidateQueries({ queryKey: ["parts"] });
    },
  });

  async function onDelete() {
    setConfirmOpen(false);
    try {
      await deleteMutation.mutateAsync();
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  }

  if (!wo)
    return (
      <QueryState
        isLoading={workOrderQuery.isLoading}
        error={workOrderQuery.error}
        onRetry={() => workOrderQuery.refetch()}
        isEmpty={!workOrderQuery.isLoading && !workOrderQuery.error}
        emptyMessage="Work order not found."
      >
        content
      </QueryState>
    );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/work-orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to work orders
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{wo.title}</h1>
        {isManager ? (
          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        ) : null}
      </div>

      {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
      {isManager && (usersQuery.error || currentAssigneeQuery.error) ? (
        <p role="alert" className="text-sm text-destructive">
          Assignee choices are unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => usersQuery.refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}
      {woPartsQuery.error ? (
        <p role="alert" className="text-sm text-destructive">
          Consumed parts are unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => woPartsQuery.refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <StatusBadge status={wo.status} />
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Priority: <PriorityBadge priority={wo.priority} />
        </span>
      </div>

      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{fmtEnum(wo.type)}</dd>
        <dt className="text-muted-foreground">Description</dt>
        <dd>{wo.description ?? "—"}</dd>
        <dt className="text-muted-foreground">Due date</dt>
        <dd>{fmtDate(wo.dueDate)}</dd>
        <dt className="text-muted-foreground">Completed at</dt>
        <dd>{fmtDate(wo.completedAt)}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{fmtDate(wo.createdAt)}</dd>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Status transition</h2>
        {canTransition ? (
          <div className="flex flex-wrap gap-2">
            {allowedNext.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Terminal status — no further transitions.
              </p>
            ) : (
              allowedNext.map((s) => (
                <Button
                  key={s}
                  variant={s === "cancelled" ? "destructive" : "default"}
                  disabled={transitionMutation.isPending}
                  onClick={() => transitionMutation.mutate(s)}
                >
                  {s.replace("_", " ")}
                </Button>
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {user?.role === "viewer"
              ? "Viewers cannot transition work orders."
              : "You can only transition work orders assigned to you."}
          </p>
        )}
      </div>

      {isManager ? (
        <div className="flex max-w-sm flex-col gap-2">
          <h2 className="text-lg font-semibold">Assignee</h2>
          <SearchableSelect
            id="assignee"
            label=""
            searchLabel="Search assignees"
            searchValue={assigneeSearch}
            onSearchChange={setAssigneeSearch}
            aria-label="Assignee"
            value={
              (assignMutation.isPending
                ? assignMutation.variables
                : wo.assignedToId) ?? ""
            }
            onChange={(e) => onAssign(e.target.value || null)}
            disabled={
              assignMutation.isPending ||
              usersQuery.isLoading ||
              currentAssigneeQuery.isLoading ||
              !!usersQuery.error ||
              !!currentAssigneeQuery.error
            }
            selectedOption={
              currentAssigneeQuery.data
                ? {
                    value: currentAssigneeQuery.data.id,
                    label: currentAssigneeQuery.data.email,
                  }
                : undefined
            }
            options={[
              { value: "", label: "Unassigned" },
              ...(users ?? []).map((u) => ({ value: u.id, label: u.email })),
            ]}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Parts consumed</h2>
        {woParts && woParts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {woParts.map((line) => (
              <li
                key={line.id}
                className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3 text-sm"
              >
                <span>
                  {line.part.name} ({line.part.sku}) —{" "}
                  <strong>{line.quantity}</strong> · on hand:{" "}
                  {line.part.quantity}
                </span>
                {isManager ? (
                  <Button
                    variant="ghost"
                    onClick={() => restockMutation.mutate(line.partId)}
                    disabled={restockMutation.isPending}
                  >
                    Restock
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No parts consumed yet.
          </p>
        )}

        {can(user?.role, "consumePart") &&
        (isManager ||
          (user?.role === "technician" && wo.assignedToId === user.id)) ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>Search parts</span>
              <input
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm"
              />
            </label>
            <Select
              id="consumePart"
              label=""
              aria-label="Part to consume"
              value={consumePartId}
              onChange={(e) => setConsumePartId(e.target.value)}
              options={[
                { value: "", label: "Select part…" },
                ...(parts ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.sku}) — ${p.quantity} on hand`,
                })),
              ]}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span>Qty</span>
              <input
                type="number"
                min={1}
                value={consumeQty}
                onChange={(e) => setConsumeQty(e.target.value)}
                className="w-24 rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <Button
              onClick={() => consumeMutation.mutate()}
              disabled={
                !consumePartId ||
                consumeMutation.isPending ||
                Number(consumeQty) < 1
              }
            >
              Consume
            </Button>
          </div>
        ) : null}
        {partsError ? (
          <p className="text-sm text-destructive">{partsError}</p>
        ) : null}
        {mayConsumeParts && partsQuery.error ? (
          <p role="alert" className="text-sm text-destructive">
            Part choices are unavailable.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => partsQuery.refetch()}
            >
              Retry
            </button>
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete work order"
        message="Soft-delete this work order? It will be hidden but its history is retained."
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={onDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
