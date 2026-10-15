"use client";

import type { ReactNode } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import {
  Banknote,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Delete,
  HandCoins,
  Link2,
  Lock,
  Minus,
  Plus,
  Receipt,
  Smartphone,
  Utensils,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/money";

/* ---------- Food-type mark: shape + colour, never colour alone ---------- */

export type FoodType = "veg" | "non_veg" | "egg";
const foodLabel: Record<FoodType, string> = { veg: "Veg", non_veg: "Non-veg", egg: "Contains egg" };

export function FoodTypeMark({ type, size = 14 }: { type: FoodType; size?: number }) {
  const colour = type === "veg" ? "text-veg" : type === "egg" ? "text-egg" : "text-non-veg";
  return (
    <svg role="img" aria-label={foodLabel[type]} width={size} height={size} viewBox="0 0 16 16" className={cn("shrink-0", colour)}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      {type === "non_veg" ? <path d="M8 4 L12 11.5 H4 Z" fill="currentColor" /> : <circle cx="8" cy="8" r="3.5" fill="currentColor" />}
    </svg>
  );
}

/* ---------- Item tile ---------- */

export function ItemTile({
  name,
  pricePaise,
  foodType,
  qtyInCart = 0,
  soldOut = false,
  hasOptions = false,
  onAdd,
}: {
  name: string;
  pricePaise: number;
  foodType: FoodType;
  qtyInCart?: number;
  soldOut?: boolean;
  hasOptions?: boolean;
  onAdd?: () => void;
}) {
  const label = `${name}, ${formatPaise(pricePaise)}, ${foodLabel[foodType]}${soldOut ? ", sold out" : ""}${qtyInCart ? `, ${qtyInCart} in order` : ""}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={soldOut || undefined}
      onClick={soldOut ? undefined : onAdd}
      className={cn(
        "relative flex min-h-control-lg min-w-[var(--t-layout-item-tile-min)] flex-col justify-between gap-2 rounded-md border p-3 text-left ease-token transition-[background-color,transform]",
        soldOut
          ? "cursor-not-allowed border-border bg-surface-sunken"
          : qtyInCart
            ? "border-accent bg-accent-soft active:scale-[.98]"
            : "border-border bg-bg hover:bg-surface active:scale-[.98]",
      )}
    >
      <span className="flex items-start gap-2">
        <span className="mt-1">
          <FoodTypeMark type={foodType} />
        </span>
        <span className={cn("line-clamp-2 text-sm font-semibold", qtyInCart ? "text-on-accent-soft" : "text-text")}>{name}</span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className={cn("num text-sm", soldOut ? "text-text-muted line-through" : "text-text-muted")}>{formatPaise(pricePaise)}</span>
        {soldOut ? (
          <span className="text-xs text-text-muted">Sold out</span>
        ) : hasOptions ? (
          <span className="text-xs text-text-muted">+ options</span>
        ) : null}
      </span>
      {qtyInCart > 0 && (
        <span aria-hidden className="num absolute -right-2 -top-2 grid size-6 place-items-center rounded-pill bg-accent text-xs font-bold text-on-accent">
          {qtyInCart}
        </span>
      )}
    </button>
  );
}

/* ---------- Category rail (tablist) ---------- */

export function CategoryRail({
  categories,
  selected,
  onSelect,
  orientation = "vertical",
}: {
  categories: { id: string; name: string; count: number }[];
  selected: string;
  onSelect: (id: string) => void;
  orientation?: "vertical" | "horizontal";
}) {
  const vertical = orientation === "vertical";
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const next = vertical ? "ArrowDown" : "ArrowRight";
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    if (e.key !== next && e.key !== prev) return;
    e.preventDefault();
    const j = (i + (e.key === next ? 1 : -1) + categories.length) % categories.length;
    onSelect(categories[j].id);
    (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label="Menu categories"
      aria-orientation={orientation}
      className={cn(vertical ? "flex w-[var(--t-layout-pos-category-rail)] flex-col gap-1" : "flex gap-2 overflow-x-auto")}
    >
      {categories.map((c, i) => {
        const on = c.id === selected;
        return (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex min-h-[var(--t-control-md)] items-center justify-between gap-2 px-3 text-left text-sm ease-token transition-colors",
              vertical ? "rounded-r-md border-l-[3px]" : "shrink-0 rounded-pill border",
              on
                ? vertical
                  ? "border-accent bg-accent-soft font-semibold text-on-accent-soft"
                  : "border-accent bg-accent-soft font-semibold text-on-accent-soft"
                : vertical
                  ? "border-transparent text-text hover:bg-surface-sunken"
                  : "border-border text-text hover:bg-surface-sunken",
            )}
          >
            <span>{c.name}</span>
            <span className="num text-xs text-text-muted">{c.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Cart line ---------- */

export type CartLineState = "editing" | "sent" | "void" | "nc";

export function CartLine({
  name,
  detail,
  note,
  qty,
  linePaise,
  state = "editing",
  voidReason,
  onQty,
  trailing,
}: {
  name: string;
  detail?: string;
  note?: string;
  qty: number;
  linePaise: number;
  state?: CartLineState;
  voidReason?: string;
  onQty?: (q: number) => void;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3">
      {state === "editing" ? (
        <div className="flex items-center rounded-md border border-border-input" role="group" aria-label={`Quantity of ${name}`}>
          <button type="button" aria-label={`Decrease quantity of ${name}`} onClick={() => onQty?.(qty - 1)} className="grid size-control-sm place-items-center text-text hover:bg-surface-sunken">
            <Minus aria-hidden className="size-4" />
          </button>
          <span className="num w-7 text-center text-sm font-semibold" aria-live="polite">
            {qty}
          </span>
          <button type="button" aria-label={`Increase quantity of ${name}`} onClick={() => onQty?.(qty + 1)} className="grid size-control-sm place-items-center text-text hover:bg-surface-sunken">
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      ) : (
        <span className="num grid h-control-sm w-[calc(var(--t-control-sm)*2.4)] place-items-center text-sm font-semibold text-text-muted">{qty} ×</span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", state === "void" ? "text-text-muted line-through" : "text-text")}>{name}</p>
        {detail && <p className="text-xs text-text-muted">{detail}</p>}
        {note && <p className="text-xs italic text-text-muted">“{note}”</p>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {state === "sent" && (
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Lock aria-hidden className="size-3" /> Sent to kitchen
            </span>
          )}
          {state === "void" && (
            <span className="rounded-sm bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-on-danger-soft">Void{voidReason ? ` · ${voidReason}` : ""}</span>
          )}
          {state === "nc" && <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-on-warning-soft">On the house</span>}
        </div>
      </div>
      <span className={cn("num text-sm font-semibold", state === "void" || state === "nc" ? "text-text-muted line-through" : "text-text")}>
        {formatPaise(linePaise)}
      </span>
      {trailing}
    </li>
  );
}

/* ---------- Numpad / PIN pad ---------- */

export function Numpad({ onKey, mode = "amount" }: { onKey: (k: string) => void; mode?: "amount" | "pin" | "qty" }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", mode === "amount" ? "." : "", "0", "del"];
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={mode === "pin" ? "PIN keypad" : "Number keypad"}>
      {keys.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : (
          <button
            key={k}
            type="button"
            aria-label={k === "del" ? "Delete" : k}
            onClick={() => onKey(k)}
            className="num grid h-control-lg place-items-center rounded-md border border-border bg-bg text-xl font-semibold text-text ease-token transition-transform hover:bg-surface active:scale-[.97]"
          >
            {k === "del" ? <Delete aria-hidden className="size-6" /> : k}
          </button>
        ),
      )}
    </div>
  );
}

export function PinDots({ length, filled, error }: { length: number; filled: number; error?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-3" role="status">
        <span className="sr-only">{`${filled} of ${length} digits entered`}</span>
        {Array.from({ length }, (_, i) => (
          <span key={i} aria-hidden className={cn("size-4 rounded-pill border-2", error ? "border-danger" : "border-border-input", i < filled && (error ? "bg-danger" : "bg-text"))} />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Table tile ---------- */

export type TableState = "blank" | "running" | "kot" | "billed" | "paid" | "reserved";

const tableStyle: Record<TableState, { box: string; label: string; icon: ReactNode }> = {
  blank: { box: "bg-table-blank text-on-table-blank border-2 border-dashed border-border-input", label: "Free", icon: null },
  running: { box: "bg-table-running text-on-table-running", label: "Seated", icon: <Utensils aria-hidden className="size-4" /> },
  kot: { box: "bg-table-kot text-on-table-kot", label: "In kitchen", icon: <ChefHat aria-hidden className="size-4" /> },
  billed: { box: "bg-table-billed text-on-table-billed", label: "Bill printed", icon: <Receipt aria-hidden className="size-4" /> },
  paid: { box: "bg-table-paid text-on-table-paid", label: "Paid", icon: <Check aria-hidden className="size-4" /> },
  reserved: { box: "bg-table-reserved text-on-table-reserved", label: "Reserved", icon: <Clock aria-hidden className="size-4" /> },
};

export function TableTile({
  name,
  state,
  seats,
  minutes,
  amountPaise,
  mergedWith,
  reservedAt,
  onOpen,
}: {
  name: string;
  state: TableState;
  seats: number;
  minutes?: number;
  amountPaise?: number;
  mergedWith?: string;
  reservedAt?: string;
  onOpen?: () => void;
}) {
  const s = tableStyle[state];
  const label = state === "reserved" && reservedAt ? `Reserved ${reservedAt}` : s.label;
  const a11y = [`Table ${name}`, label, `${seats} seats`, minutes != null && `${minutes} minutes`, mergedWith && `merged with ${mergedWith}`]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      aria-label={a11y}
      onClick={onOpen}
      className={cn(
        "flex aspect-square min-w-[var(--t-layout-table-tile-min)] flex-col justify-between rounded-lg p-3 text-left shadow-card ease-token transition-transform active:scale-[.97]",
        s.box,
      )}
    >
      <span className="flex items-start justify-between">
        <span className="text-lg font-bold">{name}</span>
        {mergedWith && <Link2 aria-hidden className="size-4" />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-semibold">
          {s.icon}
          {label}
        </span>
        <span className="num flex justify-between text-xs opacity-90">
          <span>{seats} seats</span>
          {minutes != null && <span>{minutes} min</span>}
        </span>
        {amountPaise != null && <span className="num text-sm font-bold">{formatPaise(amountPaise)}</span>}
      </span>
    </button>
  );
}

/* ---------- Segmented control (order type) ---------- */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={(v) => onChange(v as T)} orientation="horizontal" className="inline-flex rounded-md border border-border-input bg-surface p-1">
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className="h-control-sm rounded-sm px-4 text-sm font-semibold text-text-muted ease-token transition-colors disabled:opacity-50 data-[state=checked]:bg-bg data-[state=checked]:text-text data-[state=checked]:shadow-card"
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/* ---------- Payment method tiles ---------- */

export type PayMethod = "cash" | "card" | "upi" | "wallet" | "due";
const payMeta: Record<PayMethod, { label: string; icon: ReactNode }> = {
  cash: { label: "Cash", icon: <Banknote aria-hidden className="size-6" /> },
  card: { label: "Card", icon: <CreditCard aria-hidden className="size-6" /> },
  upi: { label: "UPI", icon: <Smartphone aria-hidden className="size-6" /> },
  wallet: { label: "Wallet", icon: <Wallet aria-hidden className="size-6" /> },
  due: { label: "Pay later", icon: <HandCoins aria-hidden className="size-6" /> },
};

export function PaymentMethods({
  value,
  onChange,
  amounts = {},
  disabled = [],
}: {
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  amounts?: Partial<Record<PayMethod, number>>;
  disabled?: PayMethod[];
}) {
  return (
    <RadioGroup.Root aria-label="Payment method" value={value} onValueChange={(v) => onChange(v as PayMethod)} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {(Object.keys(payMeta) as PayMethod[]).map((m) => (
        <RadioGroup.Item
          key={m}
          value={m}
          disabled={disabled.includes(m)}
          className="flex min-h-control-lg flex-col items-center justify-center gap-1 rounded-md border-2 border-border bg-bg p-2 text-sm font-semibold text-text ease-token transition-colors disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:text-on-accent-soft"
        >
          {payMeta[m].icon}
          {payMeta[m].label}
          {amounts[m] != null && <span className="num text-xs font-normal">{formatPaise(amounts[m]!)}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/* ---------- Timer badge ---------- */

export function TimerBadge({ minutes, targetMinutes }: { minutes: number; targetMinutes: number }) {
  const late = minutes >= targetMinutes;
  const warn = !late && minutes >= targetMinutes * 0.75;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold",
        late ? "bg-danger text-on-danger" : warn ? "bg-warning-soft text-on-warning-soft" : "bg-surface-sunken text-text-muted",
      )}
    >
      <Clock aria-hidden className="size-3" />
      {minutes} min{late && " · Late"}
    </span>
  );
}

/* ---------- Order card (online inbox + KDS) ---------- */

export type OrderCardState = "new" | "preparing" | "ready" | "late";

export function OrderCard({
  title,
  source,
  type,
  minutes,
  targetMinutes,
  state,
  lines,
  actions,
}: {
  title: string;
  source: string;
  type: string;
  minutes: number;
  targetMinutes: number;
  state: OrderCardState;
  lines: { qty: number; name: string; detail?: string; note?: string; cancelled?: boolean; ready?: boolean }[];
  actions?: ReactNode;
}) {
  return (
    <article
      aria-labelledby={`${title}-h`}
      className={cn(
        "flex min-w-[var(--t-layout-kds-card-min)] flex-col rounded-lg border-2 bg-surface shadow-card",
        state === "new" && "border-accent",
        state === "late" && "border-danger",
        state === "ready" && "border-success bg-success-soft",
        state === "preparing" && "border-border",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <h3 id={`${title}-h`} className="text-lg font-bold text-text">
            {title}
          </h3>
          <p className="text-xs text-text-muted">
            {source} · {type}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {state === "new" && <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs font-bold text-on-accent">New</span>}
          {state === "ready" && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-on-success-soft">
              <Check aria-hidden className="size-3" /> Ready
            </span>
          )}
          <TimerBadge minutes={minutes} targetMinutes={targetMinutes} />
        </div>
      </header>
      <ul className="flex-1 divide-y divide-border px-3">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-3 py-2">
            <span className="num w-8 text-lg font-bold text-text">{l.qty}×</span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-base font-semibold", l.cancelled ? "text-text-muted line-through" : "text-text")}>{l.name}</p>
              {l.detail && <p className="text-sm text-text-muted">{l.detail}</p>}
              {l.note && <p className="text-sm font-semibold text-warning">Note: {l.note}</p>}
              {l.cancelled && <span className="rounded-sm bg-danger-soft px-1.5 py-0.5 text-xs font-bold text-on-danger-soft">Cancelled</span>}
            </div>
            {l.ready && <Check aria-label="Ready" className="size-5 text-success" />}
          </li>
        ))}
      </ul>
      {actions && <footer className="flex gap-2 border-t border-border p-3">{actions}</footer>}
    </article>
  );
}
