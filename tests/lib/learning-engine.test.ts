/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runLearningCycle,
  recordFeedback,
  getLearnedConversionRate,
  getLearnedPatterns,
  getLearningHistory,
  getLearningStats,
} from "@/lib/learning-engine";
import { createRoutingSupabase } from "./helpers/routing-supabase-mock";

process.env.TZ = "UTC";

const PROP = "a0000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-10-26T12:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const isoDate = (d: Date) => d.toISOString().split("T")[0];

// fashion: avg ticket = sqrt(300*800); default conversion midpoint = 0.2
const FASHION_TICKET = Math.sqrt(300 * 800);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** ai_patterns resolver: lookups by title return `existing[title]`, list queries return `list`. */
function patternsTable(opts: { existing?: Record<string, any>; list?: any[] } = {}) {
  return (ctx: any) => {
    if (ctx.op !== "select") return null;
    if (ctx.single) return opts.existing?.[ctx.eq("title")] ?? null;
    return opts.list ?? [];
  };
}

function insertedPatterns(db: any) {
  return db.opsFor("ai_patterns", "insert").map((o: any) => o.payload);
}

// ─────────────────────────────────────────────────────────────
describe("learning-engine: runLearningCycle — empty data", () => {
  test("no data → zero counters, 'waiting' summary, and a cycle log is persisted", async () => {
    const db = createRoutingSupabase({});
    const r = await runLearningCycle(db, PROP);
    expect(r).toMatchObject({
      property_id: PROP,
      cycle_date: "2026-10-26",
      params_updated: 0,
      patterns_found: 0,
      patterns_confirmed: 0,
      confidence_improvements: [],
      summary: "No new learnings this cycle. Waiting for more data.",
    });
    expect(r.duration_ms).toBeGreaterThanOrEqual(0);
    const logs = db.opsFor("ai_learning_cycles", "insert");
    expect(logs).toHaveLength(1);
    expect(logs[0].payload).toMatchObject({ property_id: PROP, params_updated: 0, summary: r.summary });
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: conversion-rate calibration", () => {
  function convDb(opts: {
    leases: any[];
    footfall: any[];
    sales: any[];
    existingParam?: any;
  }) {
    return createRoutingSupabase({
      leases: opts.leases,
      footfall_daily: (ctx: any) =>
        ctx.filters.some((f: any) => f.name === "in" && f.args[0] === "unit_id") ? opts.footfall : [],
      tenant_sales_reported: opts.sales,
      ai_learned_params: (ctx: any) => (ctx.op === "select" ? opts.existingParam ?? null : null),
    });
  }
  const lease = (id: string, category: string, brand = `Brand ${id}`) => ({
    id: `l-${id}`,
    unit_id: `u-${id}`,
    tenant_id: `t-${id}`,
    tenants: { id: `t-${id}`, name: brand, brand_name: brand, category },
  });

  test("learns conversion = sales / (footfall × geometric-mean ticket), needs ≥2 matching months", async () => {
    const sales = 1000 * FASHION_TICKET * 0.3; // 30% conversion at 1000 visitors
    const db = convDb({
      leases: [lease("A", "fashion", "Aldo"), lease("B", "fashion", "Bata")],
      footfall: [
        { unit_id: "u-A", date: "2026-08-15", total_in: 600 },
        { unit_id: "u-A", date: "2026-08-20", total_in: 400 }, // aggregated per month = 1000
        { unit_id: "u-A", date: "2026-09-15", total_in: 1000 },
        { unit_id: "u-B", date: "2026-09-15", total_in: 1000 }, // only 1 month for B
      ],
      sales: [
        { tenant_id: "t-A", period_month: 8, period_year: 2026, reported_revenue_egp: sales },
        { tenant_id: "t-A", period_month: 9, period_year: 2026, reported_revenue_egp: sales },
        { tenant_id: "t-B", period_month: 9, period_year: 2026, reported_revenue_egp: sales },
      ],
    });
    const r = await runLearningCycle(db, PROP);
    expect(r.params_updated).toBe(1);
    const ups = db.opsFor("ai_learned_params", "upsert");
    expect(ups).toHaveLength(1);
    expect(ups[0].payload).toMatchObject({
      param_type: "conversion_rate",
      entity_id: "t-A",
      entity_name: "Aldo",
      initial_value: 0.2,
      learned_value: 0.3,
      sample_count: 2,
      confidence: 34, // 17 × 2 months
    });
    expect(r.confidence_improvements).toEqual([
      { param: "conversion_rate", entity: "Aldo", old_confidence: 0, new_confidence: 34 },
    ]);
    expect(r.summary).toBe("Calibrated 1 conversion rate.");
  });

  test("learned conversion is clamped to [0.01, 0.95]", async () => {
    const mk = async (salesPerMonth: number) => {
      const db = convDb({
        leases: [lease("A", "fashion")],
        footfall: [
          { unit_id: "u-A", date: "2026-08-15", total_in: 1000 },
          { unit_id: "u-A", date: "2026-09-15", total_in: 1000 },
        ],
        sales: [8, 9].map((m) => ({ tenant_id: "t-A", period_month: m, period_year: 2026, reported_revenue_egp: salesPerMonth })),
      });
      await runLearningCycle(db, PROP);
      return db.opsFor("ai_learned_params", "upsert")[0].payload.learned_value;
    };
    expect(await mk(1e12)).toBe(0.95);
    expect(await mk(1)).toBe(0.01);
  });

  test("unknown category falls back to the services model (default 0.275)", async () => {
    const db = convDb({
      leases: [lease("A", "jewellery")],
      footfall: [
        { unit_id: "u-A", date: "2026-08-15", total_in: 1000 },
        { unit_id: "u-A", date: "2026-09-15", total_in: 1000 },
      ],
      sales: [8, 9].map((m) => ({ tenant_id: "t-A", period_month: m, period_year: 2026, reported_revenue_egp: 1000 * Math.sqrt(150 * 400) * 0.25 })),
    });
    await runLearningCycle(db, PROP);
    const p = db.opsFor("ai_learned_params", "upsert")[0].payload;
    expect(p.initial_value).toBe(0.275);
    expect(p.learned_value).toBe(0.25);
  });

  test("months with zero footfall or zero/null sales are not counted", async () => {
    const db = convDb({
      leases: [lease("A", "fashion")],
      footfall: [
        { unit_id: "u-A", date: "2026-07-15", total_in: 0 },
        { unit_id: "u-A", date: "2026-08-15", total_in: 1000 },
        { unit_id: "u-A", date: "2026-09-15", total_in: 1000 },
      ],
      sales: [
        { tenant_id: "t-A", period_month: 7, period_year: 2026, reported_revenue_egp: 50_000 },
        { tenant_id: "t-A", period_month: 8, period_year: 2026, reported_revenue_egp: 0 },
        { tenant_id: "t-A", period_month: 9, period_year: 2026, reported_revenue_egp: null },
      ],
    });
    const r = await runLearningCycle(db, PROP);
    expect(r.params_updated).toBe(0);
    expect(db.opsFor("ai_learned_params", "upsert")).toHaveLength(0);
  });

  test("confidence grows with sample count and is capped at 90", async () => {
    const months = [4, 5, 6, 7, 8, 9];
    const db = convDb({
      leases: [lease("A", "food")],
      footfall: months.map((m) => ({ unit_id: "u-A", date: `2026-${String(m).padStart(2, "0")}-15`, total_in: 1000 })),
      sales: months.map((m) => ({ tenant_id: "t-A", period_month: m, period_year: 2026, reported_revenue_egp: 100_000 })),
    });
    await runLearningCycle(db, PROP);
    const p = db.opsFor("ai_learned_params", "upsert")[0].payload;
    expect(p.sample_count).toBe(6);
    expect(p.confidence).toBe(90);
  });

  test("an existing param with higher confidence is updated but not reported as an improvement", async () => {
    const db = convDb({
      leases: [lease("A", "fashion")],
      footfall: [
        { unit_id: "u-A", date: "2026-08-15", total_in: 1000 },
        { unit_id: "u-A", date: "2026-09-15", total_in: 1000 },
      ],
      sales: [8, 9].map((m) => ({ tenant_id: "t-A", period_month: m, period_year: 2026, reported_revenue_egp: 90_000 })),
      existingParam: { id: "p1", confidence: 60, learned_value: 0.2 },
    });
    const r = await runLearningCycle(db, PROP);
    expect(r.params_updated).toBe(1);
    expect(r.confidence_improvements).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: footfall pattern detection", () => {
  // 14 days: Mon 2026-10-12 → Sun 2026-10-25
  const days = Array.from({ length: 14 }, (_, i) => isoDate(new Date(Date.UTC(2026, 9, 12 + i))));

  function ffDb(rows: any[], patterns = patternsTable()) {
    return createRoutingSupabase({
      footfall_daily: rows,
      zones: [{ id: "z1", name: "Fashion Wing" }],
      ai_patterns: patterns,
    });
  }

  test("busiest-day and consistent peak-hour patterns are detected with bounded confidence", async () => {
    const rows = days.map((date, i) => ({
      zone_id: "z1",
      date,
      total_in: new Date(date).getUTCDay() === 5 ? 3000 : 1000,
      peak_hour: i < 10 ? 19 : 14,
      peak_count: 100,
    }));
    const db = ffDb(rows);
    const r = await runLearningCycle(db, PROP);
    const ins = insertedPatterns(db);
    expect(r.patterns_found).toBe(2);
    expect(ins.map((p: any) => p.title)).toEqual([
      "Fashion Wing: Friday is 3x busier than Saturday",
      "Fashion Wing: Peak hour is consistently 19:00",
    ]);
    expect(ins[0]).toMatchObject({ pattern_type: "weekly", confidence: 42, data_points: 14, status: "active" });
    expect(ins[1]).toMatchObject({ pattern_type: "footfall_trend", confidence: 71, data_points: 14 });
    for (const p of ins) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(100);
    }
    expect(r.summary).toContain("Discovered 2 footfall patterns");
  });

  test("growing trend: second-half average 50% above first half", async () => {
    const rows = days.map((date, i) => ({ zone_id: "z1", date, total_in: i < 7 ? 1000 : 1500, peak_hour: 0 }));
    const db = ffDb(rows);
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_found).toBe(1);
    expect(insertedPatterns(db)[0]).toMatchObject({
      title: "Fashion Wing: Footfall growing by 50%",
      confidence: 64, // min(70, 50 + 14)
      impact_estimate: "Revenue opportunity — growing traffic",
    });
  });

  test("declining trend from zero first half does not divide by zero", async () => {
    const rows = days.map((date, i) => ({ zone_id: "z1", date, total_in: i < 7 ? 0 : 500, peak_hour: 0 }));
    const db = ffDb(rows);
    await runLearningCycle(db, PROP);
    // firstAvg = 0 → changePct guarded to 0 → no trend pattern; weekday ratio guarded when quietest=0
    const titles = insertedPatterns(db).map((p: any) => p.title);
    expect(titles.some((t: string) => /NaN|Infinity/.test(t))).toBe(false);
    expect(titles.some((t: string) => t.includes("Footfall"))).toBe(false);
  });

  test("fewer than 7 rows, or rows without zone_id, produce no patterns", async () => {
    const few = ffDb(days.slice(0, 6).map((date) => ({ zone_id: "z1", date, total_in: 100 })));
    expect((await runLearningCycle(few, PROP)).patterns_found).toBe(0);
    const noZone = ffDb(days.map((date, i) => ({ zone_id: null, date, total_in: i * 100, peak_hour: 19 })));
    expect((await runLearningCycle(noZone, PROP)).patterns_found).toBe(0);
  });

  test("re-detecting an existing pattern updates it (confidence +3, outdated→active) and is not counted as new", async () => {
    const rows = days.map((date) => ({
      zone_id: "z1",
      date,
      total_in: new Date(date).getUTCDay() === 5 ? 3000 : 1000,
      peak_hour: 0,
    }));
    const title = "Fashion Wing: Friday is 3x busier than Saturday";
    const db = ffDb(rows, patternsTable({ existing: { [title]: { id: "p1", confidence: 94, data_points: 10, status: "outdated" } } }));
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_found).toBe(0);
    expect(insertedPatterns(db)).toHaveLength(0);
    const upd = db.opsFor("ai_patterns", "update")[0].payload;
    expect(upd.confidence).toBe(95); // min(95, max(94, 42) + 3)
    expect(upd.status).toBe("active");
    expect(upd.data_points).toBe(14);
  });

  // BUG: upsertPattern de-duplicates by exact title (src/lib/learning-engine.ts:862), but titles
  // embed live numbers (e.g. "growing by 50%"), so the same zone trend with a slightly different
  // percentage is inserted as a brand-new pattern every cycle instead of updating the existing one.
  test.fails("same zone trend with a different % updates the existing pattern rather than inserting a duplicate", async () => {
    const rows = days.map((date, i) => ({ zone_id: "z1", date, total_in: i < 7 ? 1000 : 1550, peak_hour: 0 }));
    const db = ffDb(
      rows,
      patternsTable({ existing: { "Fashion Wing: Footfall growing by 50%": { id: "p1", confidence: 60, status: "active" } } })
    );
    await runLearningCycle(db, PROP);
    expect(insertedPatterns(db)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: energy pattern detection", () => {
  const dates = Array.from({ length: 10 }, (_, i) => isoDate(new Date(Date.UTC(2026, 9, 14 + i)))); // Wed 14 → Fri 23

  function enDb(energy: any[], footfall: any[] = []) {
    return createRoutingSupabase({
      energy_readings: energy,
      zones: [{ id: "z1", name: "Food Court", property_id: PROP }],
      // the footfall-pattern detector (ordered query) sees nothing; only the energy correlation does
      footfall_daily: (ctx: any) => (ctx.filters.some((f: any) => f.name === "order") ? [] : footfall),
      ai_patterns: patternsTable(),
    });
  }

  test("flags energy waste on ≥3 days with near-average energy but <30% footfall", async () => {
    const energy = dates.map((d) => ({ zone_id: "z1", timestamp: `${d}T12:00:00Z`, consumption_kwh: 100 }));
    const footfall = dates.map((d, i) => ({ zone_id: "z1", date: d, total_in: i < 7 ? 1000 : 50 }));
    const db = enDb(energy, footfall);
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_found).toBe(1);
    expect(insertedPatterns(db)[0]).toMatchObject({
      pattern_type: "energy_waste",
      title: "Food Court: Energy waste detected on 3 days",
      confidence: 50,
      impact_estimate: "Potential 90 kWh/month savings",
      data_points: 10,
    });
  });

  test("weekend vs weekday difference > 15% is reported with the higher side", async () => {
    const energy = dates.map((d) => {
      const dow = new Date(d).getUTCDay();
      const weekend = dow === 0 || dow === 5 || dow === 6;
      return { zone_id: "z1", timestamp: `${d}T12:00:00Z`, consumption_kwh: weekend ? 150 : 100 };
    });
    const db = enDb(energy);
    await runLearningCycle(db, PROP);
    const p = insertedPatterns(db)[0];
    expect(p.title).toBe("Food Court: 50% more energy on weekends");
    expect(p.description).toContain("disproportionately high");
    expect(p.confidence).toBe(30); // min(70, 10*2 + 10)
  });

  test("readings from zones outside the property are ignored (<10 left → nothing)", async () => {
    const energy = dates.map((d, i) => ({ zone_id: i < 5 ? "z1" : "other", timestamp: `${d}T12:00:00Z`, consumption_kwh: 100 }));
    const db = enDb(energy);
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_found).toBe(0);
    // stopped before reading footfall for correlation
    expect(db.opsFor("footfall_daily").length).toBe(1); // only the footfall-pattern query
  });

  test("no footfall data → no waste days (avgFootfall 0 guard)", async () => {
    const energy = dates.map((d) => ({ zone_id: "z1", timestamp: `${d}T12:00:00Z`, consumption_kwh: 100 }));
    const db = enDb(energy, []);
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_found).toBe(0);
  });

  // BUG: weekday average of 0 kWh makes `(weAvg - wdAvg) / wdAvg` = Infinity
  // (src/lib/learning-engine.ts:641), producing a pattern titled "Infinity% more energy on weekends".
  test.fails("zero weekday consumption does not produce an Infinity% pattern", async () => {
    const energy = dates.map((d) => {
      const dow = new Date(d).getUTCDay();
      const weekend = dow === 0 || dow === 5 || dow === 6;
      return { zone_id: "z1", timestamp: `${d}T12:00:00Z`, consumption_kwh: weekend ? 100 : 0 };
    });
    const db = enDb(energy);
    await runLearningCycle(db, PROP);
    const titles = insertedPatterns(db).map((p: any) => p.title);
    expect(titles.some((t: string) => /Infinity|NaN/.test(t))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: maintenance cycle detection", () => {
  function mtDb(tickets: any[]) {
    return createRoutingSupabase({
      maintenance_tickets: tickets,
      zones: [{ id: "z1", name: "Atrium" }],
      ai_patterns: patternsTable(),
      ai_learned_params: null,
    });
  }
  const t = (zone: string | null, category: string, created: string) => ({
    id: Math.random().toString(36),
    zone_id: zone,
    category,
    title: `${category} issue`,
    created_at: created,
  });

  test("recurring category in a zone yields a cycle pattern and a learned failure interval", async () => {
    const db = mtDb([
      t("z1", "hvac", "2026-08-01T00:00:00Z"),
      t("z1", "hvac", "2026-08-31T00:00:00Z"),
      t("z1", "hvac", "2026-09-30T00:00:00Z"),
      t("z1", "plumbing", "2026-09-01T00:00:00Z"),
      t(null, "electrical", "2026-09-02T00:00:00Z"),
    ]);
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_found).toBe(1);
    const p = insertedPatterns(db)[0];
    expect(p.title).toBe("Atrium: hvac issues every ~30 days");
    expect(p.confidence).toBe(46); // min(80, 3*12 + 10)
    // next predicted 2026-10-30 → 4 days away
    expect(p.description).toContain("within 4 days");
    expect(p.impact_estimate).toBe("Preventive maintenance recommended immediately");
    const param = db.opsFor("ai_learned_params", "upsert")[0].payload;
    expect(param).toMatchObject({
      param_type: "maintenance_cycle",
      entity_id: "z1",
      entity_name: "Atrium — hvac",
      param_key: "failure_interval_days",
      initial_value: 90,
      learned_value: 30,
      sample_count: 3,
    });
  });

  test("tickets with no zone are grouped as 'General' with a null entity_id; overdue prediction clamps to 0 days", async () => {
    const db = mtDb([
      t(null, "cleaning", "2026-01-01T00:00:00Z"),
      t(null, "cleaning", "2026-01-11T00:00:00Z"),
      t(null, "cleaning", "2026-01-21T00:00:00Z"),
      t("z1", "a", "2026-01-01T00:00:00Z"),
      t("z1", "b", "2026-01-01T00:00:00Z"),
    ]);
    await runLearningCycle(db, PROP);
    const p = insertedPatterns(db)[0];
    expect(p.title).toBe("General: cleaning issues every ~10 days");
    expect(p.description).toContain("within 0 days");
    expect(db.opsFor("ai_learned_params", "upsert")[0].payload.entity_id).toBeNull();
  });

  test("intervals ≥ 180 days and fewer than 5 tickets are ignored", async () => {
    const sparse = mtDb([
      t("z1", "elevator", "2025-01-01T00:00:00Z"),
      t("z1", "elevator", "2025-07-01T00:00:00Z"),
      t("z1", "elevator", "2026-01-01T00:00:00Z"),
      t("z1", "x", "2026-01-01T00:00:00Z"),
      t("z1", "y", "2026-01-01T00:00:00Z"),
    ]);
    expect((await runLearningCycle(sparse, PROP)).patterns_found).toBe(0);
    const tooFew = mtDb([
      t("z1", "hvac", "2026-09-01T00:00:00Z"),
      t("z1", "hvac", "2026-09-02T00:00:00Z"),
      t("z1", "hvac", "2026-09-03T00:00:00Z"),
      t("z1", "hvac", "2026-09-04T00:00:00Z"),
    ]);
    expect((await runLearningCycle(tooFew, PROP)).patterns_found).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: confidence decay & confirmation", () => {
  function confDb(list: any[]) {
    return createRoutingSupabase({ ai_patterns: patternsTable({ list }) });
  }
  const updatesById = (db: any) =>
    Object.fromEntries(
      db.opsFor("ai_patterns", "update").map((o: any) => [o.eq("id"), o.payload])
    );

  test("stale patterns decay 5/month, drop below 20 → outdated, recent active → confirmed (+5, cap 95)", async () => {
    const db = confDb([
      { id: "p1", status: "active", confidence: 50, last_confirmed: daysAgo(65) },
      { id: "p2", status: "confirmed", confidence: 25, last_confirmed: daysAgo(95) },
      { id: "p3", status: "active", confidence: 93, last_confirmed: daysAgo(0.3) },
      { id: "p4", status: "confirmed", confidence: 60, last_confirmed: daysAgo(10) },
    ]);
    const r = await runLearningCycle(db, PROP);
    const u = updatesById(db);
    expect(u.p1).toEqual({ confidence: 40 });
    expect(u.p2).toEqual({ status: "outdated", confidence: 10 });
    expect(u.p3).toEqual({ status: "confirmed", confidence: 95 });
    expect(u.p4).toBeUndefined();
    expect(r.patterns_confirmed).toBe(1);
    expect(r.summary).toBe("Confirmed 1 existing pattern. Marked 1 pattern as outdated.");
  });

  test("decayed confidence never goes negative", async () => {
    const db = confDb([{ id: "p", status: "active", confidence: 10, last_confirmed: daysAgo(3650) }]);
    await runLearningCycle(db, PROP);
    expect(updatesById(db).p).toEqual({ status: "outdated", confidence: 0 });
  });

  // BUG: decay is recomputed from the *already-decayed* stored confidence using the total months
  // since last_confirmed (src/lib/learning-engine.ts:804-807). Running the cycle daily therefore
  // subtracts another 5 points every day after day 30 instead of 5 per month.
  test.fails("daily cycles decay a stale pattern only 5 points per month, not per run", async () => {
    // Day 31: 80 → 75 (correct)
    const db1 = confDb([{ id: "p", status: "active", confidence: 80, last_confirmed: daysAgo(31) }]);
    await runLearningCycle(db1, PROP);
    expect(updatesById(db1).p).toEqual({ confidence: 75 });

    // Next day (32 days stale), DB now holds 75 — no further decay is due this month.
    vi.setSystemTime(new Date(NOW.getTime() + DAY));
    const db2 = createRoutingSupabase({
      ai_patterns: patternsTable({
        list: [{ id: "p", status: "active", confidence: 75, last_confirmed: daysAgo(31) }],
      }),
    });
    await runLearningCycle(db2, PROP);
    expect(updatesById(db2).p).toBeUndefined(); // actual: { confidence: 70 }
  });

  // BUG: updateConfidenceScores runs after detection in the same cycle (src/lib/learning-engine.ts:827),
  // so a pattern first inserted moments ago (last_confirmed = now) is immediately promoted to
  // "confirmed" with +5 confidence, even though it has never been re-observed.
  test.fails("a pattern first detected in this cycle is not immediately marked confirmed", async () => {
    const nowIso = NOW.toISOString();
    const db = confDb([{ id: "new", status: "active", confidence: 42, first_detected: nowIso, last_confirmed: nowIso }]);
    const r = await runLearningCycle(db, PROP);
    expect(r.patterns_confirmed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: recordFeedback", () => {
  function fbDb(decision: any, feedbackResult: any = { id: "fb-1" }) {
    return createRoutingSupabase({
      ai_decisions: (ctx: any) => (ctx.op === "select" ? decision : null),
      ai_feedback: feedbackResult,
    });
  }

  test.each([
    ["approve", "approved"],
    ["modify", "modified"],
    ["reject", "rejected"],
    ["correct", "modified"],
  ] as const)("%s → human_action %s", async (type, action) => {
    const db = fbDb({ id: "d1", context_json: { a: 1 } });
    const r = await recordFeedback(db, "d1", type, { b: 2 }, "because", "staff-1", PROP);
    expect(r).toEqual({ id: "fb-1" });
    const fb = db.opsFor("ai_feedback", "insert")[0].payload;
    expect(fb).toEqual({
      property_id: PROP,
      decision_id: "d1",
      feedback_type: type,
      original_value: { a: 1 },
      corrected_value: { b: 2 },
      reason: "because",
      staff_id: "staff-1",
    });
    const upd = db.opsFor("ai_decisions", "update")[0];
    expect(upd.payload).toEqual({ human_action: action, human_feedback: "because" });
    expect(upd.eq("id")).toBe("d1");
  });

  test("throws when the decision does not exist (and writes nothing)", async () => {
    const db = fbDb(null);
    await expect(recordFeedback(db, "missing", "approve", null, null, null)).rejects.toThrow("Decision missing not found");
    expect(db.opsFor("ai_feedback")).toHaveLength(0);
  });

  test("propagates feedback insert errors and does not update the decision", async () => {
    const db = fbDb({ id: "d1" }, { __error: { message: "rls denied" } });
    await expect(recordFeedback(db, "d1", "reject", null, "x", null)).rejects.toMatchObject({ message: "rls denied" });
    expect(db.opsFor("ai_decisions", "update")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("learning-engine: read APIs", () => {
  test("getLearnedConversionRate uses a strict > 50 confidence threshold", async () => {
    const at = (confidence: number) =>
      getLearnedConversionRate(
        createRoutingSupabase({ ai_learned_params: { learned_value: 0.31, confidence, sample_count: 3 } }),
        "t1"
      );
    expect(await at(50)).toBeNull();
    expect(await at(51)).toEqual({ rate: 0.31, confidence: 51, source: "learned", sample_count: 3 });
    expect(await getLearnedConversionRate(createRoutingSupabase({}), "t1")).toBeNull();
  });

  test("getLearnedPatterns only adds a type filter when a type is given", async () => {
    const db = createRoutingSupabase({ ai_patterns: [{ id: "1" }] });
    expect(await getLearnedPatterns(db, PROP)).toEqual([{ id: "1" }]);
    expect(db._ops[0].filters.some((f: any) => f.args[0] === "pattern_type")).toBe(false);
    await getLearnedPatterns(db, PROP, "weekly");
    expect(db._ops[1].eq("pattern_type")).toBe("weekly");
    expect(await getLearnedPatterns(createRoutingSupabase({}), PROP)).toEqual([]);
  });

  test("getLearningHistory filters by cutoff date N days back", async () => {
    const db = createRoutingSupabase({ ai_learning_cycles: [] });
    await getLearningHistory(db, PROP, 7);
    const gte = db._ops[0].filters.find((f: any) => f.name === "gte");
    expect(gte.args).toEqual(["cycle_date", "2026-10-19"]);
  });

  test("getLearningStats aggregates counts, avg confidence, days of learning and top-5 improvements", async () => {
    const params = [
      { entity_name: "A", param_key: "conversion_rate", initial_value: 0.2, learned_value: 0.3, confidence: 41 },
      { entity_name: null, param_key: "k", initial_value: 1, learned_value: 2, confidence: 90 },
      { entity_name: "C", param_key: "k", initial_value: 1, learned_value: 2, confidence: 40 }, // excluded (not > 40)
      { entity_name: "D", param_key: "k", initial_value: 1, learned_value: 2, confidence: null },
      ...[70, 60, 55, 80].map((c, i) => ({ entity_name: `E${i}`, param_key: "k", initial_value: 1, learned_value: 2, confidence: c })),
    ];
    const db = createRoutingSupabase({
      ai_feedback: [{}, {}, {}],
      ai_learned_params: params,
      ai_patterns: [{}, {}],
      ai_learning_cycles: [{ cycle_date: "2026-10-16" }],
    });
    const s = await getLearningStats(db, PROP);
    expect(s.total_feedback_received).toBe(3);
    expect(s.params_calibrated).toBe(8);
    expect(s.patterns_discovered).toBe(2);
    expect(s.avg_confidence).toBe(Math.round((41 + 90 + 40 + 0 + 70 + 60 + 55 + 80) / 8));
    expect(s.days_of_learning).toBe(11); // 2026-10-16T00:00Z → 2026-10-26T12:00Z = 10.5 days, rounded
    expect(s.top_improvements.map((t) => t.confidence)).toEqual([90, 80, 70, 60, 55]);
    expect(s.top_improvements[0].entity_name).toBe("Unknown");
  });

  test("getLearningStats on an empty DB returns zeros without NaN", async () => {
    const s = await getLearningStats(createRoutingSupabase({}), PROP);
    expect(s).toEqual({
      total_feedback_received: 0,
      params_calibrated: 0,
      patterns_discovered: 0,
      avg_confidence: 0,
      days_of_learning: 0,
      top_improvements: [],
    });
  });

  test("getLearningStats: a cycle started today counts as at least 1 day", async () => {
    const s = await getLearningStats(
      createRoutingSupabase({ ai_learning_cycles: [{ cycle_date: "2026-10-26" }] }),
      PROP
    );
    expect(s.days_of_learning).toBe(1);
  });
});
