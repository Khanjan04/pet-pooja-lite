import { z } from "zod";
import { assertWritable, member } from "@/server/actors";
import { sha256, sixDigits } from "@/server/crypto";
import { tx } from "@/server/db";
import { body, forbidden, json, route } from "@/server/http";

// Owner/manager makes a 6-digit code (10 minutes, single use) to pair another device.
export const POST = route(async (req: Request) => {
  const m = await member(req, ["owner", "admin", "manager"]);
  assertWritable(m);
  const input = await body(req, z.object({ outletId: z.uuid(), kind: z.enum(["pos", "captain", "kds", "kiosk"]), name: z.string().trim().min(1).max(40) }));
  if (!m.outletIds.includes(input.outletId)) throw forbidden();
  const code = sixDigits();
  await tx((c) =>
    c.query(
      "insert into pairing_codes (org_id, outlet_id, code_hash, kind, name, expires_at, created_by) values ($1, $2, $3, $4, $5, now() + interval '10 minutes', $6)",
      [m.orgId, input.outletId, sha256(code), input.kind, input.name, m.userId],
    ),
  );
  return json({ code, expiresInMinutes: 10 }, 201);
});
