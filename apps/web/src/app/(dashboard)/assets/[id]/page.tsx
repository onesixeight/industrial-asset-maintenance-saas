"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { AssetStatus } from "@iam/shared";
import { assetsApi } from "@/lib/api/assets";
import { useAuth } from "@/lib/auth/hooks";
import { fmtDate } from "@/lib/format";
import { AssetStatusBadge } from "@/components/asset-status-badge";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QrCodeDisplay } from "@/components/qr-code-display";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = can(user?.role, "manageAsset");
  const canInspect = can(user?.role, "submitInspection");
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const assetQuery = useQuery({
    queryKey: ["asset", id],
    queryFn: ({ signal }) => assetsApi.get(id, signal),
  });
  const asset = assetQuery.data;

  async function onDelete() {
    if (!asset) return;
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await assetsApi.remove(id);
      qc.invalidateQueries({ queryKey: ["assets"] });
      router.push("/assets");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 409
          ? "Asset has work orders or inspections; cannot delete."
          : (e as Error).message,
      );
    } finally {
      setDeleting(false);
    }
  }

  async function onStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset || updatingStatus) return;
    const status = new FormData(event.currentTarget).get(
      "status",
    ) as AssetStatus;
    setUpdatingStatus(true);
    setErrorMsg(null);
    try {
      const updated = await assetsApi.updateStatus(id, { status });
      qc.setQueryData(["asset", id], updated);
      await qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (error) {
      setErrorMsg((error as Error).message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (!asset)
    return (
      <QueryState
        isLoading={assetQuery.isLoading}
        error={assetQuery.error}
        onRetry={() => assetQuery.refetch()}
        isEmpty={!assetQuery.isLoading && !assetQuery.error}
        emptyMessage="Asset not found."
      >
        content
      </QueryState>
    );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/assets"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to assets
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{asset.name}</h1>
        <div className="flex items-center gap-2">
          {canInspect ? (
            <Link
              href={`/inspections/new?assetId=${asset.id}`}
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Inspect asset
            </Link>
          ) : null}
          {canManage ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>

      {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}

      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Serial</dt>
        <dd>{asset.serialNumber ?? "—"}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="flex flex-wrap items-center gap-3">
          <AssetStatusBadge status={asset.status} />
          {canManage ? (
            <form className="flex items-center gap-2" onSubmit={onStatusSubmit}>
              <label htmlFor="asset-status" className="sr-only">
                Asset status
              </label>
              <select
                id="asset-status"
                name="status"
                key={asset.status}
                defaultValue={asset.status}
                disabled={updatingStatus}
                className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
              </select>
              <Button type="submit" disabled={updatingStatus}>
                {updatingStatus ? "Updating…" : "Update status"}
              </Button>
            </form>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">Description</dt>
        <dd>{asset.description ?? "—"}</dd>
        <dt className="text-muted-foreground">Purchase date</dt>
        <dd>{fmtDate(asset.purchaseDate)}</dd>
        <dt className="text-muted-foreground">Warranty date</dt>
        <dd>{fmtDate(asset.warrantyDate)}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{fmtDate(asset.createdAt)}</dd>
      </dl>

      <div className="max-w-sm">
        <h2 className="mb-2 text-lg font-semibold">QR code</h2>
        <QrCodeDisplay assetId={asset.id} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete asset"
        message={errorMsg ?? `Delete "${asset.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={onDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
