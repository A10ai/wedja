import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
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

async function importSales(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[]
) {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sale = {
      lease_id: row.lease_id,
      tenant_id: row.tenant_id,
      period_month: parseInt(row.period_month || row.month || "0"),
      period_year: parseInt(row.period_year || row.year || "0"),
      reported_revenue_egp: parseFloat(row.reported_revenue_egp || row.revenue || "0"),
      submission_date: row.submission_date || new Date().toISOString().split("T")[0],
      verified: false,
    };

    if (!sale.lease_id || !sale.tenant_id || !sale.period_month || !sale.period_year) {
      errors.push(`Row ${i + 2}: Missing required fields`);
      continue;
    }

    const { error } = await supabase.from("tenant_sales_reported").insert(sale);
    if (error) {
      errors.push(`Row ${i + 2}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return { imported, errors };
}

async function importRent(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[]
) {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const transaction = {
      lease_id: row.lease_id,
      period_month: parseInt(row.period_month || row.month || "0"),
      period_year: parseInt(row.period_year || row.year || "0"),
      min_rent_due: parseFloat(row.min_rent_due || "0"),
      percentage_rent_due: parseFloat(row.percentage_rent_due || "0"),
      amount_due: parseFloat(row.amount_due || "0"),
      amount_paid: parseFloat(row.amount_paid || "0"),
      payment_date: row.payment_date || null,
      payment_method: row.payment_method || null,
      status: row.status || "overdue",
    };

    if (!transaction.lease_id || !transaction.period_month || !transaction.period_year) {
      errors.push(`Row ${i + 2}: Missing required fields`);
      continue;
    }

    const { error } = await supabase.from("rent_transactions").insert(transaction);
    if (error) {
      errors.push(`Row ${i + 2}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return { imported, errors };
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

function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function importJDERevenue(
  supabase: ReturnType<typeof createAdminClient>,
  buffer: Buffer
) {
  const workbook = XLSX.read(buffer);
  const errors: string[] = [];
  let imported = 0;
  let matched = 0;
  let unmatched = 0;
  let total_parsed = 0;

  // Find the "ALL Category" sheet or last sheet
  const allSheet = workbook.SheetNames.find((s) => s.toLowerCase().includes("all category"))
    || workbook.SheetNames[workbook.SheetNames.length - 1];
  const ws = workbook.Sheets[allSheet];
  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  if (rawData.length < 4) {
    return { imported: 0, errors: ["File too short"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  // Find header row (row with "Customer Number" or "Customer Name")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i].map((c: any) => String(c).toLowerCase());
    if (row.some((c: string) => c.includes("customer"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { imported: 0, errors: ["Could not find header row"], total_parsed: 0, matched: 0, unmatched: 0 };
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
    return { imported: 0, errors: ["Could not detect month columns"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  // Fetch tenants and leases
  const { data: tenants } = await supabase.from("tenants").select("id, brand_name, name");
  const { data: leases } = await supabase.from("leases").select("id, tenant_id").eq("status", "active");

  if (!tenants || !leases) {
    return { imported: 0, errors: ["Failed to fetch tenants/leases"], total_parsed: 0, matched: 0, unmatched: 0 };
  }

  // Build lookup maps
  const tenantByNorm: Record<string, { id: string; brand_name: string }> = {};
  for (const t of tenants) {
    const norm = normalizeForMatch(t.brand_name || t.name || "");
    if (norm) tenantByNorm[norm] = { id: t.id, brand_name: t.brand_name || t.name };
  }
  const leaseByTenant: Record<string, string> = {};
  for (const l of leases) {
    leaseByTenant[l.tenant_id] = l.id;
  }

  // Match function
  function findTenant(jdeName: string): { id: string; brand_name: string } | null {
    const norm = normalizeForMatch(jdeName);
    if (!norm) return null;
    // Exact
    if (tenantByNorm[norm]) return tenantByNorm[norm];
    // Contains
    for (const [key, val] of Object.entries(tenantByNorm)) {
      if (key.includes(norm) || norm.includes(key)) return val;
    }
    // First word (min 4 chars)
    const firstWord = norm.slice(0, Math.max(4, norm.indexOf(" ") > 0 ? norm.indexOf(" ") : norm.length));
    for (const [key, val] of Object.entries(tenantByNorm)) {
      if (key.startsWith(firstWord) || firstWord.startsWith(key.slice(0, 4))) return val;
    }
    return null;
  }

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

    // Insert monthly transactions
    for (const mc of monthCols) {
      const amount = parseFloat(String(row[mc.col] || "0").replace(/,/g, ""));
      if (!amount || amount <= 0) continue;

      const { error } = await supabase.from("rent_transactions").insert({
        lease_id: leaseId,
        period_month: mc.month,
        period_year: mc.year,
        min_rent_due: 0,
        percentage_rent_due: 0,
        amount_due: amount,
        amount_paid: amount,
        status: "paid",
        payment_method: "jde_import",
      });

      if (error) {
        errors.push(`Row ${r + 1} ${mc.month}/${mc.year}: ${error.message}`);
      } else {
        imported++;
      }
    }
  }

  return { imported, errors: errors.slice(0, 50), total_parsed, matched, unmatched };
}

const VALID_TYPES = ["tenants", "leases", "sales", "rent", "expenses", "jde_revenue"];

export async function GET() {
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
  try {
    const supabase = createAdminClient();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be: ${VALID_TYPES.join(", ")}` },
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
        errors: result.errors,
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

    let result;
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

    return NextResponse.json({
      imported: result.imported,
      errors: result.errors,
      total_rows: rows.length,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
}
