import { SupabaseClient } from "@supabase/supabase-js";
import {
  generatePropertyInsights,
  generateDailyBriefing,
  calculatePropertyHealthScore,
  getTenantPerformanceCards,
} from "./ai-engine";
import { getFootfallOverview, getFootfallByZone } from "./footfall-engine";
import { getDiscrepancySummary } from "./revenue-engine";

// ============================================================
// Wedja AI Chat — Natural Language Query Engine
//
// Parses user messages and queries the appropriate data sources
// to provide intelligent answers about mall operations.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export interface ChatResponse {
  message: string;
  data?: any;
  type: "text" | "table" | "briefing" | "list" | "metric";
}

// ── Intent Detection ────────────────────────────────────────

interface Intent {
  action: string;
  confidence: number;
}

function detectIntent(message: string): Intent {
  const msg = message.toLowerCase().trim();

  // Underreporting / discrepancies
  if (
    msg.includes("underreport") ||
    msg.includes("discrepanc") ||
    msg.includes("flagged") ||
    msg.includes("cheating") ||
    msg.includes("underperform")
  ) {
    return { action: "discrepancies", confidence: 0.95 };
  }

  // Overdue rent
  if (
    msg.includes("overdue") ||
    msg.includes("unpaid") ||
    msg.includes("late payment") ||
    msg.includes("outstanding rent") ||
    msg.includes("not paid")
  ) {
    return { action: "overdue_rent", confidence: 0.9 };
  }

  // Vacant units
  if (
    msg.includes("vacant") ||
    msg.includes("empty unit") ||
    msg.includes("available unit") ||
    msg.includes("unoccupied")
  ) {
    return { action: "vacant_units", confidence: 0.9 };
  }

  // Occupancy rate
  if (msg.includes("occupancy")) {
    return { action: "occupancy_rate", confidence: 0.9 };
  }

  // Status update / briefing
  if (
    msg.includes("status") ||
    msg.includes("update") ||
    msg.includes("briefing") ||
    msg.includes("summary") ||
    msg.includes("how are things") ||
    msg.includes("what's happening") ||
    msg.includes("overview")
  ) {
    return { action: "briefing", confidence: 0.85 };
  }

  // Footfall today
  if (
    (msg.includes("visitor") || msg.includes("footfall") || msg.includes("traffic")) &&
    (msg.includes("today") || msg.includes("now") || msg.includes("current"))
  ) {
    return { action: "footfall_today", confidence: 0.9 };
  }

  // Zone traffic
  if (
    msg.includes("zone") ||
    msg.includes("food court") ||
    msg.includes("which area") ||
    msg.includes("most traffic") ||
    msg.includes("busiest")
  ) {
    return { action: "zone_traffic", confidence: 0.85 };
  }

  // General footfall
  if (msg.includes("footfall") || msg.includes("visitor") || msg.includes("traffic")) {
    return { action: "footfall_today", confidence: 0.8 };
  }

  // Maintenance
  if (
    msg.includes("maintenance") ||
    msg.includes("repair") ||
    msg.includes("broken") ||
    msg.includes("ticket") ||
    msg.includes("urgent")
  ) {
    return { action: "maintenance", confidence: 0.9 };
  }

  // Expiring leases
  if (msg.includes("expir") || msg.includes("lease renewal") || msg.includes("ending soon")) {
    return { action: "expiring_leases", confidence: 0.9 };
  }

  // Revenue / rent this month
  if (
    msg.includes("revenue") ||
    msg.includes("rent") ||
    msg.includes("collection") ||
    msg.includes("income") ||
    msg.includes("earned")
  ) {
    return { action: "revenue_summary", confidence: 0.85 };
  }

  // Tenant performance / ranking
  if (
    msg.includes("tenant performance") ||
    msg.includes("ranking") ||
    msg.includes("best tenant") ||
    msg.includes("worst tenant") ||
    msg.includes("top performer") ||
    msg.includes("performance")
  ) {
    return { action: "tenant_performance", confidence: 0.9 };
  }

  // Health score
  if (msg.includes("health") || msg.includes("score") || msg.includes("how is the property")) {
    return { action: "health_score", confidence: 0.85 };
  }

  // Insights
  if (msg.includes("insight") || msg.includes("alert") || msg.includes("recommendation")) {
    return { action: "insights", confidence: 0.85 };
  }

  // Food court
  if (msg.includes("food court") || msg.includes("food zone") || msg.includes("f&b")) {
    return { action: "zone_traffic", confidence: 0.8 };
  }

  // Fallback — try briefing
  return { action: "briefing", confidence: 0.4 };
}

