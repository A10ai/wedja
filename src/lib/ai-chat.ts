import { SupabaseClient } from "@supabase/supabase-js";

// ── AI Engine (cross-data, briefing, health, snapshot)
import {
  generateCrossDataInsights,
  generateDailyBriefing,
  calculatePropertyHealthScore,
  getPropertySnapshot,
} from "./ai-engine";

// ── Revenue Verification
import { getDiscrepancySummary } from "./revenue-engine";

// ── Footfall
import {
  getFootfallOverview,
  getFootfallByZone,
  getHourlyFootfall,
  getPeakPatterns,
} from "./footfall-engine";

// ── Energy
import {
  getEnergyOverview,
  getEnergyByZone,
  getEnergyRecommendations,
} from "./energy-engine";

// ── Finance
import {
  getFinanceOverview,
  getCashFlow,
  getBudgetComparison,
  getProfitAndLoss,
} from "./finance-engine";

// ── Contracts
import {
  getContractOverview,
  getExpiringLeases,
  getRentVsSalesAnalysis,
  getContractAlerts,
  getPortfolioAnalytics,
} from "./contract-engine";

// ── Tenant Analytics
import {
  getTenantRankings,
  getSqmValueAnalysis,
  getTenantMixAnalysis,
  getPercentageRateAnalysis,
  getReplacementAnalysis,
  getTenantScorecard,
} from "./tenant-analytics";

// ── Percentage Rent
import {
  calculatePercentageRent,
  getInflationHedgeAnalysis,
  getPercentageRateOptimization,
} from "./percentage-rent-engine";

// ── Marketing
import {
  getMarketingOverview,
  getSeasonalCalendar,
  getUpcomingSeasonalAlerts,
} from "./marketing-engine";

// ── Social
import { getSocialOverview, getSocialInsights } from "./social-engine";

// ── CCTV
import {
  getQueueStatus,
  getParkingStatus,
  getSecurityAlerts,
  getStoreConversion,
  getDemographics,
  getDeadZones,
} from "./cctv-engine";

// ── Anomaly
import { getActiveAnomalies, getAnomalyStats } from "./anomaly-engine";

// ── Learning
import { getLearningStats, getLearnedPatterns } from "./learning-engine";

// ============================================================
// Wedja AI Chat — Natural Language Query Engine
//
// Parses user messages and queries ALL 22 modules to provide
// intelligent answers about Senzo Mall operations.
//
// 50+ intent types, fuzzy matching, tenant name lookup,
// real EGP numbers from Supabase via engine functions.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export interface ChatResponse {
  message: string;
  data?: any;
  type: "text" | "table" | "briefing" | "list" | "metric";
}

// ── Helpers ──────────────────────────────────────────────────

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function fmtEGP(n: number): string {
  return `EGP ${Math.round(n).toLocaleString()}`;
}

function pct(n: number): string {
  return `${n > 0 ? "+" : ""}${n}%`;
}

// ── Intent Detection ────────────────────────────────────────
//
// Ordered by specificity: most specific patterns first so they
// match before broader fallbacks. Uses includes() for fuzzy
// partial matching. Handles Arabic-English mix via lowercasing.

type IntentAction =
  | "help"
  | "briefing"
  | "health_score"
  | "snapshot"
  | "discrepancies"
  | "overdue_rent"
  | "profit_loss"
  | "cash_flow"
  | "budget"
  | "revenue_summary"
  | "percentage_rent"
  | "inflation_hedge"
  | "min_rent_only"
  | "rate_optimization"
  | "expiring_leases"
  | "wale"
  | "rent_vs_sales"
  | "portfolio"
  | "contract_alerts"
  | "top_tenant"
  | "worst_tenant"
  | "tenant_ranking"
  | "tenant_mix"
  | "replacement"
  | "opportunity_cost"
  | "sqm_value"
  | "footfall"
  | "busiest_zone"
  | "peak_hour"
  | "quiet_zone"
  | "energy"
  | "energy_saving"
  | "energy_by_zone"
  | "queues"
  | "parking"
  | "security_alerts"
  | "store_conversion"
  | "demographics"
  | "dead_zones"
  | "anomalies"
  | "critical_issues"
  | "events"
  | "campaigns"
  | "social_media"
  | "seasonal"
  | "learning"
  | "vacant_units"
  | "occupancy_rate"
  | "maintenance"
  | "insights"
  | "tenant_lookup";

interface Intent {
  action: IntentAction;
  confidence: number;
  tenantQuery?: string;
}

