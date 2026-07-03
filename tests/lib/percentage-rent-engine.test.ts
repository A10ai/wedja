import { describe, test, expect, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  calculatePercentageRent,
  getPercentageRentTrend,
  getInflationHedgeAnalysis,
  getPercentageRateOptimization,
  getRentCompositionBreakdown,
} from "@/lib/percentage-rent-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

function leasesData() {
  return [
    {
      id: "l1",
      tenant_id: "t1",
      unit_id: "u1",
      property_id: PROP,
      status: "active",
      min_rent_monthly_egp: 50000,
      percentage_rate: 7,
      tenant: { id: "t1", name: "Adidas", brand_name: "Adidas", category: "fashion" },
      unit: { id: "u1", unit_number: "F-12", area_sqm: 200 },
    },
    {
      id: "l2",
      tenant_id: "t2",
      unit_id: "u2",
      property_id: PROP,
      status: "active",
      min_rent_monthly_egp: 30000,
      percentage_rate: 5,
      tenant: { id: "t2", name: "KFC", brand_name: "KFC", category: "food" },
      unit: { id: "u2", unit_number: "F-01", area_sqm: 120 },
    },
  ];
}

describe("percentage-rent-engine: calculatePercentageRent", () => {
  test("returns empty overview when no active leases", async () => {
    const sb = createMockSupabase({ leases: [] });
    const r = await calculatePercentageRent(sb, PROP, 6, 2026);
    expect(r.total_base_rent_egp).toBe(0);
    expect(r.tenants).toHaveLength(0);
    expect(r.tenants_paying_minimum_only.count).toBe(0);
  });

  test("aggregates base rent from active leases", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 1_000_000 },
        { tenant_id: "t2", reported_revenue_egp: 400_000 },
      ],
      revenue_estimates: [],
    });
    const r = await calculatePercentageRent(sb, PROP, 6, 2026);
    expect(r.total_base_rent_egp).toBe(80000);
    expect(r.tenants).toHaveLength(2);
  });

  test("percentage rent = reported_sales * pctRate; uses max(min, pct)", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 2_000_000 }, // 7% = 140k > 50k min
      ],
      revenue_estimates: [],
    });
    const r = await calculatePercentageRent(sb, PROP, 6, 2026);
    const adidas = r.tenants.find((t) => t.tenant_id === "t1")!;
    expect(adidas.actual_rent_type).toBe("percentage");
    expect(adidas.reported_percentage_rent).toBe(140000);
    expect(adidas.rent_paid).toBe(140000);
  });

  test("tenant paying minimum only when pct rent < min rent", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 100_000 }, // 7% = 7k < 50k
      ],
      revenue_estimates: [],
    });
    const r = await calculatePercentageRent(sb, PROP, 6, 2026);
    const adidas = r.tenants.find((t) => t.tenant_id === "t1")!;
    expect(adidas.actual_rent_type).toBe("minimum");
    expect(adidas.rent_paid).toBe(50000);
  });

  test("gap_reason = 'underreporting' when estimated > reported * 1.15", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 1_000_000 }, // 7% = 70k > 50k min
      ],
      revenue_estimates: [
        // estimated 2x reported -> estimated pct rent 140k > reported 70k -> gap
        { tenant_id: "t1", estimated_revenue_egp: 2_000_000, period_month: 6, period_year: 2026 },
      ],
    });
    const r = await calculatePercentageRent(sb, PROP, 6, 2026);
    const adidas = r.tenants.find((t) => t.tenant_id === "t1")!;
    expect(adidas.gap_reason).toBe("underreporting");
    expect(adidas.gap_egp).toBeGreaterThan(0);
  });

  test("tenants_with_gap sorted by gap descending", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 100_000 },
        { tenant_id: "t2", reported_revenue_egp: 50_000 },
      ],
      revenue_estimates: [
        { tenant_id: "t1", estimated_revenue_egp: 500_000, period_month: 6, period_year: 2026 },
        { tenant_id: "t2", estimated_revenue_egp: 200_000, period_month: 6, period_year: 2026 },
      ],
    });
    const r = await calculatePercentageRent(sb, PROP, 6, 2026);
    for (let i = 1; i < r.tenants_with_gap.length; i++) {
      expect(r.tenants_with_gap[i - 1].gap_egp).toBeGreaterThanOrEqual(
        r.tenants_with_gap[i].gap_egp
      );
    }
  });
});

