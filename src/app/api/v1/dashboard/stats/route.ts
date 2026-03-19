import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Run all queries in parallel
    const [
      revenueResult,
      unitsResult,
      activeTenantsResult,
      overdueResult,
      maintenanceResult,
      recentTransactionsResult,
      discrepanciesResult,
      footfallResult,
    ] = await Promise.all([
      // Total revenue (sum of amount_paid)
      supabase
        .from("rent_transactions")
        .select("amount_paid")
        .not("amount_paid", "is", null),

      // Unit counts by status
      supabase.from("units").select("status"),

      // Active tenants (tenants with active leases)
      supabase
        .from("leases")
        .select("tenant_id")
        .eq("status", "active"),

      // Overdue rent count
      supabase
        .from("rent_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue"),

      // Open maintenance tickets
      supabase
        .from("maintenance_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "assigned", "in_progress"]),

      // Recent transactions (last 10 paid)
      supabase
        .from("rent_transactions")
        .select(
          "id, period_month, period_year, amount_due, amount_paid, payment_date, status, lease:leases(id, tenant:tenants(brand_name), unit:units(unit_number, name))"
        )
        .not("amount_paid", "eq", 0)
        .order("payment_date", { ascending: false, nullsFirst: false })
        .limit(10),

      // Discrepancies count
      supabase
        .from("discrepancies")
        .select("id", { count: "exact", head: true })
        .in("status", ["flagged", "investigating"]),

      // Today's footfall
      supabase
        .from("footfall_daily")
        .select("total_in")
        .eq("date", new Date().toISOString().split("T")[0]),
    ]);

    // Calculate total revenue
    const totalRevenue = (revenueResult.data || []).reduce(
      (sum, t) => sum + (t.amount_paid || 0),
      0
    );

    // Calculate unit stats
    const units = unitsResult.data || [];
    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === "occupied").length;
    const vacantUnits = units.filter((u) => u.status === "vacant").length;
    const maintenanceUnits = units.filter(
      (u) => u.status === "maintenance"
    ).length;
    const occupancyRate =
      totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // Unique active tenants
    const uniqueTenantIds = new Set(
      (activeTenantsResult.data || []).map((l) => l.tenant_id)
    );
    const activeTenants = uniqueTenantIds.size;

    // Footfall today
    const footfallToday = (footfallResult.data || []).reduce(
      (sum, f) => sum + (f.total_in || 0),
      0
    );

    return NextResponse.json({
      total_revenue_egp: totalRevenue,
      occupancy_rate: Math.round(occupancyRate * 10) / 10,
      active_tenants: activeTenants,
      total_units: totalUnits,
      occupied_units: occupiedUnits,
      vacant_units: vacantUnits,
      maintenance_units: maintenanceUnits,
      overdue_rent_count: overdueResult.count || 0,
      open_maintenance: maintenanceResult.count || 0,
      recent_transactions: recentTransactionsResult.data || [],
      discrepancies_found: discrepanciesResult.count || 0,
      footfall_today: footfallToday,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
