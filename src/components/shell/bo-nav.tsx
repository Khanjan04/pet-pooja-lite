"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Boxes, ChefHat, ClipboardList, CreditCard, FileClock, LayoutDashboard, Menu as MenuIcon,
  MonitorSmartphone, Percent, Plug, Printer, Settings, Store, Tags, Users, UtensilsCrossed, X, Heart, Grid3x3,
} from "lucide-react";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string; icon: React.ReactNode; soon?: boolean };
const ic = "size-4";
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard aria-hidden className={ic} /> },
      { href: "/reports", label: "Reports", icon: <BarChart3 aria-hidden className={ic} /> },
      { href: "/audit", label: "Audit trail", icon: <FileClock aria-hidden className={ic} /> },
    ],
  },
  {
    title: "Menu",
    items: [
      { href: "/menu", label: "Items", icon: <UtensilsCrossed aria-hidden className={ic} /> },
      { href: "/menu/addons", label: "Variations & add-ons", icon: <Tags aria-hidden className={ic} /> },
      { href: "/discounts", label: "Discounts", icon: <Percent aria-hidden className={ic} /> },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/floor", label: "Floor & QR codes", icon: <Grid3x3 aria-hidden className={ic} /> },
      { href: "/settings/stations", label: "Stations & printers", icon: <Printer aria-hidden className={ic} /> },
      { href: "/settings/taxes", label: "Taxes & charges", icon: <ClipboardList aria-hidden className={ic} /> },
      { href: "/staff", label: "Staff & permissions", icon: <Users aria-hidden className={ic} /> },
      { href: "/settings", label: "Outlet settings", icon: <Settings aria-hidden className={ic} /> },
      { href: "/outlets", label: "Outlets", icon: <Store aria-hidden className={ic} />, soon: true },
    ],
  },
  {
    title: "Stock",
    items: [{ href: "/inventory", label: "Inventory", icon: <Boxes aria-hidden className={ic} />, soon: true }],
  },
  {
    title: "Customers",
    items: [{ href: "/crm", label: "Customers & loyalty", icon: <Heart aria-hidden className={ic} />, soon: true }],
  },
  {
    title: "Account",
    items: [
      { href: "/integrations", label: "Integrations", icon: <Plug aria-hidden className={ic} />, soon: true },
      { href: "/billing", label: "Plan & billing", icon: <CreditCard aria-hidden className={ic} /> },
    ],
  },
];

function isActive(path: string, href: string) {
  if (href === "/menu") return path === "/menu" || path.startsWith("/menu/items");
  if (href === "/settings") return path === "/settings";
  return path === href || path.startsWith(href + "/");
}

export function BoNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex h-[var(--t-layout-bo-header)] items-center justify-between border-b border-border bg-bg px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="bo-nav"
          onClick={() => setOpen((o) => !o)}
          className="grid size-control-md place-items-center rounded-md hover:bg-surface-sunken"
        >
          {open ? <X aria-hidden className="size-5" /> : <MenuIcon aria-hidden className="size-5" />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      <nav
        id="bo-nav"
        aria-label="Back office"
        className={cn(
          "w-full shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-surface p-3 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[var(--t-layout-bo-sidebar)]",
          open ? "flex" : "hidden",
        )}
      >
        <div className="hidden px-2 pt-2 lg:block">
          <Brand />
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{g.title}</p>
            {g.items.map((it) => {
              const on = isActive(path, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={on ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-control-sm items-center gap-2 rounded-md px-2 text-sm",
                    on ? "bg-accent-soft font-semibold text-on-accent-soft" : "text-text hover:bg-surface-sunken",
                  )}
                >
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  {it.soon && <span className="text-xs text-text-muted">Soon</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
          <Link href="/pos" className="flex h-control-sm items-center gap-2 rounded-md px-2 text-sm font-semibold text-accent hover:bg-surface-sunken">
            <MonitorSmartphone aria-hidden className={ic} /> Open the POS
          </Link>
          <Link href="/kds" className="flex h-control-sm items-center gap-2 rounded-md px-2 text-sm text-text hover:bg-surface-sunken">
            <ChefHat aria-hidden className={ic} /> Kitchen display
          </Link>
        </div>
      </nav>
    </>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 text-base font-bold text-text">
      <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-sm text-on-accent">
        R
      </span>
      Restaurant POS
    </Link>
  );
}
