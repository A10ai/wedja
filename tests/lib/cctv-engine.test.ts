/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getPeopleCountLive,
  getVisitorFlow,
  getDwellAnalysis,
  getQueueStatus,
  getOccupancyStatus,
  getDeadZones,
  getDemographics,
  getParkingStatus,
  getSecurityAlerts,
  getStoreConversion,
  getCCTVDashboardData,
} from "@/lib/cctv-engine";
import { createScriptedSupabase, type QueryCtx } from "./helpers/scripted-supabase";
import { createMockSupabase } from "./helpers/supabase-mock";

const PROP = "a0000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-10-26T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

// ── People count ─────────────────────────────────────────────

describe("cctv-engine: getPeopleCountLive", () => {
  test("returns [] when there are no zones (or zones query returns null)", async () => {
    expect(await getPeopleCountLive(createMockSupabase({ zones: [] }), PROP)).toEqual([]);
    expect(await getPeopleCountLive(createMockSupabase({}), PROP)).toEqual([]);
  });

  test("excludes parking, sums today's footfall, falls back to area/4 capacity and sorts by current count", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "zones") return [
        { id: "Z1", name: "Food Court", type: "food", area_sqm: 2000 },
        { id: "Z2", name: "Fashion", type: "retail", area_sqm: null },
      ];
      if (ctx.table === "occupancy_readings")
        return ctx.eq("zone_id") === "Z2" ? [{ current_count: 300, capacity: 800, occupancy_pct: 37.5 }] : [];
      if (ctx.table === "footfall_daily")
        return ctx.eq("zone_id") === "Z1" ? [{ total_in: 100 }, { total_in: null }, { total_in: 50 }] : [];
      return [];
    });
    const r = await getPeopleCountLive(sb, PROP);
    expect(r.map((z) => z.zone_id)).toEqual(["Z2", "Z1"]);
    expect(r[1]).toEqual({ zone_id: "Z1", zone_name: "Food Court", zone_type: "food", current_count: 0, today_total: 150, capacity: 500, occupancy_pct: 0 });
    expect(r[0].capacity).toBe(800);
    const zq = sb._calls.find((c: QueryCtx) => c.table === "zones");
    expect(zq.filters).toContainEqual(["neq", "type", "parking"]);
    const fq = sb._calls.find((c: QueryCtx) => c.table === "footfall_daily");
    expect(fq.eq("date")).toBe("2026-10-26");
  });

  test("zone with no area and no reading uses default 1000 sqm → capacity 250", async () => {
    const sb = createScriptedSupabase((ctx) => (ctx.table === "zones" ? [{ id: "Z", name: "X", type: "retail", area_sqm: 0 }] : []));
    const [z] = await getPeopleCountLive(sb, PROP);
    expect(z.capacity).toBe(250);
  });
});

// ── Visitor flow ─────────────────────────────────────────────

