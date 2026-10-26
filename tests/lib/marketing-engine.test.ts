/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMarketingOverview,
  getSeasonalCalendar,
  getEventPerformance,
  getCampaignROI,
  getEventFootfallCorrelation,
  getUpcomingSeasonalAlerts,
  getTenantPromotions,
} from "@/lib/marketing-engine";
import { createScriptedSupabase, type QueryCtx } from "./helpers/scripted-supabase";

const PROP = "a0000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-10-26T12:00:00Z"); // TZ is UTC in this environment

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}
/** YYYY-MM-DD n days from the (faked) current date. */
function plus(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const season = (over: Record<string, any>) => ({
  id: over.name,
  type: "shopping_event",
  footfall_impact: "high",
  revenue_impact: "high",
  tourist_ratio_change: null,
  planning_notes: null,
  is_recurring: true,
  ...over,
});

// ── Overview ─────────────────────────────────────────────────

describe("marketing-engine: getMarketingOverview", () => {
  test("empty database → zero counts, no next season and -1 days", async () => {
    const r = await getMarketingOverview(createScriptedSupabase(() => []));
    expect(r).toEqual({
      active_events: { count: 0, list: [] },
      upcoming_events: { count: 0, list: [] },
      active_campaigns: { count: 0, list: [] },
      active_promotions: 0,
      total_marketing_spend_this_month: 0,
      next_major_season: null,
      days_until_next_season: -1,
    });
  });

  test("splits active vs upcoming (planned within 30 days inclusive) events and sums monthly spend", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "events") return [
        { id: "past", status: "planned", start_date: "2026-10-25" },
        { id: "today", status: "planned", start_date: "2026-10-26" },
        { id: "edge", status: "planned", start_date: "2026-11-25" },
        { id: "far", status: "planned", start_date: "2026-11-26" },
        { id: "live", status: "active", start_date: "2026-01-01" },
      ];
      if (ctx.table === "campaigns" && ctx.has("lte", "start_date"))
        return [{ spend_egp: 12000 }, { spend_egp: null }, { spend_egp: 3000.5 }];
      if (ctx.table === "campaigns") return [{ id: "c1", status: "active" }, { id: "c2", status: "draft" }];
      if (ctx.table === "tenant_promotions") return [{ id: "p1" }, { id: "p2" }];
      return [];
    });
    const r = await getMarketingOverview(sb, PROP);
    expect(r.active_events.list.map((e) => e.id)).toEqual(["live"]);
    expect(r.upcoming_events.list.map((e) => e.id)).toEqual(["today", "edge"]);
    expect(r.active_campaigns.count).toBe(1);
    expect(r.active_promotions).toBe(2);
    expect(r.total_marketing_spend_this_month).toBe(15000.5);
    const spendQ = sb._calls.find((c: QueryCtx) => c.table === "campaigns" && c.has("lte", "start_date"));
    expect(spendQ.arg("lte", "start_date")).toBe("2026-10-26");
    expect(spendQ.arg("gte", "end_date")).toBe("2026-10-01");
  });

  test("next major season is the nearest future high/very_high item with planning guidance", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "seasonal_calendar"
        ? [
            season({ name: "Christmas", typical_start_month: 12, typical_start_day: 25, footfall_impact: "high", type: "international" }),
            season({ name: "Local fair", typical_start_month: 11, typical_start_day: 1, footfall_impact: "moderate" }),
            season({ name: "White Friday", typical_start_month: 11, typical_start_day: 27, typical_end_month: 11, typical_end_day: 30, footfall_impact: "very_high" }),
            season({ name: "Summer", typical_start_month: 7, typical_start_day: 1, footfall_impact: "very_high" }),
            season({ name: "Undated", footfall_impact: "very_high" }),
          ]
        : []
    );
    const r = await getMarketingOverview(sb, PROP);
    expect(r.next_major_season).toMatchObject({
      name: "White Friday",
      start_date: "2026-11-27",
      end_date: "2026-11-30",
      days_away: 32,
      planning_status: "Should Start",
    });
    // very_high → 60 day planning lead; 32 ≤ 60 → "start now"
    expect(r.next_major_season!.ai_recommendation).toBe(
      "Start White Friday campaign NOW. 32 days remaining. Book advertising, brief tenants, confirm event logistics."
    );
    expect(r.days_until_next_season).toBe(32);
  });

  // BUG: marketing-engine.ts:301-319 (resolveSeasonDate with currentYear only) — recurring
  // seasons are only ever resolved in the current calendar year. On 20 Dec, a recurring
  // high-impact season on 7 Jan resolves to 7 Jan *this* year (days_away -347) and is
  // filtered out, so the overview reports no upcoming season at all.
  test.fails("at year end, a recurring season early next year is the next major season", async () => {
    at("2026-12-20T12:00:00Z");
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "seasonal_calendar"
        ? [season({ name: "Coptic Christmas", typical_start_month: 1, typical_start_day: 7, type: "religious" })]
        : []
    );
    const r = await getMarketingOverview(sb, PROP);
    expect(r.next_major_season?.name).toBe("Coptic Christmas");
    expect(r.days_until_next_season).toBe(18);
  });
});

