// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { Select } from "./select";

describe("Select accessibility", () => {
  afterEach(cleanup);

  it("associates its label without requiring a caller-provided id", () => {
    render(
      <Select label="Asset" options={[]} value="" onChange={() => undefined} />,
    );

    const select = screen.getByLabelText("Asset");
    expect(select.id).not.toBe("");
  });

  it("keeps a required empty value on a disabled placeholder after options load", () => {
    const { rerender } = render(
      <Select
        label="Asset"
        required
        placeholder="Select an asset…"
        options={[]}
        value=""
        onChange={() => undefined}
      />,
    );

    rerender(
      <Select
        label="Asset"
        required
        placeholder="Select an asset…"
        options={[{ value: "asset-1", label: "Boiler pump" }]}
        value=""
        onChange={() => undefined}
      />,
    );

    const select = screen.getByLabelText("Asset") as HTMLSelectElement;
    const placeholder = screen.getByRole("option", {
      name: "Select an asset…",
    });
    expect(placeholder).toBeDisabled();
    expect(select).toHaveValue("");
    expect(select.selectedOptions).toHaveLength(1);
    expect(select.selectedOptions[0]).toBe(placeholder);
    expect(
      screen.getByRole("option", { name: "Boiler pump" }),
    ).not.toBeChecked();
  });

  it("associates select errors without replacing an existing description", () => {
    render(
      <>
        <p id="asset-help">Search by asset name.</p>
        <Select
          id="asset"
          label="Asset"
          options={[]}
          value=""
          onChange={() => undefined}
          aria-describedby="asset-help"
          error="Asset is required"
        />
      </>,
    );

    expect(screen.getByLabelText("Asset")).toHaveAccessibleDescription(
      "Search by asset name. Asset is required",
    );
  });
});
