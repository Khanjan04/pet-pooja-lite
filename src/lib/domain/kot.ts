// Kitchen order tickets: route unsent quantities to their stations.

import type { Id, KotLine, OrderItem } from "./types";

export function lineDetail(oi: Pick<OrderItem, "variationName" | "addons">): string | null {
  const parts = [oi.variationName, ...oi.addons.map((a) => a.name)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Unsent quantity per active line, grouped by station (null = no station set). */
export function pendingKotLines(items: OrderItem[]): Map<Id | null, KotLine[]> {
  const byStation = new Map<Id | null, KotLine[]>();
  for (const oi of items) {
    if (oi.status !== "active") continue;
    const qty = oi.qty - oi.sentQty;
    if (qty <= 0) continue;
    const list = byStation.get(oi.stationId) ?? [];
    list.push({ orderItemId: oi.id, name: oi.name, detail: lineDetail(oi), note: oi.note, qty });
    byStation.set(oi.stationId, list);
  }
  return byStation;
}
