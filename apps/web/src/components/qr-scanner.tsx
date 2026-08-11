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
  const onDecodeRef = useRef(onDecode);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let claimed = false;
    let startSucceeded = false;
    let stopRequested = false;
    let stopPromise: Promise<void> | null = null;
    const scanner = new Html5Qrcode(containerId);

    function stopStartedScanner(): Promise<void> {
      if (stopPromise) return stopPromise;
      stopPromise = scanner
        .stop()
        .catch(() => undefined)
        .then(() => {
          scanner.clear();
        })
        .catch(() => undefined);
      return stopPromise;
    }

    function requestStop(): void {
      stopRequested = true;
      if (startSucceeded) void stopStartedScanner();
    }

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decoded: string) => {
          if (cancelled || claimed) return;
          claimed = true;
          requestStop();
          onDecodeRef.current(decoded);
        },
        () => {
          // per-frame failure: ignore, only surface hard start failures
        },
      )
      .then(() => {
        startSucceeded = true;
        if (stopRequested) return stopStartedScanner();
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          onErrorRef.current?.(
            err instanceof Error ? err.message : "Camera unavailable",
          );
        }
      });

    return () => {
      cancelled = true;
      requestStop();
    };
  }, []);

  return (
    <div
      id={containerId}
      className="w-full max-w-sm overflow-hidden rounded-[var(--radius)] border border-border"
    />
  );
}
