import { z } from "zod";
import { pairDevice } from "@/server/devices";
import { sha256 } from "@/server/crypto";
import { one, tx } from "@/server/db";
import { body, clientIp, json, route, unauthorized } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

// A new device trades a pairing code for its own long-lived device cookie.
export const POST = route(async (req: Request) => {
  await rateLimit(`pair:${clientIp(req)}`, 10, 600);
  const { code } = await body(req, z.object({ code: z.string().regex(/^\d{6}$/, "The code is 6 digits") }));
  const res = await tx(async (c) => {
    const pc = await one<{ id: string; org_id: string; outlet_id: string; kind: "pos" | "captain" | "kds" | "kiosk"; name: string }>(
      c,
      "update pairing_codes set used_at = now() where code_hash = $1 and used_at is null and expires_at > now() returning id, org_id, outlet_id, kind, name",
      [sha256(code)],
    );
    if (!pc) throw unauthorized("That code is wrong or has expired. Ask for a new one.", "bad_code");
    return pairDevice(c, pc.org_id, pc.outlet_id, pc.kind, pc.name);
  });
  return json({ device: res.device }, 201, { "set-cookie": res.cookie });
});
