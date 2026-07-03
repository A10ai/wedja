import { describe, test, expect } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  getContractOverview,
  getExpiringLeases,
  getEscalationTracker,
  getLeasePerformance,
  getRentVsSalesAnalysis,
  getContractAlerts,
  getPortfolioAnalytics,
} from "@/lib/contract-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

function leaseRows() {
  return [
    {
      id: "l1",
      tenant_id: "t1",
      unit_id: "u1",
      property_id: PROP,
      status: "active",
      start_date: "2024-01-01",
      end_date: "2027-01-01",
      min_rent_monthly_egp: 50000,
      percentage_rate: 7,
      escalation_rate: 5,
      tenant: { id: "t1", name: "Adidas", brand_name: "Adidas", category: "fashion", status: "active" },
      unit: { id: "u1", name: "Unit 1", unit_number: "F-12", area_sqm: 200, status: "occupied", zone: { id: "z1", name: "Zone A" } },
    },
    {
      id: "l2",
      tenant_id: "t2",
      unit_id: "u2",
      property_id: PROP,
      status: "expired",
      start_date: "2022-01-01",
      end_date: "2024-01-01",
      min_rent_monthly_egp: 30000,
      percentage_rate: 5,
      escalation_rate: 3,
      tenant: { id: "t2", name: "KFC", brand_name: "KFC", category: "food", status: "active" },
      unit: { id: "u2", name: "Unit 2", unit_number: "F-01", area_sqm: 120, status: "occupied", zone: { id: "z2", name: "Zone B" } },
    },
  ];
}

describe("contract-engine: getContractOverview", () => {
  test("counts active/expired/pending leases correctly", async () => {
    const sb = createMockSupabase({
      leases: leaseRows(),
      units: [
        { id: "u1", area_sqm: 200, status: "occupied" },
        { id: "u2", area_sqm: 120, status: "occupied" },
        { id: "u3", area_sqm: 80, status: "vacant" },
      ],
      tenant_sales_reported: [],
    });
    const r = await getContractOverview(sb, PROP);
    expect(r.total_leases).toBe(2);
    expect(r.active_leases).toBe(1);
    expect(r.expired_leases).toBe(1);
    expect(r.total_units).toBe(3);
    expect(r.occupied_units).toBe(2);
  });

  test("occupancy_rate = occupied/total * 100", async () => {
    const sb = createMockSupabase({
      leases: [],
      units: [
        { id: "u1", area_sqm: 100, status: "occupied" },
        { id: "u2", area_sqm: 100, status: "vacant" },
      ],
      tenant_sales_reported: [],
    });
    const r = await getContractOverview(sb, PROP);
    expect(r.occupancy_rate).toBe(50);
  });

  test("vacant_area_sqm = total - occupied", async () => {
    const sb = createMockSupabase({
      leases: [],
      units: [
        { id: "u1", area_sqm: 300, status: "occupied" },
        { id: "u2", area_sqm: 100, status: "vacant" },
      ],
      tenant_sales_reported: [],
    });
    const r = await getContractOverview(sb, PROP);
    expect(r.total_leased_area_sqm).toBe(300);
    expect(r.vacant_area_sqm).toBe(100);
  });

  test("total_monthly_min_rent_egp sums active leases only", async () => {
    const sb = createMockSupabase({
      leases: leaseRows(),
      units: [{ id: "u1", area_sqm: 200, status: "occupied" }],
      tenant_sales_reported: [],
    });
    const r = await getContractOverview(sb, PROP);
    expect(r.total_monthly_min_rent_egp).toBe(50000); // only active l1
  });
});

describe("contract-engine: getExpiringLeases", () => {
  test("returns empty array when no leases match cutoff", async () => {
    const sb = createMockSupabase({ leases: [] });
    const r = await getExpiringLeases(sb, PROP, 180);
    expect(r).toEqual([]);
  });

  test("returns leases with end_date within cutoff", async () => {
    const soon = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
    const sb = createMockSupabase({
      leases: [
        {
          id: "l1",
          tenant_id: "t1",
          unit_id: "u1",
          property_id: PROP,
          status: "active",
          start_date: "2024-01-01",
          end_date: soon,
          min_rent_monthly_egp: 50000,
          percentage_rate: 7,
          escalation_rate: 5,
          tenant: { id: "t1", name: "X", brand_name: "X", category: "fashion" },
          unit: { id: "u1", unit_number: "F-1", area_sqm: 100 },
        },
      ],
      rent_transactions: [],
      tenant_sales_reported: [],
      discrepancies: [],
    });
    const r = await getExpiringLeases(sb, PROP, 180);
    expect(r).toHaveLength(1);
    expect(r[0].days_until_expiry).toBeGreaterThan(0);
    expect(r[0].days_until_expiry).toBeLessThanOrEqual(180);
    expect(["renew", "do_not_renew", "negotiate"]).toContain(r[0].recommendation_type);
  });
});

