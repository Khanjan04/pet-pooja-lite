import { member } from "@/server/actors";
import { many, pool } from "@/server/db";
import { json, route } from "@/server/http";

export const GET = route(async (req: Request) => {
  const m = await member(req);
  const rows = await many(
    pool(),
    `select id, outlet_id as "outletId", kind, name, series_code as "seriesCode", last_seen_at as "lastSeenAt", revoked_at as "revokedAt", created_at as "createdAt"
     from devices where org_id = $1 and outlet_id = any($2::uuid[]) order by created_at`,
    [m.orgId, m.outletIds],
  );
  return json({ devices: rows });
});
