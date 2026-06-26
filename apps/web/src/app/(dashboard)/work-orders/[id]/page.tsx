"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkOrderStatus } from "@iam/shared";
import { workOrdersApi } from "@/lib/api/work-orders";
import { partsApi, workOrderPartsApi } from "@/lib/api/parts";
import { usersApi } from "@/lib/api/reference";
import { useAuth } from "@/lib/auth/hooks";
import { fmtDate } from "@/lib/format";
import { ALLOWED_TRANSITIONS } from "@/lib/work-orders/transitions";
import { Button } from "@/components/button";
import { StatusBadge } from "@/components/status-badge";
import { Select } from "@/components/select";

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

  const { data: wo, isLoading } = useQuery({
    queryKey: ["work-order", id],
    queryFn: () => workOrdersApi.get(id),
  });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list() });
  const { data: parts } = useQuery({ queryKey: ["parts"], queryFn: () => partsApi.list() });
  const { data: woParts } = useQuery({
    queryKey: ["work-order-parts", id],
    queryFn: () => workOrderPartsApi.list(id),
  });

  const isManager = user?.role === "admin" || user?.role === "manager";
  // technician may transition only their own assigned WO; viewer none; manager/admin any.
  const canTransition =
    !!wo &&
    (isManager || (user?.role === "technician" && wo.assignedToId === user.id));
  const allowedNext: WorkOrderStatus[] = wo ? ALLOWED_TRANSITIONS[wo.status] : [];

  const transitionMutation = useMutation({
    mutationFn: (status: WorkOrderStatus) => workOrdersApi.transition(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-order", id] }),
    onError: (e: unknown) => setErrorMsg((e as Error).message),
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToId: string | null) =>
      workOrdersApi.update(id, { assignedToId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-order", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => workOrdersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      router.push("/work-orders");
    },
  });

  const consumeMutation = useMutation({
    mutationFn: () =>
      workOrderPartsApi.consume(id, { partId: consumePartId, quantity: Number(consumeQty) }),
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
    if (!confirm("Soft-delete this work order? It will be hidden but its history is retained.")) return;
    try {
      await deleteMutation.mutateAsync();
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!wo) return <p>Work order not found.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{wo.title}</h1>
        {isManager ? (
          <Button variant="destructive" onClick={onDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        ) : null}
      </div>

      {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}

      <div className="flex items-center gap-3">
        <StatusBadge status={wo.status} />
        <span className="text-sm text-muted-foreground">Priority: {wo.priority}</span>
      </div>

      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{wo.type}</dd>
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
              <p className="text-sm text-muted-foreground">Terminal status — no further transitions.</p>
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
          <Select
            id="assignee"
            label=""
            value={wo.assignedToId ?? ""}
            onChange={(e) => assignMutation.mutate(e.target.value || null)}
            options={[{ value: "", label: "Unassigned" }, ...(users ?? []).map((u) => ({ value: u.id, label: u.email }))]}
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
                  {line.part.name} ({line.part.sku}) — <strong>{line.quantity}</strong> · on hand:{" "}
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
          <p className="text-sm text-muted-foreground">No parts consumed yet.</p>
        )}

        {(isManager || (user?.role === "technician" && wo.assignedToId === user.id)) && parts?.length ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Select
              id="consumePart"
              label=""
              value={consumePartId}
              onChange={(e) => setConsumePartId(e.target.value)}
              options={[
                { value: "", label: "Select part…" },
                ...parts.map((p) => ({
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
              disabled={!consumePartId || consumeMutation.isPending || Number(consumeQty) < 1}
            >
              Consume
            </Button>
          </div>
        ) : null}
        {partsError ? <p className="text-sm text-destructive">{partsError}</p> : null}
      </div>
    </div>
  );
}
