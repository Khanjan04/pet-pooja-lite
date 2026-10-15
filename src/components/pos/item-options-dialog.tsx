"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Dialog } from "@/components/ui/feedback";
import { FoodTypeMark } from "@/components/ui/pos";
import type { AddonGroup, Item } from "@/lib/domain/types";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/cn";

export interface ItemChoice {
  variationId: string | null;
  addonIds: string[];
  qty: number;
  note: string;
}

/** Size, add-ons, quantity and a kitchen note for one dish. Validation mirrors addItem(). */
export function ItemOptionsDialog({
  item,
  groups,
  onClose,
  onAdd,
}: {
  item: Item;
  groups: AddonGroup[];
  onClose: () => void;
  onAdd: (c: ItemChoice) => Promise<void>;
}) {
  const [variationId, setVariationId] = useState<string | null>(item.variations[0]?.id ?? null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = item.variations.find((v) => v.id === variationId)?.pricePaise ?? item.pricePaise;
  const extras = groups.flatMap((g) => g.addons).filter((a) => addonIds.includes(a.id)).reduce((s, a) => s + a.pricePaise, 0);
  const missing = groups.find((g) => g.addons.filter((a) => addonIds.includes(a.id)).length < g.minSelect);

  function toggle(g: AddonGroup, id: string) {
    setAddonIds((cur) => {
      const inGroup = g.addons.map((a) => a.id);
      if (g.maxSelect === 1) return [...cur.filter((x) => !inGroup.includes(x)), id];
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const count = cur.filter((x) => inGroup.includes(x)).length;
      return g.maxSelect != null && count >= g.maxSelect ? cur : [...cur, id];
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onAdd({ variationId, addonIds, qty, note });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add the item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.name}
      description="Choose options, then add to the order."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!!missing}>
            Add · <span className="num">{formatPaise((base + extras) * qty)}</span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <FoodTypeMark type={item.foodType} /> {item.shortcode && <>Shortcode {item.shortcode}</>}
        </p>

        {item.variations.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Size (required)</legend>
            <div className="flex flex-wrap gap-2">
              {item.variations.map((v) => (
                <Choice key={v.id} type="radio" name="variation" checked={variationId === v.id} onChange={() => setVariationId(v.id)}>
                  {v.name} · <span className="num">{formatPaise(v.pricePaise)}</span>
                </Choice>
              ))}
            </div>
          </fieldset>
        )}

        {groups.map((g) => {
          const single = g.maxSelect === 1;
          const rule = g.minSelect > 0 ? (single ? "required" : `pick ${g.minSelect}+`) : g.maxSelect ? `optional, up to ${g.maxSelect}` : "optional";
          return (
            <fieldset key={g.id} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">
                {g.name} <span className="font-normal text-text-muted">({rule})</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {g.addons.map((a) => (
                  <Choice key={a.id} type={single ? "radio" : "checkbox"} name={g.id} checked={addonIds.includes(a.id)} onChange={() => toggle(g, a.id)}>
                    {a.name}
                    {a.pricePaise > 0 && (
                      <>
                        {" "}
                        · <span className="num">+{formatPaise(a.pricePaise)}</span>
                      </>
                    )}
                  </Choice>
                ))}
              </div>
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span id="qty-l" className="text-sm font-semibold">
              Quantity
            </span>
            <div role="group" aria-labelledby="qty-l" className="flex items-center rounded-md border border-border-input">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-control-md place-items-center hover:bg-surface-sunken">
                <Minus aria-hidden className="size-4" />
              </button>
              <span className="num w-10 text-center text-lg font-semibold" aria-live="polite">
                {qty}
              </span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)} className="grid size-control-md place-items-center hover:bg-surface-sunken">
                <Plus aria-hidden className="size-4" />
              </button>
            </div>
          </div>
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-semibold">
            Note for the kitchen
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="e.g. no onion"
              className="h-control-md rounded-md border border-border-input bg-bg px-3 text-base font-normal"
            />
          </label>
        </div>
        {missing && <p className="text-sm text-text-muted">Choose {missing.name.toLowerCase()} to continue.</p>}
        {error && <Alert kind="danger" title={error} />}
      </div>
    </Dialog>
  );
}

function Choice({
  type,
  name,
  checked,
  onChange,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-control-md cursor-pointer items-center rounded-pill border-2 px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        checked ? "border-accent bg-accent-soft font-semibold text-on-accent-soft" : "border-border-input text-text",
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