// ── Seasonal calendar ────────────────────────────────────────

describe("marketing-engine: getSeasonalCalendar", () => {
  test("empty → []", async () => {
    expect(await getSeasonalCalendar(createScriptedSupabase(() => []))).toEqual([]);
  });

  test("resolves dates: year-specific overrides, explicit year, missing end, year wrap and default end day", async () => {
    const sb = createScriptedSupabase(() => [
      season({ name: "Eid", year_specific_start: "2027-03-20", year_specific_end: null, typical_start_month: 1, typical_start_day: 1 }),
      season({ name: "Single", typical_start_month: 5, typical_start_day: 9 }),
      season({ name: "Winter sun", type: "tourist_season", typical_start_month: 12, typical_start_day: 1, typical_end_month: 2, typical_end_day: 28 }),
      season({ name: "NoEndDay", typical_start_month: 3, typical_start_day: 5, typical_end_month: 4 }),
      season({ name: "Undated" }),
    ]);
    const r = await getSeasonalCalendar(sb, PROP, 2027);
    const by = Object.fromEntries(r.map((s) => [s.name, s]));
    expect([by.Eid.start_date, by.Eid.end_date]).toEqual(["2027-03-20", "2027-03-20"]);
    expect([by.Single.start_date, by.Single.end_date]).toEqual(["2027-05-09", "2027-05-09"]);
    expect([by["Winter sun"].start_date, by["Winter sun"].end_date]).toEqual(["2027-12-01", "2028-02-28"]);
    expect(by.NoEndDay.end_date).toBe("2027-04-01");
    expect(by.Undated).toMatchObject({ start_date: null, days_away: null, planning_status: "N/A", ai_recommendation: "Set dates for this season to enable planning." });
    expect(sb._calls[0].filters).toContainEqual(["order", "typical_start_month", { ascending: true }]);
  });

  test.each([
    [-1, "In Progress"],
    [0, "Final Prep"],
    [7, "Final Prep"],
    [8, "Active Planning"],
    [30, "Active Planning"],
    [31, "Should Start"],
    [60, "Should Start"],
    [61, "Early Planning"],
    [90, "Early Planning"],
    [91, "Not Started"],
  ])("planning status at %i days away is %s", async (days, status) => {
    const sb = createScriptedSupabase(() => [season({ name: "S", year_specific_start: plus(days) })]);
    const [s] = await getSeasonalCalendar(sb, PROP);
    expect(s.days_away).toBe(days);
    expect(s.planning_status).toBe(status);
  });

  test("AI recommendation depends on impact-specific planning lead and season type", async () => {
    const sb = createScriptedSupabase(() => [
      season({ name: "Active", year_specific_start: plus(-2) }),
      season({ name: "Soon", year_specific_start: plus(1) }),
      season({ name: "LowBegin", footfall_impact: "low", year_specific_start: plus(20) }), // 14 < 20 ≤ 21
      season({ name: "LowFar", footfall_impact: "low", type: "school_holiday", year_specific_start: plus(22) }),
      season({ name: "Mystery", footfall_impact: "unknown", type: "other", year_specific_start: plus(100) }),
    ]);
    const r = await getSeasonalCalendar(sb, PROP);
    const rec = Object.fromEntries(r.map((s) => [s.name, s.ai_recommendation]));
    expect(rec.Active).toBe("Currently active — monitor performance and adjust in real-time.");
    expect(rec.Soon).toBe("Soon is in 1 days — final preparations only. Ensure all logistics are confirmed.");
    expect(rec.LowBegin).toMatch(/^Begin planning for LowBegin\. 20 days away/);
    expect(rec.LowFar).toBe(
      "LowFar in 22 days. Focus on family shopping promotions and kids activities. Recommended planning start: 14 days before."
    );
    expect(rec.Mystery).toBe("Mystery in 100 days. Start strategic planning. Recommended planning start: 30 days before.");
  });
});

