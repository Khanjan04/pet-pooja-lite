import { device, staffOn } from "@/server/actors";
import { json, notFound, route } from "@/server/http";
import { body } from "@/server/http";
import { runCommand, schemas, type CommandName } from "@/server/pos";
import { z } from "zod";

// Every till write goes through here: device cookie + staff PIN session + the command's own
// permission check. Send an Idempotency-Key header so retries after a dropped connection are safe.
export const POST = route(async (req: Request, ctx: { params: Promise<{ command: string }> }) => {
  const { command } = await ctx.params;
  if (!(command in schemas)) throw notFound("Unknown command.");
  const d = await device(req);
  const staff = (await staffOn(req, d))!;
  const raw = await body(req, z.unknown());
  const key = req.headers.get("idempotency-key");
  const result = await runCommand(command as CommandName, raw, {
    device: d,
    staff,
    idempotencyKey: key && /^[A-Za-z0-9-]{8,64}$/.test(key) ? key : null,
  });
  return json({ result });
});
