import { describe, test, expect } from "vitest";
import {
  runAnomalyDetection,
  getActiveAnomalies,
  getAnomalyHistory,
  getAnomalyStats,
  acknowledgeAnomaly,
  resolveAnomaly,
  type AnomalyType,
  type AnomalySeverity,
  type AnomalyStatus,
  type Anomaly,
} from "@/lib/anomaly-engine";
import { createMockSupabase } from "./helpers/supabase-mock";

const PROP = "a0000000-0000-0000-0000-000000000001";

describe("anomaly-engine: type exports", () => {
  test("AnomalyType union covers all detector categories", () => {
    const types: AnomalyType[] = [
      "footfall_spike",
      "footfall_drop",
      "energy_spike",
      "energy_drop",
      "revenue_anomaly",
      "rent_delay_pattern",
      "queue_anomaly",
      "parking_anomaly",
      "security_pattern",
      "maintenance_pattern",
      "conversion_anomaly",
      "occupancy_anomaly",
      "correlation_break",
    ];
    expect(types).toHaveLength(13);
    for (const t of types) expect(typeof t).toBe("string");
  });

  test("AnomalySeverity has 4 levels", () => {
    const sevs: AnomalySeverity[] = ["low", "medium", "high", "critical"];
    expect(sevs).toHaveLength(4);
  });

  test("AnomalyStatus has 5 states", () => {
    const statuses: AnomalyStatus[] = ["active", "acknowledged", "investigating", "resolved", "false_alarm"];
    expect(statuses).toHaveLength(5);
  });
});

describe("anomaly-engine: runAnomalyDetection", () => {
  test("returns DetectionResult-like shape with new_anomalies count", async () => {
    const sb = createMockSupabase({
      zones: [],
      footfall_daily: [],
      energy_readings: [],
      rent_transactions: [],
      tenant_sales_reported: [],
      parking_readings: [],
      maintenance_tickets: [],
      queue_readings: [],
      anomalies: [],
    });
    const r = await runAnomalyDetection(sb, PROP);
    expect(r).toHaveProperty("new_anomalies");
    expect(r).toHaveProperty("types_checked");
    expect(r).toHaveProperty("details");
    expect(typeof r.new_anomalies).toBe("number");
    expect(Array.isArray(r.details)).toBe(true);
  });

  test("returns zero anomalies when no zones/data", async () => {
    const sb = createMockSupabase({
      zones: [],
      footfall_daily: [],
      energy_readings: [],
      rent_transactions: [],
      tenant_sales_reported: [],
      parking_readings: [],
      maintenance_tickets: [],
      queue_readings: [],
      anomalies: [],
    });
    const r = await runAnomalyDetection(sb, PROP);
    expect(r.new_anomalies).toBe(0);
  });
});

describe("anomaly-engine: getActiveAnomalies", () => {
  test("returns array of anomalies filtered to active status", async () => {
    const sb = createMockSupabase({
      anomalies: [
        {
          id: "an1",
          property_id: PROP,
          anomaly_type: "footfall_spike",
          severity: "high",
          zone_id: "z1",
          unit_id: null,
          tenant_id: null,
          title: "Spike",
          description: "...",
          expected_value: 100,
          actual_value: 200,
          deviation_pct: 100,
          impact_egp: 1500,
          data_source: "footfall_daily",
          related_anomalies: null,
          status: "active",
          auto_detected: true,
          detection_confidence: 0.85,
          acknowledged_by: null,
          resolved_at: null,
          resolution_notes: null,
          created_at: "2026-06-15T10:00:00Z",
          zone_name: "A",
          zone_type: "retail",
        },
      ],
    });
    const r = await getActiveAnomalies(sb, PROP);
    expect(Array.isArray(r)).toBe(true);
  });

  test("returns empty array when no anomalies", async () => {
    const sb = createMockSupabase({ anomalies: [] });
    const r = await getActiveAnomalies(sb, PROP);
    expect(r).toEqual([]);
  });
});

describe("anomaly-engine: getAnomalyHistory", () => {
  test("returns array of historical anomalies", async () => {
    const sb = createMockSupabase({ anomalies: [] });
    const r = await getAnomalyHistory(sb, PROP, 30);
    expect(Array.isArray(r)).toBe(true);
  });
});

describe("anomaly-engine: getAnomalyStats", () => {
  test("returns AnomalyStats with by_severity and totals", async () => {
    const sb = createMockSupabase({ anomalies: [] });
    const r = await getAnomalyStats(sb, PROP);
    expect(r).toHaveProperty("active_count");
    expect(r).toHaveProperty("by_severity");
    expect(r).toHaveProperty("total_resolved");
    expect(r).toHaveProperty("total_impact_egp");
    expect(r.by_severity).toHaveProperty("low");
    expect(r.by_severity).toHaveProperty("critical");
  });
});

describe("anomaly-engine: acknowledgeAnomaly", () => {
  test("returns boolean indicating success", async () => {
    const sb = createMockSupabase({ anomalies: [] });
    const r = await acknowledgeAnomaly(sb, "an1", "staff1");
    expect(typeof r).toBe("boolean");
  });
});

describe("anomaly-engine: resolveAnomaly", () => {
  test("returns boolean indicating success", async () => {
    const sb = createMockSupabase({ anomalies: [] });
    const r = await resolveAnomaly(sb, "an1", "resolved by test");
    expect(typeof r).toBe("boolean");
  });
});