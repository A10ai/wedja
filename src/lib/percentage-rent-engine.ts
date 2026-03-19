import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Wedja Percentage Rent Engine
//
// The percentage rent model: tenants pay MAX(min_rent, sales x %).
// This is the mall's key inflation hedge -- as prices rise, sales
// rise, percentage rent rises. But if tenants underreport sales,
// the mall loses this hedge.
//
// This engine calculates:
// - What tenants SHOULD pay based on reported vs estimated sales
// - The gap between actual and potential percentage rent
// - The inflation hedge ratio (% of revenue that auto-adjusts)
// - Rate optimization opportunities per tenant category
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface PercentageRentTenantItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  min_rent: number;
  percentage_rate: number;
  reported_sales: number | null;
  estimated_sales: number | null;
  reported_percentage_rent: number;
  estimated_percentage_rent: number;
  actual_rent_type: "percentage" | "minimum";
  rent_paid: number;
  potential_rent: number;
  gap_egp: number;
  gap_reason: "underreporting" | "low_conversion" | "no_sales_data" | "none";
}

export interface PercentageRentOverview {
  tenants: PercentageRentTenantItem[];
  total_base_rent_egp: number;
  total_percentage_rent_reported_egp: number;
  total_percentage_rent_estimated_egp: number;
  total_actual_collected_egp: number;
  total_potential_egp: number;
  total_gap_egp: number;
  percentage_premium_pct: number;
  tenants_paying_minimum_only: {
    count: number;
    list: PercentageRentTenantItem[];
  };
  tenants_paying_percentage: {
    count: number;
    list: PercentageRentTenantItem[];
  };
  tenants_with_gap: PercentageRentTenantItem[];
}

export interface PercentageRentTrendMonth {
  month: number;
  year: number;
  label: string;
  base_rent_total: number;
  percentage_rent_total: number;
  total_collected: number;
  gap: number;
}

export interface InflationHedgeAnalysis {
  percentage_rent_share_pct: number;
  fixed_rent_share_pct: number;
  current_percentage_revenue_egp: number;
  current_fixed_revenue_egp: number;
  total_monthly_revenue_egp: number;
  devaluation_10pct_increase_egp: number;
  devaluation_10pct_increase_pct: number;
  hedge_ratio: number;
  target_hedge_ratio: number;
  tenants_with_zero_rate: Array<{
    tenant_name: string;
    brand_name: string;
    min_rent: number;
    category: string;
  }>;
  ai_recommendation: string;
}

export interface RateOptimizationItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  current_rate: number;
  category_avg_rate: number;
  rate_gap: number;
  estimated_sales: number;
  reported_sales: number;
  opportunity_egp: number;
  sensitivity_sales: number;
  note: string;
}

export interface RateOptimizationResult {
  tenants: RateOptimizationItem[];
  total_portfolio_uplift_egp: number;
  category_averages: Record<string, { avg_rate: number; count: number }>;
}

export interface RentCompositionItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  base_rent: number;
  percentage_premium: number;
  total_rent: number;
  rent_type: "percentage" | "minimum";
}

// ── Helpers ─────────────────────────────────────────────────

const MONTH_LABELS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

async function getActiveLeases(supabase: SupabaseClient, propertyId: string) {
  const { data, error } = await supabase
    .from("leases")
    .select(
      "*, tenant:tenants(id, name, brand_name, category), unit:units(id, unit_number, area_sqm)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");

  if (error) throw error;
  return data || [];
}

// ── 1. Calculate Percentage Rent ────────────────────────────

