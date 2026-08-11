// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserResponse } from "@iam/shared";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import UsersPage from "./page";

const { usersPage, changeRole, replace } = vi.hoisted(() => ({
  usersPage: vi.fn(),
  changeRole: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/users",
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/api/reference", () => ({
  usersApi: {
    page: usersPage,
    changeRole,
    create: vi.fn(),
  },
}));

const companyId = "00000000-0000-4000-8000-000000000010";
const admin = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.test",
  firstName: "Ada",
  lastName: "Min",
  role: "admin" as const,
  companyId,
  mustChangePassword: false,
};
const worker = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "worker@example.test",
  firstName: "View",
  lastName: "Er",
  role: "viewer" as const,
  companyId,
  mustChangePassword: false,
};
const technician = {
  ...worker,
  id: "00000000-0000-4000-8000-000000000003",
  email: "tech@example.test",
  firstName: "Tech",
  lastName: "Nician",
  role: "technician" as const,
};

describe("user role updates", () => {
  beforeEach(() => {
    usersPage
      .mockReset()
      .mockResolvedValue({ items: [worker], page: 1, pageSize: 20, total: 1 });
    changeRole.mockReset();
    replace.mockReset();
    useAuthStore.setState({
      user: admin,
      accessToken: "token",
      status: "authenticated",
    });
  });

  afterEach(cleanup);

  it("optimistically updates a controlled role and rolls it back on failure", async () => {
    let rejectRole!: (reason: Error) => void;
    changeRole.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRole = reject;
        }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <UsersPage />
      </QueryClientProvider>,
    );

    const role = await screen.findByRole("combobox", {
      name: "Role for worker@example.test",
    });
    await userEvent.selectOptions(role, "manager");
    expect(role).toHaveValue("manager");

    await act(async () => rejectRole(new Error("Network unavailable")));

    await waitFor(() => expect(role).toHaveValue("viewer"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not update worker@example.test's role",
    );
  });

  it("does not undo another user's concurrent optimistic role change", async () => {
    let rejectWorker!: (reason: Error) => void;
    let resolveTechnician!: (value: UserResponse) => void;
    usersPage.mockReset();
    usersPage.mockImplementationOnce(async () => ({
      items: [worker, technician],
      page: 1,
      pageSize: 20,
      total: 2,
    }));
    usersPage.mockImplementation(() => new Promise(() => undefined));
    changeRole.mockImplementation((id: string) =>
      id === worker.id
        ? new Promise((_resolve, reject) => {
            rejectWorker = reject;
          })
        : new Promise((resolve) => {
            resolveTechnician = resolve;
          }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <UsersPage />
      </QueryClientProvider>,
    );

    const workerRole = await screen.findByRole("combobox", {
      name: "Role for worker@example.test",
    });
    const technicianRole = screen.getByRole("combobox", {
      name: "Role for tech@example.test",
    });
    await userEvent.selectOptions(workerRole, "manager");
    await userEvent.selectOptions(technicianRole, "viewer");
    expect(workerRole).toHaveValue("manager");
    expect(technicianRole).toHaveValue("viewer");

    await act(async () => resolveTechnician({ ...technician, role: "viewer" }));
    await act(async () => rejectWorker(new Error("Network unavailable")));

    await waitFor(() => expect(workerRole).toHaveValue("viewer"));
    expect(technicianRole).toHaveValue("viewer");
  });
});
