// Till commands. Same names and signatures as the fake layer the screens were built on;
// each is now a POST to /api/v1/pos/<command> (see src/server/pos.ts for the rules).

import { computeBill } from "@/lib/domain/billing";
import type { BillTotals, Id, Kot, OrderType, PayMethod } from "@/lib/domain/types";
import { store, type Db } from "./store";

export class DomainError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * POST with an idempotency key. A dropped connection is retried with the SAME key, so the
 * server applies the command at most once. Errors carry the server's user-facing message.
 */
async function post<T>(path: string, body: unknown, opts: { refresh?: boolean } = {}): Promise<T> {
  const key = crypto.randomUUID();
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastNetworkError = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new DomainError(data.error ?? "Something went wrong. Try again.", data.code);
    if (opts.refresh !== false) await store("device").refresh();
    return data.result as T;
  }
  console.warn("network error", lastNetworkError);
  throw new DomainError("Can’t reach the server. Check the connection and try again.", "offline");
}

const command = <T>(name: string, body: unknown) => post<T>(`/api/v1/pos/${name}`, body);

/* ---------------- staff session (S17) ---------------- */

export async function loginWithPin(staffId: Id, pin: string) {
  await post("/api/v1/staff/login", { staffId, pin });
}

export async function logout() {
  await post("/api/v1/staff/logout", {});
}

/* ---------------- orders (S18, S19) ---------------- */

export const openOrder = (input: { type: OrderType; tableId?: Id; pax?: number }) => command<Id>("openOrder", input);

export const addItem = (orderId: Id, input: { itemId: Id; variationId?: Id | null; addonIds?: Id[]; qty?: number; note?: string | null }) =>
  command<Id>("addItem", { orderId, ...input });

export const setQty = (orderItemId: Id, qty: number) => command<null>("setQty", { orderItemId, qty });

export const sendKot = (orderId: Id) => command<Pick<Kot, "id" | "kotNo" | "stationId">[]>("sendKot", { orderId });

export const voidItem = (orderItemId: Id, qty: number, reason: string) => command<null>("voidItem", { orderItemId, qty, reason });

/* ---------------- billing (S19, S21, S25) ---------------- */

/** Live totals for an unbilled order; the server computes the same with the same function when billing. */
export function orderTotals(d: Db, orderId: Id): BillTotals {
  const lines = d.orderItems.filter((oi) => oi.orderId === orderId && oi.status === "active");
  return computeBill(
    lines.map((l) => ({ grossPaise: l.unitPricePaise * l.qty, taxIds: l.taxIds })),
    { taxes: d.taxes, priceIncludesTax: d.outlet.priceIncludesTax, roundOff: d.outlet.roundOff },
  );
}

export const printBill = (orderId: Id) => command<Id>("printBill", { orderId });

export const reopenOrder = (orderId: Id, reason: string) => command<null>("reopenOrder", { orderId, reason });

export function paidPaise(d: Db, billId: Id) {
  return d.payments.filter((p) => p.billId === billId).reduce((a, p) => a + p.amountPaise, 0);
}

export const addPayment = (billId: Id, input: { method: PayMethod; amountPaise: number; tenderedPaise?: number; reference?: string }) =>
  command<"open" | "settled">("addPayment", { billId, ...input });

export const cancelOrder = (orderId: Id, reason: string) => command<null>("cancelOrder", { orderId, reason });

/* ---------------- devices ---------------- */

export const pairWithCode = (code: string) => post<unknown>("/api/v1/devices/pair", { code }, { refresh: false });
export const pairThisBrowser = (outletId: string) => post<unknown>("/api/v1/devices/pair-this", { outletId, kind: "pos", name: "Counter" }, { refresh: false });
