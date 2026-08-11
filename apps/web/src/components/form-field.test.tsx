// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { FormField } from "./form-field";

describe("FormField accessibility", () => {
  afterEach(cleanup);

  it("associates its label and error through stable generated ids", () => {
    const { rerender } = render(
      <FormField label="Email" error="Email is required" />,
    );
    const input = screen.getByLabelText("Email");
    const inputId = input.id;
    const descriptionId = input.getAttribute("aria-describedby");

    expect(inputId).not.toBe("");
    expect(descriptionId).not.toBeNull();
    expect(screen.getByText("Email is required")).toHaveAttribute(
      "id",
      descriptionId,
    );
    expect(input).toHaveAccessibleDescription("Email is required");

    rerender(<FormField label="Email" error="Enter a valid email" />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("id", inputId);
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-describedby",
      descriptionId,
    );
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter a valid email",
    );
  });

  it("keeps an existing description when adding an error", () => {
    render(
      <>
        <p id="email-help">Use your work address.</p>
        <FormField
          id="email"
          label="Email"
          aria-describedby="email-help"
          error="Email is required"
        />
      </>,
    );

    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Use your work address. Email is required",
    );
  });
});
