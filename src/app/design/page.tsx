"use client";

import { useState } from "react";
import { ChefHat, Plus, Printer, Search, Send, Trash2, UtensilsCrossed } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Toggle } from "@/components/ui/form";
import {
  CartLine,
  CategoryRail,
  FoodTypeMark,
  ItemTile,
  Numpad,
  OrderCard,
  PaymentMethods,
  PinDots,
  Segmented,
  TableTile,
  type PayMethod,
} from "@/components/ui/pos";
import { Alert, Dialog, EmptyState, ReasonPicker, StatTile, SyncBanner } from "@/components/ui/feedback";
import { formatPaise } from "@/lib/money";

const ROLES = [
  "bg", "surface", "surface-sunken", "border", "border-input", "text", "text-muted",
  "accent", "accent-soft", "danger", "danger-soft", "success", "success-soft", "warning", "warning-soft",
  "table-running", "table-kot", "table-billed", "table-paid", "table-reserved", "veg", "non-veg", "egg",
];

const CATEGORIES = [
  { id: "starters", name: "Starters", count: 12 },
  { id: "mains", name: "Main course", count: 18 },
  { id: "breads", name: "Breads", count: 8 },
  { id: "drinks", name: "Drinks", count: 15 },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-border py-8">
      <h2 id={id} className="text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [density, setDensity] = useState<"compact" | "touch">("touch");
  const [cat, setCat] = useState("starters");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [pay, setPay] = useState<PayMethod>("upi");
  const [qty, setQty] = useState(2);
  const [inStock, setInStock] = useState(true);
  const [pin, setPin] = useState("");
  const [dialog, setDialog] = useState(false);

  return (
    <div data-theme={theme} data-density={density} className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-xl">Design system</h1>
          <p className="text-sm text-text-muted">Tokens and primitives for the POS, captain, kitchen display and back office.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <Segmented
            label="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: "compact", label: "Back office" },
              { value: "touch", label: "Touch" },
            ]}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[var(--t-layout-bo-content-max)] px-4 pb-16">
        <Section id="s-colour" title="Colour roles">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {ROLES.map((r) => (
              <li key={r} className="flex flex-col gap-1">
                <span className="h-12 rounded-md border border-border" style={{ background: `var(--t-color-${r})` }} />
                <code className="text-xs text-text-muted">{r}</code>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="s-type" title="Type scale">
          <div className="flex flex-col gap-2">
            <p className="text-display">₹1,24,580</p>
            <p className="text-xl">Today’s sales</p>
            <p className="text-lg">Table 12 · 4 guests</p>
            <p className="text-base">Paneer tikka with mint chutney</p>
            <p className="text-sm text-text-muted">Extra spicy, no onion</p>
            <p className="text-xs text-text-muted">KOT 0042 · 8:41 pm</p>
            <p className="text-base">पनीर टिक्का — मेनू आइटम हिंदी में</p>
          </div>
        </Section>

        <Section id="s-buttons" title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<Send aria-hidden className="size-4" />}>Send to kitchen</Button>
            <Button variant="secondary" icon={<Printer aria-hidden className="size-4" />}>
              Print bill
            </Button>
            <Button variant="success">Settle</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger" icon={<Trash2 aria-hidden className="size-4" />}>
              Void item
            </Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <IconButton label="Search menu" variant="secondary">
              <Search aria-hidden className="size-5" />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section id="s-forms" title="Form fields">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Item name" required placeholder="e.g. Masala dosa" />
            <Field label="Price" prefix="₹" inputMode="decimal" defaultValue="240.00" hint="Before tax" />
            <Field label="Customer phone" prefix="+91" inputMode="tel" defaultValue="98765" error="Enter a 10-digit mobile number" />
            <Field label="GSTIN" defaultValue="24AAACP1234Q1Z5" className="uppercase" />
            <Field label="Shortcode" disabled defaultValue="PT" />
            <div className="flex items-end">
              <Toggle label="In stock" checked={inStock} onCheckedChange={setInStock} />
            </div>
          </div>
        </Section>

        <Section id="s-pos" title="POS: categories, items, order">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Order type"
              value={orderType}
              onChange={setOrderType}
              options={[
                { value: "dine_in", label: "Dine-in" },
                { value: "takeaway", label: "Takeaway" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
            <span className="inline-flex items-center gap-2 text-sm text-text-muted">
              <FoodTypeMark type="veg" /> Veg <FoodTypeMark type="non_veg" /> Non-veg <FoodTypeMark type="egg" /> Egg
            </span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row">
            <CategoryRail categories={CATEGORIES} selected={cat} onSelect={setCat} />
            <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(var(--t-layout-item-tile-min),1fr))] content-start gap-3">
              <ItemTile name="Paneer tikka" pricePaise={24000} foodType="veg" qtyInCart={qty} />
              <ItemTile name="Chicken 65" pricePaise={28000} foodType="non_veg" hasOptions />
              <ItemTile name="Egg bhurji" pricePaise={16000} foodType="egg" />
              <ItemTile name="Hara bhara kebab with a very long name that wraps" pricePaise={22000} foodType="veg" />
              <ItemTile name="Fish amritsari" pricePaise={36000} foodType="non_veg" soldOut />
              <ItemTile name="Veg spring roll" pricePaise={19000} foodType="veg" hasOptions />
            </div>
            <aside aria-label="Current order" className="w-full rounded-lg border border-border bg-surface p-4 lg:w-[var(--t-layout-pos-cart)]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg">Table 12</h3>
                <span className="text-sm text-text-muted">4 guests · Ravi</span>
              </div>
              <ul>
                <CartLine name="Paneer tikka" detail="Full plate" note="Extra spicy" qty={qty} linePaise={qty * 24000} onQty={(q) => setQty(Math.max(1, q))} />
                <CartLine name="Butter naan" qty={4} linePaise={24000} state="sent" />
                <CartLine name="Dal makhani" qty={1} linePaise={32000} state="void" voidReason="Guest changed mind" />
                <CartLine name="Gulab jamun" qty={1} linePaise={9000} state="nc" />
              </ul>
              <dl className="num mt-3 flex flex-col gap-1 text-sm">
                <div className="flex justify-between text-text-muted"><dt>Subtotal</dt><dd>{formatPaise(qty * 24000 + 24000)}</dd></div>
                <div className="flex justify-between text-text-muted"><dt>CGST 2.5% + SGST 2.5%</dt><dd>{formatPaise(Math.round((qty * 24000 + 24000) * 0.05))}</dd></div>
                <div className="flex justify-between text-xl"><dt>Total</dt><dd>{formatPaise(Math.round((qty * 24000 + 24000) * 1.05 / 100) * 100)}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={<Printer aria-hidden className="size-4" />}>Print bill</Button>
                <Button icon={<Send aria-hidden className="size-4" />}>Send to kitchen</Button>
              </div>
            </aside>
          </div>
        </Section>

        <Section id="s-tables" title="Table floor">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--t-layout-table-tile-min),1fr))] gap-3">
            <TableTile name="T1" state="blank" seats={2} />
            <TableTile name="T2" state="running" seats={4} minutes={6} />
            <TableTile name="T3" state="kot" seats={4} minutes={23} />
            <TableTile name="T4" state="billed" seats={6} minutes={58} amountPaise={184500} />
            <TableTile name="T5" state="paid" seats={2} minutes={64} />
            <TableTile name="T6" state="reserved" seats={8} reservedAt="8:30 pm" />
            <TableTile name="T7" state="kot" seats={4} minutes={12} mergedWith="T8" />
          </div>
        </Section>

        <Section id="s-pay" title="Settle & keypads">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px_280px]">
            <div className="flex flex-col gap-3">
              <PaymentMethods value={pay} onChange={setPay} amounts={{ upi: 100000 }} disabled={["wallet"]} />
              <Alert kind="info" title="Split this bill?">Split equally, by item or by amount. GST is worked out for each share.</Alert>
            </div>
            <Numpad onKey={(k) => setPin((p) => (k === "del" ? p.slice(0, -1) : p.length < 4 ? p + k : p))} mode="pin" />
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-surface p-4">
              <p className="text-lg">Enter your PIN</p>
              <PinDots length={4} filled={pin.length} />
              <PinDots length={4} filled={4} error="Wrong PIN. 3 tries left." />
            </div>
          </div>
        </Section>

        <Section id="s-kds" title="Kitchen display & online orders">
          <div data-theme="dark" className="grid gap-4 rounded-lg bg-bg p-4 text-text md:grid-cols-2 xl:grid-cols-3">
            <OrderCard
              title="KOT 0042"
              source="Table 12"
              type="Dine-in"
              minutes={3}
              targetMinutes={15}
              state="new"
              lines={[
                { qty: 2, name: "Paneer tikka", detail: "Full plate", note: "Extra spicy" },
                { qty: 4, name: "Butter naan" },
              ]}
              actions={<Button variant="secondary" className="flex-1">Start</Button>}
            />
            <OrderCard
              title="KOT 0039"
              source="Website"
              type="Delivery"
              minutes={19}
              targetMinutes={15}
              state="late"
              lines={[
                { qty: 1, name: "Chicken biryani", ready: true },
                { qty: 1, name: "Raita", cancelled: true },
              ]}
              actions={<Button variant="success" className="flex-1" icon={<ChefHat aria-hidden className="size-4" />}>Mark ready</Button>}
            />
            <OrderCard
              title="KOT 0037"
              source="QR · Table 4"
              type="Dine-in"
              minutes={9}
              targetMinutes={15}
              state="ready"
              lines={[{ qty: 3, name: "Masala chai" }]}
            />
          </div>
        </Section>

        <Section id="s-feedback" title="Status & feedback">
          <div className="flex flex-col gap-2 overflow-hidden rounded-lg border border-border">
            <SyncBanner state="offline" pending={3} />
            <SyncBanner state="syncing" pending={3} />
            <SyncBanner state="error" />
            <SyncBanner state="synced" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Sales today" value={formatPaise(12458000)} deltaPct={12} comparison="last Thursday" />
            <StatTile label="Orders" value="214" deltaPct={-4} comparison="last Thursday" />
            <StatTile label="Average bill" value={formatPaise(58200)} />
            <StatTile label="Cancelled KOTs" loading />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Alert kind="success" title="Day closed">Summary sent to the owner.</Alert>
            <Alert kind="warning" title="Kitchen printer not responding">KOTs will show on screen until it’s back.</Alert>
            <Alert kind="danger" title="Couldn’t save the bill" action={<Button size="sm" variant="secondary">Retry</Button>}>
              Check the connection and try again.
            </Alert>
          </div>
          <EmptyState
            icon={<UtensilsCrossed />}
            title="No items yet"
            help="Add your first dish, or import your menu from a spreadsheet."
            action={<Button icon={<Plus aria-hidden className="size-4" />}>Add item</Button>}
          />
          <div>
            <Button variant="danger" onClick={() => setDialog(true)}>Void an item…</Button>
            <Dialog
              open={dialog}
              onOpenChange={setDialog}
              title="Void Dal makhani?"
              description="It has already gone to the kitchen. A cancellation ticket will print."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialog(false)}>Keep item</Button>
                  <Button variant="danger" onClick={() => setDialog(false)}>Void item</Button>
                </>
              }
            >
              <ReasonPicker reasons={["Guest changed mind", "Wrong item", "Out of stock", "Quality issue"]} onChange={() => {}} />
            </Dialog>
          </div>
        </Section>
      </main>
    </div>
  );
}
