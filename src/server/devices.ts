import "server-only";
import { DEVICE_COOKIE, cookie } from "./cookies";
import { newToken, sha256 } from "./crypto";
import { one, type Db } from "./db";

const DEVICE_COOKIE_DAYS = 400;

/** Create a device with the next free bill series (T1, T2...) and its cookie. */
export async function pairDevice(c: Db, orgId: string, outletId: string, kind: "pos" | "captain" | "kds" | "kiosk", name: string) {
  await c.query("select 1 from outlets where id = $1 for update", [outletId]); // serialise series allocation
  const n = await one<{ n: number }>(c, "select count(*)::int + 1 as n from devices where outlet_id = $1", [outletId]);
  const token = newToken();
  const d = await one<{ id: string; series_code: string }>(
    c,
    "insert into devices (org_id, outlet_id, kind, name, series_code, token_hash) values ($1, $2, $3, $4, $5, $6) returning id, series_code",
    [orgId, outletId, kind, name, `T${n!.n}`, sha256(token)],
  );
  return { device: { id: d!.id, seriesCode: d!.series_code, kind, name }, cookie: cookie(DEVICE_COOKIE, token, DEVICE_COOKIE_DAYS * 86400) };
}
