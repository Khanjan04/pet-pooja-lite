"use client";

import { useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CloudOff, Info, RefreshCw, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "./button";

/* ---------- Stat tile ---------- */

export function StatTile({
  label,
  value,
  deltaPct,
  comparison,
  loading,
}: {
  label: string;
  value?: string;
  deltaPct?: number;
  comparison?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg p-4 shadow-card" aria-busy={loading || undefined}>
      <p className="text-sm text-text-muted">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <p className="num text-xl text-text">{value ?? "—"}</p>
      )}
      {!loading && deltaPct != null && comparison && (
        <p className={cn("inline-flex items-center gap-1 text-sm", deltaPct >= 0 ? "text-success" : "text-danger")}>
          {deltaPct >= 0 ? <ArrowUpRight aria-hidden className="size-4" /> : <ArrowDownRight aria-hidden className="size-4" />}
          <span>
            {deltaPct >= 0 ? "Up" : "Down"} {Math.abs(deltaPct)}% vs {comparison}
          </span>
        </p>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-sm bg-surface-sunken", className)} />;
}

/* ---------- Empty state ---------- */

export function EmptyState({ icon, title, help, action }: { icon: ReactNode; title: string; help: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-input p-8 text-center">
      <span className="text-text-muted [&>svg]:size-12" aria-hidden>
        {icon}
      </span>
      <p className="text-lg text-text">{title}</p>
      <p className="max-w-sm text-sm text-text-muted">{help}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------- Alerts (inline) ---------- */

type Tone = "info" | "success" | "warning" | "danger";
const tone: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "bg-accent-soft text-on-accent-soft", icon: <Info aria-hidden className="size-5" /> },
  success: { box: "bg-success-soft text-on-success-soft", icon: <CheckCircle2 aria-hidden className="size-5" /> },
  warning: { box: "bg-warning-soft text-on-warning-soft", icon: <AlertTriangle aria-hidden className="size-5" /> },
  danger: { box: "bg-danger-soft text-on-danger-soft", icon: <XCircle aria-hidden className="size-5" /> },
};

export function Alert({ kind = "info", title, children, action }: { kind?: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={kind === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md p-3", tone[kind].box)}>
      {tone[kind].icon}
      <div className="flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Offline / sync banner ---------- */

export function SyncBanner({ state, pending = 0, onRetry }: { state: "offline" | "syncing" | "synced" | "error"; pending?: number; onRetry?: () => void }) {
  if (state === "offline")
    return (
      <div role="status" className="flex items-center gap-2 bg-warning-soft px-4 py-2 text-sm font-semibold text-on-warning-soft">
        <CloudOff aria-hidden className="size-4" />
        Offline. Orders are saved on this device and will sync. {pending > 0 && <span className="num">({pending} waiting)</span>}
      </div>
    );
  if (state === "syncing")
    return (
      <div role="status" className="flex items-center gap-2 bg-accent-soft px-4 py-2 text-sm font-semibold text-on-accent-soft">
        <RefreshCw aria-hidden className="size-4 animate-spin" />
        Back online. Syncing <span className="num">{pending}</span> changes…
      </div>
    );
  if (state === "error")
    return (
      <div role="alert" className="flex items-center gap-2 bg-danger-soft px-4 py-2 text-sm font-semibold text-on-danger-soft">
        <XCircle aria-hidden className="size-4" />
        <span className="flex-1">Some changes didn’t sync.</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  return (
    <div role="status" className="flex items-center gap-2 bg-success-soft px-4 py-2 text-sm font-semibold text-on-success-soft">
      <CheckCircle2 aria-hidden className="size-4" /> All changes synced.
    </div>
  );
}

/* ---------- Dialog + reason picker ---------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-text/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 flex max-h-[90vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-bg text-text shadow-pop">
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div>
              <DialogPrimitive.Title className="text-lg">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close">
                <X aria-hidden className="size-5" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border p-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ReasonPicker({ reasons, onChange }: { reasons: string[]; onChange: (r: string) => void }) {
  const [picked, setPicked] = useState<string>("");
  const [other, setOther] = useState("");
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Reason (required)</legend>
      <div className="flex flex-wrap gap-2">
        {[...reasons, "Other"].map((r) => (
          <label
            key={r}
            className={cn(
              "inline-flex h-control-md cursor-pointer items-center rounded-pill border px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              picked === r ? "border-accent bg-accent-soft font-semibold text-on-accent-soft" : "border-border-input text-text",
            )}
          >
            <input
              type="radio"
              name="reason"
              value={r}
              className="sr-only"
              checked={picked === r}
              onChange={() => {
                setPicked(r);
                onChange(r === "Other" ? other : r);
              }}
            />
            {r}
          </label>
        ))}
      </div>
      {picked === "Other" && (
        <input
          aria-label="Other reason"
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            onChange(e.target.value);
          }}
          className="h-control-md rounded-md border border-border-input bg-bg px-3 text-base"
          placeholder="Type the reason"
        />
      )}
    </fieldset>
  );
}