// ── Query Handlers ──────────────────────────────────────────

async function handleDiscrepancies(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { month, year } = currentMonth();
  const summary = await getDiscrepancySummary(supabase, PROPERTY_ID, month, year);

  if (summary.total_discrepancies === 0) {
    return {
      message:
        "No underreporting discrepancies have been flagged for this month. All tenants appear to be reporting within expected ranges.",
      type: "text",
    };
  }

  const topThree = summary.top_discrepancies.slice(0, 5);
  const tenantList = topThree
    .map(
      (d, i) =>
        `${i + 1}. **${d.brand_name}** (${d.unit_number}) — reported EGP ${d.reported_revenue_egp.toLocaleString()} vs estimated EGP ${d.estimated_revenue_egp.toLocaleString()} (${d.variance_pct.toFixed(1)}% variance, ${(d.confidence * 100).toFixed(0)}% confidence)`
    )
    .join("\n");

  return {
    message: `**${summary.total_discrepancies} tenants flagged for potential underreporting this month.**\n\nPotential recovery: **EGP ${Math.round(summary.total_potential_recovery_egp).toLocaleString()}**\nHigh confidence flags: ${summary.by_confidence.high}\n\nTop flagged tenants:\n${tenantList}`,
    data: summary,
    type: "list",
  };
}

async function handleOverdueRent(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { data: overdue } = await supabase
    .from("rent_transactions")
    .select(
      "id, amount_due, amount_paid, period_month, period_year, status, lease:leases!inner(tenant:tenants(brand_name), unit:units(unit_number))"
    )
    .eq("status", "overdue")
    .order("amount_due", { ascending: false });

  if (!overdue || overdue.length === 0) {
    return {
      message: "All rent payments are up to date. No overdue transactions found.",
      type: "text",
    };
  }

  const totalOverdue = overdue.reduce(
    (sum: number, r: any) => sum + ((r.amount_due || 0) - (r.amount_paid || 0)),
    0
  );

  const list = overdue
    .slice(0, 8)
    .map((r: any) => {
      const outstanding = (r.amount_due || 0) - (r.amount_paid || 0);
      return `- **${r.lease?.tenant?.brand_name || "Unknown"}** (${r.lease?.unit?.unit_number || "N/A"}) — EGP ${Math.round(outstanding).toLocaleString()} overdue (${r.period_month}/${r.period_year})`;
    })
    .join("\n");

  return {
    message: `**${overdue.length} overdue rent payments totalling EGP ${Math.round(totalOverdue).toLocaleString()}.**\n\n${list}${overdue.length > 8 ? `\n\n...and ${overdue.length - 8} more` : ""}`,
    data: overdue,
    type: "list",
  };
}

async function handleVacantUnits(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { data: vacantUnits } = await supabase
    .from("units")
    .select("id, unit_number, name, floor, area_sqm, zone:zones(name)")
    .eq("property_id", PROPERTY_ID)
    .eq("status", "vacant")
    .order("floor", { ascending: true });

  if (!vacantUnits || vacantUnits.length === 0) {
    return {
      message: "All units are currently occupied. No vacancies available.",
      type: "text",
    };
  }

  const list = vacantUnits
    .map(
      (u: any) =>
        `- **${u.unit_number}** — ${u.name || "Unnamed"}, Floor ${u.floor}, ${u.area_sqm} sqm (${u.zone?.name || "Unknown zone"})`
    )
    .join("\n");

  return {
    message: `**${vacantUnits.length} vacant units found.**\n\n${list}`,
    data: vacantUnits,
    type: "list",
  };
}

async function handleOccupancyRate(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { data: units } = await supabase
    .from("units")
    .select("status")
    .eq("property_id", PROPERTY_ID);

  const total = (units || []).length;
  const occupied = (units || []).filter((u: any) => u.status === "occupied").length;
  const vacant = (units || []).filter((u: any) => u.status === "vacant").length;
  const maintenance = (units || []).filter((u: any) => u.status === "maintenance").length;
  const rate = total > 0 ? ((occupied / total) * 100).toFixed(1) : "0";

  return {
    message: `**Occupancy Rate: ${rate}%**\n\n- Occupied: ${occupied} units\n- Vacant: ${vacant} units\n- Maintenance: ${maintenance} units\n- Total: ${total} units`,
    type: "metric",
  };
}

