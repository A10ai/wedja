import { SupabaseClient } from "@supabase/supabase-js";
import { getFootfallOverview, getPeakPatterns } from "./footfall-engine";
import { getDiscrepancySummary } from "./revenue-engine";

// ============================================================
// Custis AI Engine
//
// Analyses all property data and generates actionable insights,
// health scores, daily briefings, and tenant performance cards.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface AIInsight {
  id: string;
  type:
    | "revenue"
    | "occupancy"
    | "maintenance"
    | "footfall"
    | "lease"
    | "rent_collection"
    | "tenant_performance";
  severity: "info" | "opportunity" | "warning" | "critical";
  title: string;
  message: string;
  impact_estimate: string;
  confidence: number;
}

export interface HealthScore {
  total: number;
  occupancy: { score: number; max: 30; detail: string };
  revenue: { score: number; max: 30; detail: string };
  maintenance: { score: number; max: 20; detail: string };
  tenant: { score: number; max: 20; detail: string };
}

export interface DailyBriefing {
  greeting: string;
  date: string;
  sections: {
    footfall: {
      title: string;
      items: string[];
    };
    revenue: {
      title: string;
      items: string[];
    };
    maintenance: {
      title: string;
      items: string[];
    };
    alerts: {
      title: string;
      items: string[];
    };
  };
  summary: string;
}

export interface TenantPerformanceCard {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  revenue_per_sqm: number;
  footfall_attraction: number;
  payment_reliability: number;
  discrepancy_risk: number;
  overall_score: number;
}

// ── Helper ──────────────────────────────────────────────────

function makeId(): string {
  return "ins_" + Math.random().toString(36).slice(2, 11);
}

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Generate Property Insights ─────────────────────────────

