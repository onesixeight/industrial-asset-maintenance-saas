"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { InspectionResult, TemplateItemResponse } from "@iam/shared";
import { assetsApi } from "@/lib/api/assets";
import { templatesApi, inspectionsApi } from "@/lib/api/inspections";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { FormField } from "@/components/form-field";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NewInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAssetId = searchParams.get("assetId") ?? "";
  const initialAssetId = UUID_PATTERN.test(requestedAssetId)
    ? requestedAssetId
    : "";
  const [assetId, setAssetId] = useState(initialAssetId);
  const [templateId, setTemplateId] = useState("");
  const [results, setResults] = useState<Record<string, "pass" | "fail">>({});
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ passed: boolean } | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const redirectTimer = useRef<number | null>(null);
  const debouncedAssetSearch = useDebouncedValue(assetSearch);
  const debouncedTemplateSearch = useDebouncedValue(templateSearch);
  const { user } = useAuth();
  const maySubmit = can(user?.role, "submitInspection");

  useEffect(
    () => () => {
      if (redirectTimer.current !== null)
        window.clearTimeout(redirectTimer.current);
    },
    [],
  );

  const assets = useQuery({
    queryKey: ["assets", "selector", debouncedAssetSearch],
    queryFn: ({ signal }) =>
      assetsApi.page(
        { search: debouncedAssetSearch || undefined },
        { page: 1, pageSize: 50 },
        signal,
      ),
    enabled: maySubmit,
  });
  const requestedAsset = useQuery({
    queryKey: ["asset", initialAssetId],
    queryFn: ({ signal }) => assetsApi.get(initialAssetId, signal),
    enabled: maySubmit && !!initialAssetId,
  });
  const templates = useQuery({
    queryKey: ["templates", "selector", debouncedTemplateSearch],
    queryFn: ({ signal }) =>
      templatesApi.page(
        debouncedTemplateSearch || undefined,
        { page: 1, pageSize: 50 },
        signal,
      ),
    enabled: maySubmit,
  });

  const selectedTemplate = templates.data?.items.find(
    (t) => t.id === templateId,
  );
  const items: TemplateItemResponse[] = selectedTemplate?.items ?? [];
  const assetOptions = requestedAsset.data
    ? [
        requestedAsset.data,
        ...(assets.data?.items ?? []).filter(
          (asset) => asset.id !== requestedAsset.data?.id,
        ),
      ]
    : (assets.data?.items ?? []);

  function setItem(itemId: string, value: "pass" | "fail") {
    setResults((prev) => ({ ...prev, [itemId]: value }));
  }

  const allAnswered = items.length > 0 && items.every((it) => results[it.id]);

  async function onSubmit() {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setIsSubmitting(true);
    setErrorMsg(null);
    setSubmitted(null);
    try {
      const formattedResults: InspectionResult[] = items.map((it) => ({
        itemId: it.id,
        value: results[it.id],
      }));
      const res = await inspectionsApi.submit({
        assetId,
        templateId,
        results: formattedResults,
        notes: notes || undefined,
      });
      setSubmitted({ passed: res.passed });
      redirectTimer.current = window.setTimeout(
        () => router.push(`/inspections/${res.id}`),
        1500,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 400
          ? "Checklist incomplete or invalid."
          : status === 404
            ? "Asset or template not found."
            : (e as Error).message,
      );
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  if (!maySubmit) {
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
      <h1 className="text-2xl font-bold">New inspection</h1>

      <QueryState
        isLoading={
          assets.isLoading || templates.isLoading || requestedAsset.isLoading
        }
        error={assets.error ?? templates.error ?? requestedAsset.error}
        onRetry={() => {
          void assets.refetch();
          void templates.refetch();
          if (initialAssetId) void requestedAsset.refetch();
        }}
      >
        <div className="flex max-w-lg flex-col gap-4">
          <FormField
            id="assetSearch"
            label="Search assets"
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
          />
          <Select
            id="assetId"
            label="Asset"
            required
            placeholder="Select an asset…"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            options={assetOptions.map((a) => ({ value: a.id, label: a.name }))}
          />
          <FormField
            id="templateSearch"
            label="Search templates"
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
          />
          <Select
            id="templateId"
            label="Template"
            required
            placeholder="Select a template…"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setResults({});
            }}
            options={(templates.data?.items ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
          />
        </div>
      </QueryState>

      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Checklist</h2>
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3"
            >
              <span className="text-sm">{it.label}</span>
              <div
                className="flex gap-2"
                role="group"
                aria-label={`Result for ${it.label}`}
              >
                <Button
                  type="button"
                  aria-pressed={results[it.id] === "pass"}
                  variant={results[it.id] === "pass" ? "default" : "ghost"}
                  onClick={() => setItem(it.id, "pass")}
                >
                  Pass
                </Button>
                <Button
                  type="button"
                  aria-pressed={results[it.id] === "fail"}
                  variant={results[it.id] === "fail" ? "destructive" : "ghost"}
                  onClick={() => setItem(it.id, "fail")}
                >
                  Fail
                </Button>
              </div>
            </div>
          ))}
          <label
            htmlFor="inspection-notes"
            className="flex flex-col gap-1.5 text-sm font-medium"
          >
            Notes (optional)
            <textarea
              id="inspection-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 rounded-[var(--radius)] border border-input bg-background p-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {errorMsg ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMsg}
            </p>
          ) : null}
          {submitted ? (
            <p
              className={`text-sm font-medium ${submitted.passed ? "text-green-700" : "text-destructive"}`}
            >
              Inspection saved — {submitted.passed ? "PASSED" : "FAILED"}.
              Redirecting…
            </p>
          ) : null}
          <Button
            onClick={onSubmit}
            disabled={
              !allAnswered ||
              !assetId ||
              !templateId ||
              isSubmitting ||
              !!submitted
            }
          >
            {isSubmitting ? "Submitting…" : "Submit inspection"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
