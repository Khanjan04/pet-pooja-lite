import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { json, route, unauthorized } from "@/server/http";
import { periodicTasks, runDueJobs } from "@/server/jobs";
import "@/server/jobs-registry";

// Called every minute by Vercel Cron, which sends "Authorization: Bearer $CRON_SECRET".
export const GET = route(async (req: Request) => {
  const secret = env().CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== want.length || !timingSafeEqual(given, want)) throw unauthorized("Not allowed.", "cron");
  await periodicTasks();
  const ran = await runDueJobs();
  return json({ ok: true, ran });
});
