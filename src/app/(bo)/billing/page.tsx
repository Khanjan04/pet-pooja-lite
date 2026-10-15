"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Dialog, Skeleton } from "@/components/ui/feedback";
import { useMe } from "@/components/shell/bo-guard";

interface Status {
  orgStatus: string;
  trialEndsAt: string;
  paymentsConfigured: boolean;
  subscription: { plan: string; status: string; outlet_quantity: number; current_period_end: string | null; cancel_at_period_end: boolean; checkout_url: string | null } | null;
}

// Plans mirror the original's public tiers; prices are set in Razorpay (see /replica-launch).
const PLANS = [
  { id: "core", name: "Core", blurb: "Billing, kitchen tickets, tables, reports and day close." },
  { id: "growth", name: "Growth", blurb: "Core plus captain app, kitchen display and QR ordering." },
  { id: "scale", name: "Scale", blurb: "Growth plus inventory, CRM and loyalty." },
] as const;

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });

// S42
export default function BillingPage() {
  const me = useMe();
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => fetch("/api/v1/billing", { cache: "no-store" }).then(async (r) => setS(await r.json())), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: string, path: string, body: unknown) {
    setBusy(kind);
    setError(null);
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError(data.error ?? "Something went wrong.");
    if (data.url) window.location.assign(data.url); // Razorpay's hosted page
    else await load();
  }

  const owner = me?.role === "owner";
  const sub = s?.subscription;
  const live = sub && ["incomplete", "active", "past_due", "paused"].includes(sub.status);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 lg:p-8">
      <h1 className="text-xl">Plan & billing</h1>
      {!s ? (
        <Skeleton className="h-32" />
      ) : (
        <>
          <section aria-labelledby="now-h" className="rounded-lg border border-border p-4">
            <h2 id="now-h" className="text-lg">Right now</h2>
            {live ? (
              <p className="mt-1 text-text-muted">
                <span className="font-semibold capitalize text-text">{sub!.plan}</span> plan · {sub!.outlet_quantity} outlet(s) ·{" "}
                {sub!.status === "incomplete" ? "waiting for payment" : sub!.status === "active" ? "active" : "payment problem"}
                {sub!.current_period_end && <> · {sub!.cancel_at_period_end ? "ends" : "renews"} {fmt(sub!.current_period_end)}</>}
              </p>
            ) : s.orgStatus === "trial" ? (
              <p className="mt-1 text-text-muted">Free trial until {fmt(s.trialEndsAt)}. Everything works; no card needed yet.</p>
            ) : (
              <p className="mt-1 text-text-muted">No active plan. Tills keep billing; the back office is read-only until you pick one.</p>
            )}
            {live && sub!.status === "incomplete" && sub!.checkout_url && (
              <a className="mt-3 inline-block font-semibold text-accent underline" href={sub!.checkout_url}>Finish payment</a>
            )}
            {live && owner && !sub!.cancel_at_period_end && (
              <div className="mt-4">
                <Button variant="secondary" onClick={() => setConfirm(true)}>Cancel subscription</Button>
              </div>
            )}
          </section>

          {!s.paymentsConfigured && (
            <Alert kind="info" title="Payments aren’t connected yet">
              The server needs Razorpay test keys and plan ids. See replica/backend.md.
            </Alert>
          )}

          {!live && (
            <section aria-labelledby="plans-h" className="flex flex-col gap-3">
              <h2 id="plans-h" className="text-lg">Choose a plan</h2>
              <p className="text-sm text-text-muted">Billed monthly per outlet through Razorpay (UPI Autopay or card). Cancel any time in one click.</p>
              <div className="grid gap-3 md:grid-cols-3">
                {PLANS.map((p) => (
                  <div key={p.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                    <h3 className="text-lg">{p.name}</h3>
                    <p className="flex-1 text-sm text-text-muted">{p.blurb}</p>
                    <Button disabled={!owner || !s.paymentsConfigured} loading={busy === p.id} onClick={() => act(p.id, "/api/v1/billing/checkout", { plan: p.id })}>
                      Choose {p.name}
                    </Button>
                  </div>
                ))}
              </div>
              {!owner && <p className="text-sm text-text-muted">Only the owner can change the plan.</p>}
            </section>
          )}
          {error && <Alert kind="danger" title={error} />}
        </>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel your subscription?"
        description="It stops renewing. You keep everything until the end of the paid period; after that the back office is read-only and your data stays."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Keep plan</Button>
            <Button variant="danger" loading={busy === "cancel"} onClick={async () => { await act("cancel", "/api/v1/billing/cancel", {}); setConfirm(false); }}>
              Cancel subscription
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">No questions, no calls. You can subscribe again whenever you like.</p>
      </Dialog>
    </div>
  );
}
