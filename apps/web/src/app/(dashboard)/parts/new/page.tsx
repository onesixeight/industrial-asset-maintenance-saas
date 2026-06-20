"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { partsApi } from "@/lib/api/parts";
import { Button } from "@/components/button";

export default function NewPartPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit() {
    setErrorMsg(null);
    try {
      await partsApi.create({
        name,
        sku,
        description: description || undefined,
        quantity: Number(quantity),
        minQuantity: Number(minQuantity),
      });
      router.push("/parts");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErrorMsg(
        status === 409
          ? "SKU already exists in this company."
          : status === 403
            ? "Only managers/admins can create parts."
            : (e as Error).message,
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">New part</h1>

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
          <span>Description (optional)</span>
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
        <Button onClick={onSubmit} disabled={!name || !sku}>
          Create part
        </Button>
      </div>
    </div>
  );
}