// ── Event performance ────────────────────────────────────────

describe("marketing-engine: getEventPerformance", () => {
  test("no completed events → explanatory insight", async () => {
    expect(await getEventPerformance(createScriptedSupabase(() => []))).toEqual({ events: [], ai_insight: "No completed events to analyze yet." });
  });

  test("computes ROI, budget variance and rating thresholds (≥1.1 over, <0.85 under)", async () => {
    const ev = (id: string, over: Record<string, any>) => ({ id, title: id, event_type: "concert", start_date: "2026-09-01", end_date: "2026-09-02", ...over });
    const sb = createScriptedSupabase(() => [
      ev("over", { expected_footfall_boost_pct: 20, actual_footfall_boost_pct: 22, budget_egp: 100000, actual_cost_egp: 120000, revenue_impact_egp: 300000 }),
      ev("edge", { expected_footfall_boost_pct: 20, actual_footfall_boost_pct: 17 }),
      ev("under", { event_type: "kids", expected_footfall_boost_pct: 20, actual_footfall_boost_pct: 16.9, actual_cost_egp: 50000, revenue_impact_egp: 60000 }),
      ev("noexp", { expected_footfall_boost_pct: null, actual_footfall_boost_pct: 50 }),
      ev("noact", { expected_footfall_boost_pct: 10, actual_footfall_boost_pct: null }),
    ]);
    const { events, ai_insight } = await getEventPerformance(sb, PROP);
    const by = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(by.over).toMatchObject({ roi_pct: 150, budget_variance_pct: 20, performance_rating: "overperformer" });
    expect(by.edge.performance_rating).toBe("on_target");
    expect(by.edge.roi_pct).toBeNull();
    expect(by.under).toMatchObject({ performance_rating: "underperformer", roi_pct: 20, budget_variance_pct: null });
    expect(by.noexp).toMatchObject({ expected_boost: 0, performance_rating: "on_target" });
    expect(by.noact.performance_rating).toBe("on_target");
    expect(ai_insight).toBe(
      "1 events overperformed — avg actual boost of 22% vs expectations " +
        "1 events underperformed. Review targeting and budget allocation. " +
        "Best event type by ROI: concert events (avg 150% ROI). Allocate more budget here."
    );
  });

  test("events with no rating signals and no ROI produce the 'building up' insight", async () => {
    const sb = createScriptedSupabase(() => [{ id: "e", event_type: "x", expected_footfall_boost_pct: 10, actual_footfall_boost_pct: 10 }]);
    const r = await getEventPerformance(sb);
    expect(r.ai_insight).toMatch(/^Event performance data is building up/);
  });

  // BUG: marketing-engine.ts:421-424 uses `actualCost && revenueImpact`, so a genuine
  // revenue impact of 0 is treated as missing and ROI becomes null instead of -100%.
  // (Same falsy-zero issue for budget_variance when budget_egp is 0.)
  test.fails("an event that cost money but generated zero revenue has ROI of -100%", async () => {
    const sb = createScriptedSupabase(() => [
      { id: "flop", title: "Flop", event_type: "x", expected_footfall_boost_pct: 10, actual_footfall_boost_pct: 2, budget_egp: 10000, actual_cost_egp: 10000, revenue_impact_egp: 0 },
    ]);
    const { events } = await getEventPerformance(sb);
    expect(events[0].roi_pct).toBe(-100);
  });
});

