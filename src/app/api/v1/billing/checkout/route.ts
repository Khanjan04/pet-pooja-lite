import { z } from "zod";
import { member } from "@/server/actors";
import { startCheckout } from "@/server/billing";
import { body, json, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  const m = await member(req, ["owner"]);
  const { plan } = await body(req, z.object({ plan: z.enum(["core", "growth", "scale"]) }));
  return json({ url: await startCheckout(m, plan) });
});
