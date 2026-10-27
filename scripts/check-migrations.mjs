#!/usr/bin/env node
/**
 * Replays supabase/migrations + seed files into an in-memory Postgres (PGlite)
 * in several apply orders and reports which files fail.
 *
 *   npx -y -p @electric-sql/pglite@0.2.17 node scripts/check-migrations.mjs
 *   # or, with pglite installed elsewhere:
 *   PGLITE_DIR=/path/to/node_modules/@electric-sql/pglite node scripts/check-migrations.mjs
 *
 * Orders:
 *   reset      `supabase db reset` as configured: migrations, then [db.seed] sql_paths
 *   reset-all  migrations, then seed.sql, seed_extra.sql, seed_sales.sql
 *   prod       00001, all seeds, then 00003+ (how the hosted DB was most likely built)
 *   prod-alt   as prod, but 00008 applied before 00006/00007
 *
 * Exit code 1 if any file fails in any order. Not part of CI: PGlite is not a
 * project dependency.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase");

async function loadPGlite() {
  const base = process.env.PGLITE_DIR;
  const main = base ? pathToFileURL(path.join(base, "dist/index.js")).href : "@electric-sql/pglite";
  const ext = base ? pathToFileURL(path.join(base, "dist/contrib/uuid_ossp.js")).href : "@electric-sql/pglite/contrib/uuid_ossp";
  const { PGlite } = await import(main);
  const { uuid_ossp } = await import(ext);
  return () => new PGlite({ extensions: { uuid_ossp } });
}

// Minimal stand-ins for what Supabase provides before migrations run.
const SUPABASE_STUBS = `
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT ''{}''::jsonb';
`;

function configuredSeeds() {
  const toml = fs.readFileSync(path.join(root, "config.toml"), "utf8");
  const m = toml.match(/\[db\.seed\][\s\S]*?sql_paths\s*=\s*\[([^\]]*)\]/);
  if (!m) return ["seed.sql"];
  return Array.from(m[1].matchAll(/"([^"]+)"/g), (x) => x[1].replace(/^\.\//, ""));
}

const migs = fs.readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => "migrations/" + f);
const seeds = ["seed.sql", "seed_extra.sql", "seed_sales.sql"];
const n = (m) => Number(path.basename(m).slice(0, 5));
const first = migs.filter((m) => n(m) === 1);
const later = migs.filter((m) => n(m) > 1);

const ORDERS = {
  reset: [...migs, ...configuredSeeds()],
  "reset-all": [...migs, ...seeds],
  prod: [...first, ...seeds, ...later],
  "prod-alt": [
    ...first, ...seeds,
    ...later.filter((m) => n(m) < 6),
    ...later.filter((m) => n(m) === 8),
    ...later.filter((m) => n(m) >= 6 && n(m) !== 8),
  ],
};

const COUNT_TABLES = ["properties", "zones", "units", "tenants", "leases", "rent_transactions", "tenant_sales_reported",
  "revenue_estimates", "discrepancies", "footfall_daily", "footfall_readings", "energy_readings", "expenses",
  "campaigns", "social_posts", "tenant_promotions", "anomalies", "brain_decisions", "marketing_campaigns", "social_metrics"];

const wanted = process.argv.slice(2);
const make = await loadPGlite();
let failed = false;
for (const [name, order] of Object.entries(ORDERS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const db = make();
  await db.exec(SUPABASE_STUBS);
  console.log(`\n== ${name} ==`);
  for (const f of order) {
    try {
      await db.exec(fs.readFileSync(path.join(root, f), "utf8"));
      console.log("  OK   ", f);
    } catch (e) {
      failed = true;
      console.log("  FAIL ", f, "::", String(e.message).split("\n")[0], e.detail || "");
    }
  }
  // Re-applying the newest migration must be harmless (IF NOT EXISTS etc).
  const last = migs[migs.length - 1];
  try { await db.exec(fs.readFileSync(path.join(root, last), "utf8")); console.log("  OK    re-apply", last); }
  catch (e) { failed = true; console.log("  FAIL  re-apply", last, "::", String(e.message).split("\n")[0]); }
  const counts = [];
  for (const t of COUNT_TABLES) {
    try { counts.push(`${t}=${(await db.query(`select count(*)::int c from "${t}"`)).rows[0].c}`); }
    catch { counts.push(`${t}=MISSING`); }
  }
  console.log("  rows:", counts.join(" "));
  await db.close();
}
process.exit(failed ? 1 : 0);