export async function calculatePercentageRent(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month?: number,
  year?: number
): Promise<PercentageRentOverview> {
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const y = year || now.getFullYear();

  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) {
    return emptyOverview();
  }

  const tenantIds = leases.map((l: any) => l.tenant_id);

  // Get reported sales for this period
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .eq("period_month", m)
    .eq("period_year", y);

  const reportedSalesByTenant: Record<string, number> = {};
  (salesData || []).forEach((s: any) => {
    reportedSalesByTenant[s.tenant_id] = s.reported_revenue_egp;
  });

  // If no specific month data, try latest available
  if (!salesData || salesData.length === 0) {
    const { data: latestSales } = await supabase
      .from("tenant_sales_reported")
      .select("tenant_id, reported_revenue_egp")
      .in("tenant_id", tenantIds)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    const seen = new Set<string>();
    (latestSales || []).forEach((s: any) => {
      if (!seen.has(s.tenant_id)) {
        reportedSalesByTenant[s.tenant_id] = s.reported_revenue_egp;
        seen.add(s.tenant_id);
      }
    });
  }

  // Get estimated sales from revenue_estimates (latest available)
  const { data: estimates } = await supabase
    .from("revenue_estimates")
    .select("tenant_id, estimated_revenue_egp, period_month, period_year")
    .in("tenant_id", tenantIds)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const estimatedSalesByTenant: Record<string, number> = {};
  (estimates || []).forEach((e: any) => {
    if (!estimatedSalesByTenant[e.tenant_id]) {
      estimatedSalesByTenant[e.tenant_id] = e.estimated_revenue_egp;
    }
  });

  // Build per-tenant breakdown
  const tenants: PercentageRentTenantItem[] = [];
  let totalBaseRent = 0;
  let totalPctRentReported = 0;
  let totalPctRentEstimated = 0;
  let totalActualCollected = 0;
  let totalPotential = 0;

  for (const lease of leases) {
    const tenant = (lease as any).tenant;
    const unit = (lease as any).unit;
    const minRent = lease.min_rent_monthly_egp || 0;
    const pctRate = (lease.percentage_rate || 0) / 100;
    const reportedSales = reportedSalesByTenant[lease.tenant_id] ?? null;
    const estimatedSales = estimatedSalesByTenant[lease.tenant_id] ?? null;

    const reportedPctRent = reportedSales !== null ? reportedSales * pctRate : 0;
    const estimatedPctRent = estimatedSales !== null ? estimatedSales * pctRate : 0;

    const actualRentType: "percentage" | "minimum" =
      reportedPctRent > minRent ? "percentage" : "minimum";
    const rentPaid = Math.max(minRent, reportedPctRent);
    const potentialRent = Math.max(minRent, estimatedPctRent);
    const gapEgp = Math.max(0, potentialRent - rentPaid);

    let gapReason: PercentageRentTenantItem["gap_reason"] = "none";
    if (reportedSales === null && estimatedSales === null) {
      gapReason = "no_sales_data";
    } else if (gapEgp > 0 && estimatedSales !== null && reportedSales !== null && estimatedSales > reportedSales * 1.15) {
      gapReason = "underreporting";
    } else if (gapEgp > 0) {
      gapReason = "low_conversion";
    }

    totalBaseRent += minRent;
    totalPctRentReported += reportedPctRent > minRent ? reportedPctRent - minRent : 0;
    totalPctRentEstimated += estimatedPctRent > minRent ? estimatedPctRent - minRent : 0;
    totalActualCollected += rentPaid;
    totalPotential += potentialRent;

    tenants.push({
      tenant_id: lease.tenant_id,
      tenant_name: tenant?.name || "Unknown",
      brand_name: tenant?.brand_name || "Unknown",
      category: tenant?.category || "other",
      unit_number: unit?.unit_number || "-",
      area_sqm: unit?.area_sqm || 0,
      min_rent: minRent,
      percentage_rate: lease.percentage_rate || 0,
      reported_sales: reportedSales !== null ? Math.round(reportedSales) : null,
      estimated_sales: estimatedSales !== null ? Math.round(estimatedSales) : null,
      reported_percentage_rent: Math.round(reportedPctRent),
      estimated_percentage_rent: Math.round(estimatedPctRent),
      actual_rent_type: actualRentType,
      rent_paid: Math.round(rentPaid),
      potential_rent: Math.round(potentialRent),
      gap_egp: Math.round(gapEgp),
      gap_reason: gapReason,
    });
  }

  const totalGap = Math.max(0, totalPotential - totalActualCollected);
  const percentagePremium =
    totalBaseRent > 0 ? (totalPctRentReported / totalBaseRent) * 100 : 0;

  const payingMinOnly = tenants.filter((t) => t.actual_rent_type === "minimum");
  const payingPct = tenants.filter((t) => t.actual_rent_type === "percentage");
  const withGap = tenants.filter((t) => t.gap_egp > 0).sort((a, b) => b.gap_egp - a.gap_egp);

  return {
    tenants: tenants.sort((a, b) => b.rent_paid - a.rent_paid),
    total_base_rent_egp: Math.round(totalBaseRent),
    total_percentage_rent_reported_egp: Math.round(totalPctRentReported),
    total_percentage_rent_estimated_egp: Math.round(totalPctRentEstimated),
    total_actual_collected_egp: Math.round(totalActualCollected),
    total_potential_egp: Math.round(totalPotential),
    total_gap_egp: Math.round(totalGap),
    percentage_premium_pct: Math.round(percentagePremium * 10) / 10,
    tenants_paying_minimum_only: { count: payingMinOnly.length, list: payingMinOnly },
    tenants_paying_percentage: { count: payingPct.length, list: payingPct },
    tenants_with_gap: withGap,
  };
}

