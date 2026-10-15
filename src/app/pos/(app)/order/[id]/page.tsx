"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, Printer, Receipt, Search, Send, ShoppingBasket, Undo2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Alert, Dialog, EmptyState, ReasonPicker, Skeleton } from "@/components/ui/feedback";
import { CartLine, CategoryRail, ItemTile } from "@/components/ui/pos";
import { ItemOptionsDialog } from "@/components/pos/item-options-dialog";
import { SettleDialog } from "@/components/pos/settle-dialog";
import * as api from "@/lib/data/api";
import { currentStaff, useDb } from "@/lib/data/hooks";
import { lineDetail } from "@/lib/domain/kot";
import type { Item, OrderItem, OrderType } from "@/lib/domain/types";
import { formatPaise } from "@/lib/money";

const TYPE_LABEL: Record<OrderType, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [optionsFor, setOptionsFor] = useState<Item | null>(null);
  const [voiding, setVoiding] = useState<OrderItem | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirm, setConfirm] = useState<"cancel" | "reopen" | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode>(null);

  // "/" jumps to search, as on most tills.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const view = useMemo(() => {
    if (!db) return null;
    const order = db.orders.find((o) => o.id === id);
    if (!order) return { order: null } as const;
    const lines = db.orderItems.filter((oi) => oi.orderId === id);
    const bill = db.bills.find((b) => b.orderId === id && b.status !== "cancelled") ?? null;
    const payments = bill ? db.payments.filter((p) => p.billId === bill.id) : [];
    const tables = db.tables.filter((t) => order.tableIds.includes(t.id));
    const categories = [...db.categories].sort((a, b) => a.sort - b.sort);
    const kots = db.kots.filter((k) => k.orderId === id);
    return { order, lines, bill, payments, tables, categories, kots, totals: api.orderTotals(db, id) };
  }, [db, id]);

  if (!db || !view) {
    return (
      <div aria-busy className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_var(--t-layout-pos-cart)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!view.order) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Receipt />}
          title="Order not found"
          help="It may have been cancelled or this link is from another device."
          action={<Button onClick={() => router.push("/pos")}>Back to tables</Button>}
        />
      </div>
    );
  }

  const { order, lines, bill, payments, tables, categories, kots, totals } = view;
  const staff = currentStaff(db);
  const can = (r: string) => !!staff?.role.rights.includes(r as never);
  const editable = order.status === "open";
  const activeCat = cat ?? categories[0]?.id ?? null;
  const q = query.trim().toLowerCase();
  const items = db.items
    .filter((i) => (q ? i.name.toLowerCase().includes(q) || i.shortcode?.toLowerCase() === q || i.shortcode?.toLowerCase().startsWith(q) : i.categoryId === activeCat))
    .sort((a, b) => (q ? Number(b.shortcode?.toLowerCase() === q) - Number(a.shortcode?.toLowerCase() === q) : a.sort - b.sort));
  const qtyInCart = (itemId: string) => lines.filter((l) => l.itemId === itemId && l.status === "active").reduce((a, l) => a + l.qty, 0);
  const unsent = lines.some((l) => l.status === "active" && l.qty > l.sentQty);
  const hasActive = lines.some((l) => l.status === "active");
  const title = order.type === "dine_in" ? `Table ${tables.map((t) => t.name).join(" + ")}` : `${TYPE_LABEL[order.type]} #${order.orderNo}`;

  async function run(fn: () => Promise<unknown>, ok?: React.ReactNode) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (ok !== undefined) setNotice(ok);
    } catch (e) {
      setNotice(null);
      setError(e instanceof api.DomainError ? e.message : "Something went wrong. Try again.");
    }
  }

  function tap(item: Item) {
    if (!editable) return setError("This order is billed. Reopen the bill to add items.");
    const groups = db!.addonGroups.filter((g) => item.addonGroupIds.includes(g.id));
    if (item.variations.length || groups.length) setOptionsFor(item);
    else void run(() => api.addItem(id, { itemId: item.id }));
  }

  const stationName = (sid: string | null) => db.stations.find((s) => s.id === sid)?.name ?? "Kitchen";

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Menu side */}
      <section aria-label="Menu" className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <IconButton label="Back to tables" variant="secondary" onClick={() => router.push("/pos")}>
            <ArrowLeft aria-hidden className="size-5" />
          </IconButton>
          <label className="flex h-control-md flex-1 items-center gap-2 rounded-md border border-border-input bg-bg px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
            <Search aria-hidden className="size-5 text-text-muted" />
            <span className="sr-only">Search dishes by name or shortcode</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // An exact shortcode wins; otherwise add only when the search is unambiguous.
                  const exact = items.find((i) => i.shortcode?.toLowerCase() === q);
                  const pick = exact ?? (items.length === 1 ? items[0] : null);
                  if (pick) {
                    tap(pick);
                    setQuery("");
                  }
                }
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search or type a shortcode  ( / )"
              className="h-full w-full bg-transparent text-base outline-none placeholder:text-text-muted"
            />
          </label>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          {!q && (
            <>
              <div className="hidden md:block">
                <CategoryRail
                  categories={categories.map((c) => ({ id: c.id, name: c.name, count: db.items.filter((i) => i.categoryId === c.id).length }))}
                  selected={activeCat ?? ""}
                  onSelect={setCat}
                />
              </div>
              <div className="md:hidden">
                <CategoryRail
                  orientation="horizontal"
                  categories={categories.map((c) => ({ id: c.id, name: c.name, count: db.items.filter((i) => i.categoryId === c.id).length }))}
                  selected={activeCat ?? ""}
                  onSelect={setCat}
                />
              </div>
            </>
          )}
          <div role={q ? "region" : "tabpanel"} aria-label={q ? `Results for ${query}` : undefined} className="flex-1">
            {items.length === 0 ? (
              <p className="p-6 text-center text-text-muted">No dishes match “{query}”.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--t-layout-item-tile-min),1fr))] content-start gap-2 pt-2 pr-2">
                {items.map((i) => (
                  <ItemTile
                    key={i.id}
                    name={i.name}
                    pricePaise={i.variations[0]?.pricePaise ?? i.pricePaise}
                    foodType={i.foodType}
                    soldOut={!i.inStock}
                    hasOptions={i.variations.length > 0 || i.addonGroupIds.length > 0}
                    qtyInCart={qtyInCart(i.id)}
                    onAdd={() => tap(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Order side */}
      <aside aria-label="Current order" className="flex flex-col border-t border-border bg-bg lg:sticky lg:top-0 lg:h-[calc(100vh-var(--t-layout-pos-header))] lg:w-[var(--t-layout-pos-cart)] lg:border-l lg:border-t-0">
        <div className="flex items-start justify-between gap-2 border-b border-border p-3">
          <div>
            <h1 className="text-lg">{title}</h1>
            <p className="text-sm text-text-muted">
              {TYPE_LABEL[order.type]} · Order #{order.orderNo}
              {bill && (
                <>
                  {" "}
                  · Bill {bill.seriesCode}/{bill.billNo}
                </>
              )}
            </p>
          </div>
          {editable && !lines.some((l) => l.sentQty > 0) && can("order.cancel") && (
            <Button size="sm" variant="ghost" icon={<Ban aria-hidden className="size-4" />} onClick={() => setConfirm("cancel")}>
              Cancel order
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {lines.length === 0 ? (
            <div className="py-8">
              <EmptyState icon={<ShoppingBasket />} title="Nothing ordered yet" help="Tap a dish, or type its shortcode and press Enter." />
            </div>
          ) : (
            <ul>
              {lines.map((l) => {
                const state = l.status === "void" ? "void" : l.sentQty >= l.qty ? "sent" : "editing";
                return (
                  <CartLine
                    key={l.id}
                    name={l.name}
                    detail={lineDetail(l) ?? undefined}
                    note={l.note ?? undefined}
                    qty={l.qty}
                    linePaise={l.unitPricePaise * l.qty}
                    state={state}
                    voidReason={l.voidReason ?? undefined}
                    onQty={editable ? (n) => void run(() => api.setQty(l.id, n)) : undefined}
                    trailing={
                      editable && l.status === "active" && l.sentQty > 0 && can("kot.cancel") ? (
                        <IconButton label={`Void ${l.name}`} size="sm" onClick={() => setVoiding(l)}>
                          <Ban aria-hidden className="size-4 text-danger" />
                        </IconButton>
                      ) : null
                    }
                  />
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-3">
          {error && <Alert kind="danger" title={error} />}
          {notice && !error && <Alert kind="success" title="Done">{notice}</Alert>}
          <dl className="num flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-text-muted">
              <dt>Subtotal</dt>
              <dd>{formatPaise(totals.subtotalPaise)}</dd>
            </div>
            {totals.taxLines.map((t) => (
              <div key={t.taxId} className="flex justify-between text-text-muted">
                <dt>{t.name}</dt>
                <dd>{formatPaise(t.amountPaise)}</dd>
              </div>
            ))}
            {totals.roundOffPaise !== 0 && (
              <div className="flex justify-between text-text-muted">
                <dt>Round off</dt>
                <dd>{formatPaise(totals.roundOffPaise)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <dt className="text-lg">Total</dt>
              <dd className="text-xl">{formatPaise(bill?.totalPaise ?? totals.totalPaise)}</dd>
            </div>
          </dl>

          {order.status === "settled" ? (
            <div className="flex flex-col gap-2">
              <Alert kind="success" title="Paid in full">
                <span className="num">{payments.map((p) => `${p.method.toUpperCase()} ${formatPaise(p.amountPaise)}`).join(" + ")}</span>
              </Alert>
              <div className="grid grid-cols-2 gap-2">
                {bill && (
                  <Link className="inline-flex h-control-md items-center justify-center gap-2 rounded-md border border-border-input bg-surface font-semibold" href={`/pos/print/bill/${bill.id}`} target="_blank">
                    <Printer aria-hidden className="size-4" /> Receipt
                  </Link>
                )}
                <Button onClick={() => router.push("/pos")}>Back to tables</Button>
              </div>
            </div>
          ) : order.status === "cancelled" ? (
            <Alert kind="warning" title="Order cancelled">{order.cancelReason}</Alert>
          ) : order.status === "billed" && bill ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                icon={<Printer aria-hidden className="size-4" />}
                onClick={() => run(() => api.printBill(id), <Link className="underline" href={`/pos/print/bill/${bill.id}`} target="_blank">Open the duplicate bill</Link>)}
              >
                Reprint
              </Button>
              {can("bill.cancel") ? (
                <Button variant="ghost" icon={<Undo2 aria-hidden className="size-4" />} onClick={() => setConfirm("reopen")}>
                  Reopen
                </Button>
              ) : (
                <span />
              )}
              <Button size="lg" variant="success" className="col-span-2" onClick={() => setSettling(true)} disabled={!can("bill.settle")}>
                Settle {formatPaise(bill.totalPaise - payments.reduce((a, p) => a + p.amountPaise, 0))}
              </Button>
            </div>
          ) : unsent ? (
            <Button
              size="lg"
              icon={<Send aria-hidden className="size-5" />}
              onClick={() =>
                run(async () => {
                  const made = await api.sendKot(id);
                  setNotice(
                    <span>
                      Sent to {made.map((k) => stationName(k.stationId)).join(", ")}.{" "}
                      {made.map((k) => (
                        <Link key={k.id} className="underline" href={`/pos/print/kot/${k.id}`} target="_blank">
                          KOT {k.kotNo}{" "}
                        </Link>
                      ))}
                    </span>,
                  );
                })
              }
            >
              Send to kitchen
            </Button>
          ) : (
            <Button
              size="lg"
              icon={<Receipt aria-hidden className="size-5" />}
              disabled={!hasActive}
              onClick={() =>
                run(async () => {
                  const billId = await api.printBill(id);
                  setNotice(<Link className="underline" href={`/pos/print/bill/${billId}`} target="_blank">Open the bill to print</Link>);
                })
              }
            >
              Print bill
            </Button>
          )}
          {kots.length > 0 && order.status !== "settled" && (
            <p className="text-xs text-text-muted">
              Kitchen tickets:{" "}
              {kots.map((k) => (
                <Link key={k.id} href={`/pos/print/kot/${k.id}`} target="_blank" className="num underline">
                  {k.kind === "void" ? "Void " : ""}
                  {k.kotNo}{" "}
                </Link>
              ))}
            </p>
          )}
        </div>
      </aside>

      {optionsFor && (
        <ItemOptionsDialog
          item={optionsFor}
          groups={db.addonGroups.filter((g) => optionsFor.addonGroupIds.includes(g.id))}
          onClose={() => setOptionsFor(null)}
          onAdd={async (c) => {
            await api.addItem(id, { itemId: optionsFor.id, variationId: c.variationId, addonIds: c.addonIds, qty: c.qty, note: c.note });
          }}
        />
      )}

      {voiding && (
        <Dialog
          open
          onOpenChange={(o) => !o && setVoiding(null)}
          title={`Void ${voiding.name}?`}
          description="It has gone to the kitchen, so a cancellation ticket will print. This is recorded in the audit trail."
          footer={
            <>
              <Button variant="ghost" onClick={() => setVoiding(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                disabled={!voidReason.trim()}
                onClick={async () => {
                  await run(() => api.voidItem(voiding.id, 1, voidReason), `Voided 1 × ${voiding.name}.`);
                  setVoiding(null);
                  setVoidReason("");
                }}
              >
                Void 1
              </Button>
            </>
          }
        >
          <ReasonPicker reasons={["Guest changed mind", "Wrong item", "Out of stock", "Quality issue"]} onChange={setVoidReason} />
        </Dialog>
      )}

      {confirm && (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirm === "cancel" ? "Cancel this order?" : "Reopen the bill?"}
          description={
            confirm === "cancel"
              ? "Nothing has gone to the kitchen yet. The order will be closed."
              : "The printed bill is cancelled and a new one is printed when you’re done. This is recorded in the audit trail."
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Go back
              </Button>
              <Button
                variant="danger"
                disabled={!confirmReason.trim()}
                onClick={async () => {
                  if (confirm === "cancel") {
                    await run(() => api.cancelOrder(id, confirmReason));
                    router.push("/pos");
                  } else await run(() => api.reopenOrder(id, confirmReason), "Bill reopened. Add items, then print again.");
                  setConfirm(null);
                  setConfirmReason("");
                }}
              >
                {confirm === "cancel" ? "Cancel order" : "Reopen bill"}
              </Button>
            </>
          }
        >
          <ReasonPicker
            reasons={confirm === "cancel" ? ["Guest left", "Duplicate order", "Entered by mistake"] : ["Guest added items", "Wrong item billed", "Discount to apply"]}
            onChange={setConfirmReason}
          />
        </Dialog>
      )}

      {settling && bill && (
        <SettleDialog
          bill={bill}
          payments={payments}
          onClose={() => setSettling(false)}
          onSettled={() => {
            setSettling(false);
            setNotice(
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 aria-hidden className="size-4" /> Paid. The table is free.
              </span>,
            );
          }}
        />
      )}
    </div>
  );
}