function detectIntent(message: string): Intent {
  const msg = message.toLowerCase().trim();

  // ── Help ──
  if (
    msg === "help" ||
    msg === "?" ||
    msg.includes("what can you do") ||
    msg.includes("capabilities") ||
    msg.includes("commands")
  ) {
    return { action: "help", confidence: 1.0 };
  }

  // ── Learning ──
  if (
    msg.includes("what has the ai learned") ||
    msg.includes("learning") ||
    msg.includes("patterns discovered") ||
    msg.includes("ai patterns")
  ) {
    return { action: "learning", confidence: 0.95 };
  }

  // ── Anomalies — Critical ──
  if (
    msg.includes("critical issue") ||
    msg.includes("critical alert") ||
    (msg.includes("urgent") && !msg.includes("maintenance"))
  ) {
    return { action: "critical_issues", confidence: 0.95 };
  }

  // ── Anomalies ──
  if (
    msg.includes("anomal") ||
    msg.includes("unusual") ||
    msg.includes("something wrong") ||
    msg.includes("abnormal")
  ) {
    return { action: "anomalies", confidence: 0.95 };
  }

  // ── Discrepancies / Underreporting ──
  if (
    msg.includes("underreport") ||
    msg.includes("discrepanc") ||
    msg.includes("cheating") ||
    msg.includes("who is lying") ||
    msg.includes("flagged tenant")
  ) {
    return { action: "discrepancies", confidence: 0.95 };
  }

  // ── Percentage Rent — Min rent only ──
  if (
    msg.includes("minimum only") ||
    msg.includes("min rent only") ||
    msg.includes("never trigger") ||
    msg.includes("pays minimum")
  ) {
    return { action: "min_rent_only", confidence: 0.95 };
  }

  // ── Percentage Rent — Rate optimization ──
  if (
    msg.includes("rate optimization") ||
    msg.includes("increase percentage") ||
    msg.includes("optimize rate") ||
    msg.includes("raise the %")
  ) {
    return { action: "rate_optimization", confidence: 0.95 };
  }

  // ── Percentage Rent — Inflation hedge ──
  if (
    msg.includes("inflation hedge") ||
    msg.includes("inflation protect") ||
    msg.includes("devaluation")
  ) {
    return { action: "inflation_hedge", confidence: 0.95 };
  }

  // ── Percentage Rent ──
  if (
    msg.includes("percentage rent") ||
    msg.includes("% rent") ||
    msg.includes("pct rent")
  ) {
    return { action: "percentage_rent", confidence: 0.9 };
  }

  // ── Replacement analysis ──
  if (
    msg.includes("replacement") ||
    msg.includes("who to replace") ||
    msg.includes("should we replace") ||
    msg.includes("swap tenant")
  ) {
    return { action: "replacement", confidence: 0.95 };
  }

  // ── Opportunity cost ──
  if (msg.includes("opportunity cost")) {
    return { action: "opportunity_cost", confidence: 0.95 };
  }

  // ── SQM value ──
  if (
    msg.includes("revenue per sqm") ||
    msg.includes("sqm value") ||
    msg.includes("per square meter") ||
    msg.includes("value per sqm")
  ) {
    return { action: "sqm_value", confidence: 0.9 };
  }

  // ── Tenant mix ──
  if (
    msg.includes("tenant mix") ||
    msg.includes("category mix") ||
    msg.includes("category allocation") ||
    msg.includes("space allocation")
  ) {
    return { action: "tenant_mix", confidence: 0.9 };
  }

  // ── Top/Best tenant ──
  if (
    msg.includes("best tenant") ||
    msg.includes("top performer") ||
    msg.includes("highest revenue") ||
    msg.includes("top 5") ||
    msg.includes("best performing")
  ) {
    return { action: "top_tenant", confidence: 0.9 };
  }

  // ── Worst tenant ──
  if (
    msg.includes("worst tenant") ||
    msg.includes("underperformer") ||
    msg.includes("lowest revenue") ||
    msg.includes("bottom 5") ||
    msg.includes("worst performing")
  ) {
    return { action: "worst_tenant", confidence: 0.9 };
  }

  // ── Tenant ranking ──
  if (
    msg.includes("tenant ranking") ||
    msg.includes("tenant performance") ||
    msg.includes("rank tenants") ||
    msg.includes("performance ranking")
  ) {
    return { action: "tenant_ranking", confidence: 0.9 };
  }

  // ── Overdue rent ──
  if (
    msg.includes("overdue") ||
    msg.includes("unpaid") ||
    msg.includes("late payment") ||
    msg.includes("outstanding rent") ||
    msg.includes("not paid")
  ) {
    return { action: "overdue_rent", confidence: 0.9 };
  }

  // ── P&L / Profit ──
  if (
    msg.includes("profit") ||
    msg.includes("p&l") ||
    msg.includes("loss") ||
    msg.includes("expenses")
  ) {
    return { action: "profit_loss", confidence: 0.9 };
  }

  // ── Cash flow ──
  if (msg.includes("cash flow") || msg.includes("cashflow")) {
    return { action: "cash_flow", confidence: 0.9 };
  }

  // ── Budget ──
  if (
    msg.includes("budget") ||
    msg.includes("budget vs actual") ||
    msg.includes("budgeted")
  ) {
    return { action: "budget", confidence: 0.9 };
  }

  // ── WALE ──
  if (
    msg.includes("wale") ||
    msg.includes("weighted average lease") ||
    msg.includes("lease expiry metric")
  ) {
    return { action: "wale", confidence: 0.95 };
  }

  // ── Rent vs Sales ──
  if (msg.includes("rent vs sales") || msg.includes("rent versus sales")) {
    return { action: "rent_vs_sales", confidence: 0.95 };
  }

  // ── Portfolio / Rent roll ──
  if (
    msg.includes("rent roll") ||
    msg.includes("portfolio") ||
    msg.includes("tenant concentration")
  ) {
    return { action: "portfolio", confidence: 0.9 };
  }

  // ── Contract alerts ──
  if (msg.includes("contract alert") || msg.includes("lease alert")) {
    return { action: "contract_alerts", confidence: 0.9 };
  }

  // ── Expiring leases ──
  if (
    msg.includes("expir") ||
    msg.includes("renewal") ||
    msg.includes("ending soon") ||
    msg.includes("lease renewal")
  ) {
    return { action: "expiring_leases", confidence: 0.9 };
  }

  // ── Store conversion ──
  if (
    msg.includes("conversion rate") ||
    msg.includes("store conversion") ||
    msg.includes("walk-in rate")
  ) {
    return { action: "store_conversion", confidence: 0.9 };
  }

  // ── Demographics ──
  if (
    msg.includes("demographic") ||
    msg.includes("families") ||
    msg.includes("tourist") ||
    msg.includes("age group")
  ) {
    return { action: "demographics", confidence: 0.9 };
  }

  // ── Queues ──
  if (
    msg.includes("queue") ||
    msg.includes("waiting") ||
    msg.includes("line length") ||
    msg.includes("wait time")
  ) {
    return { action: "queues", confidence: 0.9 };
  }

  // ── Parking ──
  if (
    msg.includes("parking") ||
    msg.includes("car park") ||
    msg.includes("garage")
  ) {
    return { action: "parking", confidence: 0.9 };
  }

  // ── Security ──
  if (
    msg.includes("security") ||
    msg.includes("security alert") ||
    msg.includes("suspicious") ||
    msg.includes("incident")
  ) {
    return { action: "security_alerts", confidence: 0.9 };
  }

  // ── Dead zones ──
  if (
    msg.includes("dead zone") ||
    msg.includes("low traffic area") ||
    msg.includes("no traffic")
  ) {
    return { action: "dead_zones", confidence: 0.9 };
  }

  // ── Quiet / low traffic ──
  if (msg.includes("quiet") && !msg.includes("day")) {
    return { action: "quiet_zone", confidence: 0.85 };
  }

  // ── Social media ──
  if (
    msg.includes("social media") ||
    msg.includes("instagram") ||
    msg.includes("facebook") ||
    msg.includes("tiktok") ||
    msg.includes("followers") ||
    msg.includes("social insight")
  ) {
    return { action: "social_media", confidence: 0.9 };
  }

  // ── Seasonal calendar ──
  if (
    msg.includes("next season") ||
    msg.includes("next holiday") ||
    msg.includes("eid") ||
    msg.includes("ramadan") ||
    msg.includes("seasonal calendar") ||
    msg.includes("عيد") ||
    msg.includes("رمضان")
  ) {
    return { action: "seasonal", confidence: 0.9 };
  }

  // ── Campaigns ──
  if (msg.includes("campaign") || msg.includes("marketing spend")) {
    return { action: "campaigns", confidence: 0.9 };
  }

  // ── Events ──
  if (
    msg.includes("event") ||
    msg.includes("what's happening") ||
    msg.includes("whats happening") ||
    msg.includes("promotion")
  ) {
    return { action: "events", confidence: 0.85 };
  }

  // ── Energy saving ──
  if (
    msg.includes("energy waste") ||
    msg.includes("energy saving") ||
    msg.includes("save energy") ||
    msg.includes("energy recommend")
  ) {
    return { action: "energy_saving", confidence: 0.9 };
  }

  // ── Energy by zone ──
  if (msg.includes("energy by zone") || msg.includes("energy zone")) {
    return { action: "energy_by_zone", confidence: 0.9 };
  }

  // ── Energy (general) ──
  if (
    msg.includes("energy") ||
    msg.includes("electricity") ||
    msg.includes("power consumption") ||
    msg.includes("kwh")
  ) {
    return { action: "energy", confidence: 0.85 };
  }

  // ── Busiest zone ──
  if (
    msg.includes("busiest zone") ||
    msg.includes("most traffic") ||
    msg.includes("most visited") ||
    msg.includes("busiest area")
  ) {
    return { action: "busiest_zone", confidence: 0.9 };
  }

  // ── Peak hour ──
  if (
    msg.includes("peak hour") ||
    msg.includes("when is busy") ||
    msg.includes("busiest time") ||
    msg.includes("busiest day") ||
    msg.includes("quietest day")
  ) {
    return { action: "peak_hour", confidence: 0.9 };
  }

  // ── Footfall ──
  if (
    msg.includes("footfall") ||
    msg.includes("visitor") ||
    msg.includes("traffic") ||
    msg.includes("how busy") ||
    msg.includes("how many people")
  ) {
    return { action: "footfall", confidence: 0.85 };
  }

  // ── Vacant units ──
  if (
    msg.includes("vacant") ||
    msg.includes("empty unit") ||
    msg.includes("available unit") ||
    msg.includes("unoccupied")
  ) {
    return { action: "vacant_units", confidence: 0.9 };
  }

  // ── Occupancy ──
  if (msg.includes("occupancy")) {
    return { action: "occupancy_rate", confidence: 0.9 };
  }

  // ── Maintenance ──
  if (
    msg.includes("maintenance") ||
    msg.includes("repair") ||
    msg.includes("broken") ||
    msg.includes("ticket")
  ) {
    return { action: "maintenance", confidence: 0.9 };
  }

  // ── Health score ──
  if (
    msg.includes("health") ||
    msg.includes("how is the mall") ||
    msg.includes("how is the property") ||
    msg.includes("how are we doing")
  ) {
    return { action: "health_score", confidence: 0.85 };
  }

  // ── Revenue / income ──
  if (
    msg.includes("revenue") ||
    msg.includes("how much money") ||
    msg.includes("income") ||
    msg.includes("collection") ||
    msg.includes("earned") ||
    msg.includes("rent collected")
  ) {
    return { action: "revenue_summary", confidence: 0.85 };
  }

  // ── Insights ──
  if (
    msg.includes("insight") ||
    msg.includes("alert") ||
    msg.includes("recommendation")
  ) {
    return { action: "insights", confidence: 0.85 };
  }

  // ── Briefing / Status ──
  if (
    msg.includes("status") ||
    msg.includes("update") ||
    msg.includes("briefing") ||
    msg.includes("summary") ||
    msg.includes("overview") ||
    msg.includes("what's going on") ||
    msg.includes("whats going on") ||
    msg.includes("how are things")
  ) {
    return { action: "briefing", confidence: 0.85 };
  }

  // ── Snapshot ──
  if (msg.includes("snapshot") || msg.includes("dashboard")) {
    return { action: "snapshot", confidence: 0.85 };
  }

  // ── Tenant name lookup (last, so specific names don't hit generic intents) ──
  const tenantNameMatch = extractTenantName(msg);
  if (tenantNameMatch) {
    return {
      action: "tenant_lookup",
      confidence: 0.85,
      tenantQuery: tenantNameMatch,
    };
  }

  // ── Fallback ──
  return { action: "briefing", confidence: 0.4 };
}

