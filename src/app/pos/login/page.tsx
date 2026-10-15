"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Numpad, PinDots } from "@/components/ui/pos";
import { Skeleton } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { DomainError, loginWithPin } from "@/lib/data/api";
import { useDb } from "@/lib/data/hooks";
import { cn } from "@/lib/cn";

const PIN_LENGTH = 4;

export default function PinLoginPage() {
  const db = useDb();
  const router = useRouter();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | undefined>();

  const submit = useCallback(
    async (full: string) => {
      if (!staffId) return;
      try {
        await loginWithPin(staffId, full);
        router.replace("/pos");
      } catch (e) {
        setError(e instanceof DomainError ? e.message : "Couldn’t log in.");
        setPin("");
      }
    },
    [staffId, router],
  );

  const press = useCallback(
    (k: string) => {
      setError(undefined);
      setPin((p) => {
        const next = k === "del" ? p.slice(0, -1) : p.length < PIN_LENGTH ? p + k : p;
        if (next.length === PIN_LENGTH && p.length < PIN_LENGTH) void submit(next);
        return next;
      });
    },
    [submit],
  );

  // Physical keyboard: digits and Backspace.
  useEffect(() => {
    if (!staffId) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staffId, press]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-sm text-text-muted">{db?.outlet.name ?? " "}</p>
        <h1 className="text-xl">Who’s on the till?</h1>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Staff member">
        {db
          ? db.staff.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={staffId === s.id}
                onClick={() => {
                  setStaffId(s.id);
                  setPin("");
                  setError(undefined);
                }}
                className={cn(
                  "flex min-h-control-lg items-center gap-3 rounded-lg border-2 bg-bg p-4 text-left font-semibold",
                  staffId === s.id ? "border-accent bg-accent-soft text-on-accent-soft" : "border-border hover:bg-surface",
                )}
              >
                <UserRound aria-hidden className="size-6 shrink-0" />
                {s.name}
              </button>
            ))
          : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[var(--t-control-lg)] w-full" />)}
      </div>

      {staffId && (
        <section aria-label="PIN" className="flex w-full max-w-xs flex-col items-center gap-6">
          <p className="text-lg">Enter your PIN</p>
          <PinDots length={PIN_LENGTH} filled={pin.length} error={error} />
          <Numpad mode="pin" onKey={press} />
          <p className="text-center text-xs text-text-muted">Demo PINs: 1111 manager · 2222 cashier · 3333 captain</p>
        </section>
      )}
      {!staffId && db && (
        <Button variant="ghost" onClick={() => router.push("/")}>
          Back
        </Button>
      )}
    </main>
  );
}
