// Apply db/migrations/*.sql in order, each in its own transaction, recorded in schema_migrations.
//   DATABASE_URL=... npx tsx scripts/migrate.mts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dir = join(import.meta.dirname, "..", "db", "migrations");
// Read .env.local like the app does (an existing DATABASE_URL in the shell wins).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, "..", ".env.local"));
  } catch {
    /* no .env.local: fall through to the check below */
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env.local, then run: npm run db:migrate");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
} catch (e) {
  const err = e as Error & { code?: string; errors?: (Error & { code?: string })[] };
  const code = err.code ?? err.errors?.[0]?.code ?? "";
  const text = [err.message, ...(err.errors ?? []).map((x) => x.message)].filter(Boolean).join(" | ");
  console.error(`\nCan't connect to the database: ${code} ${text}\n`);
  const hints: Record<string, string> = {
    ECONNREFUSED: "Nothing is listening at that host/port. Is Postgres running? Is the port right (usually 5432)?",
    ENOTFOUND: "The host name in DATABASE_URL doesn't exist. Copy the connection string again from your provider.",
    ETIMEDOUT: "The connection timed out. On Supabase, use the 'Session pooler' connection string (the direct one needs IPv6).",
    ENETUNREACH: "Your network can't reach that address (often IPv6). On Supabase, use the 'Session pooler' connection string.",
    "28P01": "Wrong password. Reset the database password at your provider and update DATABASE_URL.",
    "3D000": "That database name doesn't exist. Check the part after the last / in DATABASE_URL.",
    SELF_SIGNED_CERT_IN_CHAIN: "SSL certificate not trusted. For Supabase add ?sslmode=no-verify to the URL (Neon works with sslmode=require).",
  };
  console.error(hints[code] ?? "Check DATABASE_URL in .env.local: postgres://USER:PASSWORD@HOST:PORT/DBNAME");
  process.exit(1);
}
try {
  await client.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select version from schema_migrations")).rows.map((r) => r.version));
  const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`applying ${f} ... `);
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("insert into schema_migrations (version) values ($1)", [f]);
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      throw e;
    }
  }
  console.log(`up to date (${files.length} migrations)`);
} finally {
  await client.end();
}