// ── Campaign ROI ─────────────────────────────────────────────

describe("marketing-engine: getCampaignROI", () => {
  test("empty → N/A summary", async () => {
    expect(await getCampaignROI(createScriptedSupabase(() => []))).toEqual({
      campaigns: [], total_spend: 0, avg_roi: 0, best_campaign_type: "N/A", recommendation: "No campaign data available yet.",
    });
  });

  test("averages ROI over completed campaigns only, totals all spend, picks best type", async () => {
    const sb = createScriptedSupabase(() => [
      { id: "1", campaign_type: "social_media", spend_egp: 10000, roi_pct: 200, status: "completed" },
      { id: "2", campaign_type: "social_media", spend_egp: 5000, roi_pct: 100.333, status: "completed" },
      { id: "3", campaign_type: "billboard", spend_egp: 1000000, roi_pct: 120, status: "completed" },
      { id: "4", campaign_type: "radio", spend_egp: null, roi_pct: 900, status: "active" },
      { id: "5", campaign_type: "radio", spend_egp: 2000, roi_pct: null, status: "completed" },
    ]);
    const r = await getCampaignROI(sb, PROP);
    expect(r.campaigns[3].spend_egp).toBe(0);
    expect(r.total_spend).toBe(1017000);
    expect(r.avg_roi).toBe(140.11); // (200 + 100.333 + 120) / 3
    expect(r.best_campaign_type).toBe("social_media");
    expect(r.recommendation).toBe(
      "social media campaigns deliver the highest ROI (avg 150%). Consider increasing budget allocation for this channel. Total marketing spend: EGP 1,017,000."
    );
  });

  test("no completed campaigns → avg 0 and 'continue building' guidance", async () => {
    const r = await getCampaignROI(createScriptedSupabase(() => [{ id: "1", campaign_type: "x", spend_egp: 100, roi_pct: 50, status: "active" }]));
    expect(r.avg_roi).toBe(0);
    expect(r.best_campaign_type).toBe("N/A");
    expect(r.recommendation).toBe("Continue building campaign data for better ROI analysis.");
  });
});

// ── Footfall correlation ─────────────────────────────────────

