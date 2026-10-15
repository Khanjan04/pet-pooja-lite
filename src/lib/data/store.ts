// FAKE DATA LAYER: one in-memory database per browser, persisted to localStorage and
// shared between tabs with BroadcastChannel (that stands in for realtime, e.g. a KDS tab).
// /replica-backend replaces this file and api.ts with Supabase calls of the same shape.

import * as seed from "./seed";
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

const KEY = "kk-pos-db-v" + seed.SEED_VERSION;
const CHANNEL = "kk-pos";

export function seedDb(): Db {
  return {
    version: seed.SEED_VERSION,
    outlet: seed.outlet,
    taxes: seed.taxes,
    stations: seed.stations,
    categories: seed.categories,
    addonGroups: seed.addonGroups,
    items: seed.items,
    areas: seed.areas,
    tables: seed.tables,
    roles: seed.roles,
    staff: seed.staff,
    orders: [],
    orderItems: [],
    kots: [],
    bills: [],
    payments: [],
    audit: [],
    counters: {},
    device: { id: "device-t1", seriesCode: "T1" },
    session: null,
  };
}

let db: Db | null = null;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function load(): Db {
  const raw = storage()?.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Db;
    } catch {
      /* corrupt: fall through to seed */
    }
  }
  return seedDb();
}

function ensure(): Db {
  if (!db) {
    db = load();
    if (typeof window !== "undefined" && "BroadcastChannel" in window && !channel) {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => {
        db = load();
        listeners.forEach((l) => l());
      };
      window.addEventListener("storage", (e) => {
        if (e.key === KEY) {
          db = load();
          listeners.forEach((l) => l());
        }
      });
    }
  }
  return db;
}

export function getDb(): Db {
  return ensure();
}

/** Apply a change to a copy, persist, notify this tab and the others. */
export function commit<T>(change: (draft: Db) => T): T {
  const draft = structuredClone(ensure());
  const result = change(draft);
  db = draft;
  try {
    storage()?.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  channel?.postMessage("changed");
  listeners.forEach((l) => l());
  return result;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDb() {
  commit((d) => Object.assign(d, seedDb()));
}

/** Tests only. */
export function __setDb(next: Db | null) {
  db = next;
}
