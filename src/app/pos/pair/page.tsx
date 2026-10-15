"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { DomainError, pairThisBrowser, pairWithCode } from "@/lib/data/api";
import { store } from "@/lib/data/store";

// Turn this browser into a till: a 6-digit code from the back office, or one click for a signed-in owner.
export default function PairPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ outletIds: string[]; org: { name: string } } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then(async (r) => r.ok && setMe(await r.json())).catch(() => {});
  }, []);

  async function done(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await store("device").refresh();
      router.replace("/pos/login");
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Couldn’t pair this device.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <MonitorSmartphone aria-hidden className="size-12 text-accent" />
        <h1 className="text-xl">Set up this device as a till</h1>
        <p className="text-text-muted">An owner or manager can get a pairing code under Outlets & tills in the back office.</p>
      </div>
      {me && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-4">
          <p className="text-sm">You’re signed in to <span className="font-semibold">{me.org.name}</span>.</p>
          <Button onClick={() => done(() => pairThisBrowser(me.outletIds[0]))} loading={busy}>Use this browser as a till</Button>
        </div>
      )}
      <form
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void done(() => pairWithCode(code.trim()));
        }}
      >
        <Field label="Pairing code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        <Button type="submit" variant={me ? "secondary" : "primary"} loading={busy} disabled={code.length !== 6}>Pair with code</Button>
      </form>
      {error && <Alert kind="danger" title={error} />}
      {!me && (
        <p className="text-center text-sm text-text-muted">
          Owner? <Link className="font-semibold text-accent underline" href="/login">Sign in</Link> first to pair in one click.
        </p>
      )}
    </main>
  );
}
