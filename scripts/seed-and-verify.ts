/**
 * Seed sales data and run initial verification.
 *
 * Usage: npx tsx scripts/seed-and-verify.ts
 *
 * This script:
 * 1. Seeds 6 months of sales data for all 30 tenants
 * 2. Runs the revenue verification engine for recent months
 * 3. Populates the discrepancies table with flagged results
 */

import { createClient } from "@supabase/supabase-js";
import { runRevenueVerification } from "../src/lib/revenue-engine";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Make sure your .env.local file is loaded.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// Tenant sales data: [lease_id_suffix, tenant_id_suffix, ...monthly_revenue]
// Months: Oct 2025, Nov 2025, Dec 2025, Jan 2026, Feb 2026, Mar 2026
type SalesRow = [string, string, number, number, number, number, number, number];

// HONEST reporters (within +/-10% of expected)
const honestReporters: SalesRow[] = [
  ["01", "01", 8200000, 7900000, 9100000, 8500000, 7800000, 8100000], // Spinneys
  ["12", "05", 920000, 870000, 1050000, 950000, 880000, 930000],       // KFC
  ["24", "09", 2100000, 1950000, 2800000, 2200000, 1900000, 2050000],  // Kidzo
  ["13", "11", 480000, 460000, 550000, 500000, 470000, 490000],        // Costa Coffee
  ["08", "12", 720000, 680000, 850000, 750000, 700000, 730000],        // Skechers
  ["26", "13", 380000, 360000, 450000, 400000, 370000, 390000],        // Bath & Body Works
  ["14", "14", 280000, 260000, 340000, 290000, 270000, 285000],        // Baskin Robbins
  ["27", "15", 320000, 300000, 370000, 340000, 310000, 330000],        // Vision Express
  ["15", "16", 780000, 740000, 890000, 810000, 760000, 790000],        // Hardee's
  ["22", "17", 620000, 580000, 740000, 650000, 600000, 630000],        // New Balance
  ["23", "18", 950000, 890000, 1200000, 1000000, 920000, 960000],      // Al Araby
  ["16", "19", 220000, 200000, 270000, 230000, 210000, 225000],        // Cinnabon
  ["28", "20", 310000, 290000, 360000, 320000, 300000, 315000],        // The Body Shop
  ["09", "21", 450000, 420000, 560000, 470000, 440000, 455000],        // Tous
  ["20", "23", 780000, 740000, 920000, 810000, 760000, 790000],        // Stradivarius
  ["29", "25", 420000, 400000, 480000, 440000, 410000, 430000],        // STC Pharmacy
  ["10", "26", 350000, 330000, 420000, 360000, 340000, 355000],        // Gold Time
  ["30", "28", 350000, 330000, 400000, 360000, 340000, 355000],        // Vodafone
  ["21", "29", 850000, 800000, 990000, 870000, 820000, 860000],        // Pull & Bear
  ["18", "30", 580000, 550000, 670000, 600000, 560000, 585000],        // Cook Door
  ["03", "03", 520000, 490000, 620000, 540000, 510000, 530000],        // Aldo
];

// HEAVY underreporters (30-50% below)
const heavyUnderreporters: SalesRow[] = [
  ["02", "02", 820000, 790000, 910000, 850000, 780000, 830000],        // Adidas ~35% under
  ["11", "04", 1150000, 1080000, 1350000, 1200000, 1100000, 1180000],  // McDonald's ~35% under
  ["04", "06", 1550000, 1480000, 1720000, 1600000, 1450000, 1530000],  // LC Waikiki ~30% under
  ["05", "07", 680000, 640000, 780000, 710000, 660000, 690000],        // DeFacto ~40% under
  ["07", "10", 550000, 520000, 680000, 580000, 540000, 560000],        // Samsung ~40% under
  ["19", "22", 750000, 710000, 870000, 780000, 730000, 760000],        // Bershka ~35% under
];

