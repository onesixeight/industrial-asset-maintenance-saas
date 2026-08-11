"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUserRequestSchema } from "@iam/shared";
import type {
  CreateUserRequest,
  PaginatedResponse,
  UserResponse,
  UserRole,
} from "@iam/shared";
import { usersApi } from "@/lib/api/reference";
import { useAuth } from "@/lib/auth/hooks";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Modal } from "@/components/modal";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { QueryState } from "@/components/query-state";
import { can, creatableRoles } from "@/lib/auth/capabilities";

const ROLES: UserRole[] = ["admin", "manager", "technician", "viewer"];
const PAGE_SIZE = 20;

export default function UsersPage() {
  const router = useRouter();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["users", page],
    queryFn: ({ signal }) =>
      usersApi.page({ page, pageSize: PAGE_SIZE }, signal),
    enabled: can(me?.role, "createUser"),
  });
  const createRoles = creatableRoles(me?.role);

  // Client guard mirrors the backend RolesGuard (admin/manager). The server is
  // the real gate; this just avoids rendering a 403 page for non-admins.
  useEffect(() => {
    if (me && me.role !== "admin" && me.role !== "manager") {
      router.replace("/dashboard");
    }
  }, [me, router]);

  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [pendingRoleIds, setPendingRoleIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const form = useForm<CreateUserRequest>({
    resolver: zodResolver(createUserRequestSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "viewer",
      password: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateUserRequest) => usersApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setModalOpen(false);
    },
    onError: (e: unknown) => {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 409 ? "Email already registered." : (e as Error).message,
      );
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      usersApi.changeRole(id, { role }),
    onMutate: async ({ id, role }) => {
      setRoleError(null);
      setPendingRoleIds((current) => new Set(current).add(id));
      await qc.cancelQueries({ queryKey: ["users"] });
      const cachedPages = qc.getQueriesData<PaginatedResponse<UserResponse>>({
        queryKey: ["users"],
      });
      const previousUser = cachedPages
        .flatMap(([, data]) => data?.items ?? [])
        .find((candidate) => candidate.id === id);
      qc.setQueriesData<PaginatedResponse<UserResponse>>(
        { queryKey: ["users"] },
        (data) =>
          data
            ? {
                ...data,
                items: data.items.map((candidate) =>
                  candidate.id === id ? { ...candidate, role } : candidate,
                ),
              }
            : data,
      );
      return {
        id,
        previousRole: previousUser?.role,
        email: previousUser?.email ?? "user",
      };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousRole) {
        qc.setQueriesData<PaginatedResponse<UserResponse>>(
          { queryKey: ["users"] },
          (data) =>
            data
              ? {
                  ...data,
                  items: data.items.map((candidate) =>
                    candidate.id === context.id
                      ? { ...candidate, role: context.previousRole as UserRole }
                      : candidate,
                  ),
                }
              : data,
        );
      }
      setRoleError(
        `Could not update ${context?.email ?? "the user"}'s role. Please try again.`,
      );
    },
    onSettled: (_data, _error, variables) => {
      setPendingRoleIds((current) => {
        const next = new Set(current);
        next.delete(variables.id);
        return next;
      });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function openNew() {
    form.reset({
      email: "",
      firstName: "",
      lastName: "",
      role: "viewer",
      password: "",
    });
    setErrorMsg(null);
    setModalOpen(true);
  }

  const columns: DataTableColumn<UserResponse>[] = [
    { key: "email", header: "Email" },
    { key: "firstName", header: "First name" },
    { key: "lastName", header: "Last name" },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <select
          aria-label={`Role for ${row.email}`}
          value={row.role}
          disabled={
            !can(me?.role, "changeUserRole") ||
            row.id === me?.id ||
            pendingRoleIds.has(row.id)
          }
          onChange={(e) =>
            roleMutation.mutate({
              id: row.id,
              role: e.target.value as UserRole,
            })
          }
          className="h-8 rounded-[var(--radius)] border border-input bg-background px-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "mustChangePassword",
      header: "Status",
      render: (r) => (r.mustChangePassword ? "Temp password" : "Active"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        {can(me?.role, "createUser") ? (
          <Button onClick={openNew}>New user</Button>
        ) : null}
      </div>
      {roleError ? (
        <p role="alert" className="text-sm text-destructive">
          {roleError}
        </p>
      ) : null}
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        isEmpty={query.data?.total === 0}
        emptyMessage="No users yet."
      >
        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          page={page}
          pageSize={PAGE_SIZE}
          total={query.data?.total ?? 0}
          onPageChange={setPage}
        />
      </QueryState>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New user"
      >
        <form
          onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
          className="flex flex-col gap-4"
        >
          <FormField
            id="email"
            label="Email"
            type="email"
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <div className="flex gap-3">
            <FormField
              id="firstName"
              label="First name"
              error={form.formState.errors.firstName?.message}
              {...form.register("firstName")}
            />
            <FormField
              id="lastName"
              label="Last name"
              error={form.formState.errors.lastName?.message}
              {...form.register("lastName")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="role"
              {...form.register("role")}
              className="h-10 rounded-[var(--radius)] border border-input bg-background px-3 text-sm"
            >
              {createRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <FormField
            id="password"
            label="Temporary password"
            type="password"
            error={form.formState.errors.password?.message}
            {...form.register("password")}
          />
          {errorMsg ? (
            <p className="text-sm text-destructive">{errorMsg}</p>
          ) : null}
          <Button type="submit" disabled={createMutation.isPending}>
            Create
          </Button>
          <p className="text-xs text-muted-foreground">
            The user must change this password on first login.
          </p>
        </form>
      </Modal>
    </div>
  );
}
