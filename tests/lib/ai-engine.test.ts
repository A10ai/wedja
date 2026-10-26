/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoutingSupabase } from "./helpers/routing-supabase-mock";

process.env.TZ = "UTC";

// ── Mock every engine ai-engine depends on ───────────────────
const m = vi.hoisted(() => {
  const arrayFns = [
    "getFootfallByZone",
    "getEnergyByZone",
    "getEnergyVsFootfall",
    "getExpiringLeases",
    "getContractAlerts",
    "getRentVsSalesAnalysis",
    "getTenantRankings",
    "getLearnedPatterns",
    "getDeadZones",
  ];
  const nullFns = [
    "getFootfallOverview",
    "getPeakPatterns",
    "getDiscrepancySummary",
    "getEnergyOverview",
    "getFinanceOverview",
    "getPortfolioAnalytics",
    "getReplacementAnalysis",
    "getTenantMixAnalysis",
    "getMarketingOverview",
    "getSocialOverview",
    "getLearningStats",
    "getCCTVDashboardData",
    "getStoreConversion",
    "getDemographics",
    "getParkingStatus",
    "getSecurityAlerts",
    "getQueueStatus",
    "calculatePercentageRent",
    "getInflationHedgeAnalysis",
    "getAnomalyStats",
    "forecastFootfall",
    "forecastRevenue",
  ];
  const fns: Record<string, any> = {};
  for (const n of [...arrayFns, ...nullFns]) fns[n] = vi.fn();
  const reset = () => {
    for (const n of arrayFns) fns[n].mockReset().mockResolvedValue([]);
    for (const n of nullFns) fns[n].mockReset().mockResolvedValue(null);
  };
  return { fns, reset, arrayFns, nullFns };
});
const f = m.fns;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/footfall-engine", () => ({
  getFootfallOverview: m.fns.getFootfallOverview,
  getFootfallByZone: m.fns.getFootfallByZone,
  getPeakPatterns: m.fns.getPeakPatterns,
}));
vi.mock("@/lib/revenue-engine", () => ({ getDiscrepancySummary: m.fns.getDiscrepancySummary }));
vi.mock("@/lib/energy-engine", () => ({
  getEnergyOverview: m.fns.getEnergyOverview,
  getEnergyByZone: m.fns.getEnergyByZone,
  getEnergyVsFootfall: m.fns.getEnergyVsFootfall,
}));
vi.mock("@/lib/finance-engine", () => ({ getFinanceOverview: m.fns.getFinanceOverview }));
vi.mock("@/lib/contract-engine", () => ({
  getPortfolioAnalytics: m.fns.getPortfolioAnalytics,
  getExpiringLeases: m.fns.getExpiringLeases,
  getContractAlerts: m.fns.getContractAlerts,
  getRentVsSalesAnalysis: m.fns.getRentVsSalesAnalysis,
}));
vi.mock("@/lib/tenant-analytics", () => ({
  getTenantRankings: m.fns.getTenantRankings,
  getReplacementAnalysis: m.fns.getReplacementAnalysis,
  getTenantMixAnalysis: m.fns.getTenantMixAnalysis,
}));
vi.mock("@/lib/marketing-engine", () => ({ getMarketingOverview: m.fns.getMarketingOverview }));
vi.mock("@/lib/social-engine", () => ({ getSocialOverview: m.fns.getSocialOverview }));
vi.mock("@/lib/learning-engine", () => ({
  getLearningStats: m.fns.getLearningStats,
  getLearnedPatterns: m.fns.getLearnedPatterns,
}));
vi.mock("@/lib/cctv-engine", () => ({
  getCCTVDashboardData: m.fns.getCCTVDashboardData,
  getStoreConversion: m.fns.getStoreConversion,
  getDeadZones: m.fns.getDeadZones,
  getDemographics: m.fns.getDemographics,
  getParkingStatus: m.fns.getParkingStatus,
  getSecurityAlerts: m.fns.getSecurityAlerts,
  getQueueStatus: m.fns.getQueueStatus,
}));
vi.mock("@/lib/percentage-rent-engine", () => ({
  calculatePercentageRent: m.fns.calculatePercentageRent,
  getInflationHedgeAnalysis: m.fns.getInflationHedgeAnalysis,
}));
vi.mock("@/lib/anomaly-engine", () => ({ getAnomalyStats: m.fns.getAnomalyStats }));
vi.mock("@/lib/prediction-model", () => ({
  forecastFootfall: m.fns.forecastFootfall,
  forecastRevenue: m.fns.forecastRevenue,
}));

