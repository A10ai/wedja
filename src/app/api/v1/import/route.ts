import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { validateBody, formatZodErrors, importTypeSchema } from "@/lib/validation";
import {
  parseCSV,
  parsePeriodMonth,
  parsePeriodYear,
  parseAmount,
  createTenantMatcher,
  changedFields,
  isJdeRentRow,
  periodKey,
  JDE_SOURCE,
} from "@/lib/import-utils";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

function parseExcel(buffer: Buffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    raw: false,
    defval: "",
  });

  // Normalize header names: lowercase, replace spaces with underscores, trim
  return rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_");
      normalized[normalizedKey] = String(value);
    }
    return normalized;
  });
}

async function importTenants(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[]
) {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tenant = {
      name: row.name,
      brand_name: row.brand_name || row.brand,
      category: row.category,
      brand_type: row.brand_type || "local",
      contact_name: row.contact_name || null,
      contact_email: row.contact_email || row.email || null,
      contact_phone: row.contact_phone || row.phone || null,
      status: row.status || "active",
    };

    if (!tenant.name || !tenant.category) {
      errors.push(`Row ${i + 2}: Missing required fields (name, category)`);
      continue;
    }

    const { error } = await supabase.from("tenants").insert(tenant);
    if (error) {
      errors.push(`Row ${i + 2}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return { imported, errors };
}

async function importLeases(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[]
) {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lease = {
      unit_id: row.unit_id,
      tenant_id: row.tenant_id,
      property_id: PROPERTY_ID,
      start_date: row.start_date,
      end_date: row.end_date,
      min_rent_monthly_egp: parseFloat(row.min_rent_monthly_egp || row.min_rent || "0"),
      percentage_rate: parseFloat(row.percentage_rate || "0"),
      security_deposit_egp: parseFloat(row.security_deposit_egp || row.deposit || "0"),
      escalation_rate: parseFloat(row.escalation_rate || "0"),
      status: row.status || "active",
    };

    if (!lease.unit_id || !lease.tenant_id || !lease.start_date || !lease.end_date) {
      errors.push(`Row ${i + 2}: Missing required fields`);
      continue;
    }

    const { error } = await supabase.from("leases").insert(lease);
    if (error) {
      errors.push(`Row ${i + 2}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return { imported, errors };
}

// ── Idempotent period upsert (sales / rent / JDE) ─────────

type Supabase = ReturnType<typeof createAdminClient>;

interface ImportCounts {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}

function emptyCounts(): ImportCounts {
  return { imported: 0, updated: 0, skipped: 0, errors: [], warnings: [] };
}

interface PeriodRow<T> {
  /** Human label for messages, e.g. "Row 7" */
  label: string;
  values: T & { lease_id: string; period_year: number; period_month: number };
}

interface PeriodTableSpec<T> {
  table: "rent_transactions" | "tenant_sales_reported";
  /** Columns fetched for the existence check (must include the compare fields). */
  selectCols: string;
  /** Fields compared to decide between update and skip. */
  compareFields: readonly (keyof T & string)[];
  /** Which existing rows count as "the same row" (e.g. JDE vs manual rent). */
  matches: (existing: Record<string, unknown>) => boolean;
  /** Extra columns written on update when something changed. */
  onUpdate?: (row: T) => Record<string, unknown>;
}

const EXISTENCE_BATCH = 200;

/**
 * Insert-or-update rows keyed by (lease_id, period_year, period_month).
 * One existence query (`.in()` on lease ids and years) per batch; rows whose
 * compare fields are unchanged are skipped, changed rows are updated, the rest
 * are bulk-inserted. If the existence check fails the batch is NOT inserted,
 * so a failed lookup can never create duplicates.
 */
async function upsertPeriodRows<T extends Record<string, unknown>>(
  supabase: Supabase,
  spec: PeriodTableSpec<T>,
  rows: PeriodRow<T>[],
  counts: ImportCounts
) {
  for (let start = 0; start < rows.length; start += EXISTENCE_BATCH) {
    const batch = rows.slice(start, start + EXISTENCE_BATCH);
    const leaseIds = Array.from(new Set(batch.map((r) => r.values.lease_id)));
    const years = Array.from(new Set(batch.map((r) => r.values.period_year)));

    // Paged: 200 leases × 12 months of history easily passes PostgREST's
    // 1000-row cap, and a missed existing row would be imported twice.
    let existingRows: Record<string, unknown>[];
    try {
      existingRows = await fetchAll<Record<string, unknown>>((from, to) =>
        supabase
          .from(spec.table)
          .select(spec.selectCols)
          .in("lease_id", leaseIds)
          .in("period_year", years)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>
      );
    } catch (lookupError) {
      const message = lookupError instanceof Error ? lookupError.message : String(lookupError);
      for (const r of batch) {
        counts.errors.push(`${r.label}: could not check for an existing row (${message}); not imported`);
      }
      continue;
    }

    // Oldest matching row per key wins; extra legacy duplicates are reported.
    const existingByKey = new Map<string, Record<string, unknown>>();
    const dupCount = new Map<string, number>();
    for (const ex of existingRows) {
      if (!spec.matches(ex)) continue;
      const key = periodKey(String(ex.lease_id), Number(ex.period_year), Number(ex.period_month));
      if (!existingByKey.has(key)) existingByKey.set(key, ex);
      dupCount.set(key, (dupCount.get(key) ?? 0) + 1);
    }

    const toInsert: PeriodRow<T>[] = [];
    for (const r of batch) {
      const key = periodKey(r.values.lease_id, r.values.period_year, r.values.period_month);
      const ex = existingByKey.get(key);
      if (!ex) {
        toInsert.push(r);
        continue;
      }
      const n = dupCount.get(key) ?? 1;
      if (n > 1) {
        counts.warnings.push(
          `${r.label}: ${n} existing ${spec.table} rows for ${r.values.period_month}/${r.values.period_year}; compared with the oldest`
        );
      }
      const changed = changedFields(ex, r.values, spec.compareFields);
      if (!changed) {
        counts.skipped++;
        continue;
      }
      const { error } = await supabase
        .from(spec.table)
        .update({ ...changed, ...(spec.onUpdate ? spec.onUpdate(r.values) : {}) })
        .eq("id", ex.id as string);
      if (error) counts.errors.push(`${r.label}: ${error.message}`);
      else counts.updated++;
    }

    if (toInsert.length === 0) continue;
    const { error: bulkError } = await supabase.from(spec.table).insert(toInsert.map((r) => r.values));
    if (!bulkError) {
      counts.imported += toInsert.length;
      continue;
    }
    // Bulk insert is all-or-nothing; retry row by row for per-row errors.
    for (const r of toInsert) {
      const { error } = await supabase.from(spec.table).insert(r.values);
      if (error) counts.errors.push(`${r.label}: ${error.message}`);
      else counts.imported++;
    }
  }
}

/** Keep the last occurrence of each period key in a file; report the rest. */
function dedupeWithinFile<T>(rows: PeriodRow<T>[], counts: ImportCounts): PeriodRow<T>[] {
  const lastByKey = new Map<string, PeriodRow<T>>();
  for (const r of rows) {
    const key = periodKey(r.values.lease_id, r.values.period_year, r.values.period_month);
    const prev = lastByKey.get(key);
    if (prev) {
      counts.skipped++;
      counts.warnings.push(`${prev.label}: same lease and period as ${r.label} in this file; ${r.label} used`);
    }
    lastByKey.set(key, r);
  }
  return Array.from(lastByKey.values());
}

async function importSales(supabase: Supabase, rows: Record<string, string>[]) {
  const counts = emptyCounts();
  const valid: PeriodRow<{
    lease_id: string;
    tenant_id: string;
    period_month: number;
    period_year: number;
    reported_revenue_egp: number;
    submission_date: string;
    verified: boolean;
  }>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sale = {
      lease_id: row.lease_id,
      tenant_id: row.tenant_id,
      period_month: parsePeriodMonth(row.period_month || row.month),
      period_year: parsePeriodYear(row.period_year || row.year),
      reported_revenue_egp: parseAmount(row.reported_revenue_egp || row.revenue),
      submission_date: row.submission_date || new Date().toISOString().split("T")[0],
      verified: false,
    };

    if (!sale.lease_id || !sale.tenant_id || !sale.period_month || !sale.period_year) {
      counts.errors.push(`Row ${i + 2}: Missing or invalid required fields (lease_id, tenant_id, period_month 1-12, period_year)`);
      continue;
    }
    if (sale.reported_revenue_egp === null) {
      counts.errors.push(`Row ${i + 2}: Invalid reported_revenue_egp (must be a non-negative number)`);
      continue;
    }
    valid.push({
      label: `Row ${i + 2}`,
      values: {
        ...sale,
        period_month: sale.period_month,
        period_year: sale.period_year,
        reported_revenue_egp: sale.reported_revenue_egp,
      },
    });
  }

  await upsertPeriodRows(
    supabase,
    {
      table: "tenant_sales_reported",
      selectCols: "id, lease_id, tenant_id, period_month, period_year, reported_revenue_egp",
      compareFields: ["reported_revenue_egp", "tenant_id"],
      matches: () => true,
      // A changed figure is a new submission and must be re-verified.
      onUpdate: (r) => ({ submission_date: r.submission_date, verified: false }),
    },
    dedupeWithinFile(valid, counts),
    counts
  );
  return counts;
}

async function importRent(supabase: Supabase, rows: Record<string, string>[]) {
  const counts = emptyCounts();
  const valid: PeriodRow<{
    lease_id: string;
    period_month: number;
    period_year: number;
    min_rent_due: number;
    percentage_rent_due: number;
    amount_due: number;
    amount_paid: number;
    payment_date: string | null;
    payment_method: string | null;
    status: string;
    source: string;
  }>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const transaction = {
      lease_id: row.lease_id,
      period_month: parsePeriodMonth(row.period_month || row.month),
      period_year: parsePeriodYear(row.period_year || row.year),
      min_rent_due: parseAmount(row.min_rent_due || "0"),
      percentage_rent_due: parseAmount(row.percentage_rent_due || "0"),
      amount_due: parseAmount(row.amount_due),
      amount_paid: parseAmount(row.amount_paid || "0"),
      payment_date: row.payment_date || null,
      payment_method: row.payment_method || null,
      status: row.status || "overdue",
    };

    if (!transaction.lease_id || !transaction.period_month || !transaction.period_year) {
      counts.errors.push(`Row ${i + 2}: Missing or invalid required fields (lease_id, period_month 1-12, period_year)`);
      continue;
    }
    if (
      transaction.amount_due === null ||
      transaction.amount_paid === null ||
      transaction.min_rent_due === null ||
      transaction.percentage_rent_due === null
    ) {
      counts.errors.push(`Row ${i + 2}: Invalid amount (must be a non-negative number)`);
      continue;
    }
    valid.push({
      label: `Row ${i + 2}`,
      values: {
        ...transaction,
        period_month: transaction.period_month,
        period_year: transaction.period_year,
        min_rent_due: transaction.min_rent_due,
        percentage_rent_due: transaction.percentage_rent_due,
        amount_due: transaction.amount_due,
        amount_paid: transaction.amount_paid,
        source: "csv_import",
      },
    });
  }

  await upsertPeriodRows(
    supabase,
    {
      table: "rent_transactions",
      selectCols:
        "id, lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status, source",
      compareFields: [
        "min_rent_due",
        "percentage_rent_due",
        "amount_due",
        "amount_paid",
        "payment_date",
        "payment_method",
        "status",
      ],
      // Manual rent rows are a separate ledger from JDE-imported rows.
      matches: (ex) => !isJdeRentRow(ex),
    },
    dedupeWithinFile(valid, counts),
    counts
  );
  return counts;
}

