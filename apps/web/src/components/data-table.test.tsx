// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./data-table";

describe("DataTable pagination", () => {
  afterEach(cleanup);

  it("shows page 2 data and reports the server-backed page metadata", () => {
    render(
      <DataTable
        columns={[{ key: "name", header: "Name" }]}
        rows={[{ id: "3", name: "Page two asset" }]}
        page={2}
        pageSize={2}
        total={3}
        onPageChange={() => undefined}
      />,
    );

    expect(screen.getByText("Page two asset")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("requests the next page without changing the current rows locally", async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={[{ key: "name", header: "Name" }]}
        rows={[
          { id: "1", name: "Asset one" },
          { id: "2", name: "Asset two" },
        ]}
        page={1}
        pageSize={2}
        total={3}
        onPageChange={onPageChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(screen.getByText("Asset one")).toBeInTheDocument();
  });

  it("returns to the last valid page when deleting page 2's sole row", async () => {
    function Harness() {
      const [page, setPage] = useState(2);
      const [rows, setRows] = useState([{ id: "21", name: "Last asset" }]);
      return (
        <>
          <output aria-label="Current page">{page}</output>
          <button type="button" onClick={() => setRows([])}>
            Delete last asset
          </button>
          <DataTable
            columns={[{ key: "name", header: "Name" }]}
            rows={rows}
            page={page}
            pageSize={20}
            total={rows.length > 0 ? 21 : 20}
            onPageChange={setPage}
          />
        </>
      );
    }

    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete last asset" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current page")).toHaveTextContent("1"),
    );
  });
});