function emptyOverview(): PercentageRentOverview {
  return {
    tenants: [],
    total_base_rent_egp: 0,
    total_percentage_rent_reported_egp: 0,
    total_percentage_rent_estimated_egp: 0,
    total_actual_collected_egp: 0,
    total_potential_egp: 0,
    total_gap_egp: 0,
    percentage_premium_pct: 0,
    tenants_paying_minimum_only: { count: 0, list: [] },
    tenants_paying_percentage: { count: 0, list: [] },
    tenants_with_gap: [],
  };
}

// ── 2. Percentage Rent Trend ────────────────────────────────

export async function getPercentageRentTrend(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  months: number = 6
): Promise<PercentageRentTrendMonth[]> {
  const now = new Date();
  const results: PercentageRentTrendMonth[] = [];

  // Get all active leases once
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) return [];

  const tenantIds = leases.map((l: any) => l.tenant_id);

  // Build lease lookup: tenant_id -> { min_rent, pct_rate }
  const leaseLookup: Record<string, { min_rent: number; pct_rate: number }> = {};
  for (const l of leases) {
    leaseLookup[l.tenant_id] = {
      min_rent: l.min_rent_monthly_egp || 0,
      pct_rate: (l.percentage_rate || 0) / 100,
    };
  }

  // Get all sales data for the period range
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startMonth = startDate.getMonth() + 1;
  const startYear = startDate.getFullYear();

  const { data: allSales } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp, period_month, period_year")
    .in("tenant_id", tenantIds)
    .or(
      `and(period_year.gt.${startYear}),and(period_year.eq.${startYear},period_month.gte.${startMonth})`
    );

  // Group sales by month key
  const salesByMonthTenant: Record<string, Record<string, number>> = {};
  (allSales || []).forEach((s: any) => {
    const key = `${s.period_year}-${s.period_month}`;
    if (!salesByMonthTenant[key]) salesByMonthTenant[key] = {};
    salesByMonthTenant[key][s.tenant_id] = s.reported_revenue_egp;
  });

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const key = `${y}-${m}`;
    const monthSales = salesByMonthTenant[key] || {};

    let baseRentTotal = 0;
    let pctRentTotal = 0;

    for (const tenantId of tenantIds) {
      const lease = leaseLookup[tenantId];
      if (!lease) continue;

      const sales = monthSales[tenantId] || 0;
      const pctRent = sales * lease.pct_rate;

      baseRentTotal += lease.min_rent;
      if (pctRent > lease.min_rent) {
        pctRentTotal += pctRent - lease.min_rent;
      }
    }

    const totalCollected = baseRentTotal + pctRentTotal;

    results.push({
      month: m,
      year: y,
      label: `${MONTH_LABELS[m]} ${y}`,
      base_rent_total: Math.round(baseRentTotal),
      percentage_rent_total: Math.round(pctRentTotal),
      total_collected: Math.round(totalCollected),
      gap: 0, // Would need estimated sales per month; set to 0 for trend
    });
  }

  return results;
}

