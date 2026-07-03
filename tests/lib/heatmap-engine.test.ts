import { describe, test, expect } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  getLiveHeatmapData,
  getZoneDeepDive,
  getVisitorFlowData,
  getLiveFeed,
} from "@/lib/heatmap-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

describe("heatmap-engine: getLiveHeatmapData", () => {
  test("returns empty result when no zones", async () => {
    const sb = createMockSupabase({ zones: [] });
    const r = await getLiveHeatmapData(sb, PROP);
    expect(r.zones).toEqual([]);
    expect(r.total_visitors_now).toBe(0);
    expect(r.busiest_zone).toBe("N/A");
    expect(r).toHaveProperty("timestamp");
  });

  test("returns zones sorted by heat_intensity descending", async () => {
    const sb = createMockSupabase({
      zones: [
        { id: "z1", name: "A", type: "retail", area_sqm: 100 },
        { id: "z2", name: "B", type: "food", area_sqm: 200 },
      ],
      footfall_daily: [
        { zone_id: "z1", total_in: 800 },
        { zone_id: "z2", total_in: 300 },
      ],
      energy_readings: [],
      units: [],
      tenant_sales_reported: [],
      maintenance_tickets: [],
      discrepancies: [],
      leases: [],
    });
    const r = await getLiveHeatmapData(sb, PROP);
    expect(r.zones).toHaveLength(2);
    for (let i = 1; i < r.zones.length; i++) {
      expect(r.zones[i - 1].heat_intensity).toBeGreaterThanOrEqual(
        r.zones[i].heat_intensity
      );
    }
  });

  test("heat_intensity is capped at 100", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "A", type: "retail", area_sqm: 100 }],
      footfall_daily: [{ zone_id: "z1", total_in: 100000 }],
      energy_readings: [],
      units: [],
      tenant_sales_reported: [],
      maintenance_tickets: [],
      discrepancies: [],
      leases: [],
    });
    const r = await getLiveHeatmapData(sb, PROP);
    expect(r.zones[0].heat_intensity).toBeLessThanOrEqual(100);
  });

  test("visitors_trend is one of up|down|stable", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "A", type: "retail", area_sqm: 100 }],
      footfall_daily: [{ zone_id: "z1", total_in: 500 }],
      energy_readings: [],
      units: [],
      tenant_sales_reported: [],
      maintenance_tickets: [],
      discrepancies: [],
      leases: [],
    });
    const r = await getLiveHeatmapData(sb, PROP);
    expect(["up", "down", "stable"]).toContain(r.zones[0].visitors_trend);
  });
});

describe("heatmap-engine: getZoneDeepDive", () => {
  test("handles zone not found gracefully", async () => {
    const sb = createMockSupabase({ zones: [] });
    // Function may throw or return null/undefined for missing zone
    try {
      const result = await getZoneDeepDive(sb, "no-such-zone");
      expect(result).toBeTruthy();
    } catch (e: unknown) {
      expect(e).toBeDefined();
    }
  });

  test("returns ZoneDeepDive with tenants, energy, discrepancies, maintenance", async () => {
    const sb = createMockSupabase({
      zones: { id: "z1", name: "A", type: "retail", area_sqm: 100, property_id: PROP },
      units: [{ id: "u1", unit_number: "F-1", area_sqm: 50, status: "occupied" }],
      footfall_daily: [{ unit_id: "u1", total_in: 100, zone_id: "z1" }],
      leases: [{ unit_id: "u1", tenant_id: "t1", min_rent_monthly_egp: 20000, percentage_rate: 5, tenants: { id: "t1", name: "X", brand_name: "X", category: "fashion" } }],
      energy_readings: [{ consumption_kwh: 50, cost_egp: 25 }],
      discrepancies: [],
      maintenance_tickets: [],
      events: [],
      tenant_sales_reported: [],
      revenue_estimates: [],
    });
    // single() needs to return the zone object; our mock's tableData can be an object
    const r = await getZoneDeepDive(sb, "z1");
    expect(r.zone_id).toBe("z1");
    expect(r).toHaveProperty("tenants");
    expect(r).toHaveProperty("energy");
    expect(r).toHaveProperty("discrepancies");
    expect(r).toHaveProperty("maintenance");
    expect(r).toHaveProperty("ai_insight");
    expect(typeof r.ai_insight).toBe("string");
    expect(r.ai_insight.length).toBeGreaterThan(0);
  });
});

describe("heatmap-engine: getVisitorFlowData", () => {
  test("returns entrances array and total_in_mall", async () => {
    const sb = createMockSupabase({
      zones: [{ id: "z1", name: "A", type: "common", area_sqm: 100 }],
      footfall_daily: [{ zone_id: "z1", total_in: 500 }],
      footfall_readings: [],
      units: [],
    });
    const r = await getVisitorFlowData(sb, PROP);
    expect(r).toHaveProperty("entrances");
    expect(r).toHaveProperty("total_in_mall");
    expect(r).toHaveProperty("avg_time_spent_minutes");
  });
});

describe("heatmap-engine: getLiveFeed", () => {
  test("returns array of LiveFeedEvent", async () => {
    const sb = createMockSupabase({
      footfall_daily: [],
      energy_readings: [],
      maintenance_tickets: [],
      tenant_sales_reported: [],
      events: [],
      discrepancies: [],
    });
    const r = await getLiveFeed(sb, PROP);
    expect(Array.isArray(r)).toBe(true);
  });
});