// Known tenant names for direct detection
const KNOWN_TENANTS = [
  "spinneys",
  "kfc",
  "mcdonald",
  "adidas",
  "aldo",
  "timberland",
  "lc waikiki",
  "defacto",
  "kidzo",
  "skechers",
  "max",
  "mothercare",
  "pandora",
  "reebok",
  "puma",
  "nike",
  "new balance",
  "zara",
  "h&m",
  "starbucks",
  "costa",
  "baskin robbins",
  "pizza hut",
  "burger king",
  "subway",
  "cinnabon",
  "dominos",
  "hardees",
  "chilis",
  "tbs",
];

function extractTenantName(msg: string): string | null {
  // Check for "tell me about X" or "how is X doing"
  const patterns = [
    /tell me about\s+(.+)/,
    /how is\s+(.+?)(?:\s+doing)?$/,
    /what about\s+(.+)/,
    /show me\s+(.+?)(?:\s+data)?$/,
    /lookup\s+(.+)/,
    /search\s+(.+)/,
  ];

  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Check for known tenant name in the message
  for (const name of KNOWN_TENANTS) {
    if (msg.includes(name)) return name;
  }

  return null;
}

// ── Query Handlers ──────────────────────────────────────────

async function handleHelp(): Promise<ChatResponse> {
  return {
    message: `**Wedja AI Chat — What I can do:**

**Property Overview:**
- "Give me a briefing" / "status update" / "what's going on"
- "Health score" / "how is the mall"
- "Snapshot" / "overview"

**Revenue & Finance:**
- "Revenue this month" / "how much money"
- "Who's underreporting" / "discrepancies"
- "Overdue rent" / "late payments"
- "Profit" / "P&L" / "expenses"
- "Cash flow" / "Budget vs actual"

**Percentage Rent:**
- "Percentage rent analysis"
- "Who pays minimum only"
- "Rate optimization suggestions"
- "Inflation hedge"

**Contracts & Leases:**
- "Expiring leases" / "renewals"
- "WALE" / "weighted lease expiry"
- "Rent vs sales" / "rent roll" / "portfolio"

**Tenant Analytics:**
- "Best tenant" / "worst tenant" / "tenant ranking"
- "Tenant mix" / "revenue per sqm"
- "Who to replace" / "opportunity cost"

**Footfall:**
- "Footfall today" / "how busy"
- "Busiest zone" / "peak hour" / "quiet areas"

**Energy:**
- "Energy overview" / "energy by zone" / "energy savings"

**CCTV & Operations:**
- "Queue status" / "parking" / "security alerts"
- "Store conversion" / "demographics" / "dead zones"

**Anomalies:**
- "Anomalies" / "something wrong" / "critical issues"

**Marketing & Social:**
- "Events" / "campaigns" / "social media"
- "Next season" / "Ramadan" / "Eid"

**AI Learning:**
- "What has the AI learned" / "patterns"

**Tenant Lookup:**
- "Tell me about Spinneys" / "How is KFC doing"
- Just type any tenant name

Ask me anything about Senzo Mall!`,
    type: "text",
  };
}

async function handleBriefing(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const briefing = await generateDailyBriefing(supabase, PROPERTY_ID);

  const sections = Object.values(briefing.sections)
    .map(
      (s: any) =>
        `**${s.title}:**\n${s.items.map((item: any) => `  - ${typeof item === "string" ? item : item.text}`).join("\n")}`
    )
    .join("\n\n");

  const actionsText =
    briefing.top_actions && briefing.top_actions.length > 0
      ? `\n\n**Top Actions:** ${briefing.top_actions.map((a: any) => a.text).join("; ")}`
      : "";

  return {
    message: `${briefing.greeting}! Here's your property briefing for today.\n\n${sections}${actionsText}`,
    data: briefing,
    type: "briefing",
  };
}

async function handleHealthScore(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const health = await calculatePropertyHealthScore(supabase, PROPERTY_ID);

  const dimensions = Object.entries(health)
    .filter(([k]) => k !== "total")
    .map(([, v]: [string, any]) =>
      v && v.score !== undefined
        ? `- ${v.label || ""}: **${v.score}/${v.max}** — ${v.detail}`
        : null
    )
    .filter(Boolean)
    .join("\n");

  return {
    message: `**Property Health Score: ${health.total}/100**\n\n${dimensions}`,
    data: health,
    type: "metric",
  };
}

async function handleSnapshot(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const snap = await getPropertySnapshot(supabase, PROPERTY_ID);

  return {
    message: `**Senzo Mall Snapshot:**\n
- Occupancy: **${snap.occupancy_rate}%**
- Revenue this month: **${fmtEGP(snap.revenue_this_month)}** (${pct(snap.revenue_trend)} vs last month)
- Total monthly rent: **${fmtEGP(snap.total_monthly_rent_egp)}**
- Footfall today: **${snap.footfall_today.toLocaleString()}** visitors (${pct(snap.footfall_trend)})
- Energy cost today: **${fmtEGP(snap.energy_cost_today)}** (${pct(snap.energy_trend)})
- Open maintenance: **${snap.open_maintenance}** (${snap.urgent_maintenance} urgent)
- Discrepancies: **${snap.discrepancies_count}** flagged (${fmtEGP(snap.discrepancies_variance)} variance)
- Expiring leases (90d): **${snap.expiring_leases_90d}**
- WALE: **${snap.wale_years} years**
- Monthly opportunity cost: **${fmtEGP(snap.opportunity_cost_monthly)}**
- Active events: **${snap.active_events}** | Campaigns: **${snap.active_campaigns}**
- Social followers: **${snap.social_followers.toLocaleString()}** (${pct(snap.social_growth)})
- Health score: **${snap.health_score}/100**
- Top tenant by rent: **${snap.top_tenant_by_rent}**`,
    data: snap,
    type: "metric",
  };
}

async function handleDiscrepancies(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { month, year } = currentMonth();
  const summary = await getDiscrepancySummary(supabase, PROPERTY_ID, month, year);

  if (summary.total_discrepancies === 0) {
    return {
      message:
        "No underreporting discrepancies flagged this month. All tenants appear to be reporting within expected ranges.",
      type: "text",
    };
  }

  const topList = summary.top_discrepancies
    .slice(0, 5)
    .map(
      (d, i) =>
        `${i + 1}. **${d.brand_name}** (${d.unit_number}) — reported ${fmtEGP(d.reported_revenue_egp)} vs estimated ${fmtEGP(d.estimated_revenue_egp)} (${d.variance_pct.toFixed(1)}% variance, ${(d.confidence * 100).toFixed(0)}% confidence)`
    )
    .join("\n");

  return {
    message: `**${summary.total_discrepancies} tenants flagged for potential underreporting this month.**\n\nPotential recovery: **${fmtEGP(summary.total_potential_recovery_egp)}**\nHigh confidence flags: ${summary.by_confidence.high}\n\nTop flagged tenants:\n${topList}`,
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
      return `- **${r.lease?.tenant?.brand_name || "Unknown"}** (${r.lease?.unit?.unit_number || "N/A"}) — ${fmtEGP(outstanding)} overdue (${r.period_month}/${r.period_year})`;
    })
    .join("\n");

  return {
    message: `**${overdue.length} overdue rent payments totalling ${fmtEGP(totalOverdue)}.**\n\n${list}${overdue.length > 8 ? `\n\n...and ${overdue.length - 8} more` : ""}`,
    data: overdue,
    type: "list",
  };
}