export async function generatePropertyInsights(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];
  const { month, year } = currentMonth();

  // Run all queries in parallel
  const [
    discrepancySummary,
    unitsResult,
    maintenanceResult,
    leasesResult,
    rentResult,
    footfallOverview,
    peakPatterns,
  ] = await Promise.all([
    getDiscrepancySummary(supabase, propertyId, month, year).catch(() => null),
    supabase.from("units").select("id, status").eq("property_id", propertyId),
    supabase
      .from("maintenance_tickets")
      .select("id, priority, status, created_at, resolved_at")
      .eq("property_id", propertyId)
      .in("status", ["open", "assigned", "in_progress"]),
    supabase
      .from("leases")
      .select("id, tenant_id, end_date, status, tenants!inner(brand_name)")
      .eq("property_id", propertyId)
      .eq("status", "active"),
    supabase
      .from("rent_transactions")
      .select("id, amount_due, amount_paid, status, lease:leases!inner(property_id, tenant:tenants(brand_name))")
      .eq("status", "overdue"),
    getFootfallOverview(supabase, propertyId).catch(() => null),
    getPeakPatterns(supabase, propertyId).catch(() => null),
  ]);

  // 1. Revenue alerts (discrepancies)
  if (discrepancySummary && discrepancySummary.total_discrepancies > 0) {
    const ds = discrepancySummary;
    const severity =
      ds.total_potential_recovery_egp > 200000
        ? "critical"
        : ds.total_potential_recovery_egp > 50000
        ? "warning"
        : "opportunity";

    insights.push({
      id: makeId(),
      type: "revenue",
      severity,
      title: `${ds.total_discrepancies} tenants flagged for underreporting`,
      message: `Revenue verification detected ${ds.total_discrepancies} potential underreporting cases. High confidence flags: ${ds.by_confidence.high}. Total estimated variance: EGP ${Math.round(ds.total_variance_egp).toLocaleString()}.`,
      impact_estimate: `EGP ${Math.round(ds.total_potential_recovery_egp).toLocaleString()} potential recovery`,
      confidence: 0.82,
    });
  }

  // 2. Occupancy alerts
  const units = unitsResult.data || [];
  const totalUnits = units.length;
  const vacantUnits = units.filter((u: any) => u.status === "vacant").length;
  const occupancyRate = totalUnits > 0 ? ((totalUnits - vacantUnits) / totalUnits) * 100 : 100;

  if (vacantUnits > 0) {
    const severity =
      occupancyRate < 70
        ? "critical"
        : occupancyRate < 85
        ? "warning"
        : "info";

    insights.push({
      id: makeId(),
      type: "occupancy",
      severity,
      title: `${vacantUnits} units vacant — ${occupancyRate.toFixed(1)}% occupancy`,
      message: `${vacantUnits} out of ${totalUnits} units are currently vacant. ${
        occupancyRate < 85
          ? "Consider marketing campaigns or rent adjustments to improve occupancy."
          : "Occupancy is within healthy range."
      }`,
      impact_estimate:
        vacantUnits > 3
          ? `Estimated EGP ${(vacantUnits * 25000).toLocaleString()}/month lost revenue`
          : "Minimal impact at current vacancy level",
      confidence: 0.95,
    });
  }

  // 3. Maintenance alerts
  const openTickets = maintenanceResult.data || [];
  const urgentTickets = openTickets.filter(
    (t: any) => t.priority === "urgent" || t.priority === "emergency"
  );

  if (openTickets.length > 0) {
    // Calculate avg resolution time from resolved tickets
    const resolvedTickets = openTickets.filter((t: any) => t.resolved_at);
    let avgDays = 0;
    if (resolvedTickets.length > 0) {
      const totalDays = resolvedTickets.reduce((sum: number, t: any) => {
        const created = new Date(t.created_at).getTime();
        const resolved = new Date(t.resolved_at).getTime();
        return sum + (resolved - created) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDays = Math.round(totalDays / resolvedTickets.length);
    }

    const severity =
      urgentTickets.length >= 3
        ? "critical"
        : urgentTickets.length > 0
        ? "warning"
        : "info";

    insights.push({
      id: makeId(),
      type: "maintenance",
      severity,
      title: `${openTickets.length} open maintenance tickets${
        urgentTickets.length > 0 ? ` (${urgentTickets.length} urgent)` : ""
      }`,
      message: `${openTickets.length} maintenance tickets require attention.${
        urgentTickets.length > 0
          ? ` ${urgentTickets.length} are marked urgent/emergency.`
          : ""
      }${avgDays > 0 ? ` Average resolution time: ${avgDays} days.` : ""}`,
      impact_estimate:
        urgentTickets.length > 0
          ? "Urgent items may affect tenant satisfaction and safety"
          : "Standard maintenance backlog",
      confidence: 0.9,
    });
  }

  // 4. Footfall insights
  if (footfallOverview) {
    const fo = footfallOverview;

    if (fo.change_vs_last_week_pct !== 0) {
      const direction = fo.change_vs_last_week_pct > 0 ? "up" : "down";
      const severity: AIInsight["severity"] =
        fo.change_vs_last_week_pct < -15
          ? "warning"
          : fo.change_vs_last_week_pct > 10
          ? "opportunity"
          : "info";

      insights.push({
        id: makeId(),
        type: "footfall",
        severity,
        title: `Footfall ${direction} ${Math.abs(fo.change_vs_last_week_pct)}% vs last week`,
        message: `Today's footfall is ${direction} ${Math.abs(
          fo.change_vs_last_week_pct
        )}% compared to the same day last week. Daily average over 30 days: ${fo.avg_daily_visitors.toLocaleString()} visitors.`,
        impact_estimate:
          fo.change_vs_last_week_pct > 10
            ? "Increased traffic may indicate seasonal trend or successful marketing"
            : fo.change_vs_last_week_pct < -10
            ? "Declining traffic warrants investigation"
            : "Normal fluctuation",
        confidence: 0.85,
      });
    }

    if (peakPatterns && peakPatterns.weekend_vs_weekday_ratio > 0) {
      const ratio = peakPatterns.weekend_vs_weekday_ratio;
      if (ratio > 1.2 || ratio < 0.8) {
        insights.push({
          id: makeId(),
          type: "footfall",
          severity: "info",
          title: `Weekend traffic ${ratio > 1 ? "higher" : "lower"} than weekdays (${ratio}x)`,
          message: `Weekend average: ${peakPatterns.weekend_avg.toLocaleString()} visitors. Weekday average: ${peakPatterns.weekday_avg.toLocaleString()} visitors. Busiest day: ${peakPatterns.busiest_day}. Quietest day: ${peakPatterns.quietest_day}.`,
          impact_estimate: "Consider adjusting staffing and marketing to peak days",
          confidence: 0.88,
        });
      }
    }
  }

  // 5. Lease alerts
  const activeLeases = leasesResult.data || [];
  const now = new Date();
  const ninetyDaysFromNow = new Date(
    now.getTime() + 90 * 24 * 60 * 60 * 1000
  );
  const expiringLeases = activeLeases.filter(
    (l: any) => new Date(l.end_date) <= ninetyDaysFromNow
  );

  if (expiringLeases.length > 0) {
    const tenantNames = expiringLeases
      .slice(0, 3)
      .map((l: any) => l.tenants?.brand_name || "Unknown")
      .join(", ");

    insights.push({
      id: makeId(),
      type: "lease",
      severity: expiringLeases.length >= 5 ? "warning" : "info",
      title: `${expiringLeases.length} leases expiring within 90 days`,
      message: `The following tenants have leases expiring soon: ${tenantNames}${
        expiringLeases.length > 3 ? ` and ${expiringLeases.length - 3} more` : ""
      }. Review for renewal negotiations.`,
      impact_estimate: `${expiringLeases.length} units at risk of vacancy`,
      confidence: 1.0,
    });
  }

  // 6. Rent collection
  const overdueRent = (rentResult.data || []).filter(
    (r: any) => r.lease?.property_id === propertyId
  );
  if (overdueRent.length > 0) {
    const totalOverdue = overdueRent.reduce(
      (sum: number, r: any) => sum + ((r.amount_due || 0) - (r.amount_paid || 0)),
      0
    );
    const uniqueTenants = new Set(
      overdueRent.map((r: any) => r.lease?.tenant?.brand_name).filter(Boolean)
    );

    insights.push({
      id: makeId(),
      type: "rent_collection",
      severity: totalOverdue > 100000 ? "critical" : "warning",
      title: `EGP ${Math.round(totalOverdue).toLocaleString()} overdue from ${uniqueTenants.size} tenants`,
      message: `${overdueRent.length} rent transactions are overdue. Total outstanding: EGP ${Math.round(totalOverdue).toLocaleString()}. Tenants: ${Array.from(uniqueTenants).slice(0, 3).join(", ")}${uniqueTenants.size > 3 ? ` and ${uniqueTenants.size - 3} more` : ""}.`,
      impact_estimate: `EGP ${Math.round(totalOverdue).toLocaleString()} at risk`,
      confidence: 0.98,
    });
  }

  // 7. Tenant performance (top and bottom)
  try {
    const cards = await getTenantPerformanceCards(supabase, propertyId);
    if (cards.length >= 5) {
      const top = cards[0];
      const bottom = cards[cards.length - 1];

      insights.push({
        id: makeId(),
        type: "tenant_performance",
        severity: "info",
        title: `Top performer: ${top.brand_name} (EGP ${Math.round(top.revenue_per_sqm).toLocaleString()}/sqm)`,
        message: `Best overall tenant score: ${top.brand_name} with ${top.overall_score.toFixed(0)}/100. Lowest performer: ${bottom.brand_name} (${bottom.overall_score.toFixed(0)}/100, EGP ${Math.round(bottom.revenue_per_sqm).toLocaleString()}/sqm). Consider reviewing underperforming tenant support strategies.`,
        impact_estimate: "Tenant mix optimization opportunity",
        confidence: 0.75,
      });
    }
  } catch {
    // Skip if tenant performance fails
  }

  // Sort by severity priority
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  };

  insights.sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return insights;
}

