// Client cache of one outlet's data, in the shape the screens use. Filled from
// GET /api/v1/pos/snapshot and refreshed when the server announces a change over
// Server-Sent Events (/api/v1/events), when the tab regains focus, and after every command.

import type {
  AddonGroup, Area, AuditEntry, Bill, Category, Item, Kot, Order, OrderItem, Outlet, Payment, Role, Staff, Station, Table, Tax,
} from "@/lib/domain/types";

export interface Db {
  version: number;
  outlet: Outlet;
  taxes: Tax[];
  stations: Station[];
  categories: Category[];
  addonGroups: AddonGroup[];
  items: Item[];
  areas: Area[];
  tables: Table[];
  roles: Role[];
  staff: Staff[];
  orders: Order[];
  orderItems: OrderItem[];
  kots: Kot[];
  bills: Bill[];
  payments: Payment[];
  audit: AuditEntry[];
  counters: Record<string, number>;
  device: { id: string; seriesCode: string };
  session: { staffId: string; expiresAt: string } | null;
}

export type Scope = "device" | "member";
export type Status = "loading" | "ready" | "device_required" | "signin_required" | "org_required" | "error";

class Store {
  db: Db | null = null;
  status: Status = "loading";
  error: string | null = null;
  private listeners = new Set<() => void>();
  private events: EventSource | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private again = false;

  constructor(private scope: Scope) {}

  private notify() {
    this.listeners.forEach((l) => l());
  }

  /** Fetch a fresh snapshot. Calls during a fetch coalesce into one more fetch afterwards. */
  refresh = (): Promise<void> => {
    if (this.inflight) {
      this.again = true;
      return this.inflight;
    }
    this.inflight = (async () => {
      try {
        const res = await fetch(`/api/v1/pos/snapshot${this.scope === "member" ? "?as-member=1" : ""}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          this.db = data as Db;
          this.status = "ready";
          this.error = null;
        } else {
          const code = data.code as Status | undefined;
          this.status = code && ["device_required", "signin_required", "org_required"].includes(code) ? code : "error";
          this.error = data.error ?? "Couldn’t load data.";
          if (this.status !== "error") this.db = null;
        }
      } catch {
        // Network down: keep showing what we have.
        if (!this.db) {
          this.status = "error";
          this.error = "Can’t reach the server. Check the connection.";
        }
      } finally {
        this.inflight = null;
        this.notify();
        if (this.again) {
          this.again = false;
          void this.refresh();
        }
      }
    })();
    return this.inflight;
  };

  private soon = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 120);
  };

  private onFocus = () => {
    if (document.visibilityState === "visible") this.soon();
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1 && typeof window !== "undefined") {
      void this.refresh();
      this.events = new EventSource("/api/v1/events");
      this.events.addEventListener("change", this.soon);
      this.events.addEventListener("ready", this.soon); // reconnected: catch up on anything missed
      document.addEventListener("visibilitychange", this.onFocus);
      window.addEventListener("online", this.soon);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.events?.close();
        this.events = null;
        document.removeEventListener("visibilitychange", this.onFocus);
        window.removeEventListener("online", this.soon);
      }
    };
  };

  getDb = () => this.db;
  getStatus = () => this.status;
}

const stores: Record<Scope, Store> = { device: new Store("device"), member: new Store("member") };
export const store = (scope: Scope = "device") => stores[scope];