// ── 3. Inflation Hedge Analysis ─────────────────────────────

export async function getInflationHedgeAnalysis(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<InflationHedgeAnalysis> {
  const overview = await calculatePercentageRent(supabase, propertyId);

  const totalRevenue = overview.total_actual_collected_egp;
  const pctRevenue = overview.total_percentage_rent_reported_egp;
  const fixedRevenue = totalRevenue - pctRevenue;

  const pctShare = totalRevenue > 0 ? (pctRevenue / totalRevenue) * 100 : 0;
  const fixedShare = 100 - pctShare;

  // If EGP devalues 10%, sales rise ~10%, so percentage rent rises ~10% on that portion
  const devaluationIncrease = Math.round(pctRevenue * 0.1);
  const devaluationIncreasePct = totalRevenue > 0 ? (devaluationIncrease / totalRevenue) * 100 : 0;

  // Hedge ratio: what % of revenue naturally adjusts with inflation
  const hedgeRatio = pctShare;
  const targetHedgeRatio = 50;

  // Find tenants with 0% rate
  const tenantsZeroRate = overview.tenants
    .filter((t) => t.percentage_rate === 0 || t.percentage_rate === null)
    .map((t) => ({
      tenant_name: t.tenant_name,
      brand_name: t.brand_name,
      min_rent: t.min_rent,
      category: t.category,
    }));

  // AI recommendation
  let recommendation: string;
  if (hedgeRatio >= 50) {
    recommendation = `Strong inflation hedge at ${hedgeRatio.toFixed(1)}%. Over half your revenue automatically adjusts with inflation. Continue monitoring tenant sales reporting accuracy.`;
  } else if (hedgeRatio >= 30) {
    recommendation = `Moderate inflation hedge at ${hedgeRatio.toFixed(1)}%. Target 50%+ by increasing percentage rates for ${tenantsZeroRate.length > 0 ? `${tenantsZeroRate.length} tenants with 0% rate` : "underperforming tenants"} at lease renewal. If EGP devalues 10%, you only gain ${formatPct(devaluationIncreasePct)} in revenue.`;
  } else if (hedgeRatio >= 10) {
    recommendation = `Weak inflation hedge at ${hedgeRatio.toFixed(1)}%. Most revenue is fixed rent exposed to inflation erosion. Priority: renegotiate percentage rates at every lease renewal. ${tenantsZeroRate.length} tenants have no percentage clause at all.`;
  } else {
    recommendation = `Critical: inflation hedge at only ${hedgeRatio.toFixed(1)}%. Nearly all revenue is fixed. A 10% EGP devaluation means you lose ${formatPct(10 - devaluationIncreasePct)} of real purchasing power. Immediate action: add percentage rent clauses to all new and renewing leases.`;
  }

  return {
    percentage_rent_share_pct: Math.round(pctShare * 10) / 10,
    fixed_rent_share_pct: Math.round(fixedShare * 10) / 10,
    current_percentage_revenue_egp: Math.round(pctRevenue),
    current_fixed_revenue_egp: Math.round(fixedRevenue),
    total_monthly_revenue_egp: Math.round(totalRevenue),
    devaluation_10pct_increase_egp: devaluationIncrease,
    devaluation_10pct_increase_pct: Math.round(devaluationIncreasePct * 10) / 10,
    hedge_ratio: Math.round(hedgeRatio * 10) / 10,
    target_hedge_ratio: targetHedgeRatio,
    tenants_with_zero_rate: tenantsZeroRate,
    ai_recommendation: recommendation,
  };
}

function formatPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

// ── 4. Percentage Rate Optimization ─────────────────────────

export async function getPercentageRateOptimization(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<RateOptimizationResult> {
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) {
    return { tenants: [], total_portfolio_uplift_egp: 0, category_averages: {} };
  }

  const tenantIds = leases.map((l: any) => l.tenant_id);

  // Get reported + estimated sales
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const reportedByTenant: Record<string, number> = {};
  const seenReported = new Set<string>();
  (salesData || []).forEach((s: any) => {
    if (!seenReported.has(s.tenant_id)) {
      reportedByTenant[s.tenant_id] = s.reported_revenue_egp;
      seenReported.add(s.tenant_id);
    }
  });

  const { data: estimates } = await supabase
    .from("revenue_estimates")
    .select("tenant_id, estimated_revenue_egp")
    .in("tenant_id", tenantIds)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const estimatedByTenant: Record<string, number> = {};
  (estimates || []).forEach((e: any) => {
    if (!estimatedByTenant[e.tenant_id]) {
      estimatedByTenant[e.tenant_id] = e.estimated_revenue_egp;
    }
  });

  // Calculate category averages
  const categoryRates: Record<string, { total: number; count: number }> = {};
  for (const l of leases) {
    const cat = (l as any).tenant?.category || "other";
    const rate = l.percentage_rate || 0;
    if (!categoryRates[cat]) categoryRates[cat] = { total: 0, count: 0 };
    categoryRates[cat].total += rate;
    categoryRates[cat].count++;
  }

  const categoryAverages: Record<string, { avg_rate: number; count: number }> = {};
  for (const [cat, data] of Object.entries(categoryRates)) {
    categoryAverages[cat] = {
      avg_rate: Math.round((data.total / data.count) * 10) / 10,
      count: data.count,
    };
  }

  // Build optimization items
  const items: RateOptimizationItem[] = [];
  let totalUplift = 0;

  for (const l of leases) {
    const tenant = (l as any).tenant;
    const cat = tenant?.category || "other";
    const currentRate = l.percentage_rate || 0;
    const avgRate = categoryAverages[cat]?.avg_rate || 0;

    if (currentRate >= avgRate) continue; // Already at or above average

    const estimatedSales = estimatedByTenant[l.tenant_id] || 0;
    const reportedSales = reportedByTenant[l.tenant_id] || 0;
    const bestSalesEstimate = Math.max(estimatedSales, reportedSales);

    if (bestSalesEstimate <= 0) continue;

    const rateGap = avgRate - currentRate;
    const opportunityEgp = Math.round(bestSalesEstimate * (rateGap / 100));

    // Sensitivity: at what sales level does % rent kick in for this tenant?
    const minRent = l.min_rent_monthly_egp || 0;
    const sensitivitySales = currentRate > 0 ? Math.round(minRent / (currentRate / 100)) : 0;

    if (opportunityEgp <= 0) continue;

    const note = `${tenant?.brand_name || "Tenant"} at ${currentRate}% but ${cat} average is ${avgRate}% — EGP ${opportunityEgp.toLocaleString()}/month uplift`;

    totalUplift += opportunityEgp;

    items.push({
      tenant_id: l.tenant_id,
      tenant_name: tenant?.name || "Unknown",
      brand_name: tenant?.brand_name || "Unknown",
      category: cat,
      current_rate: currentRate,
      category_avg_rate: avgRate,
      rate_gap: Math.round(rateGap * 10) / 10,
      estimated_sales: Math.round(estimatedSales),
      reported_sales: Math.round(reportedSales),
      opportunity_egp: opportunityEgp,
      sensitivity_sales: sensitivitySales,
      note,
    });
  }

  items.sort((a, b) => b.opportunity_egp - a.opportunity_egp);

  return {
    tenants: items,
    total_portfolio_uplift_egp: Math.round(totalUplift),
    category_averages: categoryAverages,
  };
}

// ── 5. Rent Composition Breakdown ───────────────────────────

export async function getRentCompositionBreakdown(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<RentCompositionItem[]> {
  const overview = await calculatePercentageRent(supabase, propertyId);

  return overview.tenants.map((t) => {
    const pctPremium = t.actual_rent_type === "percentage"
      ? t.reported_percentage_rent - t.min_rent
      : 0;

    return {
      tenant_id: t.tenant_id,
      tenant_name: t.tenant_name,
      brand_name: t.brand_name,
      category: t.category,
      base_rent: t.min_rent,
      percentage_premium: Math.max(0, pctPremium),
      total_rent: t.rent_paid,
      rent_type: t.actual_rent_type,
    };
  }).sort((a, b) => b.total_rent - a.total_rent);
}
