"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { assetsApi } from "@/lib/api/assets";
import { extractQrToken } from "@/lib/qr-token";

export default function AssetQrRedirectPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState("Looking up asset...");

  useEffect(() => {
    let active = true;

    async function resolveAsset(): Promise<void> {
      const token = extractQrToken(params.token ?? "");
      if (!token) {
        setStatus("Invalid QR code.");
        return;
      }

      try {
        const asset = await assetsApi.scan(token);
        if (active) router.replace(`/assets/${asset.id}`);
      } catch (e) {
        if (!active) return;
        const s = (e as { status?: number }).status;
        setStatus(
          s === 404
            ? "Unknown QR code - not an asset in your company."
            : "QR lookup failed. Try again.",
        );
      }
    }

    void resolveAsset();
    return () => {
      active = false;
    };
  }, [params.token, router]);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Opening asset</h1>
      <p className="text-sm text-muted-foreground">{status}</p>
      <Link
        href="/assets/scan"
        className="text-sm font-medium text-primary hover:underline"
      >
        Open scanner
      </Link>
    </div>
  );
}
