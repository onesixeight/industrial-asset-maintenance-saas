// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { AssetResponse } from "@iam/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScanAssetPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  scan: vi.fn(),
  latestDecode: null as null | ((text: string) => void | Promise<void>),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/api/assets", () => ({
  assetsApi: { scan: mocks.scan },
}));

vi.mock("@/components/qr-scanner", () => ({
  QrScanner: ({
    onDecode,
  }: {
    onDecode: (text: string) => void | Promise<void>;
  }) => {
    mocks.latestDecode = onDecode;
    return <div aria-label="Camera scanner" />;
  },
}));

const asset: AssetResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Cooling pump",
  description: null,
  serialNumber: "PUMP-1",
  qrCode: "asset-token",
  status: "active",
  locationId: "22222222-2222-4222-8222-222222222222",
  categoryId: "33333333-3333-4333-8333-333333333333",
  companyId: "44444444-4444-4444-8444-444444444444",
  purchaseDate: null,
  warrantyDate: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

describe("ScanAssetPage", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.scan.mockReset();
    mocks.latestDecode = null;
  });

  afterEach(cleanup);

  it("starts at most one asset lookup for repeated decoded frames", async () => {
    let resolveLookup!: (value: AssetResponse) => void;
    mocks.scan.mockReturnValue(
      new Promise<AssetResponse>((resolve) => {
        resolveLookup = resolve;
      }),
    );
    render(<ScanAssetPage />);

    act(() => {
      void mocks.latestDecode?.("asset-token");
      void mocks.latestDecode?.("asset-token");
    });

    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Looking up asset");

    await act(async () => resolveLookup(asset));
    expect(mocks.push).toHaveBeenCalledWith(`/assets/${asset.id}`);
  });

  it("aborts an in-flight lookup and ignores its completion after unmount", async () => {
    let resolveLookup!: (value: AssetResponse) => void;
    let requestSignal: AbortSignal | undefined;
    mocks.scan.mockImplementation((_token: string, signal?: AbortSignal) => {
      requestSignal = signal;
      return new Promise<AssetResponse>((resolve) => {
        resolveLookup = resolve;
      });
    });
    const { unmount } = render(<ScanAssetPage />);

    act(() => {
      void mocks.latestDecode?.("asset-token");
    });
    unmount();

    expect(requestSignal?.aborted).toBe(true);

    await act(async () => {
      resolveLookup(asset);
      await Promise.resolve();
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("offers a deliberate retry after lookup failure", async () => {
    mocks.scan
      .mockRejectedValueOnce(
        Object.assign(new Error("not found"), { status: 404 }),
      )
      .mockResolvedValueOnce(asset);
    render(<ScanAssetPage />);

    await act(async () => {
      await mocks.latestDecode?.("unknown-token");
    });

    expect(screen.getByText(/unknown qr code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Camera scanner")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /retry scanning/i }),
    );
    expect(screen.getByLabelText("Camera scanner")).toBeInTheDocument();

    await act(async () => {
      await mocks.latestDecode?.("asset-token");
    });
    expect(mocks.scan).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith(`/assets/${asset.id}`);
  });

  it.each([
    ["asset-token", "asset-token"],
    ["https://iam.example/assets/qr/asset-token?source=label", "asset-token"],
  ])("accepts manual QR input %s", async (entry, expectedToken) => {
    mocks.scan.mockResolvedValue(asset);
    render(<ScanAssetPage />);

    await userEvent.type(screen.getByLabelText(/qr token or scan url/i), entry);
    await userEvent.click(
      screen.getByRole("button", { name: /look up asset/i }),
    );

    await waitFor(() =>
      expect(mocks.scan.mock.calls[0]?.[0]).toBe(expectedToken),
    );
    expect(mocks.push).toHaveBeenCalledWith(`/assets/${asset.id}`);
  });
});
