"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { EmptyState, StatTile } from "@/components/ui/feedback";
import { useDb } from "@/lib/data/hooks";
import { businessDate } from "@/lib/domain/dates";
import type { PayMethod } from "@/lib/domain/types";
import { formatPaise } from "@/lib/money";

const METHOD: Record<PayMethod, string> = { cash: "Cash", card: "Card", upi: "UPI", wallet: "Wallet", due: "Pay later" };

export default function DashboardPage() {
  const db = useDb();
  const today = db ? businessDate(new Date(), db.outlet.timezone, db.outlet.dayStartsAt) : "";
  const settled = db ? db.bills.filter((b) => b.status === "settled" && b.businessDate === today) : [];
  const sales = settled.reduce((a, b) => a + b.totalPaise, 0);
  const tax = settled.reduce((a, b) => a + b.taxPaise, 0);
  const open = db ? db.orders.filter((o) => o.businessDate === today && (o.status === "open" || o.status === "billed")).length : 0;
  const voids = db ? db.audit.filter((a) => a.action === "kot.void" && a.at.slice(0, 10) >= today).length : 0;

  const byMethod = new Map<PayMethod, number>();
  const itemTotals = new Map<string, { qty: number; paise: number }>();
  if (db) {
    const ids = new Set(settled.map((b) => b.id));
    for (const p of db.payments) if (ids.has(p.billId)) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountPaise);
    const orderIds = new Set(settled.map((b) => b.orderId));
    for (const l of db.orderItems) {
      if (!orderIds.has(l.orderId) || l.status !== "active") continue;
      const t = itemTotals.get(l.name) ?? { qty: 0, paise: 0 };
      t.qty += l.qty;
      t.paise += l.qty * l.unitPricePaise;
      itemTotals.set(l.name, t);
    }
  }
  const top = [...itemTotals.entries()].sort((a, b) => b[1].paise - a[1].paise).slice(0, 5);

  return (
    <div className="mx-auto flex max-w-[var(--t-layout-bo-content-max)] flex-col gap-6 p-4 lg:p-8">
      <div>
        <h1 className="text-xl">Dashboard</h1>
        <p className="text-sm text-text-muted">
          {db ? db.outlet.name : " "} · business day {today && new Date(today + "T00:00:00").toLocaleDateString("en-IN", { dateStyle: "medium" })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sales (incl. tax)" value={formatPaise(sales)} loading={!db} />
        <StatTile label="Bills settled" value={String(settled.length)} loading={!db} />
        <StatTile label="Average bill" value={settled.length ? formatPaise(Math.round(sales / settled.length)) : "—"} loading={!db} />
        <StatTile label="Orders still open" value={String(open)} loading={!db} />
      </div>

      {db && settled.length === 0 ? (
        <EmptyState
          icon={<BarChart3 />}
          title="No sales yet today"
          help="Settle a bill on the POS and it shows up here straight away."
          action={
            <Link href="/pos" className="font-semibold text-accent underline">
              Open the POS
            </Link>
          }
        />
      ) : (
        db && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="pay-h" className="rounded-lg border border-border p-4">
              <h2 id="pay-h" className="mb-3 text-lg">
                How guests paid
              </h2>
              <table className="num w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byMethod.entries()].map(([m, v]) => (
                    <tr key={m} className="border-b border-border last:border-0">
                      <td className="py-2">{METHOD[m]}</td>
                      <td className="py-2 text-right">{formatPaise(v)}</td>
                      <td className="py-2 text-right text-text-muted">{Math.round((v / sales) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-text-muted">
                GST collected: <span className="num">{formatPaise(tax)}</span> · Voided items today: <span className="num">{voids}</span>
              </p>
            </section>
            <section aria-labelledby="top-h" className="rounded-lg border border-border p-4">
              <h2 id="top-h" className="mb-3 text-lg">
                Best sellers today
              </h2>
              <table className="num w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="pb-2 font-normal">Dish</th>
                    <th className="pb-2 text-right font-normal">Qty</th>
                    <th className="pb-2 text-right font-normal">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map(([name, t]) => (
                    <tr key={name} className="border-t border-border">
                      <td className="py-2">{name}</td>
                      <td className="py-2 text-right">{t.qty}</td>
                      <td className="py-2 text-right">{formatPaise(t.paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )
      )}
    </div>
  );
}
