"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { InspectionResult, TemplateItemResponse } from "@iam/shared";
import { assetsApi } from "@/lib/api/assets";
import { templatesApi, inspectionsApi } from "@/lib/api/inspections";
import { Button } from "@/components/button";
import { Select } from "@/components/select";

export default function NewInspectionPage() {
  const router = useRouter();
  const [assetId, setAssetId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [results, setResults] = useState<Record<string, "pass" | "fail">>({});
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ passed: boolean } | null>(null);

  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesApi.list() });

  const selectedTemplate = templates?.find((t) => t.id === templateId);
  const items: TemplateItemResponse[] = selectedTemplate?.items ?? [];

  function setItem(itemId: string, value: "pass" | "fail") {
    setResults((prev) => ({ ...prev, [itemId]: value }));
  }

  const allAnswered = items.length > 0 && items.every((it) => results[it.id]);

  async function onSubmit() {
    setErrorMsg(null);
    setSubmitted(null);
    try {
      const formattedResults: InspectionResult[] = items.map((it) => ({
        itemId: it.id,
        value: results[it.id],
      }));
      const res = await inspectionsApi.submit({ assetId, templateId, results: formattedResults, notes: notes || undefined });
      setSubmitted({ passed: res.passed });
      setTimeout(() => router.push(`/inspections/${res.id}`), 1500);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(status === 400 ? "Checklist incomplete or invalid." : status === 404 ? "Asset or template not found." : (e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">New inspection</h1>

      <div className="flex max-w-lg flex-col gap-4">
        <Select
          id="assetId"
          label="Asset"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          options={(assets ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
        <Select
          id="templateId"
          label="Template"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            setResults({});
          }}
          options={(templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Checklist</h2>
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3">
              <span className="text-sm">{it.label}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={results[it.id] === "pass" ? "default" : "ghost"}
                  onClick={() => setItem(it.id, "pass")}
                >
                  Pass
                </Button>
                <Button
                  type="button"
                  variant={results[it.id] === "fail" ? "destructive" : "ghost"}
                  onClick={() => setItem(it.id, "fail")}
                >
                  Fail
                </Button>
              </div>
            </div>
          ))}
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2 min-h-20 rounded-[var(--radius)] border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
          {submitted ? (
            <p className={`text-sm font-medium ${submitted.passed ? "text-green-700" : "text-destructive"}`}>
              Inspection saved — {submitted.passed ? "PASSED" : "FAILED"}. Redirecting…
            </p>
          ) : null}
          <Button onClick={onSubmit} disabled={!allAnswered || !assetId || !templateId}>
            Submit inspection
          </Button>
        </div>
      ) : null}
    </div>
  );
}
