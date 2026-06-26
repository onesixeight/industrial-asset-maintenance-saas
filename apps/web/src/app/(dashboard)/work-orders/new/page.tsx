"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createWorkOrderRequestSchema } from "@iam/shared";
import type { CreateWorkOrderRequest } from "@iam/shared";
import { workOrdersApi } from "@/lib/api/work-orders";
import { assetsApi } from "@/lib/api/assets";
import { usersApi } from "@/lib/api/reference";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Select } from "@/components/select";

const TYPES = [
  { value: "preventive", label: "Preventive" },
  { value: "corrective", label: "Corrective" },
  { value: "inspection", label: "Inspection" },
];
const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list() });

  const form = useForm<CreateWorkOrderRequest>({
    resolver: zodResolver(createWorkOrderRequestSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "preventive",
      priority: "medium",
      assetId: "",
      assignedToId: null,
      dueDate: null,
    } as never,
  });

  async function onSubmit(values: CreateWorkOrderRequest) {
    setErrorMsg(null);
    try {
      const created = await workOrdersApi.create(values);
      router.push(`/work-orders/${created.id}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(status === 400 ? "Invalid asset or assignee." : (e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">New work order</h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4">
        <FormField id="title" label="Title" error={form.formState.errors.title?.message} {...form.register("title")} />
        <FormField
          id="description"
          label="Description (optional)"
          error={form.formState.errors.description?.message}
          {...form.register("description")}
        />
        <Select id="type" label="Type" {...form.register("type")} options={TYPES} />
        <Select id="priority" label="Priority" {...form.register("priority")} options={PRIORITIES} />
        <Select
          id="assetId"
          label="Asset"
          error={form.formState.errors.assetId?.message}
          {...form.register("assetId")}
          options={(assets ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
        <Select
          id="assignedToId"
          label="Assignee (optional)"
          {...form.register("assignedToId" as never)}
          options={[{ value: "", label: "Unassigned" }, ...(users ?? []).map((u) => ({ value: u.id, label: u.email }))]}
        />
        <FormField
          id="dueDate"
          label="Due date (optional)"
          type="date"
          error={form.formState.errors.dueDate?.message}
          {...form.register("dueDate")}
        />
        {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Create
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/work-orders")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
