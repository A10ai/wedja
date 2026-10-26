// @vitest-environment node
/**
 * PostgREST returns at most `max_rows` (1000) rows per select. Every
 * aggregate over a high-volume table must page with fetchAll(), or totals are
 * silently computed from the first 1000 rows only.
 *
 * Each test feeds a mock table with more than 1000 rows where the rows past
 * 1000 change the answer, so a truncated read fails the assertion. The mocks
 * slice data on `.range(from, to)` the way PostgREST does.
 */
import { describe, test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabase as createMock } from "./helpers/supabase-mock";
import { createRoutingSupabase } from "./helpers/routing-supabase-mock";
import { fetchAll } from "@/lib/supabase/fetch-all";

import { calculatePercentageRent } from "@/lib/percentage-rent-engine";
import { getProfitAndLoss } from "@/lib/finance-engine";
import { getPercentageRateAnalysis } from "@/lib/tenant-analytics";
import { getLeasePerformance } from "@/lib/contract-engine";
import { getEnergyHourly } from "@/lib/energy-engine";
import { runAnomalyDetection } from "@/lib/anomaly-engine";
import { getFootfallTrend } from "@/lib/footfall-engine";
import { runLearningCycle } from "@/lib/learning-engine";
import { trainFootfallModel } from "@/lib/prediction-model";
import { getVisitorFlowData } from "@/lib/heatmap-engine";
import { getDemographics } from "@/lib/cctv-engine";
import { getAuditStats } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

const state = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ requireAuth: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.supabase }));

import { GET as dashboardStatsGET } from "@/app/api/v1/dashboard/stats/route";
import { GET as eventsGET } from "@/app/api/v1/ai/events/route";

/** Mock that behaves like PostgREST: every select returns at most 1000 rows. */
const createMockSupabase = (tables: Record<string, any>) => createMock(tables, { maxRows: 1000 });

const PROP = "a0000000-0000-0000-0000-000000000001";
const N = 1500; // > one PostgREST page

/** n rows; rows from index 1000 on get `late` merged in. */
function rows(n: number, base: (i: number) => any, late: (i: number) => any = () => ({})) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, ...base(i), ...(i >= 1000 ? late(i) : {}) }));
}

const rangesOn = (sb: any, table: string) =>
  sb._calls.filter((c: any) => c.table === table).flatMap((c: any) => c.filters.filter((f: string) => f.startsWith("range(")));

describe("mock + fetchAll contract", () => {
  test("mock slices on range(); fetchAll walks pages until a short one", async () => {
    const sb = createMockSupabase({ t: rows(2345, () => ({})) });
    const all = await fetchAll((from, to) => sb.from("t").select("*").order("id").range(from, to));
    expect(all).toHaveLength(2345);
    expect(rangesOn(sb, "t")).toEqual(["range(0, 999)", "range(1000, 1999)", "range(2000, 2999)"]);
  });

  test("without range() the default mock still returns all configured rows (backward compatible)", async () => {
    const sb = createMock({ t: rows(1200, () => ({})) });
    const { data } = await sb.from("t").select("*");
    expect(data).toHaveLength(1200);
  });

  test("maxRows emulates the PostgREST cap on an unpaged select", async () => {
    const sb = createMockSupabase({ t: rows(1200, () => ({})) });
    const { data } = await sb.from("t").select("*");
    expect(data).toHaveLength(1000);
  });
});

describe("row cap: percentage-rent-engine", () => {
  test("reported sales for a tenant whose row is past row 1000 are used", async () => {
    const sb = createMockSupabase({
      leases: [{ tenant_id: "late", min_rent_monthly_egp: 0, percentage_rate: 10, tenant: { name: "Late" }, unit: {} }],
      tenant_sales_reported: rows(N, (i) => ({ tenant_id: `other-${i}`, reported_revenue_egp: 1 }), () => ({
        tenant_id: "late",
        reported_revenue_egp: 50_000,
      })),
      revenue_estimates: [],
    });
    const r = await calculatePercentageRent(sb, PROP, 3, 2026);
    expect(r.tenants[0].reported_sales).toBe(50_000);
    expect(rangesOn(sb, "tenant_sales_reported")).toContain("range(1000, 1999)");
  });
});

