"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Grid3x3, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Segmented, TableTile, type TableState } from "@/components/ui/pos";
import { DomainError, openOrder, orderTotals } from "@/lib/data/api";
import { useDb, useNow } from "@/lib/data/hooks";
import type { Db } from "@/lib/data/store";
import { minutesSince } from "@/lib/domain/dates";
import type { Order, OrderType } from "@/lib/domain/types";
import { formatPaise } from "@/lib/money";

function tableView(d: Db, tableId: string, now: number) {
  const order = d.orders.find((o) => (o.status === "open" || o.status === "billed") && o.tableIds.includes(tableId));
  if (!order) return { state: "blank" as TableState };
  const bill = d.bills.find((b) => b.orderId === order.id && b.status === "open");
  const hasKot = d.kots.some((k) => k.orderId === order.id);
  const state: TableState = order.status === "billed" ? "billed" : hasKot ? "kot" : "running";
  return { state, order, minutes: minutesSince(order.createdAt, now), amountPaise: bill?.totalPaise };
}

const TYPE_LABEL: Record<OrderType, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };

export default function TablesPage() {
  const db = useDb();
  const now = useNow();
  const router = useRouter();
  const [area, setArea] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counterOrders = useMemo<Order[]>(
    // Counter orders with nothing on them are abandoned, not running (BUG-003); the cron closes them.
    () => (db ? db.orders.filter((o) => o.type !== "dine_in" && (o.status === "open" || o.status === "billed") && db.orderItems.some((l) => l.orderId === o.id)) : []),
    [db],
  );

  async function start(type: OrderType, tableId?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await openOrder({ type, tableId });
      router.push(`/pos/order/${id}`);
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Couldn’t open the order.");
      setBusy(false);
    }
  }

  if (!db) {
    return (
      <div aria-busy className="grid grid-cols-[repeat(auto-fill,minmax(var(--t-layout-table-tile-min),1fr))] gap-3 p-4">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  }

  const areas = [...db.areas].sort((a, b) => a.sort - b.sort);
  const shown = areas.filter((a) => area === "all" || a.id === area);
  const running = db.tables.filter((t) => tableView(db, t.id, now).state !== "blank").length;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl">Tables</h1>
          <p className="text-sm text-text-muted">
            <span className="num">{running}</span> of <span className="num">{db.tables.length}</span> tables in use
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<ShoppingBag aria-hidden className="size-5" />} onClick={() => start("takeaway")} disabled={busy}>
            New takeaway
          </Button>
          <Button variant="secondary" icon={<Bike aria-hidden className="size-5" />} onClick={() => start("delivery")} disabled={busy}>
            New delivery
          </Button>
        </div>
      </div>

      {error && <Alert kind="danger" title={error} />}

      {counterOrders.length > 0 && (
        <section aria-labelledby="counter-h" className="flex flex-col gap-2">
          <h2 id="counter-h" className="text-sm font-semibold text-text-muted">
            Takeaway & delivery
          </h2>
          <ul className="flex flex-wrap gap-2">
            {counterOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/pos/order/${o.id}`}
                  className="flex h-control-md items-center gap-2 rounded-md border border-border bg-bg px-3 text-sm font-semibold hover:bg-surface"
                >
                  {TYPE_LABEL[o.type]} #{o.orderNo}
                  <span className="num font-normal text-text-muted">{formatPaise(orderTotals(db, o.id).totalPaise)}</span>
                  {o.status === "billed" && <span className="rounded-sm bg-table-billed px-1.5 text-xs text-on-table-billed">Billed</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {db.tables.length === 0 ? (
        <EmptyState
          icon={<Grid3x3 />}
          title="No tables set up"
          help="Add areas and tables in the back office to take dine-in orders. Takeaway and delivery work already."
          action={
            <Link className="font-semibold text-accent underline" href="/floor">
              Set up the floor
            </Link>
          }
        />
      ) : (
        <>
          <div className="self-start overflow-x-auto">
          <Segmented
            label="Area"
            value={area}
            onChange={setArea}
            options={[{ value: "all", label: "All" }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
          />
          </div>
          {shown.map((a) => {
            const tables = db.tables.filter((t) => t.areaId === a.id);
            return (
              <section key={a.id} aria-labelledby={`area-${a.id}`} className="flex flex-col gap-2">
                <h2 id={`area-${a.id}`} className="text-sm font-semibold text-text-muted">
                  {a.name}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--t-layout-table-tile-min),1fr))] gap-3">
                  {tables.map((t) => {
                    const v = tableView(db, t.id, now);
                    return (
                      <TableTile
                        key={t.id}
                        name={t.name}
                        state={v.state}
                        seats={t.seats}
                        minutes={v.minutes}
                        amountPaise={v.amountPaise}
                        onOpen={() => (v.order ? router.push(`/pos/order/${v.order.id}`) : start("dine_in", t.id))}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
