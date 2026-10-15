import { member } from "@/server/actors";
import { json, route } from "@/server/http";

export const GET = route(async (req: Request) => {
  const m = await member(req);
  return json({ name: m.name, email: m.email, role: m.role, org: { id: m.orgId, name: m.orgName, status: m.orgStatus }, outletIds: m.outletIds });
});
