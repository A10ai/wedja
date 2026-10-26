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