// ── Daily Briefing ──────────────────────────────────────────

export async function generateDailyBriefing(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<DailyBriefing> {
  const today = todayStr();
  const { month, year } = currentMonth();
  const hour = new Date().getHours();

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
      ? "Good afternoon"
      : "Good evening";

  const [footfallOverview, discrepancySummary, maintenanceResult, overdueResult, leasesResult] =
    await Promise.all([
      getFootfallOverview(supabase, propertyId).catch(() => null),
      getDiscrepancySummary(supabase, propertyId, month, year).catch(() => null),
      supabase
        .from("maintenance_tickets")
        .select("id, title, priority, status")
        .eq("property_id", propertyId)
        .in("status", ["open", "assigned", "in_progress"])
        .order("priority", { ascending: true }),
      supabase
        .from("rent_transactions")
        .select("id, amount_due, amount_paid, status")
        .eq("status", "overdue"),
      supabase
        .from("leases")
        .select("id, end_date, tenants!inner(brand_name)")
        .eq("property_id", propertyId)
        .eq("status", "active"),
    ]);

  // Footfall section
  const footfallItems: string[] = [];
  if (footfallOverview) {
    const fo = footfallOverview;
    if (fo.total_visitors_yesterday > 0) {
      footfallItems.push(
        `Yesterday: ${fo.total_visitors_yesterday.toLocaleString()} visitors`
      );
    }
    footfallItems.push(
      `30-day daily average: ${fo.avg_daily_visitors.toLocaleString()} visitors`
    );
    if (fo.change_vs_yesterday_pct !== 0) {
      footfallItems.push(
        `${fo.change_vs_yesterday_pct > 0 ? "Up" : "Down"} ${Math.abs(fo.change_vs_yesterday_pct)}% vs day before`
      );
    }
    if (fo.total_visitors_this_month > 0) {
      footfallItems.push(
        `Month to date: ${fo.total_visitors_this_month.toLocaleString()} total visitors`
      );
    }
  } else {
    footfallItems.push("No footfall data available for today");
  }

  // Revenue section
  const revenueItems: string[] = [];
  if (discrepancySummary && discrepancySummary.total_discrepancies > 0) {
    revenueItems.push(
      `${discrepancySummary.total_discrepancies} discrepancies flagged this month`
    );
    revenueItems.push(
      `Potential recovery: EGP ${Math.round(discrepancySummary.total_potential_recovery_egp).toLocaleString()}`
    );
  } else {
    revenueItems.push("No new discrepancies detected this month");
  }

  const overdueTransactions = overdueResult.data || [];
  if (overdueTransactions.length > 0) {
    const totalOverdue = overdueTransactions.reduce(
      (sum: number, r: any) => sum + ((r.amount_due || 0) - (r.amount_paid || 0)),
      0
    );
    revenueItems.push(
      `${overdueTransactions.length} overdue payments totalling EGP ${Math.round(totalOverdue).toLocaleString()}`
    );
  } else {
    revenueItems.push("All rent payments up to date");
  }

  // Maintenance section
  const maintenanceItems: string[] = [];
  const tickets = maintenanceResult.data || [];
  if (tickets.length > 0) {
    const urgentCount = tickets.filter(
      (t: any) => t.priority === "urgent" || t.priority === "emergency"
    ).length;
    maintenanceItems.push(`${tickets.length} open tickets`);
    if (urgentCount > 0) {
      maintenanceItems.push(`${urgentCount} urgent/emergency tickets require immediate attention`);
    }
    const topTicket = tickets[0];
    if (topTicket) {
      maintenanceItems.push(`Highest priority: "${topTicket.title}" (${topTicket.priority})`);
    }
  } else {
    maintenanceItems.push("No open maintenance tickets");
  }

  // Alerts section
  const alertItems: string[] = [];
  const activeLeases = leasesResult.data || [];
  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const expiringLeases = activeLeases.filter(
    (l: any) => new Date(l.end_date) <= ninetyDays
  );
  if (expiringLeases.length > 0) {
    alertItems.push(
      `${expiringLeases.length} leases expiring within 90 days`
    );
  }
  if (discrepancySummary && discrepancySummary.by_confidence.high > 0) {
    alertItems.push(
      `${discrepancySummary.by_confidence.high} high-confidence underreporting flags`
    );
  }
  if (alertItems.length === 0) {
    alertItems.push("No urgent alerts at this time");
  }

  // Summary
  const summaryParts: string[] = [];
  if (footfallOverview && footfallOverview.total_visitors_yesterday > 0) {
    summaryParts.push(
      `${footfallOverview.total_visitors_yesterday.toLocaleString()} visitors yesterday`
    );
  }
  if (tickets.length > 0) {
    summaryParts.push(`${tickets.length} maintenance tickets open`);
  }
  if (discrepancySummary && discrepancySummary.total_discrepancies > 0) {
    summaryParts.push(`${discrepancySummary.total_discrepancies} discrepancies to review`);
  }

  const summary =
    summaryParts.length > 0
      ? summaryParts.join(". ") + "."
      : "Property is running smoothly. No urgent items.";

  return {
    greeting,
    date: today,
    sections: {
      footfall: { title: "Footfall", items: footfallItems },
      revenue: { title: "Revenue & Collections", items: revenueItems },
      maintenance: { title: "Maintenance", items: maintenanceItems },
      alerts: { title: "Key Alerts", items: alertItems },
    },
    summary,
  };
}

// ── Health Score ─────────────────────────────────────────────

export async function calculatePropertyHealthScore(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<HealthScore> {
  const { month, year } = currentMonth();

  const [unitsResult, rentResult, maintenanceResult, leasesResult, discrepancyResult] =
    await Promise.all([
      supabase.from("units").select("id, status").eq("property_id", propertyId),
      supabase.from("rent_transactions").select("id, status, amount_due, amount_paid"),
      supabase
        .from("maintenance_tickets")
        .select("id, priority, status, created_at, resolved_at")
        .eq("property_id", propertyId),
      supabase
        .from("leases")
        .select("id, end_date, status")
        .eq("property_id", propertyId)
        .eq("status", "active"),
      supabase
        .from("discrepancies")
        .select("id, confidence, status")
        .eq("period_month", month)
        .eq("period_year", year),
    ]);

  // -- Occupancy Health (0-30) --
  const units = unitsResult.data || [];
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u: any) => u.status === "occupied").length;
  const occupancyRate = totalUnits > 0 ? occupiedUnits / totalUnits : 1;

  const occupancyScore = Math.round(occupancyRate * 30);
  const occupancyDetail = `${occupiedUnits}/${totalUnits} units occupied (${(occupancyRate * 100).toFixed(1)}%)`;

  // -- Revenue Health (0-30) --
  const rentTx = rentResult.data || [];
  const totalRentTx = rentTx.length;
  const paidTx = rentTx.filter((r: any) => r.status === "paid").length;
  const overdueTx = rentTx.filter((r: any) => r.status === "overdue").length;
  const collectionRate = totalRentTx > 0 ? paidTx / totalRentTx : 1;

  let revenueScore = Math.round(collectionRate * 20);
  // Bonus for no overdue
  if (overdueTx === 0) revenueScore += 10;
  else if (overdueTx <= 3) revenueScore += 5;
  revenueScore = Math.min(revenueScore, 30);
  const revenueDetail = `${paidTx}/${totalRentTx} paid (${(collectionRate * 100).toFixed(1)}%), ${overdueTx} overdue`;

  // -- Maintenance Health (0-20) --
  const tickets = maintenanceResult.data || [];
  const openTickets = tickets.filter(
    (t: any) => t.status === "open" || t.status === "assigned" || t.status === "in_progress"
  );
  const urgentOpen = openTickets.filter(
    (t: any) => t.priority === "urgent" || t.priority === "emergency"
  );
  const resolvedTickets = tickets.filter((t: any) => t.status === "completed" && t.resolved_at);

  let avgResolutionDays = 0;
  if (resolvedTickets.length > 0) {
    const totalDays = resolvedTickets.reduce((sum: number, t: any) => {
      const created = new Date(t.created_at).getTime();
      const resolved = new Date(t.resolved_at).getTime();
      return sum + (resolved - created) / (1000 * 60 * 60 * 24);
    }, 0);
    avgResolutionDays = totalDays / resolvedTickets.length;
  }

  let maintenanceScore = 20;
  if (urgentOpen.length > 0) maintenanceScore -= urgentOpen.length * 4;
  if (openTickets.length > 5) maintenanceScore -= 3;
  if (avgResolutionDays > 7) maintenanceScore -= 3;
  else if (avgResolutionDays > 3) maintenanceScore -= 1;
  maintenanceScore = Math.max(maintenanceScore, 0);
  const maintenanceDetail = `${openTickets.length} open (${urgentOpen.length} urgent), avg resolution: ${avgResolutionDays.toFixed(1)} days`;

  // -- Tenant Health (0-20) --
  const leases = leasesResult.data || [];
  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const expiringLeases = leases.filter(
    (l: any) => new Date(l.end_date) <= ninetyDays
  );

  const discrepancies = discrepancyResult.data || [];
  const highRiskDiscrepancies = discrepancies.filter(
    (d: any) =>
      d.confidence >= 0.75 &&
      d.status !== "resolved" &&
      d.status !== "dismissed"
  );

  let tenantScore = 20;
  if (expiringLeases.length > 5) tenantScore -= 6;
  else if (expiringLeases.length > 2) tenantScore -= 3;
  if (highRiskDiscrepancies.length > 5) tenantScore -= 8;
  else if (highRiskDiscrepancies.length > 2) tenantScore -= 4;
  else if (highRiskDiscrepancies.length > 0) tenantScore -= 2;
  tenantScore = Math.max(tenantScore, 0);
  const tenantDetail = `${expiringLeases.length} leases expiring soon, ${highRiskDiscrepancies.length} high-risk discrepancies`;

  const total = occupancyScore + revenueScore + maintenanceScore + tenantScore;

  return {
    total,
    occupancy: { score: occupancyScore, max: 30, detail: occupancyDetail },
    revenue: { score: revenueScore, max: 30, detail: revenueDetail },
    maintenance: { score: maintenanceScore, max: 20, detail: maintenanceDetail },
    tenant: { score: tenantScore, max: 20, detail: tenantDetail },
  };
}