async function handleProfitLoss(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { month, year } = currentMonth();
  const pnl = await getProfitAndLoss(supabase, PROPERTY_ID, month, year);

  const expenseLines = pnl.expenses
    .slice(0, 6)
    .map((e) => `  - ${e.category}: ${fmtEGP(e.amount_egp)}`)
    .join("\n");

  return {
    message: `**Profit & Loss — ${pnl.period}:**\n
**Income:**
- Rent collected: ${fmtEGP(pnl.income.rent_collected)}
- Total income: **${fmtEGP(pnl.income.total_income)}**

**Expenses:**
${expenseLines}
- Total expenses: **${fmtEGP(pnl.total_expenses)}**

**Net Income: ${fmtEGP(pnl.net_income)}**`,
    data: pnl,
    type: "metric",
  };
}

async function handleCashFlow(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getCashFlow(supabase, PROPERTY_ID, 6);

  const list = data
    .map(
      (m) =>
        `- **${m.label}:** Income ${fmtEGP(m.income_egp)} | Expenses ${fmtEGP(m.expenses_egp)} | Net **${fmtEGP(m.net_egp)}**`
    )
    .join("\n");

  const totalNet = data.reduce((s, m) => s + m.net_egp, 0);

  return {
    message: `**Cash Flow — Last 6 Months:**\n\n${list}\n\n6-month net: **${fmtEGP(totalNet)}**`,
    data,
    type: "table",
  };
}

async function handleBudget(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getBudgetComparison(supabase, PROPERTY_ID);

  if (data.length === 0) {
    return { message: "No budget data available for this year.", type: "text" };
  }

  const list = data
    .map(
      (b) =>
        `- **${b.category}:** Budgeted ${fmtEGP(b.budgeted_egp)} | Actual ${fmtEGP(b.actual_egp)} | ${b.status === "over" ? "OVER" : b.status === "under" ? "Under" : "On track"} (${b.variance_pct > 0 ? "+" : ""}${b.variance_pct}%)`
    )
    .join("\n");

  const overBudget = data.filter((b) => b.status === "over");

  return {
    message: `**Budget vs Actual:**\n\n${list}${overBudget.length > 0 ? `\n\n**${overBudget.length} categories over budget.**` : "\n\nAll categories within budget."}`,
    data,
    type: "table",
  };
}

async function handleRevenueSummary(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const { month, year } = currentMonth();
  const fin = await getFinanceOverview(supabase, PROPERTY_ID, month, year);

  return {
    message: `**Revenue Summary — ${MONTH_NAMES[month]} ${year}:**\n
- Total income: **${fmtEGP(fin.total_income_egp)}** (${pct(fin.income_vs_last_month_pct)} vs last month)
- Total expenses: ${fmtEGP(fin.total_expenses_egp)} (${pct(fin.expenses_vs_last_month_pct)})
- Net profit: **${fmtEGP(fin.net_profit_egp)}** (${fin.profit_margin_pct}% margin)
- Overdue rent: ${fmtEGP(fin.overdue_rent_egp)}
- Percentage rent premium: ${fmtEGP(fin.percentage_rent_premium_egp)}
- Inflation hedge ratio: ${fin.inflation_hedge_ratio}%`,
    data: fin,
    type: "metric",
  };
}

async function handlePercentageRent(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await calculatePercentageRent(supabase, PROPERTY_ID);

  return {
    message: `**Percentage Rent Analysis:**\n
- Base rent total: ${fmtEGP(overview.total_base_rent_egp)}
- Percentage rent (reported): ${fmtEGP(overview.total_percentage_rent_reported_egp)}
- Percentage rent (estimated): ${fmtEGP(overview.total_percentage_rent_estimated_egp)}
- Total collected: **${fmtEGP(overview.total_actual_collected_egp)}**
- Total potential: ${fmtEGP(overview.total_potential_egp)}
- **Gap: ${fmtEGP(overview.total_gap_egp)}**
- Premium above base: ${overview.percentage_premium_pct}%
- Paying min rent only: ${overview.tenants_paying_minimum_only.count} tenants
- Paying percentage rent: ${overview.tenants_paying_percentage.count} tenants
- Tenants with gap: ${overview.tenants_with_gap.length}`,
    data: overview,
    type: "metric",
  };
}

async function handleInflationHedge(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const hedge = await getInflationHedgeAnalysis(supabase, PROPERTY_ID);

  return {
    message: `**Inflation Hedge Analysis:**\n
- Hedge ratio: **${hedge.hedge_ratio}%** (target: ${hedge.target_hedge_ratio}%)
- Percentage rent share: ${hedge.percentage_rent_share_pct}%
- Fixed rent share: ${hedge.fixed_rent_share_pct}%
- If EGP devalues 10%: +${fmtEGP(hedge.devaluation_10pct_increase_egp)} (+${hedge.devaluation_10pct_increase_pct}%)
- Tenants with 0% rate: ${hedge.tenants_with_zero_rate.length}

**AI Recommendation:** ${hedge.ai_recommendation}`,
    data: hedge,
    type: "metric",
  };
}

async function handleMinRentOnly(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await calculatePercentageRent(supabase, PROPERTY_ID);
  const minOnly = overview.tenants_paying_minimum_only.list;

  if (minOnly.length === 0) {
    return {
      message: "All tenants are generating enough sales to trigger percentage rent. No tenants are paying minimum only.",
      type: "text",
    };
  }

  const list = minOnly
    .slice(0, 10)
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** (${t.unit_number}) — Min rent: ${fmtEGP(t.min_rent)}, Rate: ${t.percentage_rate}%, Reported sales: ${t.reported_sales !== null ? fmtEGP(t.reported_sales) : "N/A"}`
    )
    .join("\n");

  return {
    message: `**${minOnly.length} tenants paying minimum rent only** (sales too low to trigger percentage rent):\n\n${list}${minOnly.length > 10 ? `\n\n...and ${minOnly.length - 10} more` : ""}\n\n**Action:** Review minimum rent levels vs market rates at renewal.`,
    data: minOnly,
    type: "list",
  };
}

async function handleRateOptimization(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const result = await getPercentageRateOptimization(supabase, PROPERTY_ID);

  if (result.tenants.length === 0) {
    return {
      message: "All tenants are at or above their category average percentage rate. No optimization opportunities found.",
      type: "text",
    };
  }

  const list = result.tenants
    .slice(0, 8)
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** — Current: ${t.current_rate}%, Category avg: ${t.category_avg_rate}%, Uplift: **${fmtEGP(t.opportunity_egp)}/month**`
    )
    .join("\n");

  return {
    message: `**Percentage Rate Optimization:**\n\nTotal portfolio uplift potential: **${fmtEGP(result.total_portfolio_uplift_egp)}/month**\n\nTop opportunities:\n${list}`,
    data: result,
    type: "list",
  };
}

async function handleExpiringLeases(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const leases = await getExpiringLeases(supabase, PROPERTY_ID, 180);

  if (leases.length === 0) {
    return {
      message: "No leases expiring within the next 180 days.",
      type: "text",
    };
  }

  const list = leases
    .slice(0, 10)
    .map(
      (l, i) =>
        `${i + 1}. **${l.brand_name}** (${l.unit_number}) — Expires ${l.expiry_date} (${l.days_until_expiry} days)\n   Rent: ${fmtEGP(l.current_rent)} | Compliance: ${l.payment_compliance}%\n   AI: *${l.ai_recommendation}*`
    )
    .join("\n");

  return {
    message: `**${leases.length} leases expiring within 180 days:**\n\n${list}`,
    data: leases,
    type: "list",
  };
}

async function handleWALE(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const portfolio = await getPortfolioAnalytics(supabase, PROPERTY_ID);

  return {
    message: `**WALE (Weighted Average Lease Expiry): ${portfolio.wale_years} years**\n
- Total contracted rent: ${fmtEGP(portfolio.total_contracted_rent)}/month
- Average rent per sqm: ${fmtEGP(portfolio.avg_rent_per_sqm)}/sqm
- Monthly vacancy cost: ${fmtEGP(portfolio.vacancy_cost_monthly)}
- Top 3 tenants by rent share:\n${portfolio.tenant_concentration.slice(0, 3).map((t) => `  - **${t.brand_name}**: ${fmtEGP(t.monthly_rent)}/month (${t.percentage_of_total}%)`).join("\n")}`,
    data: portfolio,
    type: "metric",
  };
}

