// Bill maths. Pure functions, shared by the fake data layer now and the server later.
//
// Rules (architecture.md "Money and GST"):
// - integer paise only
// - discount applies before tax; a bill-level discount is spread over lines in
//   proportion to their value (largest remainder, so it sums exactly)
// - tax is computed per tax per bill on the summed taxable value, rounded half-up
// - round-off to the nearest rupee is a separate signed amount (-50..+50 paise, half-up)
// - price-inclusive outlets back the tax out of each line so taxable + tax == price

import type { BillTaxLine, BillTotals, Tax } from "./types";

export interface PricedLine {
  grossPaise: number; // unit price x qty, as shown on the menu
  discountPaise?: number; // item-level discount
  taxIds: string[];
}

export interface BillOptions {
  taxes: Tax[];
  priceIncludesTax: boolean;
  roundOff: boolean;
  billDiscountPaise?: number;
  chargesPaise?: number;
}

/** Half-up rounding for non-negative values; symmetric for negatives. */
export function roundHalfUp(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

/** Split `total` across `weights` so the parts sum exactly to `total`. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k][1]]++;
  return parts;
}

export function computeBill(lines: PricedLine[], opts: BillOptions): BillTotals {
  const taxById = new Map(opts.taxes.map((t) => [t.id, t]));
  const itemDiscounts = lines.map((l) => Math.min(l.discountPaise ?? 0, l.grossPaise));
  const afterItem = lines.map((l, i) => l.grossPaise - itemDiscounts[i]);
  const billDiscount = Math.min(opts.billDiscountPaise ?? 0, afterItem.reduce((a, b) => a + b, 0));
  const billShares = allocate(billDiscount, afterItem);
  const net = afterItem.map((v, i) => v - billShares[i]); // value after all discounts

  // Taxable value per line.
  const taxable = net.map((v, i) => {
    if (!opts.priceIncludesTax) return v;
    const rate = lines[i].taxIds.reduce((a, id) => a + (taxById.get(id)?.rateBp ?? 0), 0);
    return roundHalfUp((v * 10000) / (10000 + rate));
  });

  // Sum taxable per tax, then tax once per tax.
  const perTax = new Map<string, number>();
  lines.forEach((l, i) => {
    for (const id of l.taxIds) if (taxById.has(id)) perTax.set(id, (perTax.get(id) ?? 0) + taxable[i]);
  });
  const taxLines: BillTaxLine[] = [];
  for (const t of opts.taxes) {
    const base = perTax.get(t.id);
    if (base == null) continue;
    taxLines.push({ taxId: t.id, name: t.name, rateBp: t.rateBp, taxablePaise: base, amountPaise: roundHalfUp((base * t.rateBp) / 10000) });
  }
  let taxPaise = taxLines.reduce((a, t) => a + t.amountPaise, 0);

  const discountPaise = itemDiscounts.reduce((a, b) => a + b, 0) + billDiscount;
  let subtotalPaise: number;
  if (opts.priceIncludesTax) {
    // Inclusive: the guest pays the menu price. Keep taxable + tax == net exactly by
    // putting any 1-paisa rounding gap into the last tax line.
    const netSum = net.reduce((a, b) => a + b, 0);
    const taxableSum = taxable.reduce((a, b) => a + b, 0);
    const gap = netSum - taxableSum - taxPaise;
    if (gap !== 0 && taxLines.length) {
      taxLines[taxLines.length - 1].amountPaise += gap;
      taxPaise += gap;
    }
    subtotalPaise = taxableSum + discountPaise;
  } else {
    subtotalPaise = lines.reduce((a, l) => a + l.grossPaise, 0);
  }

  const chargesPaise = opts.chargesPaise ?? 0;
  const beforeRound = subtotalPaise - discountPaise + chargesPaise + taxPaise;
  const roundOffPaise = opts.roundOff ? roundHalfUp(beforeRound / 100) * 100 - beforeRound : 0;
  return {
    subtotalPaise,
    discountPaise,
    chargesPaise,
    taxLines,
    taxPaise,
    roundOffPaise,
    totalPaise: beforeRound + roundOffPaise,
  };
}

/** Change to hand back for a cash payment; never negative. */
export function changeDue(tenderedPaise: number, duePaise: number): number {
  return Math.max(0, tenderedPaise - duePaise);
}
