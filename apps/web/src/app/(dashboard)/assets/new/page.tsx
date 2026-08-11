"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createAssetRequestSchema } from "@iam/shared";
import type { CreateAssetRequest } from "@iam/shared";
import { assetsApi } from "@/lib/api/assets";
import { locationsApi } from "@/lib/api/reference";
import { categoriesApi } from "@/lib/api/reference";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Select } from "@/components/select";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export default function NewAssetPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locationSearch, setLocationSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const debouncedLocationSearch = useDebouncedValue(locationSearch);
  const debouncedCategorySearch = useDebouncedValue(categorySearch);
  const { user } = useAuth();
  const mayCreate = can(user?.role, "createAsset");

  const locations = useQuery({
    queryKey: ["locations", "selector", debouncedLocationSearch],
    queryFn: ({ signal }) =>
      locationsApi.page(
        debouncedLocationSearch || undefined,
        { page: 1, pageSize: 50 },
        signal,
      ),
    enabled: mayCreate,
  });
  const categories = useQuery({
    queryKey: ["categories", "selector", debouncedCategorySearch],
    queryFn: ({ signal }) =>
      categoriesApi.page(
        debouncedCategorySearch || undefined,
        { page: 1, pageSize: 50 },
        signal,
      ),
    enabled: mayCreate,
  });

  const form = useForm<CreateAssetRequest>({
    resolver: zodResolver(createAssetRequestSchema) as never,
    defaultValues: {
      name: "",
      description: "",
      serialNumber: "",
      locationId: "",
      categoryId: "",
    } as never,
  });

  async function onSubmit(values: CreateAssetRequest) {
    setErrorMsg(null);
    try {
      const created = await assetsApi.create(values);
      router.push(`/assets/${created.id}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 400 ? "Invalid location or category." : (e as Error).message,
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
      <h1 className="text-2xl font-bold">New asset</h1>
      <QueryState
        isLoading={locations.isLoading || categories.isLoading}
        error={locations.error ?? categories.error}
        onRetry={() => {
          void locations.refetch();
          void categories.refetch();
        }}
      >
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-w-lg flex-col gap-4"
        >
          <FormField
            id="name"
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <FormField
            id="serialNumber"
            label="Serial number (optional)"
            error={form.formState.errors.serialNumber?.message}
            {...form.register("serialNumber")}
          />
          <FormField
            id="description"
            label="Description (optional)"
            error={form.formState.errors.description?.message}
            {...form.register("description")}
          />
          <FormField
            id="locationSearch"
            label="Search locations"
            value={locationSearch}
            onChange={(e) => setLocationSearch(e.target.value)}
          />
          <Select
            id="locationId"
            label="Location"
            required
            placeholder="Select a location…"
            error={form.formState.errors.locationId?.message}
            {...form.register("locationId")}
            options={(locations.data?.items ?? []).map((l) => ({
              value: l.id,
              label: l.name,
            }))}
          />
          <FormField
            id="categorySearch"
            label="Search categories"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
          />
          <Select
            id="categoryId"
            label="Category"
            required
            placeholder="Select a category…"
            error={form.formState.errors.categoryId?.message}
            {...form.register("categoryId")}
            options={(categories.data?.items ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
          <FormField
            id="purchaseDate"
            label="Purchase date (optional)"
            type="date"
            error={form.formState.errors.purchaseDate?.message}
            {...form.register("purchaseDate")}
          />
          <FormField
            id="warrantyDate"
            label="Warranty date (optional)"
            type="date"
            error={form.formState.errors.warrantyDate?.message}
            {...form.register("warrantyDate")}
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
              onClick={() => router.push("/assets")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </QueryState>
    </div>
  );
}
