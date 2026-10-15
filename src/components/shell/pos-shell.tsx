"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, SyncBanner } from "@/components/ui/feedback";
import { logout } from "@/lib/data/api";
import { currentStaff, useDb, useDbStatus } from "@/lib/data/hooks";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/pos", label: "Tables" },
  { href: "/pos/orders", label: "Orders" },
  { href: "/pos/online", label: "Online" },
  { href: "/pos/day-end", label: "Close day" },
];

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** POS header, tabs and the PIN-session guard. */
export function PosShell({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const status = useDbStatus();
  const path = usePathname();
  const router = useRouter();
  const online = useOnline();
  const staff = db ? currentStaff(db) : null;

  useEffect(() => {
    if (status === "device_required") router.replace("/pos/pair");
    else if (db && !staff) router.replace("/pos/login");
  }, [status, db, staff, router]);

  if (status === "error" && !db)
    return (
      <div className="p-6">
        <Alert kind="danger" title="Can’t load the till" action={<Button size="sm" variant="secondary" onClick={() => location.reload()}>Retry</Button>}>
          Check the internet connection, then retry.
        </Alert>
      </div>
    );
  if (!db || !staff) return <div aria-busy className="flex-1" />;

  return (
    <>
      <header className="flex h-[var(--t-layout-pos-header)] shrink-0 items-center gap-2 border-b border-border bg-bg px-3">
        <nav aria-label="POS" className="flex flex-1 gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const on = t.href === "/pos" ? path === "/pos" || path.startsWith("/pos/order/") : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-control-sm shrink-0 items-center rounded-md px-3 text-sm font-semibold",
                  on ? "bg-accent-soft text-on-accent-soft" : "text-text-muted hover:bg-surface-sunken",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <span className="hidden text-sm text-text-muted md:inline">{staff.name}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={<LogOut aria-hidden className="size-4" />}
          onClick={async () => {
            await logout();
            router.replace("/pos/login");
          }}
        >
          <span className="hidden sm:inline">Switch user</span>
          <span className="sr-only sm:hidden">Switch user</span>
        </Button>
      </header>
      {!online && <SyncBanner state="offline" />}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}