describe("cctv-engine: getVisitorFlow", () => {
  test("empty → zeroed structure and does not query zones", async () => {
    const sb = createScriptedSupabase(() => []);
    expect(await getVisitorFlow(sb, PROP)).toEqual({ paths: [], entry_points: [], total_movements: 0 });
    expect(sb._calls.map((c: QueryCtx) => c.table)).toEqual(["visitor_flow"]);
  });

  test("window defaults to last 24h and honours custom hours", async () => {
    const sb = createScriptedSupabase(() => []);
    await getVisitorFlow(sb, PROP);
    await getVisitorFlow(sb, PROP, 2);
    expect(sb._calls[0].arg("gte", "timestamp")).toBe("2026-10-25T12:00:00.000Z");
    expect(sb._calls[1].arg("gte", "timestamp")).toBe("2026-10-26T10:00:00.000Z");
  });

  test("aggregates duplicate paths, ignores rows missing an endpoint, computes 1-dp percentages", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "visitor_flow") return [
        { from_zone_id: "A", to_zone_id: "B", count: 10, direction: "enter" },
        { from_zone_id: "A", to_zone_id: "B", count: 10, direction: "move" },
        { from_zone_id: "B", to_zone_id: "C", count: 10, direction: "move" },
        { from_zone_id: "X", to_zone_id: "A", count: null, direction: "enter" },
        { from_zone_id: null, to_zone_id: "A", count: 999, direction: "enter" },
        { from_zone_id: "C", to_zone_id: null, count: 999, direction: "exit" },
      ];
      if (ctx.table === "zones") return [{ id: "A", name: "Entrance" }, { id: "B", name: "Atrium" }, { id: "C", name: "Food" }];
      return [];
    });
    const r = await getVisitorFlow(sb, PROP);
    expect(r.total_movements).toBe(30);
    expect(r.paths[0]).toMatchObject({ from_zone_name: "Entrance", to_zone_name: "Atrium", count: 20, pct_of_total: 66.7 });
    expect(r.paths[1]).toMatchObject({ count: 10, pct_of_total: 33.3 });
    expect(r.paths[2]).toMatchObject({ from_zone_name: "Unknown", count: 0, pct_of_total: 0 });
    expect(r.entry_points).toEqual([
      { zone_name: "Entrance", count: 10, pct: 100 },
      { zone_name: "Unknown", count: 0, pct: 0 },
    ]);
  });

  test("returns at most 20 paths, highest count first", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ from_zone_id: `F${i}`, to_zone_id: "T", count: i + 1, direction: "move" }));
    const sb = createScriptedSupabase((ctx) => (ctx.table === "visitor_flow" ? rows : []));
    const r = await getVisitorFlow(sb, PROP);
    expect(r.paths).toHaveLength(20);
    expect(r.paths[0].count).toBe(25);
    expect(r.paths[19].count).toBe(6);
    // percentages are relative to ALL movements, including those trimmed from the top-20
    expect(r.total_movements).toBe(325);
  });
});

// ── Dwell ────────────────────────────────────────────────────

describe("cctv-engine: getDwellAnalysis", () => {
  test("empty → zeros", async () => {
    expect(await getDwellAnalysis(createScriptedSupabase(() => []), PROP)).toEqual({ units: [], avg_dwell_all: 0, top_dwell: [], bottom_dwell: [] });
  });

  test("queries the given date's full-day window", async () => {
    const sb = createScriptedSupabase(() => []);
    await getDwellAnalysis(sb, PROP, "2026-02-28");
    expect(sb._calls[0].arg("gte", "timestamp")).toBe("2026-02-28T00:00:00");
    expect(sb._calls[0].arg("lte", "timestamp")).toBe("2026-02-28T23:59:59");
  });

  test("averages per unit, keeps max of max, sums people, resolves names and defaults to Vacant", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "dwell_readings") return [
        { unit_id: "U1", zone_id: "Z1", avg_dwell_seconds: 100, max_dwell_seconds: 300, people_stopped: 5, people_passed: 50, stop_rate: 10 },
        { unit_id: "U1", zone_id: "Z1", avg_dwell_seconds: 201, max_dwell_seconds: 250, people_stopped: 7, people_passed: 30, stop_rate: 23.33 },
        { unit_id: "U2", zone_id: "Z9", avg_dwell_seconds: 50, max_dwell_seconds: 60, people_stopped: null, people_passed: 10, stop_rate: null },
        { unit_id: null, zone_id: "Z1", avg_dwell_seconds: 9999 },
      ];
      if (ctx.table === "units") return [{ id: "U1", name: "Unit 1" }, { id: "U2", name: "Unit 2" }];
      if (ctx.table === "leases") return [{ unit_id: "U1", tenant: { brand_name: "Zara" } }, { unit_id: "U2", tenant: null }];
      if (ctx.table === "zones") return [{ id: "Z1", name: "Fashion" }];
      return [];
    });
    const r = await getDwellAnalysis(sb, PROP, "2026-10-26");
    expect(r.units).toEqual([
      { unit_id: "U1", unit_name: "Unit 1", tenant_name: "Zara", zone_name: "Fashion", avg_dwell_seconds: 151, max_dwell_seconds: 300, people_stopped: 12, people_passed: 80, stop_rate: 16.7 },
      { unit_id: "U2", unit_name: "Unit 2", tenant_name: "Vacant", zone_name: "Unknown", avg_dwell_seconds: 50, max_dwell_seconds: 60, people_stopped: 0, people_passed: 10, stop_rate: 0 },
    ]);
    expect(r.avg_dwell_all).toBe(101); // (151 + 50) / 2 = 100.5 → 101
    expect(r.bottom_dwell.map((u) => u.unit_id)).toEqual(["U2", "U1"]);
    // null unit ids are never sent to the units lookup
    expect(sb._calls.find((c: QueryCtx) => c.table === "units").arg("in", "id")).toEqual(["U1", "U2"]);
  });

  test("top/bottom lists are capped at 10 and bottom is ascending", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ unit_id: `U${i}`, zone_id: "Z", avg_dwell_seconds: (i + 1) * 10 }));
    const sb = createScriptedSupabase((ctx) => (ctx.table === "dwell_readings" ? rows : []));
    const r = await getDwellAnalysis(sb, PROP, "2026-10-26");
    expect(r.top_dwell).toHaveLength(10);
    expect(r.top_dwell[0].avg_dwell_seconds).toBe(150);
    expect(r.bottom_dwell).toHaveLength(10);
    expect(r.bottom_dwell[0].avg_dwell_seconds).toBe(10);
    expect(r.bottom_dwell[9].avg_dwell_seconds).toBe(100);
  });
});

