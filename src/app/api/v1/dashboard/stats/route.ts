import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic"; // v2

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

    // Footfall today — check both footfall_daily and live footfall_readings
    let footfallToday = (footfallResult.data || []).reduce(
      (sum, f) => sum + (f.total_in || 0),
      0
    );

    // Direct fetch for gate camera data (bypass SDK caching)
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

      // Check footfall_daily (gate camera cumulative totals)
      const dailyRes = await fetch(
        `${sbUrl}/rest/v1/footfall_daily?select=total_in&property_id=eq.a0000000-0000-0000-0000-000000000001&date=eq.${todayStr}`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }
      );
      const dailyData = await dailyRes.json();
      if (Array.isArray(dailyData)) {
        const dailyTotal = dailyData.reduce((s: number, r: any) => s + (r.total_in || 0), 0);
        footfallToday = Math.max(footfallToday, dailyTotal);
      }

      // Get latest gate reading (most recent = running daily total)
      const liveRes = await fetch(
        `${sbUrl}/rest/v1/footfall_readings?select=count_in&timestamp=gte.${todayStr}T00:00:00Z&timestamp=lte.${todayStr}T23:59:59Z&order=timestamp.desc&limit=1`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }
      );
      const liveData = await liveRes.json();
      if (Array.isArray(liveData) && liveData.length > 0) {
        footfallToday = Math.max(footfallToday, liveData[0].count_in || 0);
      }
    } catch {
      // Live readings optional
    }

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
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
