"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assetsApi } from "@/lib/api/assets";
import { QrScanner } from "@/components/qr-scanner";

export default function ScanAssetPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  /** The scanned text is the full scan URL; the trailing path segment is the token. */
  function extractToken(text: string): string {
    const trimmed = text.trim();
    const slash = trimmed.lastIndexOf("/");
    return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  }

  async function onDecode(text: string) {
    setStatus("Looking up asset…");
    const token = extractToken(text);
    try {
      const asset = await assetsApi.scan(token);
      router.push(`/assets/${asset.id}`);
    } catch (e) {
      const s = (e as { status?: number }).status;
      setStatus(s === 404 ? "Unknown QR code — not an asset in your company." : "Scan failed. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Scan asset QR</h1>
      <p className="text-sm text-muted-foreground">
        Point the camera at an asset&apos;s QR sticker. The code resolves to the asset in your company.
      </p>
      <QrScanner onDecode={onDecode} onError={(m) => setStatus(`Camera error: ${m}`)} />
      {status ? <p className="text-sm">{status}</p> : null}
    </div>
  );
}
