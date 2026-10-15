import "server-only";
import { pool } from "./db";
import { HttpError } from "./errors";

/** Fixed-window counter in Postgres. Throws 429 once `max` is exceeded within `windowSec`. */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const r = await pool().query(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end,
       updated_at = now()
     returning count`,
    [key, windowSec],
  );
  if (r.rows[0].count > max) throw new HttpError(429, "Too many attempts. Wait a minute and try again.", "rate_limited");
}