describe("row cap: finance-engine", () => {
  test("P&L rent collected sums every rent_transactions row", async () => {
    const sb = createMockSupabase({ rent_transactions: rows(N, () => ({ amount_paid: 10 })), expenses: [] });
    const pnl = await getProfitAndLoss(sb, PROP, 3, 2026);
    expect(pnl.income.rent_collected).toBe(N * 10);
  });
});

describe("row cap: tenant-analytics", () => {
  test("average reported sales include rows past 1000", async () => {
    const sb = createMockSupabase({
      leases: [{
        tenant_id: "t1", unit_id: "u1", min_rent_monthly_egp: 0, percentage_rate: 10,
        tenant: { id: "t1", name: "T1", brand_name: "T1", category: "fashion" },
        unit: { id: "u1", unit_number: "1", area_sqm: 10 },
      }],
      tenant_sales_reported: rows(N, () => ({ tenant_id: "t1", reported_revenue_egp: 100 }), () => ({ reported_revenue_egp: 400 })),
    });
    const r = await getPercentageRateAnalysis(sb, PROP);
    // (1000*100 + 500*400) / 1500 = 200; truncated would be 100
    expect(r.tenants[0].reported_sales).toBe(200);
  });
});

describe("row cap: contract-engine", () => {
  test("lease payment history counts every transaction", async () => {
    const sb = createMockSupabase({
      leases: [{
        id: "L1", tenant_id: "T1", status: "active", min_rent_monthly_egp: 0, percentage_rate: 10,
        tenant: { name: "T1" }, unit: { area_sqm: 10 },
      }],
      rent_transactions: rows(N, () => ({ lease_id: "L1", amount_due: 10, amount_paid: 10, status: "paid" })),
      tenant_sales_reported: [],
    });
    const [perf] = await getLeasePerformance(sb, PROP);
    expect(perf.total_months).toBe(N);
    expect(perf.total_paid).toBe(N * 10);
  });
});

describe("row cap: energy-engine", () => {
  test("hourly totals include readings past row 1000", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }],
      energy_readings: rows(N, () => ({ timestamp: "2026-03-01T10:00:00", consumption_kwh: 1, cost_egp: 2 })),
    });
    const hourly = await getEnergyHourly(sb, PROP, "2026-03-01");
    expect(hourly.reduce((s: number, h: any) => s + h.consumption_kwh, 0)).toBe(N);
  });
});

describe("row cap: anomaly-engine", () => {
  test("today's zone footfall sums every footfall_daily row", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "Zone One", type: "retail" }],
      footfall_daily: rows(N, () => ({ zone_id: "z1", total_in: 1, date: "2026-03-01" })),
      energy_readings: [],
      rent_transactions: [],
      tenant_sales_reported: [],
      parking_readings: [],
      maintenance_tickets: [],
      queue_readings: [],
      anomalies: [],
    });
    await runAnomalyDetection(sb, PROP);
    const spike = sb._calls
      .filter((c: any) => c.table === "anomalies")
      .flatMap((c: any) => c.payloads)
      .find((p: any) => p?.anomaly_type === "footfall_spike");
    expect(spike?.actual_value).toBe(N);
  });
});

describe("row cap: footfall-engine", () => {
  test("daily trend includes dates that only appear past row 1000", async () => {
    const sb = createMockSupabase({
      footfall_daily: rows(N, () => ({ date: "2026-03-01", total_in: 1, total_out: 1 }), () => ({ date: "2026-03-02" })),
    });
    const trend = await getFootfallTrend(sb, PROP, 30);
    expect(trend.map((d) => [d.date, d.total_in])).toEqual([
      ["2026-03-01", 1000],
      ["2026-03-02", 500],
    ]);
  });
});

