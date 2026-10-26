/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { createRoutingSupabase } from "./helpers/routing-supabase-mock";

// ── Mock every module ai-chat depends on ─────────────────────
const m = vi.hoisted(() => {
  const names = [
    // ai-engine
    "generateCrossDataInsights", "generateDailyBriefing", "calculatePropertyHealthScore", "getPropertySnapshot",
    // revenue / footfall / energy / finance
    "getDiscrepancySummary", "getFootfallOverview", "getFootfallByZone", "getHourlyFootfall", "getPeakPatterns",
    "getEnergyOverview", "getEnergyByZone", "getEnergyRecommendations",
    "getFinanceOverview", "getCashFlow", "getBudgetComparison", "getProfitAndLoss",
    // contracts / tenants / % rent
    "getContractOverview", "getExpiringLeases", "getRentVsSalesAnalysis", "getContractAlerts", "getPortfolioAnalytics",
    "getTenantRankings", "getSqmValueAnalysis", "getTenantMixAnalysis", "getPercentageRateAnalysis",
    "getReplacementAnalysis", "getTenantScorecard",
    "calculatePercentageRent", "getInflationHedgeAnalysis", "getPercentageRateOptimization",
    // marketing / social / cctv / anomaly / learning
    "getMarketingOverview", "getSeasonalCalendar", "getUpcomingSeasonalAlerts",
    "getSocialOverview", "getSocialInsights",
    "getQueueStatus", "getParkingStatus", "getSecurityAlerts", "getStoreConversion", "getDemographics", "getDeadZones",
    "getActiveAnomalies", "getAnomalyStats",
    "getLearningStats", "getLearnedPatterns",
  ];
  const fns: Record<string, any> = {};
  for (const n of names) fns[n] = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  const pick = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, fns[k]]));
  return { fns, names, logger, pick };
});
const f = m.fns;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: m.logger }));
vi.mock("@/lib/ai-engine", () =>
  m.pick("generateCrossDataInsights", "generateDailyBriefing", "calculatePropertyHealthScore", "getPropertySnapshot")
);
vi.mock("@/lib/revenue-engine", () => m.pick("getDiscrepancySummary"));
vi.mock("@/lib/footfall-engine", () => m.pick("getFootfallOverview", "getFootfallByZone", "getHourlyFootfall", "getPeakPatterns"));
vi.mock("@/lib/energy-engine", () => m.pick("getEnergyOverview", "getEnergyByZone", "getEnergyRecommendations"));
vi.mock("@/lib/finance-engine", () => m.pick("getFinanceOverview", "getCashFlow", "getBudgetComparison", "getProfitAndLoss"));
vi.mock("@/lib/contract-engine", () =>
  m.pick("getContractOverview", "getExpiringLeases", "getRentVsSalesAnalysis", "getContractAlerts", "getPortfolioAnalytics")
);
vi.mock("@/lib/tenant-analytics", () =>
  m.pick("getTenantRankings", "getSqmValueAnalysis", "getTenantMixAnalysis", "getPercentageRateAnalysis", "getReplacementAnalysis", "getTenantScorecard")
);
vi.mock("@/lib/percentage-rent-engine", () =>
  m.pick("calculatePercentageRent", "getInflationHedgeAnalysis", "getPercentageRateOptimization")
);
vi.mock("@/lib/marketing-engine", () => m.pick("getMarketingOverview", "getSeasonalCalendar", "getUpcomingSeasonalAlerts"));
vi.mock("@/lib/social-engine", () => m.pick("getSocialOverview", "getSocialInsights"));
vi.mock("@/lib/cctv-engine", () =>
  m.pick("getQueueStatus", "getParkingStatus", "getSecurityAlerts", "getStoreConversion", "getDemographics", "getDeadZones")
);
vi.mock("@/lib/anomaly-engine", () => m.pick("getActiveAnomalies", "getAnomalyStats"));
vi.mock("@/lib/learning-engine", () => m.pick("getLearningStats", "getLearnedPatterns"));

