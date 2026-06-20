"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUserRequestSchema } from "@iam/shared";
import type { CreateUserRequest, UserResponse, UserRole } from "@iam/shared";
import { usersApi } from "@/lib/api/reference";
import { useAuth } from "@/lib/auth/hooks";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Modal } from "@/components/modal";
import { DataTable, type DataTableColumn } from "@/components/data-table";

const ROLES: UserRole[] = ["admin", "manager", "technician", "viewer"];

export default function UsersPage() {
  const router = useRouter();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
  });

  // Client guard mirrors the backend RolesGuard (admin/manager). The server is
  // the real gate; this just avoids rendering a 403 page for non-admins.
  useEffect(() => {
    if (me && me.role !== "admin" && me.role !== "manager") {
      router.replace("/dashboard");
    }
  }, [me, router]);

  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const form = useForm<CreateUserRequest>({
    resolver: zodResolver(createUserRequestSchema),
    defaultValues: { email: "", firstName: "", lastName: "", role: "viewer", password: "" },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateUserRequest) => usersApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setModalOpen(false);
    },
    onError: (e: unknown) => {
      const status = (e as { status?: number }).status;
      setErrorMsg(status === 409 ? "Email already registered." : (e as Error).message);
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => usersApi.changeRole(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  function openNew() {
    form.reset({ email: "", firstName: "", lastName: "", role: "viewer", password: "" });
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
          defaultValue={row.role}
          disabled={me?.role !== "admin" || row.id === me?.id}
          onChange={(e) => roleMutation.mutate({ id: row.id, role: e.target.value as UserRole })}
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
        <Button onClick={openNew}>New user</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable columns={columns} rows={data ?? []} empty="No users yet." />}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New user">
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="flex flex-col gap-4">
          <FormField id="email" label="Email" type="email" error={form.formState.errors.email?.message} {...form.register("email")} />
          <div className="flex gap-3">
            <FormField id="firstName" label="First name" error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
            <FormField id="lastName" label="Last name" error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
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
              {ROLES.map((r) => (
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
          {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
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