describe("marketing-engine: getEventFootfallCorrelation", () => {
  const event = { id: "E1", title: "Kids Fest", event_type: "kids", start_date: "2026-10-10", end_date: "2026-10-12" };

  test("no completed events → []", async () => {
    expect(await getEventFootfallCorrelation(createScriptedSupabase(() => []))).toEqual([]);
  });

  test("compares event daily average (inclusive day count) against a start-37..start-7 baseline", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "events") return [event];
      if (ctx.arg("gte", "date") === "2026-10-10") return [{ total_in: 1500 }, { total_in: 1500 }, { total_in: 1500 }];
      return Array.from({ length: 30 }, () => ({ total_in: 1000 }));
    });
    const [c] = await getEventFootfallCorrelation(sb, PROP);
    expect(c).toMatchObject({ event_daily_footfall: 1500, baseline_daily_footfall: 1000, actual_boost_pct: 50 });
    const baseQ = sb._calls.filter((q: QueryCtx) => q.table === "footfall_daily")[1];
    expect(baseQ.arg("gte", "date")).toBe("2026-09-03");
    expect(baseQ.arg("lte", "date")).toBe("2026-10-03");
  });

  test("baseline window crosses a year boundary correctly", async () => {
    const sb = createScriptedSupabase((ctx) => (ctx.table === "events" ? [{ ...event, start_date: "2027-01-05", end_date: "2027-01-05" }] : []));
    await getEventFootfallCorrelation(sb);
    const baseQ = sb._calls.filter((q: QueryCtx) => q.table === "footfall_daily")[1];
    expect(baseQ.arg("gte", "date")).toBe("2026-11-29");
    expect(baseQ.arg("lte", "date")).toBe("2026-12-29");
  });

  test("missing baseline data yields 0% boost rather than Infinity/NaN", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "events") return [event];
      if (ctx.arg("gte", "date") === "2026-10-10") return [{ total_in: 900 }];
      return [];
    });
    const [c] = await getEventFootfallCorrelation(sb);
    expect(c).toMatchObject({ baseline_daily_footfall: 0, event_daily_footfall: 300, actual_boost_pct: 0 });
  });

  // BUG: marketing-engine.ts:615-640 — the event average divides by calendar days while the
  // baseline divides by the number of *rows*. footfall_daily has one row per zone per day,
  // so with N zones the event average is N× the baseline even when traffic is identical.
  test.fails("identical per-zone traffic in event and baseline windows yields 0% boost", async () => {
    // 1-day event, 2 zones × 1000 visitors; baseline has the exact same per-day traffic.
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "events") return [{ ...event, end_date: "2026-10-10" }];
      if (ctx.arg("gte", "date") === "2026-10-10") return [{ total_in: 1000 }, { total_in: 1000 }];
      return Array.from({ length: 62 }, () => ({ total_in: 1000 })); // 31 days × 2 zones
    });
    const [c] = await getEventFootfallCorrelation(sb);
    expect(c.actual_boost_pct).toBe(0);
  });
});

// ── Seasonal alerts ──────────────────────────────────────────

