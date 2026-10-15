import { member } from "@/server/actors";
import { cancelSubscription } from "@/server/billing";
import { json, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  await cancelSubscription(await member(req, ["owner"]));
  return json({ ok: true });
});