import {
  generateCrossDataInsights,
  calculatePropertyHealthScore,
  generateDailyBriefing,
  getPropertySnapshot,
  type CrossDataInsight,
} from "@/lib/ai-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

beforeEach(() => {
  m.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T09:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

const portfolio = (o: Record<string, any> = {}) => ({
  wale_years: 4,
  avg_rent_per_sqm: 150,
  vacancy_cost_monthly: 100_000,
  total_contracted_rent: 2_000_000,
  tenant_concentration: [],
  ...o,
});
const finance = (o: Record<string, any> = {}) => ({
  total_income_egp: 1_000_000,
  total_expenses_egp: 500_000,
  overdue_rent_egp: 0,
  profit_margin_pct: 50,
  net_profit_egp: 500_000,
  income_vs_last_month_pct: 0,
  ...o,
});
const energy = (o: Record<string, any> = {}) => ({
  cost_this_month_egp: 0,
  total_consumption_kwh_today: 1000,
  total_cost_egp_today: 2000,
  change_vs_yesterday_pct: 0,
  ...o,
});

function assertInsightInvariants(ins: CrossDataInsight[]) {
  const ids = new Set<string>();
  for (const i of ins) {
    expect(i.id).toMatch(/^cdi_[a-z0-9]+$/);
    ids.add(i.id);
    expect(i.confidence).toBeGreaterThanOrEqual(0);
    expect(i.confidence).toBeLessThanOrEqual(1);
    expect(Number.isFinite(i.impact_egp)).toBe(true);
    expect(i.title).not.toMatch(/NaN|Infinity|undefined/);
    expect(i.source_modules.length).toBeGreaterThan(0);
  }
  expect(ids.size).toBe(ins.length);
  for (let k = 1; k < ins.length; k++) expect(ins[k - 1].impact_egp).toBeGreaterThanOrEqual(ins[k].impact_egp);
}

// ─────────────────────────────────────────────────────────────
describe("ai-engine: generateCrossDataInsights", () => {
  test("no data anywhere → no insights", async () => {
    expect(await generateCrossDataInsights(createRoutingSupabase({}), PROP)).toEqual([]);
  });

  test("every engine rejecting is tolerated (each call has its own fallback)", async () => {
    for (const n of [...m.arrayFns, ...m.nullFns]) f[n].mockRejectedValue(new Error(`${n} down`));
    expect(await generateCrossDataInsights(createRoutingSupabase({}), PROP)).toEqual([]);
  });

  test.each([
    [200_001, "critical"],
    [200_000, "warning"],
    [50_001, "warning"],
    [50_000, "opportunity"],
  ])("discrepancy recovery %i → severity %s, annualised impact", async (recovery, severity) => {
    f.getDiscrepancySummary.mockResolvedValue({
      total_discrepancies: 3,
      total_potential_recovery_egp: recovery,
      total_variance_egp: 10,
      by_confidence: { high: 1, medium: 1, low: 1 },
    });
    const [ins] = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    expect(ins.type).toBe("revenue_footfall");
    expect(ins.severity).toBe(severity);
    expect(ins.impact_egp).toBe(recovery * 12);
  });

  test("occupancy severity bands and impact fallback without portfolio data", async () => {
    const units = (vacant: number, total: number) =>
      Array.from({ length: total }, (_, i) => ({ id: `${i}`, status: i < vacant ? "vacant" : "occupied" }));
    const run = async (vacant: number, total: number) =>
      (await generateCrossDataInsights(createRoutingSupabase({ units: units(vacant, total) }), PROP))[0];

    const crit = await run(4, 10); // 60%
    expect(crit.severity).toBe("critical");
    expect(crit.title).toBe("4 units vacant — 60.0% occupancy");
    expect(crit.impact_egp).toBe(4 * 25_000 * 12);
    expect(crit.recommended_action).toMatch(/aggressive/);
    expect((await run(2, 10)).severity).toBe("warning"); // 80%
    expect((await run(1, 10)).severity).toBe("info"); // 90%
    // exactly 70% / 85% are not "below"
    expect((await run(3, 10)).severity).toBe("warning");
    expect((await run(3, 20)).severity).toBe("info"); // 85%
  });

  test("finance with zero income: margin 0 → warning with 0 impact (no NaN)", async () => {
    f.getFinanceOverview.mockResolvedValue(finance({ total_income_egp: 0, total_expenses_egp: 1000 }));
    f.getEnergyOverview.mockResolvedValue(energy({ cost_this_month_egp: 5000 }));
    f.getPortfolioAnalytics.mockResolvedValue(portfolio());
    const ins = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    const fin = ins.find((i) => i.type === "finance_contracts")!;
    expect(fin.severity).toBe("warning");
    expect(fin.impact_egp).toBe(0);
    expect(fin.title).toContain("Net margin: 0.0%");
    // energy-share insight requires income > 0
    expect(ins.some((i) => i.type === "finance_energy")).toBe(false);
    assertInsightInvariants(ins);
  });

  test("energy share of revenue: >8% warning, 5–8% opportunity, ≤5% none", async () => {
    f.getFinanceOverview.mockResolvedValue(finance());
    f.getPortfolioAnalytics.mockResolvedValue(portfolio());
    const share = async (cost: number) => {
      f.getEnergyOverview.mockResolvedValue(energy({ cost_this_month_egp: cost }));
      return (await generateCrossDataInsights(createRoutingSupabase({}), PROP)).find((i) => i.type === "finance_energy");
    };
    expect((await share(90_000))!.severity).toBe("warning");
    const opp = (await share(60_000))!;
    expect(opp.severity).toBe("opportunity");
    expect(opp.impact_egp).toBe(Math.round(60_000 * 0.2 * 12));
    expect(await share(50_000)).toBeUndefined();
  });

  test("tenant concentration: needs ≥5 tenants and top-5 > 40%", async () => {
    f.getFinanceOverview.mockResolvedValue(finance());
    f.getEnergyOverview.mockResolvedValue(energy());
    const conc = (pcts: number[]) =>
      pcts.map((p, i) => ({ brand_name: `T${i}`, percentage_of_total: p, monthly_rent: 10_000 * (i + 1) }));
    const find = async (pcts: number[]) => {
      f.getPortfolioAnalytics.mockResolvedValue(portfolio({ tenant_concentration: conc(pcts) }));
      return (await generateCrossDataInsights(createRoutingSupabase({}), PROP)).find((i) => i.title.startsWith("Top 5"));
    };
    expect(await find([30, 30, 30, 30])).toBeUndefined(); // only 4 tenants
    expect(await find([8, 8, 8, 8, 8, 50])).toBeUndefined(); // top5 = 40 exactly
    const w = (await find([20, 10, 5, 5, 5]))!; // 45%
    expect(w.severity).toBe("opportunity");
    expect(w.title).toContain("45.0%");
    expect(w.impact_egp).toBe(10_000 * 6); // top tenant's monthly rent × 6
    expect((await find([30, 15, 10, 5, 5]))!.severity).toBe("warning"); // 65% > 60
  });

  test("bottom-10 opportunity cost only for >10 ranked tenants and > EGP 20k/month", async () => {
    const rankings = Array.from({ length: 11 }, (_, i) => ({
      tenant_name: `T${i}`,
      brand_name: `T${i}`,
      rent_per_sqm: 50,
      area_sqm: 100,
      reported_sales_per_sqm: 500,
      estimated_sales_per_sqm: 500,
      overall_score: 50,
      monthly_rent: 5000,
    }));
    f.getTenantRankings.mockResolvedValue(rankings);
    const ins = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    const b = ins.find((i) => i.title.startsWith("Bottom 10"))!;
    // default avg rent/sqm 150 when no portfolio → (150-50)*100*10
    expect(b.impact_egp).toBe(100_000 * 12);
    expect(b.title).toContain("1,000 sqm");
    f.getTenantRankings.mockResolvedValue(rankings.slice(0, 10));
    expect((await generateCrossDataInsights(createRoutingSupabase({}), PROP)).some((i) => i.title.startsWith("Bottom 10"))).toBe(false);
  });

  test("queue insight only for waits > 8 minutes and uses the first long queue", async () => {
    f.getQueueStatus.mockResolvedValue({
      active_queues: [
        { tenant_name: "Costa", estimated_wait_minutes: 8, queue_length: 50 },
        { tenant_name: "KFC", estimated_wait_minutes: 12, queue_length: 20 },
      ],
    });
    const [q] = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    expect(q.title).toContain("KFC averages 12 minutes");
    expect(q.impact_egp).toBe(20 * 150 * 30);
  });

  test("store conversion: only the first qualifying low converter is reported", async () => {
    f.getTenantRankings.mockResolvedValue([
      { tenant_name: "A", brand_name: "A", rent_per_sqm: 100, monthly_rent: 10_000, reported_sales_per_sqm: 999, estimated_sales_per_sqm: 0, area_sqm: 1, overall_score: 50 },
      { tenant_name: "B", brand_name: "B", rent_per_sqm: 100, monthly_rent: 20_000, reported_sales_per_sqm: 999, estimated_sales_per_sqm: 0, area_sqm: 1, overall_score: 50 },
    ]);
    f.getStoreConversion.mockResolvedValue({
      stores: [{ tenant_name: "A" }, { tenant_name: "B" }],
      avg_conversion_rate: 20,
      bottom_converters: [
        { tenant_name: "A", conversion_rate: 9, passersby: 500 },
        { tenant_name: "B", conversion_rate: 5, passersby: 500 },
      ],
    });
    const ins = (await generateCrossDataInsights(createRoutingSupabase({}), PROP)).filter((i) => i.type === "cctv_revenue");
    expect(ins).toHaveLength(1);
    expect(ins[0].title).toContain("for A is 9.0%");
    expect(ins[0].impact_egp).toBe(Math.round(10_000 * 0.3 * 12));
  });

  test("Spinneys dependency and kiosk insights from JDE rent data", async () => {
    f.getPortfolioAnalytics.mockResolvedValue(portfolio());
    const db = createRoutingSupabase({
      rent_transactions: [
        { amount_paid: 90_000, lease: { tenant: { brand_name: "Spinneys Hypermarket" } } },
        { amount_paid: "10000", lease: { tenant: { brand_name: "Aldo" } } },
        { amount_paid: null, lease: null },
      ],
      leases: [1, 2, 3, 4].map((i) => ({ min_rent_monthly_egp: 5000, unit: { area_sqm: 10 } })),
    });
    const ins = await generateCrossDataInsights(db, PROP);
    const sp = ins.find((i) => i.title.startsWith("Spinneys"))!;
    expect(sp.title).toContain("90.0% of total rent");
    expect(sp.impact_egp).toBe(90_000 * 12);
    const k = ins.find((i) => i.title.startsWith("Kiosk"))!;
    expect(k.title).toContain("EGP 20,000/month from 4 tenants");
    expect(k.impact_egp).toBe(Math.round(500 * 20 * 12));
    assertInsightInvariants(ins);
  });

  test("anomaly insights: critical > warning (≥5 active) > none", async () => {
    f.getAnomalyStats.mockResolvedValue({ active_count: 2, by_severity: { critical: 1 }, total_impact_egp: 5000, avg_detection_confidence: 0.7 });
    let [a] = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    expect(a.severity).toBe("critical");
    expect(a.title).toBe("1 critical anomaly requiring immediate attention");
    expect(a.confidence).toBe(0.7);

    f.getAnomalyStats.mockResolvedValue({ active_count: 5, by_severity: {}, total_impact_egp: 0, avg_detection_confidence: 0 });
    [a] = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    expect(a.severity).toBe("warning");
    expect(a.confidence).toBe(0.8);

    f.getAnomalyStats.mockResolvedValue({ active_count: 4, by_severity: {}, total_impact_egp: 0 });
    expect(await generateCrossDataInsights(createRoutingSupabase({}), PROP)).toEqual([]);
  });

  test("ML forecasts: confidence = min(0.95, R² + 0.1), severity from trend slope", async () => {
    f.forecastFootfall.mockResolvedValue({
      predictions: [{ predicted_value: 100 }, { predicted_value: 200 }],
      model: { trend_slope: -6, training_samples: 365, r_squared: 0.97 },
    });
    f.forecastRevenue.mockResolvedValue({
      predictions: [{ predicted_value: 1000 }, { predicted_value: 2000 }],
      model: { trend_slope: 3, training_samples: 12, r_squared: 0.5, accuracy_mape: 4.25 },
    });
    const ins = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    const ff = ins.find((i) => i.title.includes("Footfall declining"))!;
    expect(ff.title).toContain("30-day avg: 150");
    expect(ff.severity).toBe("warning");
    expect(ff.confidence).toBe(0.95);
    const rev = ins.find((i) => i.title.includes("Revenue growing"))!;
    expect(rev.severity).toBe("opportunity");
    expect(rev.impact_egp).toBe(3000);
    expect(rev.confidence).toBeCloseTo(0.6);
    // revenue (3000) sorts before footfall (0)
    expect(ins.indexOf(rev)).toBeLessThan(ins.indexOf(ff));
  });

  test("percentage-rent gap and inflation hedge thresholds", async () => {
    f.calculatePercentageRent.mockResolvedValue({ total_gap_egp: 60_000, tenants_with_gap: [{}, {}] });
    f.getInflationHedgeAnalysis.mockResolvedValue({
      hedge_ratio: 15,
      devaluation_10pct_increase_pct: 1.5,
      total_monthly_revenue_egp: 1_000_000,
      tenants_with_zero_rate: [1, 2, 3, 4, 5, 6].map((i) => ({ brand_name: `Z${i}`, min_rent: 1000 })),
    });
    const ins = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    expect(ins.find((i) => i.link === "/dashboard/percentage-rent" && i.type === "revenue_footfall")!.severity).toBe("warning");
    const hedge = ins.find((i) => i.title.startsWith("Inflation hedge"))!;
    expect(hedge.severity).toBe("warning");
    expect(hedge.impact_egp).toBe(Math.round(1_000_000 * 0.1 * 35 / 100 * 12));
    const zero = ins.find((i) => i.title.startsWith("6 tenants with 0% rate"))!;
    expect(zero.message).toContain("Z1, Z2, Z3, Z4, Z5 and 1 more");
    expect(zero.impact_egp).toBe(Math.round(6000 * 0.1 * 12));
    assertInsightInvariants(ins);
  });

  test("a rich dataset keeps all insight invariants (confidence ∈ [0,1], sorted by impact)", async () => {
    f.getDiscrepancySummary.mockResolvedValue({ total_discrepancies: 2, total_potential_recovery_egp: 70_000, total_variance_egp: 1, by_confidence: { high: 1 } });
    f.getFinanceOverview.mockResolvedValue(finance({ overdue_rent_egp: 150_000 }));
    f.getEnergyOverview.mockResolvedValue(energy({ cost_this_month_egp: 70_000 }));
    f.getPortfolioAnalytics.mockResolvedValue(portfolio());
    f.getParkingStatus.mockResolvedValue({ occupancy_pct: 85, current_occupied: 400 });
    f.getDeadZones.mockResolvedValue([{ zone_name: "Annex", relative_traffic: 10, area_sqm: 300, footfall: 50, recommendation: "signage" }]);
    f.getLearningStats.mockResolvedValue({ params_calibrated: 3, patterns_discovered: 2, days_of_learning: 9, avg_confidence: 60, top_improvements: [] });
    const ins = await generateCrossDataInsights(createRoutingSupabase({ units: [{ status: "vacant" }, { status: "occupied" }] }), PROP);
    expect(ins.length).toBeGreaterThanOrEqual(7);
    assertInsightInvariants(ins);
  });

  // BUG: the social/footfall insight title is hard-coded to "Thursday 7-9 PM"
  // (src/lib/ai-engine.ts:441) regardless of the actual best_posting_time / busiest day.
  test.fails("posting-time insight title reflects the real best posting time", async () => {
    f.getSocialOverview.mockResolvedValue({ best_posting_time: "Saturday 1-3 PM", best_content_type: "image", best_platform: "instagram" });
    f.getPeakPatterns.mockResolvedValue({ busiest_day: "Saturday", busiest_day_avg: 20_000 });
    const [ins] = await generateCrossDataInsights(createRoutingSupabase({}), PROP);
    expect(ins.title).toContain("Saturday 1-3 PM");
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-engine: calculatePropertyHealthScore", () => {
  const dims = ["revenue", "occupancy", "tenant_quality", "contracts", "energy", "maintenance", "marketing", "financial", "cctv_security", "social_media"] as const;

  test("max scores sum to 100 and each dimension stays within [0, max]", async () => {
    const h = await calculatePropertyHealthScore(createRoutingSupabase({}), PROP);
    expect(dims.reduce((s, d) => s + h[d].max, 0)).toBe(100);
    for (const d of dims) {
      expect(h[d].score).toBeGreaterThanOrEqual(0);
      expect(h[d].score).toBeLessThanOrEqual(h[d].max);
    }
    expect(h.total).toBe(dims.reduce((s, d) => s + h[d].score, 0));
  });

  test("empty database scores the neutral defaults (75/100)", async () => {
    const h = await calculatePropertyHealthScore(createRoutingSupabase({}), PROP);
    expect(Object.fromEntries(dims.map((d) => [d, h[d].score]))).toEqual({
      revenue: 15, // no transactions → 100% collection, 0 overdue
      occupancy: 10, // no units → treated as fully occupied
      tenant_quality: 10,
      contracts: 6, // WALE 0 → −4
      energy: 5,
      maintenance: 10,
      marketing: 2,
      financial: 5,
      cctv_security: 7,
      social_media: 5,
    });
    expect(h.total).toBe(75);
    expect(h.energy.detail).toBe("No energy data available");
    expect(h.contracts.detail).toBe("WALE 0.0 years, 0 expiring in 90 days");
  });

  test("best-case data reaches exactly 100", async () => {
    f.getPortfolioAnalytics.mockResolvedValue(portfolio({ wale_years: 5 }));
    f.getEnergyVsFootfall.mockResolvedValue([{ status: "efficient" }, { status: "efficient" }]);
    f.getMarketingOverview.mockResolvedValue({ active_events: { count: 1 }, active_campaigns: { count: 1 }, active_promotions: 1 });
    f.getFinanceOverview.mockResolvedValue(finance({ profit_margin_pct: 41 }));
    f.getCCTVDashboardData.mockResolvedValue({ cameras_total: 20, cameras_online: 20, security_alerts: 0 });
    f.getSecurityAlerts.mockResolvedValue({ active_alerts: [], total_active: 0 });
    f.getSocialOverview.mockResolvedValue({
      total_followers: 60_000,
      best_platform: "instagram",
      platforms: [{ follower_growth_30d: 600, posts_this_month: 20 }],
    });
    const h = await calculatePropertyHealthScore(
      createRoutingSupabase({
        units: [{ status: "occupied" }],
        rent_transactions: [{ status: "paid" }],
        leases: [{ end_date: "2030-01-01" }],
      }),
      PROP
    );
    expect(h.total).toBe(100);
    expect(h.cctv_security.score).toBe(10); // 7 + 2 + 1, clamped
  });

  test("worst-case data floors every dimension at 0 (never negative)", async () => {
    f.getPortfolioAnalytics.mockResolvedValue(portfolio({ wale_years: 0.5 }));
    f.getEnergyVsFootfall.mockResolvedValue([{ status: "inefficient" }, { status: "inefficient" }, { status: "ok" }]);
    f.getFinanceOverview.mockResolvedValue(finance({ profit_margin_pct: -20 }));
    f.getCCTVDashboardData.mockResolvedValue({ cameras_total: 10, cameras_online: 1, security_alerts: 9 });
    f.getSecurityAlerts.mockResolvedValue({ active_alerts: [1, 2, 3].map(() => ({ severity: "critical" })), total_active: 3 });
    const tickets = [
      ...Array.from({ length: 12 }, () => ({ status: "open", priority: "urgent" })),
      { status: "completed", created_at: "2026-01-01T00:00:00Z", resolved_at: "2026-02-01T00:00:00Z" },
    ];
    const h = await calculatePropertyHealthScore(
      createRoutingSupabase({
        units: [{ status: "vacant" }, { status: "vacant" }],
        rent_transactions: [{ status: "overdue" }, { status: "overdue" }, { status: "overdue" }, { status: "overdue" }],
        maintenance_tickets: tickets,
        leases: Array.from({ length: 6 }, () => ({ end_date: "2026-11-01" })),
        discrepancies: Array.from({ length: 6 }, () => ({ confidence: 0.9, status: "flagged" })),
      }),
      PROP
    );
    for (const d of dims) expect(h[d].score).toBeGreaterThanOrEqual(0);
    expect(h.revenue.score).toBe(0);
    expect(h.occupancy.score).toBe(0);
    expect(h.tenant_quality.score).toBe(4);
    expect(h.contracts.score).toBe(2);
    expect(h.energy.score).toBe(0);
    expect(h.maintenance.score).toBe(0); // 10 − 7 − 2 − 2 = −1 → clamped to 0
    expect(h.financial.score).toBe(0);
    expect(h.cctv_security.score).toBe(0);
  });

  test.each([
    [41, 10],
    [40, 8],
    [30.5, 8],
    [30, 6],
    [20, 4],
    [10, 2],
    [0.1, 2],
    [0, 0],
  ])("financial: margin %f%% → %i", async (margin, score) => {
    f.getFinanceOverview.mockResolvedValue(finance({ profit_margin_pct: margin }));
    expect((await calculatePropertyHealthScore(createRoutingSupabase({}), PROP)).financial.score).toBe(score);
  });

  test("tenant quality ignores resolved/dismissed and low-confidence discrepancies", async () => {
    const h = await calculatePropertyHealthScore(
      createRoutingSupabase({
        discrepancies: [
          { confidence: 0.75, status: "flagged" },
          { confidence: 0.74, status: "flagged" },
          { confidence: 0.99, status: "resolved" },
          { confidence: 0.99, status: "dismissed" },
        ],
      }),
      PROP
    );
    expect(h.tenant_quality.score).toBe(9);
    expect(h.tenant_quality.detail).toBe("1 high-risk discrepancies this month");
  });

  test("revenue: partial collection rounds and overdue ≤3 earns +2", async () => {
    const h = await calculatePropertyHealthScore(
      createRoutingSupabase({ rent_transactions: [{ status: "paid" }, { status: "paid" }, { status: "overdue" }] }),
      PROP
    );
    expect(h.revenue.score).toBe(Math.round((2 / 3) * 10) + 2);
    expect(h.revenue.detail).toBe("2/3 paid (67%), 1 overdue");
  });

  test("CCTV with zero cameras is treated as 0% uptime (−2)", async () => {
    f.getCCTVDashboardData.mockResolvedValue({ cameras_total: 0, cameras_online: 0, security_alerts: 0 });
    expect((await calculatePropertyHealthScore(createRoutingSupabase({}), PROP)).cctv_security.score).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-engine: generateDailyBriefing", () => {
  test.each([
    ["2026-10-26T06:00:00Z", "Good morning"],
    ["2026-10-26T11:59:00Z", "Good morning"],
    ["2026-10-26T12:00:00Z", "Good afternoon"],
    ["2026-10-26T16:59:00Z", "Good afternoon"],
    ["2026-10-26T17:00:00Z", "Good evening"],
  ])("at %s greets with '%s'", async (iso, greeting) => {
    vi.setSystemTime(new Date(iso));
    const b = await generateDailyBriefing(createRoutingSupabase({}), PROP);
    expect(b.greeting).toBe(greeting);
    expect(b.date).toBe(iso.slice(0, 10));
  });

  test("empty data: every section has a fallback line and only the low-priority default action", async () => {
    const b = await generateDailyBriefing(createRoutingSupabase({}), PROP);
    expect(Object.keys(b.sections)).toHaveLength(10);
    for (const s of Object.values(b.sections)) expect(s.items.length).toBeGreaterThan(0);
    expect(b.sections.revenue.items.map((i) => i.text)).toEqual([
      "No new discrepancies detected this month",
      "All rent payments up to date",
    ]);
    expect(b.sections.learning.items[0].text).toBe("Learning engine initializing");
    expect(b.top_actions).toEqual([
      { text: "Review tenant analytics for optimization opportunities", link: "/dashboard/tenant-analytics", priority: "low" },
    ]);
  });

  test("overdue total and action list are computed and capped at 5", async () => {
    f.getDiscrepancySummary.mockResolvedValue({ total_discrepancies: 2, total_potential_recovery_egp: 1234.5, by_confidence: { high: 2 } });
    f.getSecurityAlerts.mockResolvedValue({ total_active: 2 });
    f.getMarketingOverview.mockResolvedValue({
      active_events: { count: 0 },
      upcoming_events: { count: 0 },
      active_campaigns: { count: 0 },
      next_major_season: { name: "Christmas" },
      days_until_next_season: 20,
    });
    const db = createRoutingSupabase({
      maintenance_tickets: [{ priority: "emergency" }, { priority: "low" }],
      rent_transactions: [{ amount_due: 1000, amount_paid: 250 }, { amount_due: 500, amount_paid: null }],
      leases: [{ end_date: "2026-11-15" }, { end_date: "2031-01-01" }],
    });
    const b = await generateDailyBriefing(db, PROP);
    expect(b.sections.revenue.items[0]).toEqual({ text: "2 discrepancies flagged — EGP 1,235 potential recovery", alert: true });
    expect(b.sections.revenue.items[1]).toEqual({ text: "EGP 1,250 overdue from 2 transactions", alert: true });
    expect(b.sections.contracts.items[0]).toEqual({ text: "1 leases expiring within 90 days", alert: false });
    expect(b.sections.maintenance.items).toEqual([
      { text: "2 open tickets", alert: true },
      { text: "1 urgent/emergency need attention", alert: true },
    ]);
    expect(b.top_actions).toHaveLength(5);
    expect(b.top_actions.map((a) => a.link)).toEqual([
      "/dashboard/maintenance",
      "/dashboard/discrepancies",
      "/dashboard/contracts",
      "/dashboard/finance",
      "/dashboard/cctv",
    ]);
    expect(b.sections.marketing.items).toEqual([{ text: "No active events or campaigns" }]);
  });

  test("energy trend is inverted (more consumption = 'down') and alerts above +15%", async () => {
    f.getEnergyOverview.mockResolvedValue(energy({ change_vs_yesterday_pct: 16 }));
    let b = await generateDailyBriefing(createRoutingSupabase({}), PROP);
    expect(b.sections.energy.items[1]).toEqual({ text: "Up 16% vs yesterday", trend: "down", alert: true });
    f.getEnergyOverview.mockResolvedValue(energy({ change_vs_yesterday_pct: -15 }));
    b = await generateDailyBriefing(createRoutingSupabase({}), PROP);
    expect(b.sections.energy.items[1]).toEqual({ text: "Down 15% vs yesterday", trend: "up", alert: false });
    f.getEnergyOverview.mockResolvedValue(energy({ change_vs_yesterday_pct: 0 }));
    b = await generateDailyBriefing(createRoutingSupabase({}), PROP);
    expect(b.sections.energy.items).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-engine: getPropertySnapshot", () => {
  test("empty data → zeroed metrics, 100% occupancy, 'N/A' top tenant", async () => {
    const s = await getPropertySnapshot(createRoutingSupabase({}), PROP);
    expect(s).toMatchObject({
      tenants: { total: 0, by_category: {} },
      occupancy_rate: 100,
      revenue_this_month: 0,
      footfall_today: 0,
      open_maintenance: 0,
      health_score: 75,
      top_insights: [],
      top_tenant_by_rent: "N/A",
      kiosk_revenue_total: 0,
      dead_zones_count: 0,
      anomalies_active: 0,
    });
  });

  test("aggregates seeded rows and rounds percentages to 1 dp", async () => {
    f.getDeadZones.mockResolvedValue([{ relative_traffic: 19 }, { relative_traffic: 20 }, { relative_traffic: 5 }]);
    f.getStoreConversion.mockResolvedValue({ avg_conversion_rate: 12.345, stores: [], bottom_converters: [], top_converters: [] });
    f.getCCTVDashboardData.mockResolvedValue({ security_alerts: 3, parking_occupancy_pct: 66.6, cameras_total: 0, cameras_online: 0 });
    f.getPortfolioAnalytics.mockResolvedValue(portfolio({ total_contracted_rent: 1234.6, tenant_concentration: [{ brand_name: "Spinneys" }] }));
    f.getSocialOverview.mockResolvedValue({ total_followers: 10, best_platform: "x", platforms: [{ follower_growth_30d: 3, posts_this_month: 0 }, { follower_growth_30d: 4, posts_this_month: 0 }] });
    const db = createRoutingSupabase({
      tenants: [{ category: "food" }, { category: "food" }, { category: "fashion" }],
      units: [{ status: "occupied" }, { status: "occupied" }, { status: "maintenance" }],
      rent_transactions: [{ amount_paid: "100.4" }, { amount_paid: 200 }],
      maintenance_tickets: [{ priority: "urgent" }, { priority: "normal" }],
      leases: [{ min_rent_monthly_egp: 1000 }, { min_rent_monthly_egp: null }],
    });
    const s = await getPropertySnapshot(db, PROP);
    expect(s.tenants).toEqual({ total: 3, by_category: { food: 2, fashion: 1 } });
    expect(s.occupancy_rate).toBe(66.7); // maintenance units count as not occupied here
    expect(s.revenue_this_month).toBe(300);
    expect(s.urgent_maintenance).toBe(1);
    expect(s.dead_zones_count).toBe(2);
    expect(s.store_avg_conversion_rate).toBe(12.3);
    expect(s.parking_occupancy_pct).toBe(67);
    expect(s.total_monthly_rent_egp).toBe(1235);
    expect(s.top_tenant_by_rent).toBe("Spinneys");
    expect(s.kiosk_revenue_total).toBe(1000);
    expect(s.social_growth).toBe(7);
    expect(s.top_insights.length).toBeLessThanOrEqual(5);
  });
});