// ── Queues ───────────────────────────────────────────────────

describe("cctv-engine: getQueueStatus", () => {
  const zero = { active_queues: [], total_queued: 0, alerts_count: 0, avg_wait_minutes: 0 };

  test("no occupied units or no readings → zeros", async () => {
    expect(await getQueueStatus(createScriptedSupabase(() => []), PROP)).toEqual(zero);
    const sb = createScriptedSupabase((ctx) => (ctx.table === "units" ? [{ id: "U1" }] : []));
    expect(await getQueueStatus(sb, PROP)).toEqual(zero);
  });

  test("uses only the latest reading per unit, drops empty queues and averages wait to 1 dp", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "units" && ctx.has("eq", "status")) return [{ id: "U1" }, { id: "U2" }, { id: "U3" }];
      if (ctx.table === "units") return [{ id: "U1", name: "McDonald's" }, { id: "U2", name: "KFC" }];
      if (ctx.table === "queue_readings") return [
        // ordered newest first, as requested by the engine
        { unit_id: "U1", queue_length: 4, estimated_wait_minutes: 5, alert_triggered: false, timestamp: "t3" },
        { unit_id: "U2", queue_length: 12, estimated_wait_minutes: 15.5, alert_triggered: true, timestamp: "t3" },
        { unit_id: "U3", queue_length: 0, estimated_wait_minutes: 0, alert_triggered: false, timestamp: "t3" },
        { unit_id: "U1", queue_length: 40, estimated_wait_minutes: 60, alert_triggered: true, timestamp: "t1" },
      ];
      if (ctx.table === "leases") return [{ unit_id: "U2", tenant: { brand_name: "KFC" } }];
      return [];
    });
    const r = await getQueueStatus(sb, PROP);
    expect(r.active_queues.map((q) => [q.unit_id, q.queue_length, q.tenant_name])).toEqual([
      ["U2", 12, "KFC"],
      ["U1", 4, "Unknown"],
    ]);
    expect(r.total_queued).toBe(16);
    expect(r.alerts_count).toBe(1);
    expect(r.avg_wait_minutes).toBe(10.3); // (5 + 15.5) / 2 = 10.25 → 10.3
    const q = sb._calls.find((c: QueryCtx) => c.table === "queue_readings");
    expect(q.arg("gte", "timestamp")).toBe("2026-10-26T09:00:00.000Z");
  });
});

// ── Occupancy ────────────────────────────────────────────────