describe("marketing-engine: getUpcomingSeasonalAlerts", () => {
  test("empty → []", async () => {
    expect(await getUpcomingSeasonalAlerts(createScriptedSupabase(() => []))).toEqual([]);
  });

  test("urgency tiers, 90-day horizon, singular/plural wording and sort order", async () => {
    const sb = createScriptedSupabase(() => [
      season({ name: "D46", year_specific_start: plus(46) }),
      season({ name: "D1", year_specific_start: plus(1) }),
      season({ name: "D91", year_specific_start: plus(91) }),
      season({ name: "D14", year_specific_start: plus(14) }),
      season({ name: "D15", year_specific_start: plus(15) }),
      season({ name: "D3", year_specific_start: plus(3) }),
      season({ name: "D45", year_specific_start: plus(45) }),
      season({ name: "D90", year_specific_start: plus(90) }),
      season({ name: "Running", year_specific_start: plus(-3), year_specific_end: plus(5) }),
      season({ name: "LongOver", year_specific_start: plus(-30), year_specific_end: plus(-10) }),
      season({ name: "NoDates" }),
    ]);
    const r = await getUpcomingSeasonalAlerts(sb, PROP);
    expect(r.map((a) => [a.name, a.urgency])).toEqual([
      ["D1", "critical"], ["D3", "critical"], ["D14", "critical"],
      ["D15", "warning"], ["D45", "warning"],
      ["Running", "info"], ["D46", "info"], ["D90", "info"],
    ]);
    const msg = Object.fromEntries(r.map((a) => [a.name, a.message]));
    expect(msg.D1).toBe("D1 starts in 1 day — final preparations. Ensure all logistics are locked in.");
    expect(msg.D3).toContain("starts in 3 days");
    expect(msg.D14).toContain("active planning phase");
    expect(msg.D45).toContain("start planning NOW");
    expect(msg.D90).toContain("early planning window");
    expect(msg.Running).toBe("Running is currently active — monitor performance and optimize in real-time.");
  });

  test("action items vary by season type; religious adds the 30-day campaign item only when >14 days out", async () => {
    const sb = createScriptedSupabase(() => [
      season({ name: "RelFar", type: "religious", year_specific_start: plus(20) }),
      season({ name: "RelNear", type: "religious", year_specific_start: plus(10) }),
      season({ name: "Tour", type: "tourist_season", year_specific_start: plus(5) }),
      season({ name: "Nat", type: "national", year_specific_start: plus(5) }),
      season({ name: "School", type: "school_holiday", year_specific_start: plus(5) }),
      season({ name: "Other", type: "misc", year_specific_start: plus(5) }),
    ]);
    const r = await getUpcomingSeasonalAlerts(sb);
    const items = Object.fromEntries(r.map((a) => [a.name, a.action_items]));
    expect(items.RelFar).toHaveLength(4);
    expect(items.RelFar).toContain("Launch marketing campaign 30 days before");
    expect(items.RelNear).toHaveLength(3);
    expect(items.Tour[0]).toBe("Prepare multilingual signage (English, Russian, German)");
    expect(items.Nat).toHaveLength(2);
    expect(items.School).toHaveLength(2);
    expect(items.Other).toEqual([]);
  });

  // BUG: marketing-engine.ts:159-189 / 680 — a season that wraps the year (Dec→Feb) is always
  // resolved with start in the *current* year. On 15 Jan the Dec 1 – Feb 28 season is
  // actually running, but it resolves to 1 Dec of this year (320 days away) and is dropped.
  test.fails("a Dec→Feb season is reported as currently active in mid-January", async () => {
    at("2027-01-15T12:00:00Z");
    const sb = createScriptedSupabase(() => [
      season({ name: "Winter sun", type: "tourist_season", typical_start_month: 12, typical_start_day: 1, typical_end_month: 2, typical_end_day: 28 }),
    ]);
    const r = await getUpcomingSeasonalAlerts(sb);
    expect(r).toHaveLength(1);
    expect(r[0].message).toContain("currently active");
  });

  // BUG: marketing-engine.ts:686,717-718 — seasons are kept for up to 7 days after they END,
  // and every season with a past start date is labelled "currently active", so a season
  // that finished 3 days ago is reported as still running.
  test.fails("a season that already ended is not described as currently active", async () => {
    const sb = createScriptedSupabase(() => [season({ name: "Done", year_specific_start: plus(-10), year_specific_end: plus(-3) })]);
    const r = await getUpcomingSeasonalAlerts(sb);
    expect(r.every((a) => !a.message.includes("currently active"))).toBe(true);
  });
});

// ── Tenant promotions ────────────────────────────────────────

describe("marketing-engine: getTenantPromotions", () => {
  test("maps rows, falls back to Unknown brand, and filters by status only when given", async () => {
    const sb = createScriptedSupabase(() => [
      { id: "p1", tenant_id: "T1", tenants: { brand_name: "Adidas" }, title: "20% off", discount_pct: 20, status: "active" },
      { id: "p2", tenant_id: "T2", tenants: null, title: "BOGO", discount_pct: null, status: "active" },
    ]);
    const r = await getTenantPromotions(sb, PROP);
    expect(r.map((p) => p.tenant_name)).toEqual(["Adidas", "Unknown"]);
    expect(r[1].discount_pct).toBeNull();
    expect(sb._calls[0].has("eq", "status")).toBe(false);
    await getTenantPromotions(sb, PROP, "expired");
    expect(sb._calls[1].eq("status")).toBe("expired");
  });

  test("no rows → []", async () => {
    expect(await getTenantPromotions(createScriptedSupabase(() => null))).toEqual([]);
  });
});
