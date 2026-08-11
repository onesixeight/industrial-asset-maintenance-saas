// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import NewInspectionPage from "./page";

const {
  assetPage,
  assetGet,
  templatePage,
  submitInspection,
  push,
  searchParamGet,
} = vi.hoisted(() => ({
  assetPage: vi.fn(),
  assetGet: vi.fn(),
  templatePage: vi.fn(),
  submitInspection: vi.fn(),
  push: vi.fn(),
  searchParamGet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/inspections/new",
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => ({ get: searchParamGet }),
}));
vi.mock("@/lib/api/assets", () => ({
  assetsApi: { page: assetPage, get: assetGet },
}));
vi.mock("@/lib/api/inspections", () => ({
  templatesApi: { page: templatePage },
  inspectionsApi: { submit: submitInspection },
}));

const companyId = "00000000-0000-4000-8000-000000000010";
const assetId = "00000000-0000-4000-8000-000000000011";
const templateId = "00000000-0000-4000-8000-000000000012";
const inspectionId = "00000000-0000-4000-8000-000000000013";

const asset = {
  id: assetId,
  name: "Boiler pump",
  description: null,
  serialNumber: null,
  qrCode: "qr-token",
  status: "active" as const,
  locationId: "00000000-0000-4000-8000-000000000014",
  categoryId: "00000000-0000-4000-8000-000000000015",
  companyId,
  purchaseDate: null,
  warrantyDate: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const template = {
  id: templateId,
  name: "Monthly check",
  version: 1,
  items: [{ id: "oil-level", label: "Oil level", type: "pass_fail" as const }],
  companyId,
  createdAt: "2026-08-11T00:00:00.000Z",
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewInspectionPage />
    </QueryClientProvider>,
  );
}

async function chooseInspection() {
  await screen.findByRole("option", { name: "Boiler pump" });
  await userEvent.selectOptions(screen.getByLabelText("Asset"), assetId);
  await userEvent.selectOptions(screen.getByLabelText("Template"), templateId);
}

describe("new inspection interaction correctness", () => {
  beforeEach(() => {
    assetPage
      .mockReset()
      .mockResolvedValue({ items: [asset], page: 1, pageSize: 50, total: 1 });
    assetGet.mockReset().mockResolvedValue(asset);
    templatePage.mockReset().mockResolvedValue({
      items: [template],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    submitInspection.mockReset();
    push.mockReset();
    searchParamGet.mockReset().mockReturnValue(null);
    useAuthStore.setState({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "tech@example.test",
        firstName: "Tech",
        lastName: "Nician",
        role: "technician",
        companyId,
        mustChangePassword: false,
      },
      accessToken: "token",
      status: "authenticated",
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps required async selects on explicit placeholders", async () => {
    renderPage();

    await screen.findByRole("option", { name: "Boiler pump" });
    expect(screen.getByLabelText("Asset")).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "Select an asset…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Template")).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "Select a template…" }),
    ).toBeDisabled();
  });

  it("preselects the asset requested by the asset-detail inspection action", async () => {
    searchParamGet.mockImplementation((key: string) =>
      key === "assetId" ? assetId : null,
    );
    assetPage.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    renderPage();

    await screen.findByRole("option", { name: "Boiler pump" });
    expect(screen.getByLabelText("Asset")).toHaveValue(assetId);
  });

  it("exposes the selected checklist result through pressed semantics", async () => {
    renderPage();
    await chooseInspection();

    const result = screen.getByRole("group", { name: "Result for Oil level" });
    const pass = screen.getByRole("button", { name: "Pass" });
    expect(result).toContainElement(pass);
    expect(pass).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(pass);
    expect(pass).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Fail" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("allows only one inspection request while submission is pending", async () => {
    let resolveSubmit!: (value: unknown) => void;
    submitInspection.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    renderPage();
    await chooseInspection();
    await userEvent.click(screen.getByRole("button", { name: "Pass" }));

    const submit = screen.getByRole("button", { name: "Submit inspection" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(submitInspection).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();

    await act(async () => {
      resolveSubmit({
        id: inspectionId,
        assetId,
        templateId,
        templateVersion: 1,
        templateSnapshot: { name: template.name, items: template.items },
        results: [{ itemId: "oil-level", value: "pass" }],
        passed: true,
        notes: null,
        inspectedById: "00000000-0000-4000-8000-000000000001",
        companyId,
        createdAt: "2026-08-11T00:00:00.000Z",
      });
    });
    await waitFor(() =>
      expect(screen.getByText(/Inspection saved/)).toBeInTheDocument(),
    );
  });

  it("cancels the delayed success redirect when the page is left", async () => {
    submitInspection.mockResolvedValue({
      id: inspectionId,
      assetId,
      templateId,
      templateVersion: 1,
      templateSnapshot: { name: template.name, items: template.items },
      results: [{ itemId: "oil-level", value: "pass" }],
      passed: true,
      notes: null,
      inspectedById: "00000000-0000-4000-8000-000000000001",
      companyId,
      createdAt: "2026-08-11T00:00:00.000Z",
    });
    const view = renderPage();
    await chooseInspection();
    await userEvent.click(screen.getByRole("button", { name: "Pass" }));
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Submit inspection" }));
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();
    act(() => vi.advanceTimersByTime(1500));

    expect(push).not.toHaveBeenCalled();
  });
});