async function handleBriefing(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const briefing = await generateDailyBriefing(supabase, PROPERTY_ID);

  const sections = Object.values(briefing.sections)
    .map(
      (s) =>
        `**${s.title}:**\n${s.items.map((item) => `  - ${item}`).join("\n")}`
    )
    .join("\n\n");

  return {
    message: `${briefing.greeting}! Here's your property briefing for today.\n\n${sections}\n\n**Summary:** ${briefing.summary}`,
    data: briefing,
    type: "briefing",
  };
}

async function handleFootfallToday(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await getFootfallOverview(supabase, PROPERTY_ID);

  return {
    message: `**Today's Footfall: ${overview.total_visitors_today.toLocaleString()} visitors**\n\n- Yesterday: ${overview.total_visitors_yesterday.toLocaleString()}\n- This week: ${overview.total_visitors_this_week.toLocaleString()}\n- This month: ${overview.total_visitors_this_month.toLocaleString()}\n- 30-day average: ${overview.avg_daily_visitors.toLocaleString()}/day\n- Change vs yesterday: ${overview.change_vs_yesterday_pct > 0 ? "+" : ""}${overview.change_vs_yesterday_pct}%\n- Change vs last week: ${overview.change_vs_last_week_pct > 0 ? "+" : ""}${overview.change_vs_last_week_pct}%${overview.peak_hour > 0 ? `\n- Peak hour: ${overview.peak_hour}:00 (${overview.peak_count.toLocaleString()} visitors)` : ""}`,
    data: overview,
    type: "metric",
  };
}

async function handleZoneTraffic(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const zones = await getFootfallByZone(supabase, PROPERTY_ID);

  if (zones.length === 0) {
    return {
      message: "No zone-level footfall data available for today.",
      type: "text",
    };
  }

  const list = zones
    .map(
      (z, i) =>
        `${i + 1}. **${z.zone_name}** (${z.zone_type}) — ${z.total_in.toLocaleString()} visitors (${z.share_of_total_pct}% of total), avg dwell: ${z.avg_dwell_seconds}s`
    )
    .join("\n");

  return {
    message: `**Footfall by Zone (Today):**\n\n${list}`,
    data: zones,
    type: "table",
  };
}

async function handleMaintenance(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select("id, title, priority, status, category, created_at")
    .eq("property_id", PROPERTY_ID)
    .in("status", ["open", "assigned", "in_progress"])
    .order("priority", { ascending: true })
    .limit(10);

  if (!tickets || tickets.length === 0) {
    return {
      message: "No open maintenance tickets. Everything is running smoothly.",
      type: "text",
    };
  }

  const urgentCount = tickets.filter(
    (t: any) => t.priority === "urgent" || t.priority === "emergency"
  ).length;

  const list = tickets
    .map(
      (t: any) =>
        `- [${t.priority.toUpperCase()}] **${t.title}** — ${t.category} (${t.status})`
    )
    .join("\n");

  return {
    message: `**${tickets.length} open maintenance tickets${urgentCount > 0 ? ` (${urgentCount} urgent)` : ""}:**\n\n${list}`,
    data: tickets,
    type: "list",
  };
}

