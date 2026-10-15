import pg from "pg";
import { device, member } from "@/server/actors";
import { DEVICE_COOKIE, readCookie } from "@/server/cookies";
import { env } from "@/server/env";
import { forbidden, route } from "@/server/http";
import { channelFor } from "@/server/pos";

// Live updates for one outlet as Server-Sent Events, fed by Postgres LISTEN/NOTIFY.
// Streams for a few minutes, then closes; EventSource reconnects by itself.
const MAX_MS = 4 * 60_000;

export const GET = route(async (req: Request) => {
  let outletId: string;
  if (readCookie(req, DEVICE_COOKIE)) outletId = (await device(req)).outletId;
  else {
    const m = await member(req);
    outletId = new URL(req.url).searchParams.get("outlet") ?? m.outletIds[0];
    if (!m.outletIds.includes(outletId)) throw forbidden();
  }
  const client = new pg.Client({ connectionString: env().DATABASE_URL });
  await client.connect();
  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => !closed && controller.enqueue(enc.encode(s));
      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(stop);
        await client.end().catch(() => {});
        try {
          controller.close();
        } catch {}
      };
      client.on("notification", (n) => send(`event: change\ndata: ${n.payload ?? "{}"}\n\n`));
      client.on("error", close);
      await client.query(`listen ${channelFor(outletId)}`);
      send("retry: 2000\n\nevent: ready\ndata: {}\n\n");
      const ping = setInterval(() => send(": ping\n\n"), 20_000);
      const stop = setTimeout(close, MAX_MS);
      req.signal.addEventListener("abort", close);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
});
