"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { assetsApi } from "@/lib/api/assets";
import { extractQrToken } from "@/lib/qr-token";
import { QrScanner } from "@/components/qr-scanner";
import { Button } from "@/components/button";

type ScanState = "ready" | "resolving" | "error";

export default function ScanAssetPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>("ready");
  const [manualEntry, setManualEntry] = useState("");
  const inFlightRef = useRef(false);
  const lookupControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      lookupControllerRef.current?.abort();
      lookupControllerRef.current = null;
    },
    [],
  );

  const onDecode = useCallback(
    async (text: string) => {
      if (inFlightRef.current) return;
      const token = extractQrToken(text);
      if (!token) {
        setStatus("Enter a QR token or scan URL.");
        setScanState("error");
        return;
      }

      inFlightRef.current = true;
      const controller = new AbortController();
      lookupControllerRef.current = controller;
      setScanState("resolving");
      setStatus("Looking up asset…");
      try {
        const asset = await assetsApi.scan(token, controller.signal);
        if (controller.signal.aborted) return;
        router.push(`/assets/${asset.id}`);
      } catch (e) {
        if (controller.signal.aborted) return;
        const s = (e as { status?: number }).status;
        setStatus(
          s === 404
            ? "Unknown QR code — not an asset in your company."
            : "Scan failed. Try again.",
        );
        setScanState("error");
      } finally {
        if (lookupControllerRef.current === controller)
          lookupControllerRef.current = null;
        inFlightRef.current = false;
      }
    },
    [router],
  );

  const onCameraError = useCallback((message: string) => {
    setStatus(`Camera error: ${message}`);
    setScanState("error");
  }, []);

  const retry = useCallback(() => {
    setStatus(null);
    setScanState("ready");
  }, []);

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onDecode(manualEntry);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Scan asset QR</h1>
      <p className="text-sm text-muted-foreground">
        Point the camera at an asset&apos;s QR sticker. The code resolves to the
        asset in your company.
      </p>
      {scanState === "ready" ? (
        <QrScanner onDecode={onDecode} onError={onCameraError} />
      ) : null}

      <form onSubmit={submitManual} className="flex max-w-sm flex-col gap-2">
        <label htmlFor="manual-qr" className="text-sm font-medium">
          QR token or scan URL
        </label>
        <div className="flex gap-2">
          <input
            id="manual-qr"
            value={manualEntry}
            onChange={(event) => setManualEntry(event.target.value)}
            disabled={scanState === "resolving"}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-[var(--radius)] border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={scanState === "resolving" || !manualEntry.trim()}
          >
            Look up asset
          </Button>
        </div>
      </form>

      {status ? (
        <p className="text-sm" role="status">
          {status}
        </p>
      ) : null}
      {scanState === "error" ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={retry}
        >
          Retry scanning
        </Button>
      ) : null}
    </div>
  );
}
