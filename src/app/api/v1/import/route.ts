import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    if (values.length !== headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx];
    });
    rows.push(row);
  }

  return rows;
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

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!type || !["tenants", "leases", "sales", "rent"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be: tenants, leases, sales, or rent" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty or invalid" },
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
