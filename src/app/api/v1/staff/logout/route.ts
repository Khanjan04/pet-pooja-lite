import { device } from "@/server/actors";
import { STAFF_COOKIE, cookie, readCookie } from "@/server/cookies";
import { sha256 } from "@/server/crypto";
import { pool } from "@/server/db";
import { json, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  const d = await device(req);
  const token = readCookie(req, STAFF_COOKIE);
  if (token) await pool().query("update staff_sessions set ended_at = now() where token_hash = $1 and device_id = $2", [sha256(token), d.deviceId]);
  return json({ ok: true }, 200, { "set-cookie": cookie(STAFF_COOKIE, "", 0) });
});
