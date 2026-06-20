"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoryRequestSchema } from "@iam/shared";
import type { CategoryRequest, CategoryResponse } from "@iam/shared";
import { categoriesApi } from "@/lib/api/reference";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Modal } from "@/components/modal";
import { DataTable, type DataTableColumn } from "@/components/data-table";

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.list(),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const form = useForm<CategoryRequest>({
    resolver: zodResolver(categoryRequestSchema),
    defaultValues: { name: "", description: "" },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: CategoryRequest) => {
      if (editing) return categoriesApi.update(editing.id, input);
      return categoriesApi.create(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setModalOpen(false);
    },
    onError: (e: unknown) => setErrorMsg((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  function openNew() {
    setEditing(null);
    form.reset({ name: "", description: "" });
    setErrorMsg(null);
    setModalOpen(true);
  }

  function openEdit(row: CategoryResponse) {
    setEditing(row);
    form.reset({ name: row.name, description: row.description ?? "" });
    setErrorMsg(null);
    setModalOpen(true);
  }

  async function onDelete(row: CategoryResponse) {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(row.id);
    } catch (e) {
      const status = (e as { status?: number }).status;
      alert(status === 409 ? "Has assets; remove them first." : "Could not delete.");
    }
  }

  const columns: DataTableColumn<CategoryResponse>[] = [
    { key: "name", header: "Name" },
    { key: "description", header: "Description", render: (r) => r.description ?? "—" },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button variant="destructive" onClick={() => onDelete(row)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={openNew}>New category</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable columns={columns} rows={data ?? []} empty="No categories yet." />}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit category" : "New category"}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="flex flex-col gap-4">
          <FormField id="name" label="Name" error={form.formState.errors.name?.message} {...form.register("name")} />
          <FormField id="description" label="Description (optional)" error={form.formState.errors.description?.message} {...form.register("description")} />
          {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
          <Button type="submit" disabled={saveMutation.isPending}>
            {editing ? "Save" : "Create"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
