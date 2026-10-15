import "server-only";
import pg, { Pool, type PoolClient } from "pg";
import { env } from "./env";

export type Db = PoolClient;

// int8 (paise, counters) and numeric (quantities) as JS numbers. Paise stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const g = globalThis as { __kkPool?: Pool };

export function pool(): Pool {
  if (!g.__kkPool) {
    g.__kkPool = new Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
    g.__kkPool.on("error", (e) => console.error("pg pool error", e.message));
  }
  return g.__kkPool;
}

/** Run fn in one transaction. Rolls back on any error. */
export async function tx<T>(fn: (c: Db) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export interface Claims {
  org_id: string;
  outlet_ids: string[];
  all_outlets: boolean;
}

/**
 * Tenant reads: runs as role app_reader with claims for this transaction only, so Postgres
 * row level security filters every query to the caller's org and outlets.
 */
export async function asReader<T>(claims: Claims, fn: (c: Db) => Promise<T>): Promise<T> {
  return tx(async (c) => {
    await c.query("set local role app_reader");
    await c.query("select set_config('app.claims', $1, true)", [JSON.stringify(claims)]);
    return fn(c);
  });
}

/** Anything with query(): the pool or a transaction client. */
export type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export async function one<T = Record<string, unknown>>(c: Queryable, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await c.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = Record<string, unknown>>(c: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query(sql, params)).rows as T[];
}
