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

export default function NewAssetPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => locationsApi.list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });

  const form = useForm<CreateAssetRequest>({
    resolver: zodResolver(createAssetRequestSchema),
    defaultValues: { name: "", description: "", serialNumber: "", locationId: "", categoryId: "" } as never,
  });

  async function onSubmit(values: CreateAssetRequest) {
    setErrorMsg(null);
    try {
      const created = await assetsApi.create(values);
      router.push(`/assets/${created.id}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(status === 400 ? "Invalid location or category." : (e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">New asset</h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4">
        <FormField id="name" label="Name" error={form.formState.errors.name?.message} {...form.register("name")} />
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
        <Select
          id="locationId"
          label="Location"
          error={form.formState.errors.locationId?.message}
          {...form.register("locationId")}
          options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
        />
        <Select
          id="categoryId"
          label="Category"
          error={form.formState.errors.categoryId?.message}
          {...form.register("categoryId")}
          options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
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
        {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Create
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/assets")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