describe("row cap: learning-engine", () => {
  test("energy readings past row 1000 reach the weekend/weekday pattern detector", async () => {
    // Wed 14 → Fri 23 Oct 2026; weekend per the engine = Fri/Sat/Sun
    const dates = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10));
    const isWeekend = (d: string) => [0, 5, 6].includes(new Date(d).getUTCDay());
    const weekdays = dates.filter((d) => !isWeekend(d));
    const weekends = dates.filter(isWeekend);
    // 170 readings per weekday (1020 rows) first, then 300 per weekend day: only the
    // first 1000 rows would contain no weekend data at all.
    const energy = [
      ...weekdays.flatMap((d) => Array.from({ length: 170 }, () => ({ zone_id: "z1", timestamp: `${d}T12:00:00Z`, consumption_kwh: 1 }))),
      ...weekends.flatMap((d) => Array.from({ length: 300 }, () => ({ zone_id: "z1", timestamp: `${d}T12:00:00Z`, consumption_kwh: 1 }))),
    ].map((r, i) => ({ id: `e${i}`, ...r }));
    const inserted: any[] = [];
    const db = createRoutingSupabase({
      energy_readings: energy,
      zones: [{ id: "z1", name: "Food Court", property_id: PROP }],
      footfall_daily: [],
      ai_patterns: (ctx: any) => {
        if (ctx.op === "insert") inserted.push(ctx.payload);
        return ctx.op === "select" ? [] : ctx.op === "insert" ? { id: "p" } : null;
      },
    }, { maxRows: 1000 });
    await runLearningCycle(db, PROP);
    const titles = inserted.map((p) => p.title);
    // weekday avg 170, weekend avg 300 → 76% more on weekends
    expect(titles).toContain("Food Court: 76% more energy on weekends");
  });
});

describe("row cap: prediction-model", () => {
  test("training sees dates that only appear past row 1000", async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
    const sb = createMockSupabase({
      footfall_daily: rows(N, (i) => ({ date: day(i % 10), total_in: 100, zone_id: "z1" }), (i) => ({ date: day(10 + (i % 5)) })),
    });
    const model = await trainFootfallModel(sb, PROP);
    expect(model.training_samples).toBe(15);
  });
});

describe("row cap: heatmap-engine", () => {
  test("visitor flow ranks a zone whose rows are all past row 1000", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "zA", name: "Zone Early", type: "retail" }, { id: "zB", name: "Zone Late", type: "retail" }],
      footfall_daily: rows(N, () => ({ zone_id: "zA", total_in: 1 }), () => ({ zone_id: "zB", total_in: 10 })),
    });
    const flow = await getVisitorFlowData(sb, PROP);
    expect(JSON.stringify(flow)).toContain("Zone Late");
  });
});

describe("row cap: cctv-engine", () => {
  test("demographic breakdown counts every reading", async () => {
    const sb = createMockSupabase({
      demographic_readings: rows(N, () => ({
        group_type: "family", estimated_age_range: "adult", count: 1, timestamp: "2026-03-01T12:00:00",
      })),
    });
    const d = await getDemographics(sb, PROP, "2026-03-01");
    expect(d.group_breakdown).toEqual([{ type: "family", count: N, pct: 100 }]);
  });
});

describe("row cap: audit", () => {
  test("audit stats tally categories across all rows", async () => {
    const sb = createMockSupabase({
      audit_log: rows(N, () => ({ category: "ai_brain" }), () => ({ category: "ai_decision" })),
    });
    const s = await getAuditStats(sb);
    expect(s.by_category).toEqual({ ai_brain: 1000, ai_decision: 500 });
    expect(s.ai_decisions).toBe(N);
  });
});

describe("row cap: API routes", () => {
  test("GET /api/v1/dashboard/stats total revenue sums every rent_transactions row", async () => {
    const sb = createMockSupabase({
      rent_transactions: rows(N, () => ({ amount_paid: 2 })),
      units: [],
      leases: [],
      maintenance_tickets: [],
      discrepancies: [],
      footfall_daily: rows(N, () => ({ total_in: 1 })),
    });
    state.supabase = sb;
    const res = await dashboardStatsGET(new NextRequest("http://localhost/api/v1/dashboard/stats"));
    const body = await res.json();
    expect(body.total_revenue_egp).toBe(N * 2);
    expect(body.footfall_today).toBe(N);
  });

  test("GET /api/v1/ai/events counts actions from every processed event today", async () => {
    const sb = createMockSupabase({
      system_events: rows(N, () => ({ results: [{ success: true }], source_system: "x" })),
    });
    state.supabase = sb;
    const res = await eventsGET(new NextRequest("http://localhost/api/v1/ai/events"));
    const body = await res.json();
    expect(body.stats.actions_today).toBe(N);
  });
});
