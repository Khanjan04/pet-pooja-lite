import { assertWritable, member } from "@/server/actors";
import { tx } from "@/server/db";
import { json, notFound, route } from "@/server/http";

// A lost or replaced till stops working immediately: token gone, PIN sessions ended.
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const m = await member(req, ["owner", "admin", "manager"]);
  assertWritable(m);
  const { id } = await ctx.params;
  await tx(async (c) => {
    const r = await c.query("update devices set token_hash = null, revoked_at = now() where id = $1 and org_id = $2 and outlet_id = any($3::uuid[]) and revoked_at is null", [id, m.orgId, m.outletIds]);
    if (!r.rowCount) throw notFound("Device not found.");
    await c.query("update staff_sessions set ended_at = now() where device_id = $1 and ended_at is null", [id]);
  });
  return json({ ok: true });
});
