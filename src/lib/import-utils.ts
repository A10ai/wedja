/**
 * Pure parsing / matching helpers for the CSV, Excel and JDE import route.
 * Kept free of Supabase and Next.js so they can be unit tested directly.
 */

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse fields handling quoted values (fields with commas inside double quotes)
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        if (inQuotes && c + 1 < line.length && line[c + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          c++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length !== headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx];
    });
    rows.push(row);
  }

  return rows;
}

/** Parse an integer period month; returns null unless it is 1–12. */
export function parsePeriodMonth(value: string | undefined): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** Parse a four-digit period year; returns null outside 2000–2100. */
export function parsePeriodYear(value: string | undefined): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

/**
 * Parse a monetary amount ("1,250.50" → 1250.5). Returns null for blank,
 * non-numeric, non-finite or negative input.
 */
export function parseAmount(value: string | undefined): number | null {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Shortest normalised name allowed to match by substring/prefix. */
const MIN_FUZZY_KEY_LENGTH = 4;

export interface MatchableTenant {
  id: string;
  brand_name: string | null;
  name: string | null;
}

/**
 * Build a matcher from JDE customer names to tenants.
 *
 * Order: exact normalised match, then the longest tenant key contained in
 * the JDE name (or vice versa), then a shared 4+ character prefix. Short
 * keys (e.g. "hm" for H&M) only ever match exactly — otherwise they would
 * hit any customer name that happens to contain those letters and book
 * revenue against the wrong tenant.
 */
export function createTenantMatcher(tenants: MatchableTenant[]) {
  const tenantByNorm: Record<string, { id: string; brand_name: string }> = {};
  for (const t of tenants) {
    const norm = normalizeForMatch(t.brand_name || t.name || "");
    if (norm) tenantByNorm[norm] = { id: t.id, brand_name: t.brand_name || t.name || "" };
  }
  const fuzzyKeys = Object.keys(tenantByNorm)
    .filter((k) => k.length >= MIN_FUZZY_KEY_LENGTH)
    .sort((a, b) => b.length - a.length);

  return function findTenant(jdeName: string): { id: string; brand_name: string } | null {
    const norm = normalizeForMatch(jdeName);
    if (!norm) return null;
    // Exact
    if (tenantByNorm[norm]) return tenantByNorm[norm];
    if (norm.length < MIN_FUZZY_KEY_LENGTH) return null;
    // Contains (longest key first so "adidaskids" beats "adidas")
    for (const key of fuzzyKeys) {
      if (norm.includes(key) || key.includes(norm)) return tenantByNorm[key];
    }
    // Shared prefix of at least MIN_FUZZY_KEY_LENGTH characters
    const prefix = norm.slice(0, MIN_FUZZY_KEY_LENGTH);
    for (const key of fuzzyKeys) {
      if (key.startsWith(prefix)) return tenantByNorm[key];
    }
    return null;
  };
}

// ── Idempotent period imports ─────────────────────────────
//
// rent_transactions and tenant_sales_reported have no unique constraint on
// (lease_id, period_year, period_month), so re-importing a file must be made
// idempotent in the application: look up existing rows for the same period
// and update/skip them instead of inserting duplicates.

/** Marker written to rent_transactions.source by every JDE import path. */
export const JDE_SOURCE = "jde_import";

/**
 * True for rent rows that came from JDE. Older web imports marked them in
 * payment_method; the SQL seeds and the Python importer use source.
 */
export function isJdeRentRow(row: { source?: unknown; payment_method?: unknown }): boolean {
  return row.source === JDE_SOURCE || row.payment_method === JDE_SOURCE;
}

/** Identity of a monthly period row for one lease. */
export function periodKey(leaseId: string, year: number, month: number): string {
  return `${leaseId}|${year}|${month}`;
}

function sameValue(a: unknown, b: unknown): boolean {
  const blank = (v: unknown) => v === null || v === undefined || v === "";
  if (blank(a) && blank(b)) return true;
  if (blank(a) || blank(b)) return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 0.005;
  }
  return String(a) === String(b);
}

/**
 * Fields of `incoming` (restricted to `fields`) whose values differ from
 * `existing`. Numbers compare to the cent (Postgres NUMERIC may come back as
 * a string). Returns null when nothing changed.
 */
export function changedFields<T extends Record<string, unknown>>(
  existing: Record<string, unknown>,
  incoming: T,
  fields: readonly (keyof T & string)[]
): Partial<T> | null {
  const changed: Partial<T> = {};
  let any = false;
  for (const f of fields) {
    if (!sameValue(existing[f], incoming[f])) {
      changed[f] = incoming[f];
      any = true;
    }
  }
  return any ? changed : null;
}
