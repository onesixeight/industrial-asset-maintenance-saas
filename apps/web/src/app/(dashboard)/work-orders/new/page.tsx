"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { SearchableSelect } from "@/components/searchable-select";

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
  const [assetSearch, setAssetSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const debouncedAssetSearch = useDebouncedValue(assetSearch);
  const debouncedAssigneeSearch = useDebouncedValue(assigneeSearch);
  const { user } = useAuth();
  const mayCreate = can(user?.role, "createWorkOrder");

  const assets = useQuery({
    queryKey: ["assets", "selector", debouncedAssetSearch],
    queryFn: ({ signal }) =>
      assetsApi.page(
        { search: debouncedAssetSearch || undefined },
        { page: 1, pageSize: 50 },
        signal,
      ),
    placeholderData: (previous) => previous,
    enabled: mayCreate,
  });
  const users = useQuery({
    queryKey: ["users", "selector", debouncedAssigneeSearch],
    queryFn: ({ signal }) =>
      usersApi.page(
        { page: 1, pageSize: 50 },
        signal,
        debouncedAssigneeSearch || undefined,
      ),
    placeholderData: (previous) => previous,
    enabled: mayCreate,
  });

  const form = useForm<CreateWorkOrderRequest>({
    resolver: zodResolver(createWorkOrderRequestSchema) as never,
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
  const selectedAssetId = useWatch({ control: form.control, name: "assetId" });
  const selectedAssigneeId = useWatch({
    control: form.control,
    name: "assignedToId",
  });

  async function onSubmit(values: CreateWorkOrderRequest) {
    setErrorMsg(null);
    try {
      const created = await workOrdersApi.create(values);
      router.push(`/work-orders/${created.id}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 400 ? "Invalid asset or assignee." : (e as Error).message,
      );
    }
  }

  if (!mayCreate) {
    return (
      <QueryState
        error={Object.assign(new Error("Forbidden"), { status: 403 })}
      >
        content
      </QueryState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">New work order</h1>
      <QueryState
        isLoading={assets.isLoading || users.isLoading}
        error={assets.error ?? users.error}
        onRetry={() => {
          void assets.refetch();
          void users.refetch();
        }}
      >
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-w-lg flex-col gap-4"
        >
          <FormField
            id="title"
            label="Title"
            error={form.formState.errors.title?.message}
            {...form.register("title")}
          />
          <FormField
            id="description"
            label="Description (optional)"
            error={form.formState.errors.description?.message}
            {...form.register("description")}
          />
          <Select
            id="type"
            label="Type"
            {...form.register("type")}
            options={TYPES}
          />
          <Select
            id="priority"
            label="Priority"
            {...form.register("priority")}
            options={PRIORITIES}
          />
          <SearchableSelect
            id="assetId"
            label="Asset"
            searchLabel="Search assets"
            searchValue={assetSearch}
            onSearchChange={setAssetSearch}
            required
            placeholder="Select an asset…"
            error={form.formState.errors.assetId?.message}
            {...form.register("assetId")}
            value={selectedAssetId}
            options={(assets.data?.items ?? []).map((a) => ({
              value: a.id,
              label: a.name,
            }))}
          />
          <SearchableSelect
            id="assignedToId"
            label="Assignee (optional)"
            searchLabel="Search assignees"
            searchValue={assigneeSearch}
            onSearchChange={setAssigneeSearch}
            {...form.register("assignedToId" as never)}
            value={selectedAssigneeId ?? ""}
            options={[
              { value: "", label: "Unassigned" },
              ...(users.data?.items ?? []).map((u) => ({
                value: u.id,
                label: u.email,
              })),
            ]}
          />
          <FormField
            id="dueDate"
            label="Due date (optional)"
            type="date"
            error={form.formState.errors.dueDate?.message}
            {...form.register("dueDate")}
          />
          {errorMsg ? (
            <p className="text-sm text-destructive">{errorMsg}</p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/work-orders")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </QueryState>
    </div>
  );
}
