// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrScanner } from "./qr-scanner";

interface ScannerDouble {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  decode?: (text: string) => void;
}

const scanners = vi.hoisted(() => ({
  instances: [] as ScannerDouble[],
  startGate: null as null | (() => Promise<void>),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class implements ScannerDouble {
    decode?: (text: string) => void;
    start = vi.fn(
      (
        _camera: unknown,
        _config: unknown,
        onDecode: (text: string) => void,
      ) => {
        this.decode = onDecode;
        return scanners.startGate?.() ?? Promise.resolve();
      },
    );
    stop = vi.fn(async () => undefined);
    clear = vi.fn(() => undefined);

    constructor(containerId: string) {
      void containerId;
      scanners.instances.push(this);
    }
  },
}));

describe("QrScanner", () => {
  beforeEach(() => {
    scanners.instances.length = 0;
    scanners.startGate = null;
  });

  afterEach(cleanup);

  it("keeps one camera session while using the latest callback", async () => {
    const firstDecode = vi.fn();
    const latestDecode = vi.fn();
    const { rerender } = render(<QrScanner onDecode={firstDecode} />);

    await waitFor(() =>
      expect(scanners.instances[0]?.start).toHaveBeenCalledTimes(1),
    );
    rerender(<QrScanner onDecode={latestDecode} />);

    expect(scanners.instances).toHaveLength(1);
    act(() => scanners.instances[0]?.decode?.("qr-token"));
    expect(firstDecode).not.toHaveBeenCalled();
    expect(latestDecode).toHaveBeenCalledWith("qr-token");
  });

  it("claims only the first decoded frame and stops the camera", async () => {
    const onDecode = vi.fn();
    render(<QrScanner onDecode={onDecode} />);

    await waitFor(() =>
      expect(scanners.instances[0]?.start).toHaveBeenCalledTimes(1),
    );
    act(() => {
      scanners.instances[0]?.decode?.("first-token");
      scanners.instances[0]?.decode?.("duplicate-token");
    });

    expect(onDecode).toHaveBeenCalledTimes(1);
    expect(onDecode).toHaveBeenCalledWith("first-token");
    await waitFor(() =>
      expect(scanners.instances[0]?.stop).toHaveBeenCalledTimes(1),
    );
    expect(scanners.instances[0]?.clear).toHaveBeenCalledTimes(1);
  });

  it("waits for a pending camera start before stopping after unmount", async () => {
    let resolveStart!: () => void;
    scanners.startGate = () =>
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
    const { unmount } = render(<QrScanner onDecode={() => undefined} />);

    await waitFor(() =>
      expect(scanners.instances[0]?.start).toHaveBeenCalledTimes(1),
    );
    const scanner = scanners.instances[0];
    unmount();

    expect(scanner?.stop).not.toHaveBeenCalled();
    expect(scanner?.clear).not.toHaveBeenCalled();

    await act(async () => {
      resolveStart();
      await Promise.resolve();
    });

    await waitFor(() => expect(scanner?.stop).toHaveBeenCalledTimes(1));
    expect(scanner?.clear).toHaveBeenCalledTimes(1);
  });
});