async function handleRentVsSales(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getRentVsSalesAnalysis(supabase, PROPERTY_ID);

  const withGap = data.filter((t) => t.gap_egp > 0);
  const flagged = data.filter((t) => t.underreporting_flag);

  const list = withGap
    .slice(0, 8)
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** — Min: ${fmtEGP(t.min_rent)} | % rent: ${fmtEGP(t.percentage_rent)} | Gap: **${fmtEGP(t.gap_egp)}**${t.underreporting_flag ? " [UNDERREPORTING FLAG]" : ""}`
    )
    .join("\n");

  return {
    message: `**Rent vs Sales Analysis:**\n\n${withGap.length} tenants with a gap between min rent and percentage rent.\n${flagged.length} flagged for potential underreporting.\n\nTop gaps:\n${list}`,
    data,
    type: "table",
  };
}

async function handlePortfolio(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getPortfolioAnalytics(supabase, PROPERTY_ID);

  const rentRollNext6 = data.rent_roll
    .slice(0, 6)
    .map((m) => `- ${m.month} ${m.year}: ${fmtEGP(m.contracted_rent)} (${m.active_leases} leases${m.expiring_rent > 0 ? `, ${fmtEGP(m.expiring_rent)} expiring` : ""})`)
    .join("\n");

  const catDiv = data.category_diversification
    .slice(0, 5)
    .map((c) => `- ${c.category}: ${c.lease_count} leases, ${fmtEGP(c.monthly_rent)}/month (${c.percentage_of_total}%)`)
    .join("\n");

  return {
    message: `**Portfolio Analytics:**\n
**WALE:** ${data.wale_years} years
**Total contracted rent:** ${fmtEGP(data.total_contracted_rent)}/month
**Vacancy cost:** ${fmtEGP(data.vacancy_cost_monthly)}/month

**Rent Roll (next 6 months):**
${rentRollNext6}

**Category Diversification:**
${catDiv}`,
    data,
    type: "table",
  };
}

async function handleTopTenant(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const cards = await getTenantRankings(supabase, PROPERTY_ID);

  if (cards.length === 0) {
    return { message: "No tenant performance data available.", type: "text" };
  }

  const topFive = cards.slice(0, 5);
  const list = topFive
    .map(
      (c, i) =>
        `${i + 1}. **${c.brand_name}** — Score: ${c.overall_score}, Revenue/sqm: EGP ${c.reported_sales_per_sqm}, Rent/sqm: EGP ${c.rent_per_sqm}, Profit/sqm: EGP ${c.profit_per_sqm}`
    )
    .join("\n");

  return {
    message: `**Top 5 Tenants:**\n\n${list}`,
    data: topFive,
    type: "table",
  };
}

async function handleWorstTenant(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const cards = await getTenantRankings(supabase, PROPERTY_ID);

  if (cards.length === 0) {
    return { message: "No tenant performance data available.", type: "text" };
  }

  const bottomFive = cards.slice(-5).reverse();
  const list = bottomFive
    .map(
      (c, i) =>
        `${i + 1}. **${c.brand_name}** — Score: ${c.overall_score}, Revenue/sqm: EGP ${c.reported_sales_per_sqm}, Rent/sqm: EGP ${c.rent_per_sqm}, Opportunity cost/sqm: EGP ${c.opportunity_cost_per_sqm}`
    )
    .join("\n");

  return {
    message: `**Bottom 5 Tenants (underperformers):**\n\n${list}\n\n**Action:** Review these tenants for lease renegotiation or replacement at expiry.`,
    data: bottomFive,
    type: "table",
  };
}

async function handleTenantRanking(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const cards = await getTenantRankings(supabase, PROPERTY_ID);

  if (cards.length === 0) {
    return { message: "No tenant performance data available yet.", type: "text" };
  }

  const topFive = cards.slice(0, 5);
  const bottomFive = cards.slice(-5).reverse();

  const topList = topFive
    .map(
      (c, i) =>
        `${i + 1}. **${c.brand_name}** — Score: ${c.overall_score}, Revenue/sqm: EGP ${c.reported_sales_per_sqm}, Rent/sqm: EGP ${c.rent_per_sqm}`
    )
    .join("\n");

  const bottomList = bottomFive
    .map(
      (c, i) =>
        `${i + 1}. **${c.brand_name}** — Score: ${c.overall_score}, Revenue/sqm: EGP ${c.reported_sales_per_sqm}, Rent/sqm: EGP ${c.rent_per_sqm}`
    )
    .join("\n");

  return {
    message: `**Tenant Performance Rankings:**\n\nTop 5:\n${topList}\n\nBottom 5:\n${bottomList}\n\nTotal tenants ranked: ${cards.length}`,
    data: cards,
    type: "table",
  };
}

async function handleTenantMix(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const mix = await getTenantMixAnalysis(supabase, PROPERTY_ID);

  const list = mix.categories
    .map(
      (c) =>
        `- **${c.category}:** ${c.tenant_count} tenants, ${c.area_sqm.toLocaleString()} sqm (${c.area_pct}%), Revenue: ${fmtEGP(c.revenue_egp)} (${c.revenue_pct}%), EGP ${c.revenue_per_sqm}/sqm — *${c.mismatch_direction.replace("_", " ")}*`
    )
    .join("\n");

  return {
    message: `**Tenant Mix Analysis:**\n\n${list}\n\n**AI Recommendation:** ${mix.ai_recommendation}`,
    data: mix,
    type: "table",
  };
}

async function handleReplacement(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const result = await getReplacementAnalysis(supabase, PROPERTY_ID);

  if (result.bottom_tenants.length === 0) {
    return { message: "No replacement candidates identified.", type: "text" };
  }

  const list = result.bottom_tenants
    .slice(0, 5)
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** (${t.unit_number}, ${t.zone_name}) — Score: ${t.overall_score}\n   Current rent: ${fmtEGP(t.current_monthly_rent)} | If avg performer: ${fmtEGP(t.if_avg_performer_rent)} (+${fmtEGP(t.revenue_increase_avg)})\n   Break-even: ${t.break_even_months_avg} months | Vacancy cost: ${fmtEGP(t.vacancy_cost_per_month)}/month`
    )
    .join("\n");

  return {
    message: `**Replacement Analysis:**\n\nTotal potential monthly gain: **${fmtEGP(result.total_potential_monthly_gain)}**\nTotal vacancy risk: ${fmtEGP(result.total_vacancy_risk)}\n\nTop replacement candidates:\n${list}`,
    data: result,
    type: "list",
  };
}

async function handleOpportunityCost(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getSqmValueAnalysis(supabase, PROPERTY_ID);

  const totalOC = data.reduce((s, t) => s + t.opportunity_cost_total, 0);
  const topOC = data
    .sort((a, b) => b.opportunity_cost_total - a.opportunity_cost_total)
    .slice(0, 5);

  const list = topOC
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** — ${fmtEGP(t.opportunity_cost_total)}/month (${t.opportunity_cost_per_sqm} EGP/sqm x ${t.area_sqm} sqm)`
    )
    .join("\n");

  return {
    message: `**Total Monthly Opportunity Cost: ${fmtEGP(totalOC)}**\n\nThis is what the mall loses by having underperformers instead of zone-best performers.\n\nBiggest opportunity gaps:\n${list}`,
    data: topOC,
    type: "list",
  };
}

async function handleSqmValue(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getSqmValueAnalysis(supabase, PROPERTY_ID);

  const top5 = [...data].sort((a, b) => b.profit_per_sqm - a.profit_per_sqm).slice(0, 5);
  const bottom5 = data.slice(0, 5);

  const topList = top5
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** — Profit/sqm: EGP ${t.profit_per_sqm}, Sales/sqm: EGP ${t.sales_per_sqm_monthly}`
    )
    .join("\n");

  const bottomList = bottom5
    .map(
      (t, i) =>
        `${i + 1}. **${t.brand_name}** — Profit/sqm: EGP ${t.profit_per_sqm}, Sales/sqm: EGP ${t.sales_per_sqm_monthly}, OC: EGP ${t.opportunity_cost_per_sqm}/sqm`
    )
    .join("\n");

  return {
    message: `**SQM Value Analysis:**\n\nBest value per sqm:\n${topList}\n\nWorst value per sqm:\n${bottomList}`,
    data,
    type: "table",
  };
}

