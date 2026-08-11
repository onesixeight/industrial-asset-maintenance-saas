// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("publishes only the latest value after the quiet period", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } },
    );

    rerender({ value: "bo" });
    rerender({ value: "boiler" });
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("boiler");
  });
});
