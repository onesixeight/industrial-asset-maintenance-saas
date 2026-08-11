// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../lib/auth/store";
import { AppSidebar } from "./app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

function renderSidebar() {
  const user = userEvent.setup();
  render(
    <>
      <AppSidebar />
      <div data-app-content>
        <button type="button">Background action</button>
      </div>
    </>,
  );

  return {
    user,
    opener: screen.getByRole("button", { name: "Open navigation" }),
    drawer: screen.getByLabelText("Mobile navigation", { selector: "aside" }),
  };
}

describe("AppSidebar mobile drawer", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });
  });

  afterEach(cleanup);

  it("keeps the closed drawer out of the accessibility and tab order", () => {
    const { drawer, opener } = renderSidebar();

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls", drawer.id);
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(drawer).toHaveAttribute("inert");
  });

  it("moves focus to an explicit close control when opened", async () => {
    const { drawer, opener, user } = renderSidebar();

    await user.click(opener);

    const close = within(drawer).getByRole("button", {
      name: "Close navigation",
    });
    await waitFor(() => expect(close).toHaveFocus());
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(drawer).not.toHaveAttribute("aria-hidden");
    expect(drawer).not.toHaveAttribute("inert");
    expect(screen.getByText("Background action").parentElement).toHaveAttribute(
      "inert",
    );
  });

  it("traps forward and backward tab focus inside the modal drawer", async () => {
    const { drawer, opener, user } = renderSidebar();
    await user.click(opener);
    const close = within(drawer).getByRole("button", {
      name: "Close navigation",
    });
    const lastLink = within(drawer).getByRole("link", { name: "Categories" });

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(lastLink).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
    expect(drawer).toHaveAttribute("role", "dialog");
    expect(drawer).toHaveAttribute("aria-modal", "true");
  });

  it("restores focus to the opener when the close control is used", async () => {
    const { drawer, opener, user } = renderSidebar();

    await user.click(opener);
    await user.click(
      within(drawer).getByRole("button", { name: "Close navigation" }),
    );

    await waitFor(() => expect(opener).toHaveFocus());
    expect(opener).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and restores focus to the opener", async () => {
    const { opener, user } = renderSidebar();

    await user.click(opener);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
    expect(opener).toHaveAttribute("aria-expanded", "false");
  });

  it("closes after mobile navigation and restores focus", async () => {
    const { drawer, opener, user } = renderSidebar();

    await user.click(opener);
    const assetsLink = within(drawer).getByRole("link", { name: "Assets" });
    assetsLink.addEventListener("click", (event) => event.preventDefault());
    await user.click(assetsLink);

    await waitFor(() => expect(opener).toHaveFocus());
    expect(opener).toHaveAttribute("aria-expanded", "false");
  });
});
