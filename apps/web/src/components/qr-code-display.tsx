"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth/hooks";
import { assetsApi } from "@/lib/api/assets";
import { Button } from "./button";

/**
 * Renders the asset's QR code (SVG from GET /assets/:id/qr) inline, with a
 * download button and a rotate action (admin/manager only). The SVG comes from
 * our own authenticated api, not user input, so inline rendering is safe.
 */
export function QrCodeDisplay({ assetId }: { assetId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canRotate = user?.role === "admin" || user?.role === "manager";
  const [rotating, setRotating] = useState(false);

  const { data: svg, isLoading } = useQuery({
    queryKey: ["asset-qr", assetId],
    queryFn: () => assetsApi.getQrSvg(assetId),
    enabled: canRotate, // only admin/manager can hit the QR endpoint
  });

  const rotate = useMutation({
    mutationFn: () => assetsApi.rotateQr(assetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-qr", assetId] });
      qc.invalidateQueries({ queryKey: ["asset", assetId] });
    },
  });

  function download() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-${assetId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onRotate() {
    if (!confirm("Rotate the QR code? The old printed sticker will stop working.")) return;
    setRotating(true);
    try {
      await rotate.mutateAsync();
    } finally {
      setRotating(false);
    }
  }

  if (!canRotate) {
    return <p className="text-sm text-muted-foreground">Ask an admin/manager to view or print the QR code.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius)] border border-border p-4">
      {isLoading || !svg ? (
        <p className="text-sm text-muted-foreground">Loading QR…</p>
      ) : (
        <div
          className="h-48 w-48"
          // Trusted source: our own authenticated api.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={download} disabled={!svg}>
          Download SVG
        </Button>
        <Button variant="destructive" onClick={onRotate} disabled={rotating}>
          {rotating ? "Rotating…" : "Rotate QR"}
        </Button>
      </div>
    </div>
  );
}
