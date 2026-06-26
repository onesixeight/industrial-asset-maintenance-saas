"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { templatesApi } from "@/lib/api/inspections";
import { useAuth } from "@/lib/auth/hooks";
import { fmtDate } from "@/lib/format";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Modal } from "@/components/modal";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import type { TemplateResponse } from "@iam/shared";

export default function TemplatesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isManager = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (user && !isManager) router.replace("/dashboard");
  }, [user, isManager, router]);

  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => templatesApi.list() });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateResponse | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, items: items.filter(Boolean).map((label) => ({ label })) };
      if (editing) return templatesApi.update(editing.id, payload);
      return templatesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setModalOpen(false);
    },
    onError: (e: unknown) => setErrorMsg((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  function openNew() {
    setEditing(null);
    setName("");
    setItems([""]);
    setErrorMsg(null);
    setModalOpen(true);
  }

  function openEdit(tpl: TemplateResponse) {
    setEditing(tpl);
    setName(tpl.name);
    setItems(tpl.items.map((i) => i.label));
    setErrorMsg(null);
    setModalOpen(true);
  }

  async function onDelete(tpl: TemplateResponse) {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(tpl.id);
    } catch (e) {
      const status = (e as { status?: number }).status;
      alert(status === 409 ? "Template has submitted inspections; cannot delete." : "Could not delete.");
    }
  }

  const columns: DataTableColumn<TemplateResponse>[] = [
    { key: "name", header: "Name" },
    { key: "items", header: "Items", render: (r) => String(r.items.length) },
    { key: "createdAt", header: "Created", render: (r) => fmtDate(r.createdAt) },
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

  if (!isManager) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inspection templates</h1>
        <Button onClick={openNew}>New template</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable columns={columns} rows={data ?? []} empty="No templates yet." />}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit template" : "New template"}>
        <div className="flex flex-col gap-4">
          <FormField
            id="name"
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Checklist items</label>
            {items.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={item}
                  onChange={(e) => setItems((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  className="h-10 flex-1 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder={`Item ${i + 1}`}
                />
                {items.length > 1 ? (
                  <Button variant="ghost" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
                    ✕
                  </Button>
                ) : null}
              </div>
            ))}
            <Button variant="ghost" onClick={() => setItems((prev) => [...prev, ""])}>
              + Add item
            </Button>
          </div>
          {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name || items.every((i) => !i)}>
            {editing ? "Save" : "Create"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
