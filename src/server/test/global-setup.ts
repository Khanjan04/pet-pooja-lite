import { execSync } from "node:child_process";
import pg from "pg";

// Drop and recreate the test database, then run every migration on it.
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5499/kk_itest");
  const name = url.pathname.slice(1);
  if (!/itest|test/.test(name)) throw new Error(`refusing to reset a database not named *test*: ${name}`);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();
  execSync("npx tsx scripts/migrate.mts", { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "inherit" });
}