describe("contract-engine: getEscalationTracker", () => {
  test("returns escalations with post_escalation_rent", async () => {
    const future = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
    const sb = createMockSupabase({
      leases: [
        {
          id: "l1",
          tenant_id: "t1",
          unit_id: "u1",
          property_id: PROP,
          status: "active",
          start_date: "2024-01-01",
          end_date: future,
          min_rent_monthly_egp: 100000,
          percentage_rate: 0,
          escalation_rate: 10,
          tenant: { id: "t1", name: "X", brand_name: "X", category: "fashion" },
          unit: { id: "u1", unit_number: "F-1", area_sqm: 100 },
        },
      ],
    });
    const r = await getEscalationTracker(sb, PROP);
    expect(r.length).toBeGreaterThan(0);
    const e = r[0];
    expect(e.current_rent).toBe(100000);
    expect(e.escalation_rate).toBe(10);
    expect(e.increase_amount).toBe(10000);
    expect(e.post_escalation_rent).toBe(110000);
  });
});

describe("contract-engine: getLeasePerformance", () => {
  test("returns performance items with score in {good,watch,underperforming}", async () => {
    const future = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
    const sb = createMockSupabase({
      leases: [
        {
          id: "l1",
          tenant_id: "t1",
          unit_id: "u1",
          property_id: PROP,
          status: "active",
          start_date: "2024-01-01",
          end_date: future,
          min_rent_monthly_egp: 50000,
          percentage_rate: 7,
          escalation_rate: 0,
          tenant: { id: "t1", name: "X", brand_name: "X", category: "fashion" },
          unit: { id: "u1", unit_number: "F-1", area_sqm: 100 },
        },
      ],
      rent_transactions: [{ lease_id: "l1", status: "paid" }],
      tenant_sales_reported: [{ tenant_id: "t1", reported_revenue_egp: 500000 }],
    });
    const r = await getLeasePerformance(sb, PROP);
    expect(r.length).toBeGreaterThan(0);
    expect(["good", "watch", "underperforming"]).toContain(r[0].performance_score);
  });
});

describe("contract-engine: getRentVsSalesAnalysis", () => {
  test("returns items with paying_type and should_pay_type", async () => {
    const future = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
    const sb = createMockSupabase({
      leases: [
        {
          id: "l1",
          tenant_id: "t1",
          unit_id: "u1",
          property_id: PROP,
          status: "active",
          start_date: "2024-01-01",
          end_date: future,
          min_rent_monthly_egp: 50000,
          percentage_rate: 7,
          escalation_rate: 0,
          tenant: { id: "t1", name: "X", brand_name: "X", category: "fashion" },
          unit: { id: "u1", unit_number: "F-1", area_sqm: 100 },
        },
      ],
      rent_transactions: [],
      tenant_sales_reported: [{ tenant_id: "t1", reported_revenue_egp: 200000 }],
      revenue_estimates: [{ tenant_id: "t1", estimated_revenue_egp: 400000 }],
      discrepancies: [],
    });
    const r = await getRentVsSalesAnalysis(sb, PROP);
    expect(r.length).toBeGreaterThan(0);
    expect(["min_rent", "percentage"]).toContain(r[0].paying_type);
    expect(["min_rent", "percentage"]).toContain(r[0].should_pay_type);
  });
});

describe("contract-engine: getContractAlerts", () => {
  test("returns an array of alerts with severity", async () => {
    const sb = createMockSupabase({
      leases: [],
      units: [],
      rent_transactions: [],
      tenant_sales_reported: [],
      discrepancies: [],
      maintenance_tickets: [],
    });
    const r = await getContractAlerts(sb, PROP);
    expect(Array.isArray(r)).toBe(true);
    for (const a of r) {
      expect(["critical", "warning", "info", "opportunity"]).toContain(a.severity);
    }
  });
});

describe("contract-engine: getPortfolioAnalytics", () => {
  test("returns wale_years and rent_roll array", async () => {
    const sb = createMockSupabase({
      leases: leaseRows(),
      units: [{ id: "u1", area_sqm: 200, status: "occupied" }],
      rent_transactions: [],
      tenant_sales_reported: [],
    });
    const r = await getPortfolioAnalytics(sb, PROP);
    expect(r).toHaveProperty("wale_years");
    expect(r).toHaveProperty("rent_roll");
    expect(Array.isArray(r.rent_roll)).toBe(true);
    expect(r).toHaveProperty("tenant_concentration");
  });
});