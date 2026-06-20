"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export interface QrScannerProps {
  onDecode: (text: string) => void;
  /** Called when the camera cannot start (permissions / no camera). */
  onError?: (message: string) => void;
}

/**
 * Camera-based QR scanner wrapping html5-qrcode. Starts the camera on mount,
 * invokes onDecode(text) on a successful scan (the text is the full scan URL —
 * the caller extracts the trailing token), and stops/cleans up on unmount.
 */
export function QrScanner({ onDecode, onError }: QrScannerProps) {
  const containerId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decoded: string) => {
          if (cancelled) return;
          onDecode(decoded);
        },
        () => {
          // per-frame failure: ignore, only surface hard start failures
        },
      )
      .catch((err: unknown) => {
        if (!cancelled) onError?.(err instanceof Error ? err.message : "Camera unavailable");
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            // already stopped
          });
      }
    };
  }, [onDecode, onError]);

  return <div id={containerId} className="w-full max-w-sm overflow-hidden rounded-[var(--radius)] border border-border" />;
}
