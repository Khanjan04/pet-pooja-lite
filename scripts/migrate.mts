// Apply db/migrations/*.sql in order, each in its own transaction, recorded in schema_migrations.
//   DATABASE_URL=... npx tsx scripts/migrate.mts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dir = join(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
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