// ── Tenant Performance Cards ────────────────────────────────

export async function getTenantPerformanceCards(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<TenantPerformanceCard[]> {
  const { month, year } = currentMonth();

  // Get active leases with tenant and unit info
  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_id, tenants!inner(id, name, brand_name, category), units!inner(id, unit_number, area_sqm, zone_id)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");

  if (!leases || leases.length === 0) return [];

  const unitIds = leases.map((l: any) => l.unit_id);
  const tenantIds = leases.map((l: any) => l.tenant_id);

  // Parallel queries
  const [salesResult, footfallResult, rentResult, discrepancyResult, zoneFootfallResult] =
    await Promise.all([
      // Reported sales this month
      supabase
        .from("tenant_sales_reported")
        .select("tenant_id, reported_revenue_egp")
        .in("tenant_id", tenantIds)
        .eq("period_month", month)
        .eq("period_year", year),
      // Monthly footfall per unit
      supabase
        .from("footfall_daily")
        .select("unit_id, total_in")
        .in("unit_id", unitIds)
        .gte("date", `${year}-${String(month).padStart(2, "0")}-01`),
      // Rent transactions
      supabase
        .from("rent_transactions")
        .select("id, status, lease_id")
        .in(
          "lease_id",
          leases.map((l: any) => l.id)
        ),
      // Discrepancies
      supabase
        .from("discrepancies")
        .select("tenant_id, confidence, status")
        .in("tenant_id", tenantIds),
      // Zone-level footfall for attraction calculation
      supabase
        .from("footfall_daily")
        .select("zone_id, total_in")
        .eq("property_id", propertyId)
        .gte("date", `${year}-${String(month).padStart(2, "0")}-01`),
    ]);

  // Build lookup maps
  const salesByTenant: Record<string, number> = {};
  (salesResult.data || []).forEach((s: any) => {
    salesByTenant[s.tenant_id] = (salesByTenant[s.tenant_id] || 0) + s.reported_revenue_egp;
  });

  const footfallByUnit: Record<string, number> = {};
  (footfallResult.data || []).forEach((f: any) => {
    footfallByUnit[f.unit_id] = (footfallByUnit[f.unit_id] || 0) + (f.total_in || 0);
  });

  const zoneFootfall: Record<string, number> = {};
  (zoneFootfallResult.data || []).forEach((f: any) => {
    if (f.zone_id) {
      zoneFootfall[f.zone_id] = (zoneFootfall[f.zone_id] || 0) + (f.total_in || 0);
    }
  });

  const rentByLease: Record<string, { total: number; paid: number }> = {};
  (rentResult.data || []).forEach((r: any) => {
    if (!rentByLease[r.lease_id]) {
      rentByLease[r.lease_id] = { total: 0, paid: 0 };
    }
    rentByLease[r.lease_id].total += 1;
    if (r.status === "paid") rentByLease[r.lease_id].paid += 1;
  });

  const discrepanciesByTenant: Record<string, { count: number; highRisk: number }> = {};
  (discrepancyResult.data || []).forEach((d: any) => {
    if (!discrepanciesByTenant[d.tenant_id]) {
      discrepanciesByTenant[d.tenant_id] = { count: 0, highRisk: 0 };
    }
    discrepanciesByTenant[d.tenant_id].count += 1;
    if (d.confidence >= 0.75 && d.status !== "resolved" && d.status !== "dismissed") {
      discrepanciesByTenant[d.tenant_id].highRisk += 1;
    }
  });

  // Build cards
  const cards: TenantPerformanceCard[] = leases.map((lease: any) => {
    const tenant = lease.tenants;
    const unit = lease.units;
    const areaSqm = unit.area_sqm || 100;

    // Revenue per sqm
    const revenue = salesByTenant[lease.tenant_id] || 0;
    const revenuePerSqm = areaSqm > 0 ? revenue / areaSqm : 0;

    // Footfall attraction — % of zone footfall entering this unit
    const unitFf = footfallByUnit[lease.unit_id] || 0;
    const zoneFf = zoneFootfall[unit.zone_id] || 1;
    const footfallAttraction = Math.min((unitFf / zoneFf) * 100, 100);

    // Payment reliability
    const rentInfo = rentByLease[lease.id] || { total: 0, paid: 0 };
    const paymentReliability =
      rentInfo.total > 0 ? (rentInfo.paid / rentInfo.total) * 100 : 100;

    // Discrepancy risk (0=good, 100=bad)
    const discInfo = discrepanciesByTenant[lease.tenant_id] || {
      count: 0,
      highRisk: 0,
    };
    const discrepancyRisk = Math.min(
      discInfo.highRisk * 30 + discInfo.count * 10,
      100
    );

    // Overall score (weighted: higher = better)
    // Revenue/sqm normalized (assume max ~1000 EGP/sqm = 100)
    const revenueScore = Math.min((revenuePerSqm / 1000) * 100, 100);
    const overall =
      revenueScore * 0.3 +
      footfallAttraction * 0.2 +
      paymentReliability * 0.3 +
      (100 - discrepancyRisk) * 0.2;

    return {
      tenant_id: lease.tenant_id,
      tenant_name: tenant.name,
      brand_name: tenant.brand_name,
      category: tenant.category,
      unit_number: unit.unit_number,
      area_sqm: areaSqm,
      revenue_per_sqm: Math.round(revenuePerSqm * 100) / 100,
      footfall_attraction: Math.round(footfallAttraction * 10) / 10,
      payment_reliability: Math.round(paymentReliability * 10) / 10,
      discrepancy_risk: Math.round(discrepancyRisk),
      overall_score: Math.round(overall * 10) / 10,
    };
  });

  // Sort by overall score descending
  cards.sort((a, b) => b.overall_score - a.overall_score);

  return cards;
}
