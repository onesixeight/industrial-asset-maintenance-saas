"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { InspectionResponse } from "@iam/shared";
import { inspectionsApi } from "@/lib/api/inspections";
import { assetsApi } from "@/lib/api/assets";
import { templatesApi } from "@/lib/api/inspections";
import { fmtDate } from "@/lib/format";
import { buttonClassName } from "@/components/button";
import { Select } from "@/components/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PassedBadge } from "@/components/passed-badge";
import { QueryState } from "@/components/query-state";
import { can } from "@/lib/auth/capabilities";
import { useAuth } from "@/lib/auth/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { SearchableSelect } from "@/components/searchable-select";

const PAGE_SIZE = 20;

const PASSED_FILTER = [
  { value: "", label: "All" },
  { value: "true", label: "Passed" },
  { value: "false", label: "Failed" },
];

export default function InspectionsPage() {
  const [assetId, setAssetId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [passed, setPassed] = useState("");
  const [page, setPage] = useState(1);
  const debouncedAssetSearch = useDebouncedValue(assetSearch);
  const debouncedTemplateSearch = useDebouncedValue(templateSearch);
  const { user } = useAuth();

  const assetsQuery = useQuery({
    queryKey: ["assets", "selector", debouncedAssetSearch],
    queryFn: ({ signal }) =>
      assetsApi.page(
        { search: debouncedAssetSearch || undefined },
        { page: 1, pageSize: 50 },
        signal,
      ),
  });
  const templatesQuery = useQuery({
    queryKey: ["templates", "selector", debouncedTemplateSearch],
    queryFn: ({ signal }) =>
      templatesApi.page(
        debouncedTemplateSearch || undefined,
        { page: 1, pageSize: 50 },
        signal,
      ),
  });
  const assets = assetsQuery.data?.items;
  const templates = templatesQuery.data?.items;

  const query = useQuery({
    queryKey: ["inspections", assetId, templateId, passed, page],
    queryFn: ({ signal }) =>
      inspectionsApi.page(
        {
          assetId: assetId || undefined,
          templateId: templateId || undefined,
          passed: passed === "" ? undefined : passed === "true",
        },
        { page, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  const assetName = (id: string) =>
    assets?.find((a) => a.id === id)?.name ?? id;
  const tplName = (id: string) =>
    templates?.find((t) => t.id === id)?.name ?? id;

  const columns: DataTableColumn<InspectionResponse>[] = [
    { key: "asset", header: "Asset", render: (r) => assetName(r.assetId) },
    {
      key: "template",
      header: "Template",
      render: (r) => tplName(r.templateId),
    },
    {
      key: "passed",
      header: "Result",
      render: (r) => <PassedBadge passed={r.passed} />,
    },
    { key: "createdAt", header: "Date", render: (r) => fmtDate(r.createdAt) },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link
          href={`/inspections/${row.id}`}
          className="text-sm font-medium underline"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inspections</h1>
        {can(user?.role, "submitInspection") ? (
          <Link href="/inspections/new" className={buttonClassName()}>
            New inspection
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchableSelect
          label=""
          searchLabel="Search assets for inspection filter"
          searchValue={assetSearch}
          onSearchChange={setAssetSearch}
          aria-label="Filter by asset"
          id="asset"
          value={assetId}
          onChange={(e) => {
            setAssetId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All assets" },
            ...(assets ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <SearchableSelect
          label=""
          searchLabel="Search templates for inspection filter"
          searchValue={templateSearch}
          onSearchChange={setTemplateSearch}
          aria-label="Filter by inspection template"
          id="template"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All templates" },
            ...(templates ?? []).map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Select
          label=""
          aria-label="Filter by inspection result"
          id="passed"
          value={passed}
          onChange={(e) => {
            setPassed(e.target.value);
            setPage(1);
          }}
          options={PASSED_FILTER}
        />
      </div>

      {assetsQuery.error || templatesQuery.error ? (
        <p role="alert" className="text-sm text-destructive">
          Some inspection filters are unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void assetsQuery.refetch();
              void templatesQuery.refetch();
            }}
          >
            Retry
          </button>
        </p>
      ) : null}

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        isEmpty={query.data?.total === 0}
        emptyMessage="No inspections yet."
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
    </div>
  );
}
