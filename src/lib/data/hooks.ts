"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getDb, subscribe, type Db } from "./store";

const serverSnapshot = () => null;

/** The whole database, or null during server render / first paint (show a skeleton). */
export function useDb(): Db | null {
  return useSyncExternalStore(subscribe, getDb, serverSnapshot);
}

/** Ticks every `ms` so timers on screen stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function currentStaff(d: Db) {
  const s = d.session;
  if (!s || Date.parse(s.expiresAt) < Date.now()) return null;
  const staff = d.staff.find((x) => x.id === s.staffId) ?? null;
  const role = staff ? d.roles.find((r) => r.id === staff.roleId) ?? null : null;
  return staff && role ? { ...staff, role } : null;
}
