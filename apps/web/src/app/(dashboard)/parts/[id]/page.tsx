"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { partsApi } from "@/lib/api/parts";
import { Button } from "@/components/button";

export default function EditPartPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: part, isLoading } = useQuery({
    queryKey: ["part", params.id],
    queryFn: () => partsApi.get(params.id),
  });

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Hydrate local form state once when the part loads. Done in an effect (not
  // during render) so we don't trigger React's render-during-render warning and
  // risk discarding in-flight edits on a fast re-render.
  useEffect(() => {
    if (part && !loaded) {
      setName(part.name);
      setSku(part.sku);
      setDescription(part.description ?? "");
      setQuantity(String(part.quantity));
      setMinQuantity(String(part.minQuantity));
      setLoaded(true);
    }
  }, [part, loaded]);

  async function onSave() {
    setErrorMsg(null);
    try {
      await partsApi.update(params.id, {
        name,
        sku,
        description: description || undefined,
        quantity: Number(quantity),
        minQuantity: Number(minQuantity),
      });
      await qc.invalidateQueries({ queryKey: ["parts"] });
      router.push("/parts");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 409
          ? "SKU already exists in this company."
          : status === 403
            ? "Only managers/admins can edit parts."
            : (e as Error).message,
      );
    }
  }

  async function onDelete() {
    setErrorMsg(null);
    try {
      await partsApi.remove(params.id);
      await qc.invalidateQueries({ queryKey: ["parts"] });
      router.push("/parts");
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  }

  if (isLoading || !part) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parts" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to parts
      </Link>
      <h1 className="text-2xl font-bold">Edit part</h1>

      <div className="flex max-w-lg flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>SKU</span>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-20 rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span>Quantity</span>
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span>Min quantity</span>
            <input
              type="number"
              min={0}
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              className="rounded-[var(--radius)] border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={!name || !sku}>
            Save
          </Button>
          <Button variant="ghost" onClick={() => router.push("/parts")}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
