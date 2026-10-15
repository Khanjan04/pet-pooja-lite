"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Dialog } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { PaymentMethods, type PayMethod } from "@/components/ui/pos";
import { addPayment, DomainError } from "@/lib/data/api";
import { changeDue } from "@/lib/domain/billing";
import type { Bill, Payment } from "@/lib/domain/types";
import { formatPaise } from "@/lib/money";

const METHOD_LABEL: Record<PayMethod, string> = { cash: "Cash", card: "Card", upi: "UPI", wallet: "Wallet", due: "Pay later" };

function toPaise(input: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(input.trim())) return null;
  const [r, p = ""] = input.trim().split(".");
  return Number(r) * 100 + Number((p + "00").slice(0, 2));
}

function rupees(paise: number) {
  return (paise / 100).toFixed(2);
}

/** S21. Takes one payment at a time; several payments make a split tender. */
export function SettleDialog({
  bill,
  payments,
  onClose,
  onSettled,
}: {
  bill: Bill;
  payments: Payment[];
  onClose: () => void;
  onSettled: () => void;
}) {
  const paid = payments.reduce((a, p) => a + p.amountPaise, 0);
  const due = bill.totalPaise - paid;
  const [method, setMethod] = useState<PayMethod>("cash");
  const [amount, setAmount] = useState(rupees(due));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountPaise = toPaise(amount);
  const tenderedPaise = tendered ? toPaise(tendered) : null;
  const quick = [due, Math.ceil(due / 10000) * 10000, Math.ceil(due / 50000) * 50000, 200000].filter((v, i, a) => v >= due && a.indexOf(v) === i);

  async function submit() {
    if (amountPaise == null || amountPaise <= 0) return setError("Enter an amount, like 250 or 250.50.");
    if (method === "cash" && tenderedPaise != null && tenderedPaise < amountPaise) return setError("Cash received is less than the amount.");
    setBusy(true);
    setError(null);
    try {
      const status = await addPayment(bill.id, {
        method,
        amountPaise,
        tenderedPaise: method === "cash" ? tenderedPaise ?? undefined : undefined,
        reference: method === "cash" ? undefined : reference,
      });
      if (status === "settled") onSettled();
      else {
        const left = due - amountPaise;
        setAmount(rupees(left));
        setTendered("");
        setReference("");
      }
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Couldn’t record the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Settle bill ${bill.seriesCode}/${bill.billNo}`}
      description="Take the full amount, or part of it and then the rest another way."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button variant="success" onClick={submit} loading={busy} disabled={amountPaise == null || amountPaise <= 0}>
            Take {amountPaise ? formatPaise(amountPaise) : "payment"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="num grid grid-cols-3 gap-2 rounded-md bg-surface p-3 text-center">
          <div>
            <dt className="text-xs text-text-muted">Bill</dt>
            <dd className="font-semibold">{formatPaise(bill.totalPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Paid</dt>
            <dd className="font-semibold">{formatPaise(paid)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Due</dt>
            <dd className="text-lg">{formatPaise(due)}</dd>
          </div>
        </dl>

        {payments.length > 0 && (
          <ul className="text-sm text-text-muted">
            {payments.map((p) => (
              <li key={p.id} className="num">
                {METHOD_LABEL[p.method]} {formatPaise(p.amountPaise)}
              </li>
            ))}
          </ul>
        )}

        <PaymentMethods value={method} onChange={setMethod} disabled={["wallet", "due"]} />

        <Field label="Amount" prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />

        {method === "cash" ? (
          <div className="flex flex-col gap-2">
            <Field
              label="Cash received"
              prefix="₹"
              inputMode="decimal"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              hint={tenderedPaise != null && amountPaise != null ? `Change to give: ${formatPaise(changeDue(tenderedPaise, amountPaise))}` : "Optional. Works out the change."}
            />
            <div role="group" className="flex flex-wrap gap-2" aria-label="Quick amounts">
              {quick.map((v) => (
                <Button key={v} size="sm" variant="secondary" onClick={() => setTendered(rupees(v))}>
                  <span className="num">{formatPaise(v)}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <Field
            label={method === "upi" ? "UPI reference" : "Card reference"}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            hint="Optional. Last 4 digits or transaction ID."
          />
        )}
        <p className="text-xs text-text-muted">Wallet and pay-later come with customer accounts.</p>
        {error && <Alert kind="danger" title={error} />}
      </div>
    </Dialog>
  );
}
