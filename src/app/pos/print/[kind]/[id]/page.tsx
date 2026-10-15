"use client";

import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useDb } from "@/lib/data/hooks";
import type { Db } from "@/lib/data/store";
import { lineDetail } from "@/lib/domain/kot";
import { formatPaise } from "@/lib/money";

// S25. Browser-print fallback for 80 mm thermal printers. The print agent renders the
// same content as ESC/POS later (architecture.md "Printing").

const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

function Row({ l, r, strong }: { l: React.ReactNode; r: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between text-base font-bold" : "flex justify-between"}>
      <span>{l}</span>
      <span className="num">{r}</span>
    </div>
  );
}

function BillTicket({ d, id }: { d: Db; id: string }) {
  const bill = d.bills.find((b) => b.id === id);
  if (!bill) return null;
  const order = d.orders.find((o) => o.id === bill.orderId)!;
  const lines = d.orderItems.filter((l) => l.orderId === order.id && l.status === "active");
  const tables = d.tables.filter((t) => order.tableIds.includes(t.id)).map((t) => t.name);
  const payments = d.payments.filter((p) => p.billId === bill.id);
  const biller = d.staff.find((s) => s.id === bill.createdByStaffId)?.name;
  const o = d.outlet;
  return (
    <>
      {bill.printCount > 1 && <p className="text-center font-bold">** DUPLICATE **</p>}
      {bill.status === "cancelled" && <p className="text-center font-bold">** CANCELLED **</p>}
      <div className="text-center">
        <p className="text-lg font-bold">{o.billHeader}</p>
        <p>{o.address}</p>
        {o.gstin && <p>GSTIN {o.gstin}</p>}
        {o.fssaiNo && <p>FSSAI {o.fssaiNo}</p>}
        <p className="mt-1 font-bold">{o.gstin ? "TAX INVOICE" : "BILL OF SUPPLY"}</p>
      </div>
      <hr className="my-2 border-dashed border-text" />
      <Row l="Bill no." r={`${bill.seriesCode}/${bill.fiscalYear}/${bill.billNo}`} />
      <Row l="Date" r={when(bill.createdAt, o.timezone)} />
      <Row l={order.type === "dine_in" ? "Table" : "Order"} r={order.type === "dine_in" ? tables.join(" + ") : `#${order.orderNo} ${order.type}`} />
      {biller && <Row l="Billed by" r={biller} />}
      <hr className="my-2 border-dashed border-text" />
      <div className="flex justify-between font-bold">
        <span>Item</span>
        <span>Amount</span>
      </div>
      {lines.map((l) => (
        <div key={l.id} className="py-0.5">
          <Row l={`${l.qty} × ${l.name}`} r={formatPaise(l.qty * l.unitPricePaise)} />
          {lineDetail(l) && <p className="pl-4 text-xs">{lineDetail(l)}</p>}
          <p className="num pl-4 text-xs">@ {formatPaise(l.unitPricePaise)}</p>
        </div>
      ))}
      <hr className="my-2 border-dashed border-text" />
      <Row l="Subtotal" r={formatPaise(bill.subtotalPaise)} />
      {bill.discountPaise > 0 && <Row l="Discount" r={`-${formatPaise(bill.discountPaise)}`} />}
      {bill.taxLines.map((t) => (
        <Row key={t.taxId} l={`${t.name} on ${formatPaise(t.taxablePaise)}`} r={formatPaise(t.amountPaise)} />
      ))}
      {bill.roundOffPaise !== 0 && <Row l="Round off" r={formatPaise(bill.roundOffPaise)} />}
      <hr className="my-2 border-dashed border-text" />
      <Row strong l="TOTAL" r={formatPaise(bill.totalPaise)} />
      {payments.length > 0 && (
        <>
          <hr className="my-2 border-dashed border-text" />
          {payments.map((p) => (
            <Row key={p.id} l={`Paid by ${p.method.toUpperCase()}`} r={formatPaise(p.amountPaise)} />
          ))}
          {payments.filter((p) => p.tenderedPaise).map((p) => (
            <Row key={p.id + "c"} l="Change" r={formatPaise(p.tenderedPaise! - p.amountPaise)} />
          ))}
        </>
      )}
      <p className="mt-3 text-center">{o.billFooter}</p>
      <p className="text-center text-xs">SAC 996331 · Prices in INR</p>
    </>
  );
}

function KotTicket({ d, id }: { d: Db; id: string }) {
  const kot = d.kots.find((k) => k.id === id);
  if (!kot) return null;
  const order = d.orders.find((o) => o.id === kot.orderId)!;
  const tables = d.tables.filter((t) => order.tableIds.includes(t.id)).map((t) => t.name);
  const station = d.stations.find((s) => s.id === kot.stationId)?.name ?? "Kitchen";
  const by = d.staff.find((s) => s.id === kot.createdByStaffId)?.name;
  return (
    <>
      {kot.kind === "void" && <p className="text-center text-lg font-bold">*** CANCELLED ***</p>}
      <p className="text-center text-lg font-bold">KOT {kot.kotNo} · {station}</p>
      <Row l={order.type === "dine_in" ? `Table ${tables.join(" + ")}` : `${order.type} #${order.orderNo}`} r={when(kot.createdAt, d.outlet.timezone)} />
      {by && <Row l="By" r={by} />}
      <hr className="my-2 border-dashed border-text" />
      {kot.lines.map((l) => (
        <div key={l.orderItemId} className="py-1">
          <p className="text-base font-bold">
            <span className="num">{Math.abs(l.qty)}</span> × {l.name}
          </p>
          {l.detail && <p className="pl-6">{l.detail}</p>}
          {l.note && <p className="pl-6 font-bold">NOTE: {l.note}</p>}
        </div>
      ))}
      <hr className="my-2 border-dashed border-text" />
      <p className="text-center text-xs">
        {kot.lines.reduce((a, l) => a + Math.abs(l.qty), 0)} item(s) · {kot.businessDate}
      </p>
    </>
  );
}

export default function PrintPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const db = useDb();
  const found = db && (kind === "bill" ? db.bills.some((b) => b.id === id) : kind === "kot" ? db.kots.some((k) => k.id === id) : false);

  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center gap-4 bg-surface p-4 print:bg-bg print:p-0">
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } body { background: white; } }`}</style>
      {!db ? (
        <Skeleton className="h-96 w-[80mm]" />
      ) : !found ? (
        <EmptyState icon={<Printer />} title="Nothing to print" help="This ticket isn’t on this device." />
      ) : (
        <>
          <div className="flex gap-2 print:hidden">
            <Button icon={<Printer aria-hidden className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="ghost" onClick={() => window.close()}>
              Close
            </Button>
          </div>
          <article
            aria-label={kind === "bill" ? "Bill" : "Kitchen ticket"}
            className="w-[80mm] max-w-full bg-bg p-3 font-mono text-xs leading-snug text-text shadow-card print:shadow-none"
          >
            {kind === "bill" ? <BillTicket d={db} id={id} /> : <KotTicket d={db} id={id} />}
          </article>
        </>
      )}
    </main>
  );
}