async function handleFootfall(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await getFootfallOverview(supabase, PROPERTY_ID);

  return {
    message: `**Today's Footfall: ${overview.total_visitors_today.toLocaleString()} visitors**\n
- Yesterday: ${overview.total_visitors_yesterday.toLocaleString()}
- This week: ${overview.total_visitors_this_week.toLocaleString()}
- This month: ${overview.total_visitors_this_month.toLocaleString()}
- 30-day average: ${overview.avg_daily_visitors.toLocaleString()}/day
- Change vs yesterday: ${pct(overview.change_vs_yesterday_pct)}
- Change vs last week: ${pct(overview.change_vs_last_week_pct)}${overview.peak_hour > 0 ? `\n- Peak hour: ${overview.peak_hour}:00 (${overview.peak_count.toLocaleString()} visitors)` : ""}`,
    data: overview,
    type: "metric",
  };
}

async function handleBusiestZone(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const zones = await getFootfallByZone(supabase, PROPERTY_ID);

  if (zones.length === 0) {
    return { message: "No zone-level footfall data available for today.", type: "text" };
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

async function handlePeakHour(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const patterns = await getPeakPatterns(supabase, PROPERTY_ID);

  return {
    message: `**Peak Patterns (Last 30 Days):**\n
- Busiest day: **${patterns.busiest_day}** (avg ${patterns.busiest_day_avg.toLocaleString()} visitors)
- Quietest day: **${patterns.quietest_day}** (avg ${patterns.quietest_day_avg.toLocaleString()} visitors)
- Weekend average: ${patterns.weekend_avg.toLocaleString()}/day
- Weekday average: ${patterns.weekday_avg.toLocaleString()}/day
- Weekend/weekday ratio: ${patterns.weekend_vs_weekday_ratio}x
- Peak hour: **${patterns.peak_hour}:00** (avg ${patterns.peak_hour_avg.toLocaleString()} visitors)`,
    data: patterns,
    type: "metric",
  };
}

async function handleQuietZone(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const zones = await getFootfallByZone(supabase, PROPERTY_ID);

  if (zones.length === 0) {
    return { message: "No zone-level footfall data available.", type: "text" };
  }

  const quiet = zones.slice(-3).reverse();
  const list = quiet
    .map(
      (z) =>
        `- **${z.zone_name}** — ${z.total_in.toLocaleString()} visitors (${z.share_of_total_pct}% of total)`
    )
    .join("\n");

  return {
    message: `**Quietest Zones Today:**\n\n${list}\n\n**Action:** Consider targeted promotions or events in these zones to drive footfall.`,
    data: quiet,
    type: "list",
  };
}

async function handleEnergy(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await getEnergyOverview(supabase, PROPERTY_ID);

  return {
    message: `**Energy Overview:**\n
- Today: **${overview.total_consumption_kwh_today.toLocaleString()} kWh** (${fmtEGP(overview.total_cost_egp_today)})
- This month: ${overview.total_this_month_kwh.toLocaleString()} kWh (${fmtEGP(overview.cost_this_month_egp)})
- 30-day avg: ${overview.avg_daily_kwh.toLocaleString()} kWh/day (${fmtEGP(overview.avg_daily_cost_egp)}/day)
- Change vs yesterday: ${pct(overview.change_vs_yesterday_pct)}
- Peak: ${overview.peak_hour}:00 (${overview.peak_consumption_kwh.toLocaleString()} kWh)`,
    data: overview,
    type: "metric",
  };
}

async function handleEnergySaving(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const recs = await getEnergyRecommendations(supabase, PROPERTY_ID);

  if (recs.length === 0) {
    return { message: "No energy saving recommendations at this time.", type: "text" };
  }

  const totalSavings = recs.reduce((s, r) => s + r.estimated_savings_egp, 0);

  const list = recs
    .map(
      (r) =>
        `- [${r.severity.toUpperCase()}] **${r.title}**\n  ${r.description}\n  Estimated savings: **${fmtEGP(r.estimated_savings_egp)}/month**`
    )
    .join("\n\n");

  return {
    message: `**Energy Recommendations:**\n\nTotal potential savings: **${fmtEGP(totalSavings)}/month**\n\n${list}`,
    data: recs,
    type: "list",
  };
}

async function handleEnergyByZone(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const zones = await getEnergyByZone(supabase, PROPERTY_ID);

  if (zones.length === 0) {
    return { message: "No energy data available by zone.", type: "text" };
  }

  const list = zones
    .map(
      (z) =>
        `- **${z.zone_name}** (${z.zone_type}): ${z.consumption_kwh.toLocaleString()} kWh (${fmtEGP(z.cost_egp)}), ${z.share_pct}% of total, ${z.kwh_per_sqm} kWh/sqm`
    )
    .join("\n");

  return {
    message: `**Energy by Zone (Today):**\n\n${list}`,
    data: zones,
    type: "table",
  };
}

async function handleQueues(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const status = await getQueueStatus(supabase, PROPERTY_ID);

  if (status.active_queues.length === 0) {
    return { message: "No active queues detected right now.", type: "text" };
  }

  const list = status.active_queues
    .slice(0, 8)
    .map(
      (q) =>
        `- **${q.tenant_name}**: ${q.queue_length} people, ~${q.estimated_wait_minutes} min wait${q.alert_triggered ? " [ALERT]" : ""}`
    )
    .join("\n");

  return {
    message: `**Queue Status:**\n\n- Total queued: ${status.total_queued}\n- Alerts: ${status.alerts_count}\n- Avg wait: ${status.avg_wait_minutes} min\n\n${list}`,
    data: status,
    type: "list",
  };
}

async function handleParking(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getParkingStatus(supabase, PROPERTY_ID);

  return {
    message: `**Parking Status:**\n
- Occupied: **${data.current_occupied}/${data.total_spaces}** (${data.occupancy_pct}%)
- Cars entered (last hour): ${data.cars_entered_hour}
- Cars exited (last hour): ${data.cars_exited_hour}
- Avg duration: ${data.avg_duration_minutes} min
- Peak: ${data.peak_hour}:00 (${data.peak_occupancy} cars)`,
    data,
    type: "metric",
  };
}

async function handleSecurityAlerts(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getSecurityAlerts(supabase, PROPERTY_ID);

  if (data.total_active === 0) {
    return {
      message: `No active security alerts. This week: ${data.total_this_week} alerts total, avg response: ${data.avg_response_minutes} min, false alarm rate: ${data.false_alarm_rate}%.`,
      type: "text",
    };
  }

  const list = data.active_alerts
    .slice(0, 8)
    .map(
      (a) =>
        `- [${a.severity.toUpperCase()}] **${a.alert_type}** in ${a.zone_name} — ${a.description} (${a.status})`
    )
    .join("\n");

  return {
    message: `**${data.total_active} Active Security Alerts:**\n\n${list}\n\nThis week: ${data.total_this_week} | Avg response: ${data.avg_response_minutes} min | False alarm rate: ${data.false_alarm_rate}%`,
    data,
    type: "list",
  };
}

async function handleStoreConversion(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getStoreConversion(supabase, PROPERTY_ID);

  if (data.stores.length === 0) {
    return { message: "No store conversion data available for today.", type: "text" };
  }

  const topList = data.top_converters
    .slice(0, 5)
    .map(
      (s, i) =>
        `${i + 1}. **${s.tenant_name}** — ${s.conversion_rate}% conversion (${s.entered}/${s.passersby} entered, avg ${Math.round(s.avg_time_in_store_seconds / 60)} min in store)`
    )
    .join("\n");

  return {
    message: `**Store Conversion (Today):**\n\nAvg conversion rate: **${data.avg_conversion_rate}%**\n\nTop converters:\n${topList}`,
    data,
    type: "table",
  };
}

async function handleDemographics(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const data = await getDemographics(supabase, PROPERTY_ID);

  if (data.group_breakdown.length === 0) {
    return { message: "No demographic data available for today.", type: "text" };
  }

  const groups = data.group_breakdown
    .map((g) => `- **${g.type}**: ${g.count.toLocaleString()} (${g.pct}%)`)
    .join("\n");

  const ages = data.age_breakdown
    .map((a) => `- ${a.range}: ${a.count.toLocaleString()} (${a.pct}%)`)
    .join("\n");

  return {
    message: `**Visitor Demographics (Today):**\n\n**Group Types:**\n${groups}\n\n**Age Ranges:**\n${ages}`,
    data,
    type: "table",
  };
}

async function handleDeadZones(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const zones = await getDeadZones(supabase, PROPERTY_ID);

  const dead = zones.filter((z) => z.relative_traffic < 40);

  if (dead.length === 0) {
    return { message: "No dead zones detected. All areas have adequate traffic.", type: "text" };
  }

  const list = dead
    .map(
      (z) =>
        `- **${z.zone_name}** (${z.zone_type}) — ${z.footfall.toLocaleString()} visitors, ${z.relative_traffic}% of busiest zone\n  ${z.recommendation}`
    )
    .join("\n");

  return {
    message: `**${dead.length} Low Traffic Areas:**\n\n${list}`,
    data: dead,
    type: "list",
  };
}

async function handleAnomalies(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const anomalies = await getActiveAnomalies(supabase, PROPERTY_ID);
  const stats = await getAnomalyStats(supabase, PROPERTY_ID);

  if (anomalies.length === 0) {
    return { message: "No active anomalies detected. All systems are operating within normal parameters.", type: "text" };
  }

  const list = anomalies
    .slice(0, 8)
    .map(
      (a: any) =>
        `- [${(a.severity || "info").toUpperCase()}] **${a.title}**\n  ${a.description}${a.impact_egp ? `\n  Impact: ${fmtEGP(a.impact_egp)}` : ""}`
    )
    .join("\n\n");

  return {
    message: `**${stats.active_count} Active Anomalies:**\n\nBy severity: Critical ${stats.by_severity.critical || 0} | High ${stats.by_severity.high || 0} | Medium ${stats.by_severity.medium || 0} | Low ${stats.by_severity.low || 0}\nTotal impact: ${fmtEGP(stats.total_impact_egp)}\n\n${list}`,
    data: { anomalies, stats },
    type: "list",
  };
}

async function handleCriticalIssues(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const anomalies = await getActiveAnomalies(supabase, PROPERTY_ID, "critical");

  if (anomalies.length === 0) {
    return { message: "No critical issues at this time. Everything is under control.", type: "text" };
  }

  const list = anomalies
    .map(
      (a: any) =>
        `- [CRITICAL] **${a.title}**\n  ${a.description}${a.impact_egp ? `\n  Impact: ${fmtEGP(a.impact_egp)}` : ""}`
    )
    .join("\n\n");

  return {
    message: `**${anomalies.length} Critical Issues Requiring Attention:**\n\n${list}`,
    data: anomalies,
    type: "list",
  };
}

async function handleEvents(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await getMarketingOverview(supabase, PROPERTY_ID);
  const alerts = await getUpcomingSeasonalAlerts(supabase, PROPERTY_ID);

  const activeList = overview.active_events.list
    .map((e) => `- **${e.title}** (${e.event_type}) — ${e.start_date} to ${e.end_date}`)
    .join("\n");

  const upcomingList = overview.upcoming_events.list
    .map((e) => `- **${e.title}** — starts ${e.start_date}`)
    .join("\n");

  const alertList = alerts
    .slice(0, 3)
    .map((a) => `- [${a.urgency.toUpperCase()}] **${a.name}** — ${a.message}`)
    .join("\n");

  return {
    message: `**Events & Marketing:**\n
Active events: ${overview.active_events.count}${activeList ? `\n${activeList}` : ""}
Upcoming (30 days): ${overview.upcoming_events.count}${upcomingList ? `\n${upcomingList}` : ""}
Active campaigns: ${overview.active_campaigns.count}
Active promotions: ${overview.active_promotions}
Marketing spend this month: ${fmtEGP(overview.total_marketing_spend_this_month)}
${overview.next_major_season ? `Next major season: **${overview.next_major_season.name}** (${overview.days_until_next_season} days)` : ""}
${alertList ? `\n**Seasonal Alerts:**\n${alertList}` : ""}`,
    data: overview,
    type: "list",
  };
}

async function handleCampaigns(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await getMarketingOverview(supabase, PROPERTY_ID);

  if (overview.active_campaigns.count === 0) {
    return { message: "No active marketing campaigns at the moment.", type: "text" };
  }

  const list = overview.active_campaigns.list
    .map(
      (c) =>
        `- **${c.name}** (${c.campaign_type}) — Budget: ${c.budget_egp ? fmtEGP(c.budget_egp) : "N/A"} | Spent: ${fmtEGP(c.spend_egp)}${c.roi_pct !== null ? ` | ROI: ${c.roi_pct}%` : ""}`
    )
    .join("\n");

  return {
    message: `**${overview.active_campaigns.count} Active Campaigns:**\n\n${list}\n\nTotal marketing spend this month: ${fmtEGP(overview.total_marketing_spend_this_month)}`,
    data: overview.active_campaigns,
    type: "list",
  };
}

async function handleSocialMedia(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const overview = await getSocialOverview(supabase, PROPERTY_ID);

  const platformList = overview.platforms
    .map(
      (p) =>
        `- **${p.account.platform}**: ${p.account.followers.toLocaleString()} followers (${p.follower_growth_30d > 0 ? "+" : ""}${p.follower_growth_30d} this month), ${p.posts_this_month} posts, avg reach: ${p.avg_reach_per_post.toLocaleString()}`
    )
    .join("\n");

  return {
    message: `**Social Media Overview:**\n
- Total followers: **${overview.total_followers.toLocaleString()}**
- Reach this month: ${overview.total_reach_this_month.toLocaleString()}
- Engagement this month: ${overview.total_engagement_this_month.toLocaleString()}
- Best platform: ${overview.best_platform}
- Best content type: ${overview.best_content_type}
- Best posting time: ${overview.best_posting_time}

**Platforms:**
${platformList}`,
    data: overview,
    type: "metric",
  };
}

async function handleSeasonal(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const calendar = await getSeasonalCalendar(supabase, PROPERTY_ID);

  const upcoming = calendar
    .filter((s) => s.days_away !== null && s.days_away >= 0)
    .sort((a, b) => (a.days_away ?? 999) - (b.days_away ?? 999))
    .slice(0, 8);

  if (upcoming.length === 0) {
    return { message: "No upcoming seasonal events found in the calendar.", type: "text" };
  }

  const list = upcoming
    .map(
      (s) =>
        `- **${s.name}** (${s.type}) — ${s.days_away} days away | Impact: ${s.footfall_impact}\n  Status: ${s.planning_status}\n  AI: *${s.ai_recommendation}*`
    )
    .join("\n\n");

  return {
    message: `**Seasonal Calendar:**\n\n${list}`,
    data: upcoming,
    type: "list",
  };
}

async function handleLearning(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const stats = await getLearningStats(supabase, PROPERTY_ID);
  const patterns = await getLearnedPatterns(supabase, PROPERTY_ID);

  const patternList = patterns
    .slice(0, 5)
    .map(
      (p: any) =>
        `- [${p.status.toUpperCase()}] **${p.title}** (${p.confidence}% confidence, ${p.data_points} data points)\n  ${p.description}`
    )
    .join("\n\n");

  const improvementList = stats.top_improvements
    .slice(0, 3)
    .map(
      (imp) =>
        `- **${imp.entity_name}** (${imp.param_key}): ${imp.initial_value.toFixed(4)} -> ${imp.learned_value.toFixed(4)} (${imp.confidence}% confidence)`
    )
    .join("\n");

  return {
    message: `**AI Learning Stats:**\n
- Days of learning: ${stats.days_of_learning}
- Parameters calibrated: ${stats.params_calibrated}
- Patterns discovered: ${stats.patterns_discovered}
- Average confidence: ${stats.avg_confidence}%
- Human feedback received: ${stats.total_feedback_received}

${improvementList ? `**Top Calibrations:**\n${improvementList}\n` : ""}
${patternList ? `**Discovered Patterns:**\n${patternList}` : "No patterns discovered yet."}`,
    data: { stats, patterns },
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
    return { message: "All units are currently occupied. No vacancies available.", type: "text" };
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
    return { message: "No open maintenance tickets. Everything is running smoothly.", type: "text" };
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

async function handleInsights(
  supabase: SupabaseClient
): Promise<ChatResponse> {
  const insights = await generateCrossDataInsights(supabase, PROPERTY_ID);

  if (insights.length === 0) {
    return { message: "No active insights or alerts at this time. Property is running smoothly.", type: "text" };
  }

  const list = insights
    .map((ins: any) => {
      const icon =
        ins.severity === "critical"
          ? "[CRITICAL]"
          : ins.severity === "warning"
            ? "[WARNING]"
            : ins.severity === "opportunity"
              ? "[OPPORTUNITY]"
              : "[INFO]";
      const impact = ins.impact_egp > 0 ? `\n  Impact: ${fmtEGP(ins.impact_egp)}` : "";
      return `${icon} **${ins.title}**\n  ${ins.message}${impact}\n  Sources: ${ins.source_modules.join(", ")}`;
    })
    .join("\n\n");

  return {
    message: `**${insights.length} Cross-Data Insights:**\n\n${list}`,
    data: insights,
    type: "list",
  };
}

async function handleTenantLookup(
  supabase: SupabaseClient,
  query: string
): Promise<ChatResponse> {
  // Search by brand_name ILIKE
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, brand_name, category, brand_type, status")
    .ilike("brand_name", `%${query}%`)
    .limit(5);

  if (!tenants || tenants.length === 0) {
    // Try name field too
    const { data: tenants2 } = await supabase
      .from("tenants")
      .select("id, name, brand_name, category, brand_type, status")
      .ilike("name", `%${query}%`)
      .limit(5);

    if (!tenants2 || tenants2.length === 0) {
      return {
        message: `No tenant found matching "${query}". Try the exact brand name or ask "tenant ranking" to see all tenants.`,
        type: "text",
      };
    }

    return await buildTenantResponse(supabase, tenants2[0]);
  }

  if (tenants.length === 1) {
    return await buildTenantResponse(supabase, tenants[0]);
  }

  // Multiple matches
  const list = tenants
    .map((t: any) => `- **${t.brand_name}** (${t.category}) — ${t.status}`)
    .join("\n");

  return {
    message: `Found ${tenants.length} tenants matching "${query}":\n\n${list}\n\nBe more specific to get a detailed scorecard.`,
    data: tenants,
    type: "list",
  };
}

async function buildTenantResponse(
  supabase: SupabaseClient,
  tenant: any
): Promise<ChatResponse> {
  try {
    const scorecard = await getTenantScorecard(supabase, tenant.id);

    if (!scorecard) {
      return {
        message: `**${tenant.brand_name}** (${tenant.category}) — ${tenant.status}\n\nNo active lease found for this tenant. They may have an expired or pending lease.`,
        type: "text",
      };
    }

    return {
      message: `**${scorecard.brand_name} — Tenant Scorecard:**\n
**Basic Info:**
- Category: ${scorecard.category} | Brand type: ${scorecard.brand_type}
- Unit: ${scorecard.unit_number} | Zone: ${scorecard.zone_name}
- Area: ${scorecard.area_sqm} sqm
- Lease: ${scorecard.start_date} to ${scorecard.end_date}

**Revenue:**
- Reported sales (avg): ${fmtEGP(scorecard.reported_sales_monthly_avg)}/month
- Estimated sales (avg): ${fmtEGP(scorecard.estimated_sales_monthly_avg)}/month
- Revenue/sqm: EGP ${scorecard.revenue_per_sqm_monthly}
- Revenue gap: ${fmtEGP(scorecard.revenue_gap_egp)} (${scorecard.revenue_gap_pct}%)

**Rent:**
- Min rent: ${fmtEGP(scorecard.min_rent)} | Rate: ${scorecard.percentage_rate}%
- Actually paying: ${scorecard.actual_rent_type === "percentage" ? "Percentage rent" : "Minimum rent"} (${fmtEGP(scorecard.monthly_rent_amount)})
- Rent/sqm: EGP ${scorecard.min_rent_per_sqm}
- Rent-to-sales: ${(scorecard.rent_to_sales_ratio * 100).toFixed(1)}%

**Footfall:**
- Avg daily visitors: ${scorecard.avg_daily_visitors}
- Conversion rate: ${scorecard.avg_conversion_rate}%
- Visitors/sqm: ${scorecard.visitors_per_sqm}
- Avg dwell: ${scorecard.dwell_time_avg}s

**Scores (0-100):**
- Overall: **${scorecard.overall_score}**
- Productivity: ${scorecard.productivity_score} | Rent efficiency: ${scorecard.rent_efficiency_score}
- Footfall attraction: ${scorecard.footfall_attraction_score} | Payment: ${scorecard.payment_reliability_score}

**AI Verdict:** *${scorecard.ai_verdict}*`,
      data: scorecard,
      type: "metric",
    };
  } catch {
    return {
      message: `**${tenant.brand_name}** (${tenant.category}) found, but could not generate full scorecard. The tenant may not have sufficient data yet.`,
      type: "text",
    };
  }
}

// ── Main Chat Handler ───────────────────────────────────────

export async function processChat(
  supabase: SupabaseClient,
  message: string
): Promise<ChatResponse> {
  const intent = detectIntent(message);

  try {
    switch (intent.action) {
      case "help":
        return await handleHelp();
      case "briefing":
        return await handleBriefing(supabase);
      case "health_score":
        return await handleHealthScore(supabase);
      case "snapshot":
        return await handleSnapshot(supabase);
      case "discrepancies":
        return await handleDiscrepancies(supabase);
      case "overdue_rent":
        return await handleOverdueRent(supabase);
      case "profit_loss":
        return await handleProfitLoss(supabase);
      case "cash_flow":
        return await handleCashFlow(supabase);
      case "budget":
        return await handleBudget(supabase);
      case "revenue_summary":
        return await handleRevenueSummary(supabase);
      case "percentage_rent":
        return await handlePercentageRent(supabase);
      case "inflation_hedge":
        return await handleInflationHedge(supabase);
      case "min_rent_only":
        return await handleMinRentOnly(supabase);
      case "rate_optimization":
        return await handleRateOptimization(supabase);
      case "expiring_leases":
        return await handleExpiringLeases(supabase);
      case "wale":
        return await handleWALE(supabase);
      case "rent_vs_sales":
        return await handleRentVsSales(supabase);
      case "portfolio":
        return await handlePortfolio(supabase);
      case "contract_alerts":
        return await handleInsights(supabase);
      case "top_tenant":
        return await handleTopTenant(supabase);
      case "worst_tenant":
        return await handleWorstTenant(supabase);
      case "tenant_ranking":
        return await handleTenantRanking(supabase);
      case "tenant_mix":
        return await handleTenantMix(supabase);
      case "replacement":
        return await handleReplacement(supabase);
      case "opportunity_cost":
        return await handleOpportunityCost(supabase);
      case "sqm_value":
        return await handleSqmValue(supabase);
      case "footfall":
        return await handleFootfall(supabase);
      case "busiest_zone":
        return await handleBusiestZone(supabase);
      case "peak_hour":
        return await handlePeakHour(supabase);
      case "quiet_zone":
        return await handleQuietZone(supabase);
      case "energy":
        return await handleEnergy(supabase);
      case "energy_saving":
        return await handleEnergySaving(supabase);
      case "energy_by_zone":
        return await handleEnergyByZone(supabase);
      case "queues":
        return await handleQueues(supabase);
      case "parking":
        return await handleParking(supabase);
      case "security_alerts":
        return await handleSecurityAlerts(supabase);
      case "store_conversion":
        return await handleStoreConversion(supabase);
      case "demographics":
        return await handleDemographics(supabase);
      case "dead_zones":
        return await handleDeadZones(supabase);
      case "anomalies":
        return await handleAnomalies(supabase);
      case "critical_issues":
        return await handleCriticalIssues(supabase);
      case "events":
        return await handleEvents(supabase);
      case "campaigns":
        return await handleCampaigns(supabase);
      case "social_media":
        return await handleSocialMedia(supabase);
      case "seasonal":
        return await handleSeasonal(supabase);
      case "learning":
        return await handleLearning(supabase);
      case "vacant_units":
        return await handleVacantUnits(supabase);
      case "occupancy_rate":
        return await handleOccupancyRate(supabase);
      case "maintenance":
        return await handleMaintenance(supabase);
      case "insights":
        return await handleInsights(supabase);
      case "tenant_lookup":
        return await handleTenantLookup(
          supabase,
          intent.tenantQuery || message
        );
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