describe("percentage-rent-engine: getPercentageRentTrend", () => {
  test("returns empty array when no active leases", async () => {
    const sb = createMockSupabase({ leases: [] });
    const r = await getPercentageRentTrend(sb, PROP, 3);
    expect(r).toEqual([]);
  });

  test("returns N months of trend entries", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [],
    });
    const r = await getPercentageRentTrend(sb, PROP, 6);
    expect(r).toHaveLength(6);
    for (const m of r) {
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("base_rent_total");
      expect(m).toHaveProperty("total_collected");
    }
  });
});

describe("percentage-rent-engine: getInflationHedgeAnalysis", () => {
  test("returns analysis with hedge_ratio and recommendation", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 2_000_000 },
      ],
      revenue_estimates: [],
    });
    const r = await getInflationHedgeAnalysis(sb, PROP);
    expect(r).toHaveProperty("hedge_ratio");
    expect(r).toHaveProperty("ai_recommendation");
    expect(typeof r.ai_recommendation).toBe("string");
    expect(r.ai_recommendation.length).toBeGreaterThan(0);
  });

  test("target_hedge_ratio is 50", async () => {
    const sb = createMockSupabase({ leases: [] });
    const r = await getInflationHedgeAnalysis(sb, PROP);
    expect(r.target_hedge_ratio).toBe(50);
  });
});

describe("percentage-rent-engine: getPercentageRateOptimization", () => {
  test("returns empty result when no leases", async () => {
    const sb = createMockSupabase({ leases: [] });
    const r = await getPercentageRateOptimization(sb, PROP);
    expect(r.tenants).toHaveLength(0);
    expect(r.total_portfolio_uplift_egp).toBe(0);
  });

  test("identifies tenants below category average", async () => {
    const sb = createMockSupabase({
      leases: [
        ...leasesData(),
        {
          id: "l3",
          tenant_id: "t3",
          unit_id: "u3",
          property_id: PROP,
          status: "active",
          min_rent_monthly_egp: 40000,
          percentage_rate: 3, // below fashion avg (7)
          tenant: { id: "t3", name: "Nike", brand_name: "Nike", category: "fashion" },
          unit: { id: "u3", unit_number: "F-15", area_sqm: 150 },
        },
      ],
      tenant_sales_reported: [
        { tenant_id: "t3", reported_revenue_egp: 500_000 },
      ],
      revenue_estimates: [],
    });
    const r = await getPercentageRateOptimization(sb, PROP);
    // t3 (3%) below fashion avg of (7+3)/2=5 -> opportunity
    const nike = r.tenants.find((t) => t.tenant_id === "t3");
    expect(nike).toBeDefined();
    expect(nike!.rate_gap).toBeGreaterThan(0);
    expect(nike!.opportunity_egp).toBeGreaterThan(0);
  });
});

describe("percentage-rent-engine: getRentCompositionBreakdown", () => {
  test("returns composition items sorted by total_rent desc", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 2_000_000 }, // pays 140k
      ],
      revenue_estimates: [],
    });
    const r = await getRentCompositionBreakdown(sb, PROP);
    expect(r.length).toBe(2);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].total_rent).toBeGreaterThanOrEqual(r[i].total_rent);
    }
  });

  test("percentage_premium is 0 for min-rent payers", async () => {
    const sb = createMockSupabase({
      leases: leasesData(),
      tenant_sales_reported: [
        { tenant_id: "t1", reported_revenue_egp: 10_000 }, // 7% = 700 < 50k
      ],
      revenue_estimates: [],
    });
    const r = await getRentCompositionBreakdown(sb, PROP);
    const adidas = r.find((t) => t.tenant_id === "t1")!;
    expect(adidas.rent_type).toBe("minimum");
    expect(adidas.percentage_premium).toBe(0);
  });
});