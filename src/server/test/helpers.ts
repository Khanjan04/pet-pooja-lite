// Drive the real route handlers with Request objects, keeping cookies like a browser would.
import { pool } from "@/server/db";

export const BASE = "http://localhost:3123";

let ipCounter = 0;

export class Browser {
  cookies = new Map<string, string>();
  // Each simulated browser has its own address, so per-IP rate limits behave as in real life.
  ip = `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

  private header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorb(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(";");
      const [k, ...v] = pair.split("=");
      const value = v.join("=");
      const maxAge = attrs.map((a) => a.trim().toLowerCase()).find((a) => a.startsWith("max-age="));
      if (!value || maxAge === "max-age=0") this.cookies.delete(k.trim());
      else this.cookies.set(k.trim(), value);
    }
  }

  async call(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers have per-route param types
    handler: (req: Request, ctx: { params: Promise<any> }) => Promise<Response>,
    path: string,
    opts: { method?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {},
  ) {
    const req = new Request(BASE + path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        cookie: this.header(),
        origin: BASE,
        "x-forwarded-for": this.ip,
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
    this.absorb(res);
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are inspected loosely
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, res };
  }
}

/** The newest dev email to `to` (dev mode keeps the payload in the jobs table). */
export async function lastEmailTo(to: string): Promise<{ subject: string; text: string }> {
  const r = await pool().query("select payload from jobs where kind = 'email.send' and payload->>'to' = $1 order by created_at desc limit 1", [to]);
  if (!r.rows[0]) throw new Error(`no email to ${to}`);
  return r.rows[0].payload;
}

export const linkIn = (text: string) => text.match(/https?:\/\/\S+/)![0];
