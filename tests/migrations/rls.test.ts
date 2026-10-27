// @vitest-environment node
/**
 * Every table created by a migration from 00014 onward must enable row-level
 * security in the same file. 00014 locks down all earlier tables; this keeps
 * new ones from reopening the hole (anon key → read/write via PostgREST).
 */
import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";

const DIR = path.resolve(__dirname, "../../supabase/migrations");
const LOCKDOWN = 14;

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

function createdTables(sql: string): string[] {
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  return Array.from(sql.matchAll(re), (m) => m[1].toLowerCase());
}

function rlsTables(sql: string): Set<string> {
  const re = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+enable\s+row\s+level\s+security/gi;
  return new Set(Array.from(sql.matchAll(re), (m) => m[1].toLowerCase()));
}

describe("migrations: row-level security", () => {
  test("the lockdown migration exists", () => {
    expect(files.some((f) => f.startsWith("00014_"))).toBe(true);
  });

  for (const file of files.filter((f) => Number(f.slice(0, 5)) >= LOCKDOWN)) {
    test(`${file} enables RLS on every table it creates`, () => {
      const sql = fs.readFileSync(path.join(DIR, file), "utf8");
      const enabled = rlsTables(sql);
      const missing = createdTables(sql).filter((t) => !enabled.has(t));
      expect(missing, `tables without RLS in ${file}`).toEqual([]);
    });
  }

  test("no migration adds a write-all policy for authenticated users", () => {
    for (const file of files.filter((f) => Number(f.slice(0, 5)) > LOCKDOWN)) {
      const sql = fs.readFileSync(path.join(DIR, file), "utf8");
      expect(sql, file).not.toMatch(/for\s+all\s+to\s+(authenticated|anon)/i);
    }
  });
});