// MODERATE underreporters (15-25% below)
const moderateUnderreporters: SalesRow[] = [
  ["06", "08", 480000, 450000, 560000, 500000, 470000, 490000],        // Timberland ~20% under
  ["17", "24", 680000, 640000, 790000, 700000, 660000, 690000],        // Pizza Hut ~20% under
  ["25", "27", 620000, 580000, 750000, 650000, 600000, 640000],        // Mega Bowl ~25% under
];

const allSales = [...honestReporters, ...heavyUnderreporters, ...moderateUnderreporters];

const months = [
  { month: 10, year: 2025, dateOffset: "2025-11" },
  { month: 11, year: 2025, dateOffset: "2025-12" },
  { month: 12, year: 2025, dateOffset: "2026-01" },
  { month: 1, year: 2026, dateOffset: "2026-02" },
  { month: 2, year: 2026, dateOffset: "2026-03" },
  { month: 3, year: 2026, dateOffset: "2026-03" },
];

async function seedSales() {
  console.log("Clearing existing sales data...");
  await supabase.from("tenant_sales_reported").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Seeding sales data for 30 tenants x 6 months...");

  const rows: Array<{
    lease_id: string;
    tenant_id: string;
    period_month: number;
    period_year: number;
    reported_revenue_egp: number;
    submission_date: string;
    verified: boolean;
  }> = [];

  for (const [leaseSuffix, tenantSuffix, ...revenues] of allSales) {
    const leaseId = `e0000000-0000-0000-0000-0000000000${leaseSuffix}`;
    const tenantId = `c0000000-0000-0000-0000-0000000000${tenantSuffix}`;

    for (let i = 0; i < months.length; i++) {
      const { month, year, dateOffset } = months[i];
      const revenue = revenues[i];
      const day = String(5 + Math.floor(Math.random() * 10)).padStart(2, "0");

      rows.push({
        lease_id: leaseId,
        tenant_id: tenantId,
        period_month: month,
        period_year: year,
        reported_revenue_egp: revenue,
        submission_date: `${dateOffset}-${day}`,
        verified: false,
      });
    }
  }

  const { error } = await supabase.from("tenant_sales_reported").insert(rows);
  if (error) {
    console.error("Failed to seed sales:", error.message);
    return false;
  }

  console.log(`Seeded ${rows.length} sales records.`);
  return true;
}

async function runVerification() {
  console.log("\nRunning revenue verification...");

  // Clear existing discrepancies and estimates
  await supabase.from("discrepancies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("revenue_estimates").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Run for the last 3 months that have footfall data
  const periodsToVerify = [
    { month: 3, year: 2026 },
    { month: 2, year: 2026 },
    { month: 1, year: 2026 },
  ];

  for (const { month, year } of periodsToVerify) {
    console.log(`\nVerifying ${month}/${year}...`);
    const result = await runRevenueVerification(supabase, PROPERTY_ID, month, year);

    console.log(`  Tenants analyzed: ${result.total_tenants}`);
    console.log(`  With sales data: ${result.total_with_sales}`);
    console.log(`  Discrepancies found: ${result.total_discrepancies}`);
    console.log(`  Total variance: EGP ${result.total_variance_egp.toLocaleString()}`);

    if (result.total_discrepancies > 0) {
      console.log("  Flagged tenants:");
      result.results
        .filter((r) => r.status === "flagged")
        .forEach((r) => {
          console.log(
            `    - ${r.brand_name}: reported ${r.reported_revenue_egp?.toLocaleString()} vs estimated ${r.estimated_mid_egp.toLocaleString()} (${r.variance_pct.toFixed(1)}% variance)`
          );
        });
    }
  }
}

async function main() {
  console.log("=== Wedja Revenue Verification — Seed & Verify ===\n");

  const success = await seedSales();
  if (!success) {
    console.error("Seed failed. Aborting.");
    process.exit(1);
  }

  await runVerification();

  console.log("\n=== Complete ===");
  console.log("Dashboard data is now populated. Open /dashboard/discrepancies to see results.");
}

main().catch(console.error);