describe("cctv-engine: getOccupancyStatus", () => {
  test("no zones → zeros", async () => {
    expect(await getOccupancyStatus(createScriptedSupabase(() => []), PROP)).toEqual({ zones: [], total_current: 0, total_capacity: 0, overall_pct: 0, alerts: [] });
  });

  test("skips zones without readings, computes overall % and alerts on near/over capacity", async () => {
    const readings: Record<string, any> = {
      Z1: { current_count: 900, capacity: 1000, occupancy_pct: 90, status: "near_capacity" },
      Z2: { current_count: 120, capacity: 100, occupancy_pct: 120, status: "over_capacity" },
      Z3: { current_count: 10, capacity: 200, occupancy_pct: 5, status: "normal" },
    };
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "zones") return ["Z1", "Z2", "Z3", "Z4"].map((id) => ({ id, name: id, type: "retail" }));
      if (ctx.table === "occupancy_readings") return readings[ctx.eq("zone_id")] ? [readings[ctx.eq("zone_id")]] : [];
      return [];
    });
    const r = await getOccupancyStatus(sb, PROP);
    expect(r.zones.map((z) => z.zone_id)).toEqual(["Z2", "Z1", "Z3"]);
    expect(r.total_current).toBe(1030);
    expect(r.total_capacity).toBe(1300);
    expect(r.overall_pct).toBe(79.2);
    expect(r.alerts).toEqual([
      { zone_name: "Z1", status: "near_capacity", pct: 90 },
      { zone_name: "Z2", status: "over_capacity", pct: 120 },
    ]);
  });

  test("zero total capacity yields 0% instead of NaN/Infinity", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "zones") return [{ id: "Z1", name: "Z1", type: "retail" }];
      if (ctx.table === "occupancy_readings") return [{ current_count: 5, capacity: 0, occupancy_pct: 0, status: "normal" }];
      return [];
    });
    expect((await getOccupancyStatus(sb, PROP)).overall_pct).toBe(0);
  });
});

// ── Dead zones ───────────────────────────────────────────────

describe("cctv-engine: getDeadZones", () => {
  test("ranks zones by relative traffic ascending with the matching recommendation tiers", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "zones") return [
        { id: "A", name: "A", type: "retail", area_sqm: 100 },
        { id: "B", name: "B", type: "retail", area_sqm: 0 },
        { id: "C", name: "C", type: "retail", area_sqm: 300 },
        { id: "D", name: "D", type: "retail", area_sqm: 100 },
        { id: "E", name: "E", type: "retail", area_sqm: 100 },
      ];
      if (ctx.table === "footfall_daily") return [
        { zone_id: "A", total_in: 600 },
        { zone_id: "A", total_in: 400 },
        { zone_id: "B", total_in: 100 },
        { zone_id: "C", total_in: 333 },
        { zone_id: "D", total_in: 590 },
        { zone_id: null, total_in: 1e9 },
      ];
      return [];
    });
    const r = await getDeadZones(sb, PROP, "2026-10-26");
    expect(r.map((z) => [z.zone_id, z.relative_traffic])).toEqual([["E", 0], ["B", 10], ["C", 33], ["D", 59], ["A", 100]]);
    expect(r[0].recommendation).toMatch(/^Low traffic area/);
    expect(r[2].recommendation).toMatch(/^Below average traffic/);
    expect(r[3].recommendation).toMatch(/^Moderate traffic/);
    expect(r[4].recommendation).toMatch(/^Good traffic levels/);
    // area 0 → per-sqm uses 1 sqm (no Infinity), area reported as-is
    expect(r[1]).toMatchObject({ footfall_per_sqm: 100, area_sqm: 0 });
    expect(r[2].footfall_per_sqm).toBe(1.11);
  });

  test("no footfall anywhere → all zones 0% relative traffic, no NaN", async () => {
    const sb = createScriptedSupabase((ctx) => (ctx.table === "zones" ? [{ id: "A", name: "A", type: "x", area_sqm: 10 }] : []));
    const [z] = await getDeadZones(sb, PROP);
    expect(z.relative_traffic).toBe(0);
    expect(z.footfall_per_sqm).toBe(0);
  });
});

// ── Demographics ─────────────────────────────────────────────

