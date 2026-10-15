import { member } from "@/server/actors";
import { billingStatus } from "@/server/billing";
import { json, route } from "@/server/http";

export const GET = route(async (req: Request) => json(await billingStatus(await member(req))));
