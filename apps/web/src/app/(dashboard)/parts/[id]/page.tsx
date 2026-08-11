"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PartResponse } from "@iam/shared";
import { partsApi } from "@/lib/api/parts";
import { Button } from "@/components/button";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function EditPartPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const partQuery = useQuery({
    queryKey: ["part", params.id],
    queryFn: ({ signal }) => partsApi.get(params.id, signal),
  });
  const part = partQuery.data;

  if (!can(user?.role, "managePart")) {
    return (
      <QueryState
        error={Object.assign(new Error("Forbidden"), { status: 403 })}
      >
        content
      </QueryState>
    );
  }
  if (!part)
    return (
      <QueryState
        isLoading={partQuery.isLoading}
        error={partQuery.error}
        onRetry={() => partQuery.refetch()}
        isEmpty={!partQuery.isLoading && !partQuery.error}
        emptyMessage="Part not found."
      >
        content
      </QueryState>
    );

  return <PartEditor key={part.id} part={part} />;
}

function PartEditor({ part }: { part: PartResponse }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(part.name);
  const [sku, setSku] = useState(part.sku);
  const [description, setDescription] = useState(part.description ?? "");
  const [minQuantity, setMinQuantity] = useState(String(part.minQuantity));
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "archive" | null>(
    null,
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  const actionInFlight = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSave() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPendingAction("save");
    setErrorMsg(null);
    try {
      await partsApi.update(part.id, {
        name,
        sku,
        description: description.trim() === "" ? null : description,
        minQuantity: Number(minQuantity),
      });
      await qc.invalidateQueries({ queryKey: ["parts"] });
      router.push("/parts");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 409
          ? "SKU already exists in this company."
          : status === 403
            ? "Only managers/admins can edit parts."
            : (e as Error).message,
      );
    } finally {
      actionInFlight.current = false;
      setPendingAction(null);
    }
  }

  async function onAdjust() {
    const delta = Number(adjustment);
    if (!Number.isInteger(delta) || delta === 0 || !adjustmentReason.trim())
      return;
    setErrorMsg(null);
    setIsAdjusting(true);
    try {
      const updated = await partsApi.adjust(part.id, {
        delta,
        reason: adjustmentReason.trim(),
      });
      qc.setQueryData(["part", part.id], updated);
      await qc.invalidateQueries({ queryKey: ["parts"] });
      setAdjustment("");
      setAdjustmentReason("");
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setIsAdjusting(false);
    }
  }

  async function onDelete() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPendingAction("archive");
    setArchiveOpen(false);
    setErrorMsg(null);
    try {
      await partsApi.remove(part.id);
      await qc.invalidateQueries({ queryKey: ["parts"] });
      router.push("/parts");
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      actionInFlight.current = false;
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/parts"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to parts
      </Link>
      <h1 className="text-2xl font-bold">Edit part</h1>

      <div className="flex max-w-lg flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>SKU</span>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-20 rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1 text-sm">
            <span>Current quantity</span>
            <output className="rounded-[var(--radius)] border border-input bg-muted p-2 text-sm">
              {part.quantity}
            </output>
          </div>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span>Min quantity</span>
            <input
              type="number"
              min={0}
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <fieldset className="flex flex-col gap-3 rounded-[var(--radius)] border border-border p-3">
          <legend className="px-1 text-sm font-medium">
            Audited stock adjustment
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span>Signed quantity change</span>
            <input
              type="number"
              step={1}
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="e.g. 10 or -2"
              className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Reason</span>
            <input
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Restock, cycle count correction…"
              className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <Button
            onClick={onAdjust}
            disabled={
              isAdjusting ||
              !adjustmentReason.trim() ||
              !Number.isInteger(Number(adjustment)) ||
              Number(adjustment) === 0
            }
          >
            {isAdjusting ? "Adjusting…" : "Apply adjustment"}
          </Button>
        </fieldset>
        {errorMsg ? (
          <p className="text-sm text-destructive">{errorMsg}</p>
        ) : null}
        <div className="flex gap-2">
          <Button
            onClick={onSave}
            disabled={!name || !sku || pendingAction !== null}
          >
            {pendingAction === "save" ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" onClick={() => router.push("/parts")}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => setArchiveOpen(true)}
            disabled={pendingAction !== null}
          >
            {pendingAction === "archive" ? "Archiving…" : "Archive"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={archiveOpen}
        title="Archive part"
        message="Archive this part? It will be hidden from active inventory while its movement history is retained."
        confirmLabel="Confirm archive"
        tone="destructive"
        onConfirm={onDelete}
        onClose={() => setArchiveOpen(false)}
      />
    </div>
  );
}
