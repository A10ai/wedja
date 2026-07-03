import { describe, test, expect } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  getEnergyOverview,
  getEnergyByZone,
  getEnergyHourly,
  getEnergyTrend,
  getEnergyVsFootfall,
} from "@/lib/energy-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

describe("energy-engine: getEnergyOverview", () => {
  test("returns zeros when property has no zones", async () => {
    const sb = createMockSupabase({ zones: [] });
    const r = await getEnergyOverview(sb, PROP, "2026-06-15");
    expect(r.total_consumption_kwh_today).toBe(0);
    expect(r.total_cost_egp_today).toBe(0);
    expect(r.peak_hour).toBe(0);
  });

  test("sums today's kWh and cost across zones", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }, { id: "z2" }],
      energy_readings: [
        { consumption_kwh: 100, cost_egp: 50, timestamp: "2026-06-15T10:00:00" },
        { consumption_kwh: 200, cost_egp: 100, timestamp: "2026-06-15T14:00:00" },
      ],
    });
    const r = await getEnergyOverview(sb, PROP, "2026-06-15");
    expect(r.total_consumption_kwh_today).toBe(300);
    expect(r.total_cost_egp_today).toBe(150);
  });

  test("peak_hour is the hour with highest kWh", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }],
      energy_readings: [
        { consumption_kwh: 50, cost_egp: 10, timestamp: "2026-06-15T10:00:00" },
        { consumption_kwh: 300, cost_egp: 100, timestamp: "2026-06-15T19:00:00" },
        { consumption_kwh: 80, cost_egp: 20, timestamp: "2026-06-15T22:00:00" },
      ],
    });
    const r = await getEnergyOverview(sb, PROP, "2026-06-15");
    expect(r.peak_hour).toBe(19);
    expect(r.peak_consumption_kwh).toBe(300);
  });

  test("change_vs_yesterday_pct = ((today-yesterday)/yesterday)*100", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }],
      energy_readings: [{ consumption_kwh: 120, cost_egp: 60, timestamp: "2026-06-15T12:00:00" }],
    });
    const r = await getEnergyOverview(sb, PROP, "2026-06-15");
    // mock returns same data for yesterday & today, so change = 0
    expect(r.change_vs_yesterday_pct).toBe(0);
  });
});

describe("energy-engine: getEnergyByZone", () => {
  test("returns empty array when no zones", async () => {
    const sb = createMockSupabase({ zones: [] });
    const r = await getEnergyByZone(sb, PROP, "2026-06-15");
    expect(r).toEqual([]);
  });

  test("computes kwh_per_sqm = kwh / area_sqm", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "Food Court", type: "food", area_sqm: 100 }],
      energy_readings: [{ zone_id: "z1", consumption_kwh: 500, cost_egp: 200 }],
    });
    const r = await getEnergyByZone(sb, PROP, "2026-06-15");
    expect(r).toHaveLength(1);
    expect(r[0].kwh_per_sqm).toBe(5); // 500/100
  });

  test("share_pct sums to ~100 when there are multiple zones", async () => {
    const sb = createMockSupabase({
      zones: [
        { id: "z1", name: "A", type: "retail", area_sqm: 100 },
        { id: "z2", name: "B", type: "retail", area_sqm: 100 },
      ],
      energy_readings: [
        { zone_id: "z1", consumption_kwh: 300, cost_egp: 100 },
        { zone_id: "z2", consumption_kwh: 700, cost_egp: 200 },
      ],
    });
    const r = await getEnergyByZone(sb, PROP, "2026-06-15");
    const totalShare = r.reduce((s, z) => s + z.share_pct, 0);
    expect(Math.round(totalShare)).toBe(100);
  });
});

describe("energy-engine: getEnergyHourly", () => {
  test("returns 24 hourly buckets", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }],
      energy_readings: [],
    });
    const r = await getEnergyHourly(sb, PROP, "2026-06-15");
    expect(r).toHaveLength(24);
    for (const h of r) {
      expect(h).toHaveProperty("hour");
      expect(h).toHaveProperty("is_operating");
      expect(h).toHaveProperty("is_peak");
    }
  });

  test("is_operating true for hours 10-23, false otherwise", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }],
      energy_readings: [],
    });
    const r = await getEnergyHourly(sb, PROP, "2026-06-15");
    expect(r[5].is_operating).toBe(false);
    expect(r[10].is_operating).toBe(true);
    expect(r[23].is_operating).toBe(true);
  });

  test("returns empty array when no zones", async () => {
    const sb = createMockSupabase({ zones: [] });
    const r = await getEnergyHourly(sb, PROP, "2026-06-15");
    expect(r).toEqual([]);
  });
});

describe("energy-engine: getEnergyTrend", () => {
  test("returns empty array when no zones", async () => {
    const sb = createMockSupabase({ zones: [] });
    const r = await getEnergyTrend(sb, PROP, 30);
    expect(r).toEqual([]);
  });

  test("groups readings by day and sorts ascending", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1" }],
      energy_readings: [
        { timestamp: "2026-06-02T10:00:00", consumption_kwh: 100, cost_egp: 50 },
        { timestamp: "2026-06-01T10:00:00", consumption_kwh: 200, cost_egp: 100 },
      ],
    });
    const r = await getEnergyTrend(sb, PROP, 30);
    expect(r.length).toBe(2);
    expect(r[0].date).toBe("2026-06-01");
    expect(r[1].date).toBe("2026-06-02");
  });
});

describe("energy-engine: getEnergyVsFootfall", () => {
  test("returns efficiency score per zone", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "Retail A", type: "retail", area_sqm: 100 }],
      energy_readings: [{ zone_id: "z1", consumption_kwh: 100, cost_egp: 50 }],
      footfall_daily: [{ zone_id: "z1", total_in: 200 }],
    });
    const r = await getEnergyVsFootfall(sb, PROP);
    expect(r).toHaveLength(1);
    expect(r[0].kwh_per_visitor).toBe(0.5); // 100/200
    expect(r[0].efficiency_score).toBeGreaterThan(0);
    expect(r[0].efficiency_score).toBeLessThanOrEqual(100);
  });

  test("parking zones get neutral score 50", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "Lot A", type: "parking", area_sqm: 1000 }],
      energy_readings: [{ zone_id: "z1", consumption_kwh: 1000, cost_egp: 500 }],
      footfall_daily: [{ zone_id: "z1", total_in: 100 }],
    });
    const r = await getEnergyVsFootfall(sb, PROP);
    expect(r[0].efficiency_score).toBe(50);
    expect(r[0].status).toBe("moderate");
  });

  test("status='efficient' when score >= 65", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "X", type: "retail", area_sqm: 100 }],
      energy_readings: [{ zone_id: "z1", consumption_kwh: 50, cost_egp: 25 }],
      footfall_daily: [{ zone_id: "z1", total_in: 1000 }], // 0.05 kwh/visitor -> very efficient
    });
    const r = await getEnergyVsFootfall(sb, PROP);
    expect(r[0].efficiency_score).toBeGreaterThanOrEqual(65);
    expect(r[0].status).toBe("efficient");
  });

  test("status='inefficient' when score < 40", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "X", type: "retail", area_sqm: 100 }],
      energy_readings: [{ zone_id: "z1", consumption_kwh: 10000, cost_egp: 5000 }],
      footfall_daily: [{ zone_id: "z1", total_in: 100 }], // 100 kwh/visitor
    });
    const r = await getEnergyVsFootfall(sb, PROP);
    expect(r[0].efficiency_score).toBeLessThan(40);
    expect(r[0].status).toBe("inefficient");
  });
});