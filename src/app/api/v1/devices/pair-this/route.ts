import { z } from "zod";
import { assertWritable, member } from "@/server/actors";
import { pairDevice } from "@/server/devices";
import { tx } from "@/server/db";
import { body, forbidden, json, route } from "@/server/http";

// Shortcut for the owner: make the browser they're signed in on a till, no code needed.
export const POST = route(async (req: Request) => {
  const m = await member(req, ["owner", "admin", "manager"]);
  assertWritable(m);
  const input = await body(req, z.object({ outletId: z.uuid(), kind: z.enum(["pos", "captain", "kds", "kiosk"]).default("pos"), name: z.string().trim().min(1).max(40).default("Counter") }));
  if (!m.outletIds.includes(input.outletId)) throw forbidden();
  const res = await tx((c) => pairDevice(c, m.orgId, input.outletId, input.kind, input.name));
  return json({ device: res.device }, 201, { "set-cookie": res.cookie });
});
