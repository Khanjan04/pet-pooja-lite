import "server-only";
import { pool } from "./db";

// A small Postgres job queue: retries with exponential backoff, then "dead" (the dead-letter
// state) with the last error kept for inspection. Run by /api/cron/tick every minute.

type Result = void | { keepPayload?: boolean };
type Handler<P> = (payload: P) => Promise<Result>;
const handlers = new Map<string, Handler<unknown>>();

export function registerJob<P>(kind: string, fn: Handler<P>) {
  handlers.set(kind, fn as Handler<unknown>);
}

export async function enqueue(kind: string, payload: unknown, opts: { runAt?: Date; maxAttempts?: number } = {}): Promise<string> {
  const r = await pool().query(
    "insert into jobs (kind, payload, run_at, max_attempts) values ($1, $2, $3, $4) returning id",
    [kind, JSON.stringify(payload), opts.runAt ?? new Date(), opts.maxAttempts ?? 5],
  );
  return r.rows[0].id;
}

interface JobRow {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

async function execute(job: JobRow) {
  const fn = handlers.get(job.kind);
  try {
    if (!fn) throw new Error(`no handler for ${job.kind}`);
    const res = await fn(job.payload);
    await pool().query(
      "update jobs set status = 'done', last_error = null, locked_at = null, payload = case when $2 then payload else jsonb_build_object('redacted', true) end where id = $1",
      [job.id, !!(res && res.keepPayload)],
    );
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    const dead = job.attempts >= job.max_attempts;
    await pool().query(
      `update jobs set status = $2, last_error = $3, locked_at = null,
         run_at = now() + make_interval(mins => least(power(2, attempts)::int, 120))
       where id = $1`,
      [job.id, dead ? "dead" : "queued", msg],
    );
    if (dead) console.error(`job ${job.kind} ${job.id} is dead after ${job.attempts} attempts: ${msg}`);
  }
}

/** Claim one specific job now (used to send an email inline). Safe if the cron grabs it first. */
export async function runJobNow(id: string) {
  const r = await pool().query(
    "update jobs set status = 'running', attempts = attempts + 1, locked_at = now() where id = $1 and status = 'queued' returning id, kind, payload, attempts, max_attempts",
    [id],
  );
  if (r.rows[0]) await execute(r.rows[0]);
}

/** Claim due jobs with SKIP LOCKED so several runners never take the same job. */
export async function runDueJobs(limit = 25): Promise<number> {
  // Jobs stuck in "running" (a crashed runner) go back to the queue after 10 minutes.
  await pool().query("update jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '10 minutes'");
  const r = await pool().query(
    `update jobs set status = 'running', attempts = attempts + 1, locked_at = now()
     where id in (select id from jobs where status = 'queued' and run_at <= now() order by run_at limit $1 for update skip locked)
     returning id, kind, payload, attempts, max_attempts`,
    [limit],
  );
  for (const job of r.rows) await execute(job);
  return r.rows.length;
}

/** Housekeeping that runs on every tick. Idempotent. */
export async function periodicTasks() {
  const p = pool();
  await p.query("update items set in_stock = true, auto_turn_on_at = null where auto_turn_on_at is not null and auto_turn_on_at <= now()");
  await p.query("update outlets set online_status = 'on', online_turn_on_at = null where online_turn_on_at is not null and online_turn_on_at <= now()");
  await p.query("delete from idempotency_keys where created_at < now() - interval '30 days'");
  await p.query("delete from staff_sessions where expires_at < now() - interval '1 day' or ended_at < now() - interval '1 day'");
  await p.query("delete from pairing_codes where expires_at < now() - interval '1 day'");
  await p.query("delete from rate_limits where window_start < now() - interval '1 day'");
  await p.query("delete from jobs where status = 'done' and updated_at < now() - interval '30 days'");
  // Trials that ran out without a subscription: back office becomes read-only, tills keep billing.
  await p.query("update organizations set status = 'read_only' where status = 'trial' and trial_ends_at < now()");
  // Past due for more than 7 days: same.
  await p.query(
    `update organizations o set status = 'read_only' from subscriptions s
     where s.org_id = o.id and o.status = 'past_due' and s.status in ('past_due','paused') and s.updated_at < now() - interval '7 days'`,
  );
}
