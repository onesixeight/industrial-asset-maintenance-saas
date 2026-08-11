// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

describe("Modal focus lifecycle", () => {
  afterEach(cleanup);

  it("focuses the first meaningful field instead of the close control", () => {
    render(
      <Modal open onClose={() => undefined} title="New template">
        <label htmlFor="template-name">Template name</label>
        <input id="template-name" />
        <button type="button">Create</button>
      </Modal>,
    );

    expect(screen.getByLabelText("Template name")).toHaveFocus();
  });

  it("keeps focus in a controlled field while typing rerenders the parent", async () => {
    function Harness() {
      const [name, setName] = useState("");
      return (
        <Modal open onClose={() => undefined} title="New template">
          <label htmlFor="template-name">Template name</label>
          <input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Modal>
      );
    }

    render(<Harness />);
    const input = screen.getByLabelText("Template name");

    await userEvent.type(input, "Pump checklist");

    expect(input).toHaveValue("Pump checklist");
    expect(input).toHaveFocus();
  });

  it("uses the latest close callback for Escape without restarting focus", async () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={firstClose} title="Edit template">
        <input aria-label="Template name" />
      </Modal>,
    );
    const input = screen.getByLabelText("Template name");

    rerender(
      <Modal open onClose={latestClose} title="Edit template">
        <input aria-label="Template name" />
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");

    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it("restores focus to the opener when it closes", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            New template
          </button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="New template"
          >
            <input aria-label="Template name" />
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "New template" });
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");

    expect(opener).toHaveFocus();
  });
});