describe("cctv-engine: getDemographics", () => {
  test("empty → empty breakdowns", async () => {
    expect(await getDemographics(createScriptedSupabase(() => []), PROP, "2026-10-26")).toEqual({ group_breakdown: [], age_breakdown: [], time_patterns: [] });
  });

  test("breakdowns sum to ~100%, sorted by count; hourly patterns sorted by hour", async () => {
    const sb = createScriptedSupabase(() => [
      { group_type: "family", estimated_age_range: "adult", count: 30, timestamp: "2026-10-26T18:10:00" },
      { group_type: "solo", estimated_age_range: "young_adult", count: 50, timestamp: "2026-10-26T09:05:00" },
      { group_type: "couple", estimated_age_range: "senior", count: 20, timestamp: "2026-10-26T18:40:00" },
      { group_type: "family", estimated_age_range: "young_adult", count: null, timestamp: "2026-10-26T18:50:00" },
    ]);
    const r = await getDemographics(sb, PROP, "2026-10-26");
    expect(r.group_breakdown).toEqual([
      { type: "solo", count: 50, pct: 50 },
      { type: "family", count: 30, pct: 30 },
      { type: "couple", count: 20, pct: 20 },
    ]);
    expect(r.age_breakdown.reduce((s, a) => s + a.pct, 0)).toBeCloseTo(100, 5);
    expect(r.time_patterns).toEqual([
      { hour: 9, families: 0, young_adults: 50, seniors: 0 },
      { hour: 18, families: 30, young_adults: 0, seniors: 20 },
    ]);
  });

  test("all-zero counts give 0% rather than NaN", async () => {
    const sb = createScriptedSupabase(() => [{ group_type: "solo", estimated_age_range: "adult", count: 0, timestamp: "2026-10-26T10:00:00" }]);
    const r = await getDemographics(sb, PROP, "2026-10-26");
    expect(r.group_breakdown[0].pct).toBe(0);
  });
});

// ── Parking ──────────────────────────────────────────────────

describe("cctv-engine: getParkingStatus", () => {
  test("no readings → defaults (500 spaces) and a 24-slot zero trend", async () => {
    const r = await getParkingStatus(createScriptedSupabase(() => []), PROP);
    expect(r.total_spaces).toBe(500);
    expect(r.current_occupied).toBe(0);
    expect(r.hourly_trend).toHaveLength(24);
    expect(r.hourly_trend.every((h, i) => h.hour === i && h.occupied === 0)).toBe(true);
    expect(r.peak_hour).toBe(0);
    expect(r.peak_occupancy).toBe(0);
  });

  test("latest reading per hour wins and earliest peak hour is chosen on ties", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.has("limit")) return [{ occupied_spaces: 410, total_spaces: 600, occupancy_pct: 68.3, cars_entered_hour: 40, cars_exited_hour: 12, avg_duration_minutes: 95 }];
      return [
        { timestamp: "2026-10-26T10:00:00", occupied_spaces: 100, occupancy_pct: 16 },
        { timestamp: "2026-10-26T10:45:00", occupied_spaces: 450, occupancy_pct: 75 },
        { timestamp: "2026-10-26T19:00:00", occupied_spaces: 450, occupancy_pct: 75 },
        { timestamp: "2026-10-26T21:00:00", occupied_spaces: 300, occupancy_pct: 50 },
      ];
    });
    const r = await getParkingStatus(sb, PROP);
    expect(r.hourly_trend[10]).toEqual({ hour: 10, occupied: 450, pct: 75 });
    expect(r.peak_hour).toBe(10);
    expect(r.peak_occupancy).toBe(450);
    expect(r).toMatchObject({ current_occupied: 410, total_spaces: 600, cars_entered_hour: 40, avg_duration_minutes: 95 });
  });
});

// ── Security ─────────────────────────────────────────────────

describe("cctv-engine: getSecurityAlerts", () => {
  test("empty → zeros", async () => {
    const r = await getSecurityAlerts(createScriptedSupabase(() => []), PROP);
    expect(r).toEqual({ active_alerts: [], total_active: 0, total_this_week: 0, false_alarm_rate: 0, avg_response_minutes: 0, by_severity: [] });
  });

  test("status filter is only applied when provided", async () => {
    const sb = createScriptedSupabase(() => []);
    await getSecurityAlerts(sb, PROP);
    await getSecurityAlerts(sb, PROP, "active");
    expect(sb._calls[0].has("eq", "status")).toBe(false);
    expect(sb._calls[1].eq("status")).toBe("active");
  });

  test("computes active set, 7-day window, false-alarm rate, avg response and severity order", async () => {
    const sb = createScriptedSupabase(() => [
      { id: "1", alert_type: "loitering", severity: "low", status: "active", created_at: "2026-10-26T10:00:00.000Z", resolved_at: null, zones: { name: "Gate" }, camera_feeds: { name: "Cam 1" } },
      { id: "2", alert_type: "intrusion", severity: "critical", status: "acknowledged", created_at: "2026-10-20T10:00:00.000Z", resolved_at: null },
      { id: "3", alert_type: "fight", severity: "high", status: "resolved", created_at: "2026-10-10T10:00:00.000Z", resolved_at: "2026-10-10T10:30:00.000Z" },
      { id: "4", alert_type: "motion", severity: "weird", status: "false_alarm", created_at: "2026-10-19T12:00:00.000Z", resolved_at: "2026-10-19T12:10:00.000Z" },
    ]);
    const r = await getSecurityAlerts(sb, PROP);
    expect(r.active_alerts.map((a) => a.id)).toEqual(["1", "2"]);
    expect(r.active_alerts[1]).toMatchObject({ zone_name: "Unknown", camera_name: "Unknown" });
    expect(r.total_active).toBe(2);
    // boundary: created exactly 7 days ago counts as this week
    expect(r.total_this_week).toBe(3);
    expect(r.false_alarm_rate).toBe(25);
    expect(r.avg_response_minutes).toBe(20);
    expect(r.by_severity.map((s) => s.severity)).toEqual(["critical", "high", "low", "weird"]);
  });
});

