"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { assetsApi } from "@/lib/api/assets";
import { useAuth } from "@/lib/auth/hooks";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/button";
import { QrCodeDisplay } from "@/components/qr-code-display";

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => assetsApi.get(id),
  });

  async function onDelete() {
    if (!asset) return;
    if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await assetsApi.remove(id);
      qc.invalidateQueries({ queryKey: ["assets"] });
      router.push("/assets");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(status === 409 ? "Asset has work orders or inspections; cannot delete." : (e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!asset) return <p>Asset not found.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{asset.name}</h1>
        {canManage ? (
          <Button variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        ) : null}
      </div>

      {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}

      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Serial</dt>
        <dd>{asset.serialNumber ?? "—"}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>{asset.status}</dd>
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
    </div>
  );
}
