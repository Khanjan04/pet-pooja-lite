import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import { env } from "./env";

export { bad, conflict, forbidden, HttpError, notFound, unauthorized } from "./errors";
import { bad, HttpError } from "./errors";

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

/** Wrap a route: known errors become JSON with a user-safe message; everything else is logged and hidden. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const req = args[0] instanceof Request ? args[0] : null;
      // CSRF defence in depth (cookies are SameSite=Lax and writes need JSON): a browser
      // request from another site carries its Origin, and we refuse it.
      if (req && req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        if (origin && origin !== new URL(env().APP_URL).origin) throw new HttpError(403, "Cross-site request refused.", "bad_origin");
      }
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e); // let Next's own control-flow errors (prerender bail-outs) through
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof ZodError) return json({ error: "Some details are missing or invalid.", issues: e.issues.map((i) => i.path.join(".")) }, 400);
      console.error("unhandled route error:", describe(e));
      return json({ error: "Something went wrong on our side. Try again." }, 500);
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw bad("Send JSON.");
  const raw = await req.text();
  if (raw.length > 64_000) throw new HttpError(413, "Request too large.");
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw bad("Send valid JSON.");
  }
  return schema.parse(data);
}

/** Client IP as seen by the platform proxy (Vercel sets x-forwarded-for). Used for rate limits only. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** A one-line cause for logs. Connection failures arrive as AggregateErrors with an empty message. */
export function describe(e: unknown): string {
  if (e instanceof AggregateError && e.errors.length) return e.errors.map(describe).join(" | ");
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    const msg = e.message || e.name;
    const cause = e.cause ? ` (cause: ${describe(e.cause)})` : "";
    return `${code ? code + ": " : ""}${msg}${cause}`;
  }
  return String(e);
}