async function handleExpiringLeases(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const ninetyDaysFromNow = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000
  ).toISOString().split("T")[0];

  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, end_date, tenants!inner(brand_name), units!inner(unit_number)"
    )
    .eq("property_id", PROPERTY_ID)
    .eq("status", "active")
    .lte("end_date", ninetyDaysFromNow)
    .order("end_date", { ascending: true });

  if (!leases || leases.length === 0) {
    return {
      message: "No leases expiring within the next 90 days.",
      type: "text",
    };
  }

  const list = leases
    .map((l: any) => {
      const daysLeft = Math.ceil(
        (new Date(l.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return `- **${l.tenants?.brand_name}** (${l.units?.unit_number}) — expires ${l.end_date} (${daysLeft} days)`;
    })
    .join("\n");

  return {
    message: `**${leases.length} leases expiring within 90 days:**\n\n${list}`,
    data: leases,
    type: "list",
  };
}

async function handleRevenueSummary(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { month, year } = currentMonth();

  const { data: transactions } = await supabase
    .from("rent_transactions")
    .select("amount_due, amount_paid, status")
    .eq("period_month", month)
    .eq("period_year", year);

  const tx = transactions || [];
  const totalDue = tx.reduce((s: number, t: any) => s + (t.amount_due || 0), 0);
  const totalPaid = tx.reduce((s: number, t: any) => s + (t.amount_paid || 0), 0);
  const paidCount = tx.filter((t: any) => t.status === "paid").length;
  const overdueCount = tx.filter((t: any) => t.status === "overdue").length;
  const collectionRate = totalDue > 0 ? ((totalPaid / totalDue) * 100).toFixed(1) : "100";

  const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return {
    message: `**Revenue Summary — ${MONTH_NAMES[month]} ${year}:**\n\n- Total due: EGP ${Math.round(totalDue).toLocaleString()}\n- Total collected: EGP ${Math.round(totalPaid).toLocaleString()}\n- Collection rate: ${collectionRate}%\n- Paid: ${paidCount} transactions\n- Overdue: ${overdueCount} transactions\n- Outstanding: EGP ${Math.round(totalDue - totalPaid).toLocaleString()}`,
    type: "metric",
  };
}

async function handleTenantPerformance(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const cards = await getTenantPerformanceCards(supabase, PROPERTY_ID);

  if (cards.length === 0) {
    return {
      message: "No tenant performance data available yet.",
      type: "text",
    };
  }

  const topFive = cards.slice(0, 5);
  const bottomFive = cards.slice(-5).reverse();

  const topList = topFive
    .map(
      (c, i) =>
        `${i + 1}. **${c.brand_name}** — Score: ${c.overall_score.toFixed(0)}, Revenue/sqm: EGP ${c.revenue_per_sqm.toFixed(0)}, Payment: ${c.payment_reliability.toFixed(0)}%`
    )
    .join("\n");

  const bottomList = bottomFive
    .map(
      (c, i) =>
        `${i + 1}. **${c.brand_name}** — Score: ${c.overall_score.toFixed(0)}, Revenue/sqm: EGP ${c.revenue_per_sqm.toFixed(0)}, Payment: ${c.payment_reliability.toFixed(0)}%`
    )
    .join("\n");

  return {
    message: `**Tenant Performance Rankings:**\n\nTop 5:\n${topList}\n\nBottom 5:\n${bottomList}\n\nTotal tenants ranked: ${cards.length}`,
    data: cards,
    type: "table",
  };
}

async function handleHealthScore(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const health = await calculatePropertyHealthScore(supabase, PROPERTY_ID);

  return {
    message: `**Property Health Score: ${health.total}/100**\n\n- Occupancy: ${health.occupancy.score}/${health.occupancy.max} — ${health.occupancy.detail}\n- Revenue: ${health.revenue.score}/${health.revenue.max} — ${health.revenue.detail}\n- Maintenance: ${health.maintenance.score}/${health.maintenance.max} — ${health.maintenance.detail}\n- Tenant: ${health.tenant.score}/${health.tenant.max} — ${health.tenant.detail}`,
    data: health,
    type: "metric",
  };
}

async function handleInsights(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const insights = await generatePropertyInsights(supabase, PROPERTY_ID);

  if (insights.length === 0) {
    return {
      message: "No active insights or alerts at this time. Property is running smoothly.",
      type: "text",
    };
  }

  const list = insights
    .map((ins) => {
      const icon =
        ins.severity === "critical"
          ? "[CRITICAL]"
          : ins.severity === "warning"
          ? "[WARNING]"
          : ins.severity === "opportunity"
          ? "[OPPORTUNITY]"
          : "[INFO]";
      return `${icon} **${ins.title}**\n  ${ins.message}\n  Impact: ${ins.impact_estimate}`;
    })
    .join("\n\n");

  return {
    message: `**${insights.length} Active Insights:**\n\n${list}`,
    data: insights,
    type: "list",
  };
}

// ── Main Chat Handler ───────────────────────────────────────

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function processChat(
  supabase: SupabaseClient,
  message: string
): Promise<ChatResponse> {
  const intent = detectIntent(message);

  try {
    switch (intent.action) {
      case "discrepancies":
        return await handleDiscrepancies(supabase);
      case "overdue_rent":
        return await handleOverdueRent(supabase);
      case "vacant_units":
        return await handleVacantUnits(supabase);
      case "occupancy_rate":
        return await handleOccupancyRate(supabase);
      case "briefing":
        return await handleBriefing(supabase);
      case "footfall_today":
        return await handleFootfallToday(supabase);
      case "zone_traffic":
        return await handleZoneTraffic(supabase);
      case "maintenance":
        return await handleMaintenance(supabase);
      case "expiring_leases":
        return await handleExpiringLeases(supabase);
      case "revenue_summary":
        return await handleRevenueSummary(supabase);
      case "tenant_performance":
        return await handleTenantPerformance(supabase);
      case "health_score":
        return await handleHealthScore(supabase);
      case "insights":
        return await handleInsights(supabase);
      default:
        return await handleBriefing(supabase);
    }
  } catch (error) {
    console.error("AI Chat error:", error);
    return {
      message:
        "I encountered an error while processing your request. Please try again or rephrase your question.",
      type: "text",
    };
  }
}