async function importExpenses(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[]
) {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const expense = {
      property_id: PROPERTY_ID,
      category: row.category,
      description: row.description,
      amount_egp: parseFloat(row.amount_egp || row.amount || "0"),
      vendor: row.vendor || null,
      expense_date: row.expense_date || row.date || new Date().toISOString().split("T")[0],
      status: row.status || "pending",
      is_recurring: row.is_recurring === "true" || row.is_recurring === "1" ? true : false,
    };

    if (!expense.category || !expense.description || !expense.amount_egp) {
      errors.push(`Row ${i + 2}: Missing required fields (category, description, amount_egp)`);
      continue;
    }

    const { error } = await supabase.from("expenses").insert(expense);
    if (error) {
      errors.push(`Row ${i + 2}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return { imported, errors };
}

// ── JDE Revenue Import ─────────────────────────────────────

async function importJDERevenue(supabase: Supabase, buffer: Buffer) {
  const workbook = XLSX.read(buffer);
  const counts = emptyCounts();
  const errors = counts.errors;
  let matched = 0;
  let unmatched = 0;
  let total_parsed = 0;

  // Find the "ALL Category" sheet or last sheet
  const allSheet = workbook.SheetNames.find((s) => s.toLowerCase().includes("all category"))
    || workbook.SheetNames[workbook.SheetNames.length - 1];
  const ws = workbook.Sheets[allSheet];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  if (rawData.length < 4) {
    return { ...emptyCounts(), errors: ["File too short"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  // Find header row (row with "Customer Number" or "Customer Name")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i].map((c: unknown) => String(c).toLowerCase());
    if (row.some((c: string) => c.includes("customer"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { ...emptyCounts(), errors: ["Could not find header row"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  // Detect month columns (columns 3-14 typically have dates like "2025-01-01" or month values)
  const headers = rawData[headerIdx];
  const monthCols: { col: number; month: number; year: number }[] = [];
  for (let c = 2; c < headers.length - 2; c++) {
    const val = String(headers[c]);
    // Try parsing as date
    const dateMatch = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      monthCols.push({ col: c, month: parseInt(dateMatch[2]), year: parseInt(dateMatch[1]) });
    }
  }

  if (monthCols.length === 0) {
    return { ...emptyCounts(), errors: ["Could not detect month columns"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  // Fetch tenants and leases
  const { data: tenants } = await supabase.from("tenants").select("id, brand_name, name");
  const { data: leases } = await supabase.from("leases").select("id, tenant_id").eq("status", "active");

  if (!tenants || !leases) {
    return { ...emptyCounts(), errors: ["Failed to fetch tenants/leases"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  const findTenant = createTenantMatcher(tenants);
  const leaseByTenant: Record<string, string> = {};
  for (const l of leases) {
    leaseByTenant[l.tenant_id] = l.id;
  }

  const jdeByKey = new Map<
    string,
    PeriodRow<{
      lease_id: string;
      period_month: number;
      period_year: number;
      min_rent_due: number;
      percentage_rent_due: number;
      amount_due: number;
      amount_paid: number;
      status: string;
      source: string;
    }>
  >();

  // Process data rows
  for (let r = headerIdx + 1; r < rawData.length; r++) {
    const row = rawData[r];
    const custName = String(row[1] || "").trim();
    if (!custName || custName.toLowerCase().includes("total")) continue;
    total_parsed++;

    const tenant = findTenant(custName);
    if (!tenant) {
      unmatched++;
      continue;
    }
    matched++;

    const leaseId = leaseByTenant[tenant.id];
    if (!leaseId) {
      errors.push(`No lease for tenant: ${custName} (${tenant.brand_name})`);
      continue;
    }

    // Collect monthly amounts; several JDE customers can map to one lease,
    // in which case their amounts for the same month are summed.
    for (const mc of monthCols) {
      const amount = parseFloat(String(row[mc.col] || "0").replace(/,/g, ""));
      if (!amount || amount <= 0) continue;
      const key = periodKey(leaseId, mc.year, mc.month);
      const prev = jdeByKey.get(key);
      if (prev) {
        prev.values.amount_due += amount;
        prev.values.amount_paid += amount;
        counts.warnings.push(`${prev.label} and row ${r + 1} (${custName}) map to the same lease for ${mc.month}/${mc.year}; amounts summed`);
      } else {
        jdeByKey.set(key, {
          label: `Row ${r + 1} ${mc.month}/${mc.year}`,
          values: {
            lease_id: leaseId,
            period_month: mc.month,
            period_year: mc.year,
            min_rent_due: 0,
            percentage_rent_due: 0,
            amount_due: amount,
            amount_paid: amount,
            status: "paid",
            source: JDE_SOURCE,
          },
        });
      }
    }
  }

  await upsertPeriodRows(
    supabase,
    {
      table: "rent_transactions",
      selectCols: "id, lease_id, period_month, period_year, amount_due, amount_paid, status, payment_method, source",
      compareFields: ["amount_due", "amount_paid", "status"],
      matches: isJdeRentRow,
    },
    Array.from(jdeByKey.values()),
    counts
  );

  return { ...counts, errors: errors.slice(0, 50), total_parsed, matched, unmatched };
}

const VALID_TYPES = ["tenants", "leases", "sales", "rent", "expenses", "jde_revenue"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    types: [
      {
        id: "rent",
        name: "Rent Transactions",
        required: ["lease_id", "period_month", "period_year", "amount_due"],
        optional: ["amount_paid", "payment_date", "status"],
      },
      {
        id: "sales",
        name: "Tenant Reported Sales",
        required: ["lease_id", "tenant_id", "period_month", "period_year", "reported_revenue_egp"],
        optional: ["submission_date"],
      },
      {
        id: "expenses",
        name: "Expenses",
        required: ["category", "description", "amount_egp"],
        optional: ["vendor", "expense_date", "status"],
      },
      {
        id: "tenants",
        name: "Tenants",
        required: ["name", "category"],
        optional: ["brand_name", "brand_type", "contact_name", "contact_email", "contact_phone"],
      },
      {
        id: "leases",
        name: "Leases",
        required: ["unit_id", "tenant_id", "start_date", "end_date"],
        optional: ["min_rent_monthly_egp", "percentage_rate", "status"],
      },
      {
        id: "jde_revenue",
        name: "JDE Revenue Analysis",
        required: ["Auto-detected from JDE Excel format"],
        optional: ["Matches tenants by name, imports monthly revenue by category"],
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const typeValidation = validateBody(importTypeSchema, { type });
    if (!typeValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(typeValidation.error) },
        { status: 400 }
      );
    }

    // Determine file format from extension
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const isCSV = fileName.endsWith(".csv");

    if (!isExcel && !isCSV) {
      return NextResponse.json(
        { error: "Unsupported file format. Must be .csv, .xlsx, or .xls" },
        { status: 400 }
      );
    }

    // Special handling for JDE Revenue format
    if (type === "jde_revenue") {
      if (!isExcel) {
        return NextResponse.json({ error: "JDE Revenue requires Excel (.xlsx) format" }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await importJDERevenue(supabase, buffer);
      return NextResponse.json({
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        rows_imported: result.imported + result.updated,
        errors: result.errors,
        warnings: result.warnings.slice(0, 50),
        total_rows: result.total_parsed,
        matched: result.matched,
        unmatched: result.unmatched,
      });
    }

    let rows: Record<string, string>[];

    if (isExcel) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      rows = parseExcel(buffer);
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "File is empty or invalid" },
        { status: 400 }
      );
    }

    let result: { imported: number; errors: string[]; updated?: number; skipped?: number; warnings?: string[] };
    switch (type) {
      case "tenants":
        result = await importTenants(supabase, rows);
        break;
      case "leases":
        result = await importLeases(supabase, rows);
        break;
      case "sales":
        result = await importSales(supabase, rows);
        break;
      case "rent":
        result = await importRent(supabase, rows);
        break;
      case "expenses":
        result = await importExpenses(supabase, rows);
        break;
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const updated = result.updated ?? 0;
    return NextResponse.json({
      imported: result.imported,
      updated,
      skipped: result.skipped ?? 0,
      // The import page reads rows_imported: new + updated rows.
      rows_imported: result.imported + updated,
      errors: result.errors,
      warnings: (result.warnings ?? []).slice(0, 50),
      total_rows: rows.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Import error:");
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
}
