import "server-only";
import type { Right } from "@/lib/domain/types";
import { auth } from "./auth";
import { DEVICE_COOKIE, STAFF_COOKIE, readCookie } from "./cookies";
import { sha256 } from "./crypto";
import { one, pool, type Claims } from "./db";
import { forbidden, HttpError, unauthorized } from "./errors";

/* ---------- back-office members (Better Auth session) ---------- */

export type MemberRole = "owner" | "admin" | "manager" | "accountant";

export interface Member {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  orgStatus: string;
  role: MemberRole;
  outletIds: string[]; // resolved: every outlet when all_outlets
}

export async function signedInUser(req: Request) {
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) throw unauthorized("Please sign in.", "signin_required");
  return s.user;
}

export async function member(req: Request, roles?: MemberRole[]): Promise<Member> {
  const user = await signedInUser(req);
  const m = await one<{ org_id: string; role: MemberRole; all_outlets: boolean; outlet_ids: string[]; name: string; status: string }>(
    pool(),
    `select m.org_id, m.role, m.all_outlets or m.role in ('owner','admin') as all_outlets, m.outlet_ids, o.name, o.status
     from org_members m join organizations o on o.id = m.org_id where m.user_id = $1 order by m.created_at limit 1`,
    [user.id],
  );
  if (!m) throw unauthorized("Set up your restaurant first.", "org_required");
  if (roles && !roles.includes(m.role)) throw forbidden();
  const outletIds = m.all_outlets
    ? (await pool().query("select id from outlets where org_id = $1 and active order by created_at", [m.org_id])).rows.map((r) => r.id)
    : m.outlet_ids;
  return { userId: user.id, email: user.email, name: user.name, orgId: m.org_id, orgName: m.name, orgStatus: m.status, role: m.role, outletIds };
}

/** Back-office edits stop when the subscription lapses; tills keep billing (architecture.md). */
export function assertWritable(m: Member) {
  if (m.orgStatus === "read_only") throw new HttpError(402, "Your plan has lapsed, so the back office is read-only. Tills still work.", "read_only");
  if (m.orgStatus === "cancelled") throw new HttpError(403, "This restaurant account is closed.", "cancelled");
}

export const memberClaims = (m: Member): Claims => ({ org_id: m.orgId, outlet_ids: m.outletIds, all_outlets: false });

/* ---------- paired devices ---------- */

export interface Device {
  deviceId: string;
  orgId: string;
  outletId: string;
  kind: "pos" | "captain" | "kds" | "kiosk";
  name: string;
  seriesCode: string;
  orgStatus: string;
}

export async function device(req: Request): Promise<Device> {
  const token = readCookie(req, DEVICE_COOKIE);
  if (!token) throw unauthorized("This browser isn’t set up as a till yet.", "device_required");
  const d = await one<{ id: string; org_id: string; outlet_id: string; kind: Device["kind"]; name: string; series_code: string; status: string }>(
    pool(),
    `update devices d set last_seen_at = now()
     from organizations o
     where d.token_hash = $1 and d.revoked_at is null and o.id = d.org_id and o.status <> 'cancelled'
     returning d.id, d.org_id, d.outlet_id, d.kind, d.name, d.series_code, o.status`,
    [sha256(token)],
  );
  if (!d) throw unauthorized("This till was removed or its pairing expired. Pair it again.", "device_required");
  return { deviceId: d.id, orgId: d.org_id, outletId: d.outlet_id, kind: d.kind, name: d.name, seriesCode: d.series_code, orgStatus: d.status };
}

export const deviceClaims = (d: Device): Claims => ({ org_id: d.orgId, outlet_ids: [d.outletId], all_outlets: false });

/* ---------- staff on a device (PIN session) ---------- */

export interface StaffActor {
  staffId: string;
  name: string;
  roleId: string;
  rights: Right[];
  sessionId: string;
  expiresAt: string;
}

export async function staffOn(req: Request, d: Device, optional = false): Promise<StaffActor | null> {
  const token = readCookie(req, STAFF_COOKIE);
  const row = token
    ? await one<{ id: string; staff_id: string; name: string; role_id: string; rights: Right[]; expires_at: Date }>(
        pool(),
        `select ss.id, s.id as staff_id, s.name, s.role_id, r.rights, ss.expires_at
         from staff_sessions ss join staff s on s.id = ss.staff_id join roles r on r.id = s.role_id
         where ss.token_hash = $1 and ss.device_id = $2 and ss.ended_at is null and ss.expires_at > now() and s.active`,
        [sha256(token), d.deviceId],
      )
    : null;
  if (!row) {
    if (optional) return null;
    throw unauthorized("Your session has ended. Log in with your PIN again.", "pin_required");
  }
  return { staffId: row.staff_id, name: row.name, roleId: row.role_id, rights: row.rights, sessionId: row.id, expiresAt: row.expires_at.toISOString() };
}

export function need(s: StaffActor, right: Right) {
  if (!s.rights.includes(right)) throw forbidden();
}
