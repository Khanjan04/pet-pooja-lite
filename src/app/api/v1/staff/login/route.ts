import { z } from "zod";
import { device } from "@/server/actors";
import { STAFF_COOKIE, cookie } from "@/server/cookies";
import { newToken, sha256, verifyPin } from "@/server/crypto";
import { one, pool, tx } from "@/server/db";
import { body, HttpError, json, route, unauthorized } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

const SESSION_HOURS = 12;
const MAX_TRIES = 5;

// S17: staff PIN on a paired device. 5 wrong PINs lock that person out for 5 minutes.
export const POST = route(async (req: Request) => {
  const d = await device(req);
  await rateLimit(`pin:${d.deviceId}`, 20, 60);
  const input = await body(req, z.object({ staffId: z.uuid(), pin: z.string().regex(/^\d{4,6}$/) }));
  const s = await one<{ id: string; pin_hash: string; locked_until: Date | null; failed_pin_attempts: number }>(
    pool(),
    `select s.id, ss.pin_hash, s.locked_until, s.failed_pin_attempts from staff s join staff_secrets ss on ss.staff_id = s.id
     where s.id = $1 and s.org_id = $2 and s.active and (cardinality(s.outlet_ids) = 0 or $3 = any(s.outlet_ids))`,
    [input.staffId, d.orgId, d.outletId],
  );
  if (!s) throw unauthorized("Wrong PIN. Try again.", "bad_pin");
  if (s.locked_until && s.locked_until > new Date()) throw new HttpError(423, "Too many wrong PINs. Try again in a few minutes or ask a manager.", "locked");
  if (!(await verifyPin(input.pin, s.pin_hash))) {
    const n = s.failed_pin_attempts + 1;
    const lock = n >= MAX_TRIES;
    await pool().query(
      "update staff set failed_pin_attempts = $2, locked_until = case when $3 then now() + interval '5 minutes' else locked_until end where id = $1",
      [s.id, lock ? 0 : n, lock],
    );
    if (lock) throw new HttpError(423, "Too many wrong PINs. Try again in a few minutes or ask a manager.", "locked");
    throw unauthorized(`Wrong PIN. ${MAX_TRIES - n} ${MAX_TRIES - n === 1 ? "try" : "tries"} left.`, "bad_pin");
  }
  const token = newToken();
  await tx(async (c) => {
    await c.query("update staff set failed_pin_attempts = 0, locked_until = null where id = $1", [s.id]);
    // One person per till at a time: switching user ends the previous session on this device.
    await c.query("update staff_sessions set ended_at = now() where device_id = $1 and ended_at is null", [d.deviceId]);
    await c.query(
      `insert into staff_sessions (org_id, outlet_id, staff_id, device_id, token_hash, expires_at) values ($1, $2, $3, $4, $5, now() + make_interval(hours => $6))`,
      [d.orgId, d.outletId, s.id, d.deviceId, sha256(token), SESSION_HOURS],
    );
    await c.query(
      "insert into audit_log (org_id, outlet_id, actor_kind, actor_id, device_id, action, entity, entity_id) values ($1, $2, 'staff', $3, $4, 'staff.login', 'staff', $3)",
      [d.orgId, d.outletId, s.id, d.deviceId],
    );
  });
  return json({ ok: true }, 200, { "set-cookie": cookie(STAFF_COOKIE, token, SESSION_HOURS * 3600) });
});