import { processChat } from "@/lib/ai-chat";

const briefing = {
  greeting: "Good morning",
  date: "2026-10-26",
  sections: {
    revenue: { title: "Revenue", icon: "x", items: [{ text: "All good" }] },
    footfall: { title: "Footfall", icon: "x", items: [{ text: "12,000 visitors" }] },
  },
  top_actions: [{ text: "Do A" }, { text: "Do B" }],
};

beforeEach(() => {
  for (const n of m.names) f[n].mockReset();
  m.logger.error.mockReset();
  f.generateDailyBriefing.mockResolvedValue(briefing);
});

const db = (tables: Record<string, any> = {}) => createRoutingSupabase(tables);

// ─────────────────────────────────────────────────────────────
describe("ai-chat: intent routing", () => {
  test.each([
    ["what has the AI learned?", "getLearningStats"],
    ["show critical issues", "getActiveAnomalies"],
    ["anything urgent?", "getActiveAnomalies"],
    ["anything unusual today", "getAnomalyStats"],
    ["Who is underreporting?", "getDiscrepancySummary"],
    ["who pays minimum only", "calculatePercentageRent"],
    ["rate optimization please", "getPercentageRateOptimization"],
    ["inflation hedge", "getInflationHedgeAnalysis"],
    ["percentage rent analysis", "calculatePercentageRent"],
    ["who to replace", "getReplacementAnalysis"],
    ["opportunity cost", "getSqmValueAnalysis"],
    ["revenue per sqm", "getSqmValueAnalysis"],
    ["tenant mix", "getTenantMixAnalysis"],
    ["best tenant", "getTenantRankings"],
    ["P&L this month", "getProfitAndLoss"],
    ["cash flow", "getCashFlow"],
    ["budget vs actual", "getBudgetComparison"],
    ["what is our WALE", "getPortfolioAnalytics"],
    ["rent vs sales", "getRentVsSalesAnalysis"],
    ["leases expiring soon", "getExpiringLeases"],
    ["store conversion rate", "getStoreConversion"],
    ["demographics", "getDemographics"],
    ["queue status", "getQueueStatus"],
    ["parking", "getParkingStatus"],
    ["security alerts", "getSecurityAlerts"],
    ["dead zones", "getDeadZones"],
    ["quiet areas", "getFootfallByZone"],
    ["instagram followers", "getSocialOverview"],
    ["when is ramadan", "getSeasonalCalendar"],
    ["متى رمضان", "getSeasonalCalendar"],
    ["campaigns", "getMarketingOverview"],
    ["energy saving tips", "getEnergyRecommendations"],
    ["energy by zone", "getEnergyByZone"],
    ["electricity today", "getEnergyOverview"],
    ["busiest zone", "getFootfallByZone"],
    ["peak hour", "getPeakPatterns"],
    ["how busy is it", "getFootfallOverview"],
    ["health score", "calculatePropertyHealthScore"],
    ["how much money did we make", "getFinanceOverview"],
    ["any recommendations", "generateCrossDataInsights"],
    ["status update", "generateDailyBriefing"],
    ["snapshot", "getPropertySnapshot"],
    ["xyzzy", "generateDailyBriefing"],
  ])("%j → %s", async (msg, fn) => {
    await processChat(db(), msg);
    expect(f[fn]).toHaveBeenCalled();
  });

  test("help: exact keywords only; message lists capabilities", async () => {
    for (const msg of ["help", "  HELP  ", "?", "what can you do"]) {
      const r = await processChat(db(), msg);
      expect(r.type).toBe("text");
      expect(r.message).toContain("Wedja AI Chat — What I can do");
    }
    // "help me" is not the help intent → falls back to briefing
    const r = await processChat(db(), "help me");
    expect(r.type).toBe("briefing");
  });

  test("urgent + maintenance goes to maintenance, not critical issues", async () => {
    const r = await processChat(db({ maintenance_tickets: [] }), "urgent maintenance");
    expect(f.getActiveAnomalies).not.toHaveBeenCalled();
    expect(r.message).toMatch(/No open maintenance tickets/);
  });

  // BUG: "event" is matched with includes() before the maintenance intent
  // (src/lib/ai-chat.ts:530), so "preventive maintenance" is routed to Events & Marketing.
  test.fails("'schedule preventive maintenance' is routed to maintenance", async () => {
    f.getMarketingOverview.mockResolvedValue(null);
    const sb = db({ maintenance_tickets: [] });
    await processChat(sb, "schedule preventive maintenance");
    expect(sb.opsFor("maintenance_tickets").length).toBe(1);
  });

  // BUG: KNOWN_TENANTS substring match (src/lib/ai-chat.ts:737) treats "max" inside
  // "maximize" as the tenant "Max", so an unrelated question becomes a tenant lookup.
  test.fails("a word containing a tenant name ('maximize') is not treated as a tenant lookup", async () => {
    const sb = db({ tenants: [] });
    await processChat(sb, "any ideas to maximize space?");
    expect(sb.opsFor("tenants")).toHaveLength(0);
    expect(f.generateDailyBriefing).toHaveBeenCalled();
  });

  // BUG: the "contract_alerts" intent dispatches to handleInsights (src/lib/ai-chat.ts:2156);
  // getContractAlerts is imported but never called.
  test.fails("'contract alerts' queries the contract alerts engine", async () => {
    f.getContractAlerts.mockResolvedValue([]);
    f.generateCrossDataInsights.mockResolvedValue([]);
    await processChat(db(), "contract alerts");
    expect(f.getContractAlerts).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-chat: handlers", () => {
  test("briefing renders sections and top actions", async () => {
    const r = await processChat(db(), "briefing");
    expect(r.type).toBe("briefing");
    expect(r.data).toBe(briefing);
    expect(r.message).toContain("Good morning! Here's your property briefing");
    expect(r.message).toContain("**Revenue:**\n  - All good");
    expect(r.message).toContain("**Top Actions:** Do A; Do B");
  });

  test("discrepancies: zero → reassuring text; otherwise top 5 with % formatting", async () => {
    f.getDiscrepancySummary.mockResolvedValue({ total_discrepancies: 0 });
    expect((await processChat(db(), "discrepancies")).message).toMatch(/No underreporting discrepancies/);

    const top = Array.from({ length: 7 }, (_, i) => ({
      brand_name: `B${i}`,
      unit_number: `U${i}`,
      reported_revenue_egp: 1000,
      estimated_revenue_egp: 2000.6,
      variance_pct: -49.97,
      confidence: 0.876,
    }));
    f.getDiscrepancySummary.mockResolvedValue({
      total_discrepancies: 7,
      total_potential_recovery_egp: 12345.5,
      by_confidence: { high: 3 },
      top_discrepancies: top,
    });
    const r = await processChat(db(), "discrepancies");
    expect(r.type).toBe("list");
    expect(r.message).toContain("Rent at risk on open cases: **EGP 12,346**");
    expect(r.message).toContain("1. **B0** (U0) — reported EGP 1,000 vs estimated EGP 2,001 (-50.0% variance, 88% confidence)");
    expect(r.message).toContain("5. **B4**");
    expect(r.message).not.toContain("B5");
  });

  test("overdue rent: outstanding = due − paid (null → 0), top 8 + 'and N more'", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      amount_due: 1000,
      amount_paid: i === 0 ? null : 400,
      period_month: 9,
      period_year: 2026,
      lease: i === 1 ? null : { tenant: { brand_name: `T${i}` }, unit: { unit_number: `G-${i}` } },
    }));
    const r = await processChat(db({ rent_transactions: rows }), "overdue rent");
    expect(r.message).toContain("**10 overdue rent payments totalling EGP 6,400.**");
    expect(r.message).toContain("- **T0** (G-0) — EGP 1,000 overdue (9/2026)");
    expect(r.message).toContain("- **Unknown** (N/A) — EGP 600 overdue");
    expect(r.message).toContain("...and 2 more");
    expect((await processChat(db({ rent_transactions: [] }), "unpaid")).message).toMatch(/All rent payments are up to date/);
  });

  test("worst tenants are the last 5 of the ranking, worst first", async () => {
    f.getTenantRankings.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ brand_name: `R${i}`, overall_score: 100 - i * 10 }))
    );
    const r = await processChat(db(), "worst tenant");
    expect((r.data as any[]).map((c) => c.brand_name)).toEqual(["R7", "R6", "R5", "R4", "R3"]);
    f.getTenantRankings.mockResolvedValue([]);
    expect((await processChat(db(), "worst tenant")).message).toBe("No tenant performance data available.");
  });

  test("tenant ranking with fewer than 5 tenants shows them all in both lists", async () => {
    f.getTenantRankings.mockResolvedValue([{ brand_name: "A" }, { brand_name: "B" }]);
    const r = await processChat(db(), "tenant ranking");
    expect(r.message).toContain("Top 5:\n1. **A**");
    expect(r.message).toContain("Bottom 5:\n1. **B**");
    expect(r.message).toContain("Total tenants ranked: 2");
  });

  test("opportunity cost totals all tenants but lists the 5 largest", async () => {
    f.getSqmValueAnalysis.mockResolvedValue(
      [10, 50, 30, 20, 40, 60].map((v, i) => ({ brand_name: `S${i}`, opportunity_cost_total: v * 1000, opportunity_cost_per_sqm: v, area_sqm: 1000 }))
    );
    const r = await processChat(db(), "opportunity cost");
    expect(r.message).toContain("Total Monthly Opportunity Cost: EGP 210,000");
    expect((r.data as any[]).map((t) => t.brand_name)).toEqual(["S5", "S1", "S4", "S2", "S3"]);
  });

  test("quiet zones: the last 3 zones, quietest first", async () => {
    f.getFootfallByZone.mockResolvedValue(
      ["Z1", "Z2", "Z3", "Z4"].map((n, i) => ({ zone_name: n, total_in: 1000 - i * 100, share_of_total_pct: 25 }))
    );
    const r = await processChat(db(), "quiet zones");
    expect((r.data as any[]).map((z) => z.zone_name)).toEqual(["Z4", "Z3", "Z2"]);
  });

  test("dead zones use a < 40% relative-traffic threshold", async () => {
    f.getDeadZones.mockResolvedValue([
      { zone_name: "A", zone_type: "retail", footfall: 10, relative_traffic: 39, recommendation: "r" },
      { zone_name: "B", zone_type: "retail", footfall: 10, relative_traffic: 40, recommendation: "r" },
    ]);
    const r = await processChat(db(), "dead zone");
    expect((r.data as any[]).map((z) => z.zone_name)).toEqual(["A"]);
    f.getDeadZones.mockResolvedValue([]);
    expect((await processChat(db(), "dead zone")).message).toMatch(/No dead zones/);
  });

  test("seasonal calendar: drops past/null dates, sorts by days away, max 8", async () => {
    f.getSeasonalCalendar.mockResolvedValue([
      { name: "Past", days_away: -3 },
      { name: "Unknown", days_away: null },
      ...[40, 5, 0, 12, 90, 60, 30, 20, 70].map((d) => ({ name: `S${d}`, days_away: d, type: "holiday", footfall_impact: "+20%", planning_status: "p", ai_recommendation: "a" })),
    ]);
    const r = await processChat(db(), "next season");
    expect((r.data as any[]).map((s) => s.days_away)).toEqual([0, 5, 12, 20, 30, 40, 60, 70]);
    f.getSeasonalCalendar.mockResolvedValue([{ name: "Past", days_away: -1 }]);
    expect((await processChat(db(), "next season")).message).toMatch(/No upcoming seasonal events/);
  });

  test("occupancy rate with zero units reports 0% without dividing by zero", async () => {
    const r = await processChat(db({ units: [] }), "occupancy");
    expect(r.message).toContain("**Occupancy Rate: 0%**");
    const r2 = await processChat(
      db({ units: [{ status: "occupied" }, { status: "occupied" }, { status: "vacant" }] }),
      "occupancy"
    );
    expect(r2.message).toContain("**Occupancy Rate: 66.7%**");
    expect(r2.message).toContain("- Vacant: 1 units");
  });

  test("snapshot formats signed trends: +x%, -x%, 0%", async () => {
    f.getPropertySnapshot.mockResolvedValue({
      occupancy_rate: 92.5, revenue_this_month: 1e6, revenue_trend: 0, total_monthly_rent_egp: 2e6,
      footfall_today: 12000, footfall_trend: 5, energy_cost_today: 3000, energy_trend: -4,
      open_maintenance: 2, urgent_maintenance: 1, discrepancies_count: 3, discrepancies_variance: 5000,
      expiring_leases_90d: 2, wale_years: 3.2, opportunity_cost_monthly: 0, active_events: 1,
      active_campaigns: 1, social_followers: 100, social_growth: 0, health_score: 80, top_tenant_by_rent: "Spinneys",
    });
    const r = await processChat(db(), "snapshot");
    expect(r.message).toContain("(0% vs last month)");
    expect(r.message).toContain("12,000** visitors (+5%)");
    expect(r.message).toContain("(-4%)");
  });

  // BUG: handleHealthScore prints `v.label` (src/lib/ai-chat.ts:841) but HealthScoreDimension
  // has no `label` field, so every line renders as "- : **x/y** — detail" with no dimension name.
  test.fails("health score lines include the dimension name", async () => {
    f.calculatePropertyHealthScore.mockResolvedValue({
      total: 80,
      revenue: { score: 15, max: 15, detail: "ok", link: "/" },
      occupancy: { score: 9, max: 10, detail: "ok", link: "/" },
    });
    const r = await processChat(db(), "health score");
    expect(r.message).not.toMatch(/^- : /m);
  });

  test("anomalies: none → all-clear; otherwise lists with severity fallback", async () => {
    f.getActiveAnomalies.mockResolvedValue([]);
    f.getAnomalyStats.mockResolvedValue({});
    expect((await processChat(db(), "anomalies")).message).toMatch(/No active anomalies/);

    f.getActiveAnomalies.mockResolvedValue([{ title: "Spike", description: "d", impact_egp: 0 }]);
    f.getAnomalyStats.mockResolvedValue({ active_count: 1, by_severity: { critical: 1 }, total_impact_egp: 0 });
    const r = await processChat(db(), "anomalies");
    expect(r.message).toContain("[INFO] **Spike**");
    expect(r.message).not.toContain("Impact:"); // zero impact omitted
    expect(r.message).toContain("Critical 1 | High 0 | Medium 0 | Low 0");
  });

  test("insights: icon by severity and impact shown only when > 0", async () => {
    f.generateCrossDataInsights.mockResolvedValue([
      { severity: "critical", title: "A", message: "m", impact_egp: 1000, source_modules: ["x", "y"] },
      { severity: "weird", title: "B", message: "m", impact_egp: 0, source_modules: ["z"] },
    ]);
    const r = await processChat(db(), "insights");
    expect(r.message).toContain("[CRITICAL] **A**\n  m\n  Impact: EGP 1,000\n  Sources: x, y");
    expect(r.message).toContain("[INFO] **B**\n  m\n  Sources: z");
  });

  test("handler exceptions return a friendly error and are logged", async () => {
    f.getEnergyOverview.mockRejectedValue(new Error("db down"));
    const r = await processChat(db(), "energy");
    expect(r).toEqual({
      message: "I encountered an error while processing your request. Please try again or rephrase your question.",
      type: "text",
    });
    expect(m.logger.error).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-chat: tenant lookup", () => {
  test("'how is kfc doing' extracts 'kfc' and searches brand_name with ILIKE", async () => {
    const sb = db({ tenants: [{ id: "t1", brand_name: "KFC", category: "food", status: "active" }] });
    f.getTenantScorecard.mockResolvedValue(null);
    const r = await processChat(sb, "How is KFC doing");
    const q = sb.opsFor("tenants")[0];
    expect(q.filters).toContainEqual({ name: "ilike", args: ["brand_name", "%kfc%"] });
    expect(r.message).toContain("No active lease found");
  });

  test("known tenant name anywhere in the message triggers lookup", async () => {
    const sb = db({ tenants: [] });
    const r = await processChat(sb, "spinneys");
    expect(r.message).toBe('No tenant found matching "spinneys". Try the exact brand name or ask "tenant ranking" to see all tenants.');
    // brand_name first, then name
    expect(sb.opsFor("tenants").map((o: any) => o.filters.find((x: any) => x.name === "ilike").args[0])).toEqual(["brand_name", "name"]);
  });

  test("falls back to the name column when brand_name has no match", async () => {
    const sb = db({
      tenants: (ctx: any) =>
        ctx.filters.some((x: any) => x.name === "ilike" && x.args[0] === "name")
          ? [{ id: "t9", brand_name: "Adidas Originals", category: "fashion", status: "active" }]
          : [],
    });
    f.getTenantScorecard.mockResolvedValue({
      brand_name: "Adidas Originals", category: "fashion", brand_type: "international", unit_number: "G1", zone_name: "Z",
      area_sqm: 200, start_date: "2024-01-01", end_date: "2029-01-01", reported_sales_monthly_avg: 1e6,
      estimated_sales_monthly_avg: 1.2e6, revenue_per_sqm_monthly: 5000, revenue_gap_egp: 2e5, revenue_gap_pct: 16.7,
      min_rent: 50_000, percentage_rate: 8, actual_rent_type: "percentage", monthly_rent_amount: 80_000,
      min_rent_per_sqm: 250, rent_to_sales_ratio: 0.08, avg_daily_visitors: 900, avg_conversion_rate: 20,
      visitors_per_sqm: 4.5, dwell_time_avg: 300, overall_score: 82, productivity_score: 80,
      rent_efficiency_score: 70, footfall_attraction_score: 90, payment_reliability_score: 95, ai_verdict: "Keep",
    });
    const r = await processChat(sb, "tell me about adidas originals");
    expect(f.getTenantScorecard).toHaveBeenCalledWith(sb, "t9");
    expect(r.type).toBe("metric");
    expect(r.message).toContain("Actually paying: Percentage rent (EGP 80,000)");
    expect(r.message).toContain("Rent-to-sales: 8.0%");
  });

  test("multiple matches return a disambiguation list", async () => {
    const sb = db({
      tenants: [
        { id: "1", brand_name: "Costa Coffee", category: "food", status: "active" },
        { id: "2", brand_name: "Costa Express", category: "food", status: "pending" },
      ],
    });
    const r = await processChat(sb, "lookup costa");
    expect(r.type).toBe("list");
    expect(r.message).toContain('Found 2 tenants matching "costa"');
    expect(f.getTenantScorecard).not.toHaveBeenCalled();
  });

  test("scorecard failure degrades gracefully", async () => {
    const sb = db({ tenants: [{ id: "1", brand_name: "Puma", category: "fashion", status: "active" }] });
    f.getTenantScorecard.mockRejectedValue(new Error("no data"));
    const r = await processChat(sb, "puma");
    expect(r.message).toContain("**Puma** (fashion) found, but could not generate full scorecard");
    expect(m.logger.error).not.toHaveBeenCalled();
  });

  // BUG: extractTenantName keeps trailing punctuation (src/lib/ai-chat.ts:721), so
  // "Tell me about KFC?" searches ILIKE '%kfc?%' and never matches "KFC".
  test.fails("trailing punctuation is stripped from the extracted tenant name", async () => {
    const sb = db({ tenants: [] });
    await processChat(sb, "Tell me about KFC?");
    expect(sb.opsFor("tenants")[0].filters).toContainEqual({ name: "ilike", args: ["brand_name", "%kfc%"] });
  });
});
