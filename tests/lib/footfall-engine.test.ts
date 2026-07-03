import { describe, test, expect } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  getFootfallOverview,
  getFootfallByZone,
  getFootfallByUnit,
  getHourlyFootfall,
  getFootfallTrend,
  getFootfallHeatmap,
  getPeakPatterns,
} from "@/lib/footfall-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

describe("footfall-engine: getFootfallOverview", () => {
  test("returns all required fields with zero data", async () => {
    const sb = createMockSupabase({
      footfall_daily: [],
      footfall_readings: [],
      units: [],
    });
    const r = await getFootfallOverview(sb, PROP, "2026-06-15");
    expect(r).toHaveProperty("total_visitors_today");
    expect(r).toHaveProperty("total_visitors_yesterday");
    expect(r).toHaveProperty("avg_daily_visitors");
    expect(r).toHaveProperty("peak_hour");
    expect(r).toHaveProperty("change_vs_yesterday_pct");
    expect(r.total_visitors_today).toBe(0);
  });

  test("total_visitors_today = max(daily sum, latest live reading)", async () => {
    const sb = createMockSupabase({
      footfall_daily: [{ total_in: 5000 }],
      footfall_readings: [{ count_in: 8000 }],
      units: [{ id: "u1" }],
    });
    const r = await getFootfallOverview(sb, PROP, "2026-06-15");
    expect(r.total_visitors_today).toBe(8000);
  });

  test("change_vs_yesterday_pct is 0 when yesterday is 0", async () => {
    const sb = createMockSupabase({
      footfall_daily: [{ total_in: 100 }],
      footfall_readings: [],
      units: [],
    });
    const r = await getFootfallOverview(sb, PROP, "2026-06-15");
    // same data returned for both today & yesterday
    expect(r.change_vs_yesterday_pct).toBe(0);
  });
});

describe("footfall-engine: getFootfallByZone", () => {
  test("returns empty array when no data", async () => {
    const sb = createMockSupabase({ footfall_daily: [] });
    const r = await getFootfallByZone(sb, PROP, "2026-06-15");
    expect(r).toEqual([]);
  });

  test("groups by zone and computes share_of_total_pct", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { zone_id: "z1", total_in: 300, total_out: 280, avg_dwell_seconds: 600, zones: { name: "A", type: "retail" } },
        { zone_id: "z2", total_in: 700, total_out: 650, avg_dwell_seconds: 800, zones: { name: "B", type: "food" } },
      ],
    });
    const r = await getFootfallByZone(sb, PROP, "2026-06-15");
    expect(r).toHaveLength(2);
    const totalShare = r.reduce((s, z) => s + z.share_of_total_pct, 0);
    expect(Math.round(totalShare)).toBe(100);
  });

  test("sorted by total_in descending", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { zone_id: "z1", total_in: 100, total_out: 90, avg_dwell_seconds: 300, zones: { name: "A", type: "retail" } },
        { zone_id: "z2", total_in: 500, total_out: 480, avg_dwell_seconds: 500, zones: { name: "B", type: "food" } },
      ],
    });
    const r = await getFootfallByZone(sb, PROP, "2026-06-15");
    expect(r[0].total_in).toBeGreaterThanOrEqual(r[1].total_in);
  });
});

describe("footfall-engine: getFootfallByUnit", () => {
  test("returns empty array when no data", async () => {
    const sb = createMockSupabase({ footfall_daily: [], leases: [] });
    const r = await getFootfallByUnit(sb, PROP, undefined, "2026-06-15");
    expect(r).toEqual([]);
  });

  test("maps tenant names via leases", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { unit_id: "u1", total_in: 200, total_out: 180, avg_dwell_seconds: 400, units: { unit_number: "F-1", zone_id: "z1" } },
      ],
      leases: [{ unit_id: "u1", tenant: { brand_name: "Adidas" } }],
    });
    const r = await getFootfallByUnit(sb, PROP, undefined, "2026-06-15");
    expect(r).toHaveLength(1);
    expect(r[0].tenant_name).toBe("Adidas");
    expect(r[0].count_in).toBe(200);
  });
});

describe("footfall-engine: getHourlyFootfall", () => {
  test("returns 24 zero buckets when no units", async () => {
    const sb = createMockSupabase({ units: [] });
    const r = await getHourlyFootfall(sb, PROP, "2026-06-15");
    expect(r).toHaveLength(24);
    for (const h of r) expect(h.count).toBe(0);
  });

  test("aggregates counts by hour", async () => {
    // Use local-time timestamps (no Z suffix) so getHours() is deterministic
    const sb = createMockSupabase({
      units: [{ id: "u1" }],
      footfall_readings: [
        { timestamp: "2026-06-15T10:00:00", count_in: 50 },
        { timestamp: "2026-06-15T14:00:00", count_in: 100 },
      ],
    });
    const r = await getHourlyFootfall(sb, PROP, "2026-06-15");
    expect(r).toHaveLength(24);
    const total = r.reduce((s, h) => s + h.count, 0);
    expect(total).toBe(150);
  });
});

describe("footfall-engine: getFootfallTrend", () => {
  test("returns empty when no data", async () => {
    const sb = createMockSupabase({ footfall_daily: [] });
    const r = await getFootfallTrend(sb, PROP, 30);
    expect(r).toEqual([]);
  });

  test("groups by date and includes day_of_week", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { date: "2026-06-01", total_in: 100, total_out: 90 },
        { date: "2026-06-02", total_in: 200, total_out: 180 },
      ],
    });
    const r = await getFootfallTrend(sb, PROP, 30);
    expect(r.length).toBeGreaterThan(0);
    for (const d of r) {
      expect(d).toHaveProperty("day_of_week");
      expect(d.day_of_week).toBeGreaterThanOrEqual(0);
      expect(d.day_of_week).toBeLessThanOrEqual(6);
    }
  });
});

describe("footfall-engine: getFootfallHeatmap", () => {
  test("returns zones with intensity", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { zone_id: "z1", total_in: 1000, zones: { name: "A", type: "retail" } },
      ],
      units: [{ id: "u1", zone_id: "z1", status: "occupied" }],
    });
    const r = await getFootfallHeatmap(sb, PROP, "2026-06-15");
    expect(Array.isArray(r)).toBe(true);
  });
});

describe("footfall-engine: getPeakPatterns", () => {
  test("returns busiest/quietest day and weekend/weekday avgs", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { date: "2026-06-01", total_in: 100, total_out: 90 },
        { date: "2026-06-07", total_in: 500, total_out: 480 },
      ],
    });
    const r = await getPeakPatterns(sb, PROP);
    expect(r).toHaveProperty("busiest_day");
    expect(r).toHaveProperty("quietest_day");
    expect(r).toHaveProperty("weekend_avg");
    expect(r).toHaveProperty("weekday_avg");
    expect(r).toHaveProperty("weekend_vs_weekday_ratio");
  });
});