// ── Store conversion ─────────────────────────────────────────

describe("cctv-engine: getStoreConversion", () => {
  test("empty → zeros", async () => {
    expect(await getStoreConversion(createScriptedSupabase(() => []), PROP, "2026-10-26")).toEqual({ stores: [], avg_conversion_rate: 0, top_converters: [], bottom_converters: [] });
  });

  test("sorts by conversion, averages to 1 dp and labels unleased units Vacant", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "store_conversion") return [
        { unit_id: "U1", passersby: 1000, entered: 100, conversion_rate: 10, avg_time_in_store_seconds: 300 },
        { unit_id: "U2", passersby: 500, entered: 125, conversion_rate: 25, avg_time_in_store_seconds: 200 },
        { unit_id: "U3", passersby: 0, entered: 0, conversion_rate: 0, avg_time_in_store_seconds: 0 },
      ];
      if (ctx.table === "units") return [{ id: "U1", name: "G-01" }, { id: "U2", name: "G-02" }];
      if (ctx.table === "leases") return [{ unit_id: "U1", tenant: { brand_name: "Adidas" } }];
      return [];
    });
    const r = await getStoreConversion(sb, PROP, "2026-10-26");
    expect(r.stores.map((s) => s.unit_id)).toEqual(["U2", "U1", "U3"]);
    expect(r.avg_conversion_rate).toBe(11.7);
    expect(r.stores.find((s) => s.unit_id === "U3")).toMatchObject({ unit_name: "Unknown", tenant_name: "Vacant" });
    expect(r.bottom_converters[0].unit_id).toBe("U3");
  });
});

// ── Dashboard ────────────────────────────────────────────────

describe("cctv-engine: getCCTVDashboardData", () => {
  test("aggregates sub-reports and counts only active cameras online", async () => {
    const sb = createScriptedSupabase((ctx) => {
      switch (ctx.table) {
        case "zones": return [{ id: "Z1", name: "Z1", type: "retail" }];
        case "occupancy_readings": return [{ current_count: 250, capacity: 500, occupancy_pct: 50, status: "normal" }];
        case "parking_readings": return ctx.has("limit") ? [{ occupancy_pct: 72, occupied_spaces: 360, total_spaces: 500 }] : [];
        case "security_alerts": return [{ id: "s", severity: "high", status: "active", created_at: NOW.toISOString(), resolved_at: null }];
        case "camera_feeds": return [{ id: "c1", status: "active" }, { id: "c2", status: "offline" }, { id: "c3", status: "active" }];
        default: return [];
      }
    });
    const r = await getCCTVDashboardData(sb, PROP);
    expect(r).toMatchObject({
      total_visitors_now: 250,
      parking_occupancy_pct: 72,
      active_queues: 0,
      security_alerts: 1,
      avg_dwell_seconds: 0,
      cameras_online: 2,
      cameras_total: 3,
      zones_monitored: 1,
      data_freshness: NOW.toISOString(),
    });
  });

  test("entirely empty database produces a zeroed overview without throwing", async () => {
    const r = await getCCTVDashboardData(createMockSupabase({}), PROP);
    expect(r.total_visitors_now).toBe(0);
    expect(r.cameras_total).toBe(0);
    expect(r.zones_monitored).toBe(0);
  });
});
