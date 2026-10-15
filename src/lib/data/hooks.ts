"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { store, type Db, type Scope, type Status } from "./store";

const serverSnapshot = () => null;
const serverStatus = () => "loading" as Status;

/** The outlet's data, or null while loading (show a skeleton). "member" = back-office view. */
export function useDb(scope: Scope = "device"): Db | null {
  const s = store(scope);
  return useSyncExternalStore(s.subscribe, s.getDb, serverSnapshot);
}

export function useDbStatus(scope: Scope = "device"): Status {
  const s = store(scope);
  return useSyncExternalStore(s.subscribe, s.getStatus, serverStatus);
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
