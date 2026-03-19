import { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_MODELS } from "./revenue-engine";

// ============================================================
// Wedja Tenant Analytics Engine
//
// Deep per-tenant and portfolio-level analytics focused on
// the productivity of every square meter.
//
// KEY QUESTION: Is each tenant earning its space?
//
// METRICS:
// - Revenue per sqm (the hero metric)
// - Rent per sqm (what the owner earns per sqm)
// - Opportunity cost per sqm (vs best performer in zone)
// - Performance scores (0-100, multi-dimensional)
// - Tenant mix efficiency (category vs revenue allocation)
// - Percentage rate sensitivity analysis
// - Replacement break-even analysis
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface TenantScorecard {
  // Basic
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  brand_type: string;
  area_sqm: number;
  unit_number: string;
  zone_name: string;
  zone_id: string;
  // Lease
  lease_id: string;
  min_rent: number;
  percentage_rate: number;
  start_date: string;
  end_date: string;
  monthly_rent_amount: number;
  // Revenue
  reported_sales_monthly_avg: number;
  estimated_sales_monthly_avg: number;
  revenue_per_sqm_monthly: number;
  estimated_revenue_per_sqm: number;
  revenue_gap_egp: number;
  revenue_gap_pct: number;
  // Rent analysis
  min_rent_per_sqm: number;
  percentage_rent_would_be: number;
  actual_rent_type: "min_rent" | "percentage";
  rent_to_sales_ratio: number;
  if_accurate_rent_would_be: number;
  // Footfall
  avg_daily_visitors: number;
  avg_conversion_rate: number;
  visitors_per_sqm: number;
  dwell_time_avg: number;
  // Performance scores (0-100)
  productivity_score: number;
  rent_efficiency_score: number;
  footfall_attraction_score: number;
  payment_reliability_score: number;
  overall_score: number;
  // AI verdict
  ai_verdict: string;
  // Monthly history
  monthly_history: Array<{
    month: number;
    year: number;
    reported_sales: number;
    estimated_sales: number;
  }>;
}

export interface TenantRanking {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  area_sqm: number;
  unit_number: string;
  zone_name: string;
  zone_id: string;
  monthly_rent: number;
  rent_per_sqm: number;
  reported_sales_per_sqm: number;
  estimated_sales_per_sqm: number;
  percentage_rate: number;
  profit_per_sqm: number;
  opportunity_cost_per_sqm: number;
  overall_score: number;
  rank: number;
}

export interface ZoneBenchmark {
  zone_id: string;
  zone_name: string;
  tenant_count: number;
  total_area_sqm: number;
  avg_revenue_per_sqm: number;
  avg_rent_per_sqm: number;
  avg_footfall_per_sqm: number;
  best_tenant: { name: string; revenue_per_sqm: number } | null;
  worst_tenant: { name: string; revenue_per_sqm: number } | null;
  zone_productivity_score: number;
}

export interface SqmValueItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  area_sqm: number;
  unit_number: string;
  zone_name: string;
  zone_id: string;
  rent_per_sqm_monthly: number;
  sales_per_sqm_monthly: number;
  estimated_sales_per_sqm: number;
  profit_per_sqm: number;
  opportunity_cost_per_sqm: number;
  opportunity_cost_total: number;
  zone_best_profit_per_sqm: number;
}

export interface TenantMixAnalysis {
  categories: Array<{
    category: string;
    area_sqm: number;
    area_pct: number;
    revenue_egp: number;
    revenue_pct: number;
    footfall: number;
    footfall_pct: number;
    revenue_per_sqm: number;
    tenant_count: number;
    mismatch_direction: "over_spaced" | "under_spaced" | "balanced";
    mismatch_magnitude: number;
  }>;
  ai_recommendation: string;
  total_area_sqm: number;
  total_revenue_egp: number;
  total_footfall: number;
}

export interface PercentageRateItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  current_rate: number;
  category_avg_rate: number;
  rate_gap: number;
  reported_sales: number;
  percentage_rent_at_current: number;
  min_rent: number;
  actual_paying: "min_rent" | "percentage";
  impact_at_plus_1: number;
  impact_at_plus_2: number;
  impact_at_plus_5: number;
  breakeven_sales: number;
  potential_uplift_egp: number;
}

export interface PercentageRateAnalysis {
  tenants: PercentageRateItem[];
  total_potential_uplift_egp: number;
  avg_rate: number;
  avg_rate_by_category: Record<string, number>;
}

export interface ReplacementItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  zone_name: string;
  current_revenue_per_sqm: number;
  zone_avg_revenue_per_sqm: number;
  zone_top_revenue_per_sqm: number;
  current_monthly_rent: number;
  if_avg_performer_rent: number;
  if_top_performer_rent: number;
  revenue_increase_avg: number;
  revenue_increase_top: number;
  vacancy_cost_per_month: number;
  vacancy_months_estimate: number;
  break_even_months_avg: number;
  break_even_months_top: number;
  overall_score: number;
}

export interface ReplacementAnalysis {
  bottom_tenants: ReplacementItem[];
  total_potential_monthly_gain: number;
  total_vacancy_risk: number;
}

// ── Helpers ─────────────────────────────────────────────────

interface LeaseWithDetails {
  id: string;
  tenant_id: string;
  unit_id: string;
  property_id: string;
  min_rent_monthly_egp: number;
  percentage_rate: number;
  escalation_rate: number;
  start_date: string;
  end_date: string;
  status: string;
  tenant: {
    id: string;
    name: string;
    brand_name: string;
    category: string;
    brand_type: string;
  };
  unit: {
    id: string;
    unit_number: string;
    area_sqm: number;
    zone_id: string;
    zone: { id: string; name: string } | null;
  };
}

async function getActiveLeases(
  supabase: SupabaseClient,
  propertyId: string
): Promise<LeaseWithDetails[]> {
  const { data } = await supabase
    .from("leases")
    .select(
      "id, tenant_id, unit_id, property_id, min_rent_monthly_egp, percentage_rate, escalation_rate, start_date, end_date, status, tenant:tenants!inner(id, name, brand_name, category, brand_type), unit:units!inner(id, unit_number, area_sqm, zone_id, zone:zones(id, name))"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");
  return (data || []) as unknown as LeaseWithDetails[];
}

async function getSalesData(
  supabase: SupabaseClient,
  tenantIds: string[]
): Promise<Record<string, { total: number; count: number; monthly: Array<{ month: number; year: number; amount: number }> }>> {
  if (tenantIds.length === 0) return {};
  const { data } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, period_month, period_year, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  const result: Record<string, { total: number; count: number; monthly: Array<{ month: number; year: number; amount: number }> }> = {};
  (data || []).forEach((s: any) => {
    if (!result[s.tenant_id]) {
      result[s.tenant_id] = { total: 0, count: 0, monthly: [] };
    }
    result[s.tenant_id].total += s.reported_revenue_egp;
    result[s.tenant_id].count++;
    result[s.tenant_id].monthly.push({
      month: s.period_month,
      year: s.period_year,
      amount: s.reported_revenue_egp,
    });
  });
  return result;
}

async function getEstimatesData(
  supabase: SupabaseClient,
  tenantIds: string[]
): Promise<Record<string, { total: number; count: number; monthly: Array<{ month: number; year: number; amount: number }> }>> {
  if (tenantIds.length === 0) return {};
  const { data } = await supabase
    .from("revenue_estimates")
    .select("tenant_id, period_month, period_year, estimated_revenue_egp")
    .in("tenant_id", tenantIds)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  const result: Record<string, { total: number; count: number; monthly: Array<{ month: number; year: number; amount: number }> }> = {};
  (data || []).forEach((e: any) => {
    if (!result[e.tenant_id]) {
      result[e.tenant_id] = { total: 0, count: 0, monthly: [] };
    }
    result[e.tenant_id].total += e.estimated_revenue_egp;
    result[e.tenant_id].count++;
    result[e.tenant_id].monthly.push({
      month: e.period_month,
      year: e.period_year,
      amount: e.estimated_revenue_egp,
    });
  });
  return result;
}

async function getFootfallData(
  supabase: SupabaseClient,
  unitIds: string[]
): Promise<Record<string, { total_in: number; days: number; dwell_sum: number; dwell_count: number }>> {
  if (unitIds.length === 0) return {};
  // Get last 6 months of footfall
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = sixMonthsAgo.toISOString().split("T")[0];

  const { data } = await supabase
    .from("footfall_daily")
    .select("unit_id, total_in, avg_dwell_seconds, date")
    .in("unit_id", unitIds)
    .gte("date", startDate);

  const result: Record<string, { total_in: number; days: number; dwell_sum: number; dwell_count: number }> = {};
  (data || []).forEach((r: any) => {
    if (!result[r.unit_id]) {
      result[r.unit_id] = { total_in: 0, days: 0, dwell_sum: 0, dwell_count: 0 };
    }
    result[r.unit_id].total_in += r.total_in || 0;
    result[r.unit_id].days++;
    if (r.avg_dwell_seconds) {
      result[r.unit_id].dwell_sum += r.avg_dwell_seconds;
      result[r.unit_id].dwell_count++;
    }
  });
  return result;
}

async function getPaymentData(
  supabase: SupabaseClient,
  leaseIds: string[]
): Promise<Record<string, { total: number; on_time: number; total_paid: number; total_due: number }>> {
  if (leaseIds.length === 0) return {};
  const { data } = await supabase
    .from("rent_transactions")
    .select("lease_id, status, amount_paid, amount_due")
    .in("lease_id", leaseIds);

  const result: Record<string, { total: number; on_time: number; total_paid: number; total_due: number }> = {};
  (data || []).forEach((t: any) => {
    if (!result[t.lease_id]) {
      result[t.lease_id] = { total: 0, on_time: 0, total_paid: 0, total_due: 0 };
    }
    result[t.lease_id].total++;
    if (t.status === "paid") result[t.lease_id].on_time++;
    result[t.lease_id].total_paid += t.amount_paid || 0;
    result[t.lease_id].total_due += t.amount_due || 0;
  });
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── 1. Tenant Scorecard ─────────────────────────────────────

export async function getTenantScorecard(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantScorecard | null> {
  // Get the lease with all details
  const { data: leaseData } = await supabase
    .from("leases")
    .select(
      "id, tenant_id, unit_id, property_id, min_rent_monthly_egp, percentage_rate, escalation_rate, start_date, end_date, status, tenant:tenants!inner(id, name, brand_name, category, brand_type), unit:units!inner(id, unit_number, area_sqm, zone_id, zone:zones(id, name))"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!leaseData) return null;

  const lease = leaseData as unknown as LeaseWithDetails;
  const area = lease.unit.area_sqm || 0;
  const propertyId = lease.property_id;

  // Fetch all data in parallel
  const [salesMap, estimatesMap, footfallMap, paymentMap] = await Promise.all([
    getSalesData(supabase, [tenantId]),
    getEstimatesData(supabase, [tenantId]),
    getFootfallData(supabase, [lease.unit_id]),
    getPaymentData(supabase, [lease.id]),
  ]);

  const sales = salesMap[tenantId] || { total: 0, count: 0, monthly: [] };
  const estimates = estimatesMap[tenantId] || { total: 0, count: 0, monthly: [] };
  const footfall = footfallMap[lease.unit_id] || { total_in: 0, days: 0, dwell_sum: 0, dwell_count: 0 };
  const payment = paymentMap[lease.id] || { total: 0, on_time: 0, total_paid: 0, total_due: 0 };

  const reportedAvg = sales.count > 0 ? sales.total / sales.count : 0;
  const estimatedAvg = estimates.count > 0 ? estimates.total / estimates.count : 0;
  const revenuePerSqm = area > 0 ? reportedAvg / area : 0;
  const estimatedRevenuePerSqm = area > 0 ? estimatedAvg / area : 0;
  const revenueGap = estimatedAvg - reportedAvg;
  const revenueGapPct = estimatedAvg > 0 ? (revenueGap / estimatedAvg) * 100 : 0;

  const minRentPerSqm = area > 0 ? lease.min_rent_monthly_egp / area : 0;
  const percentageRentWouldBe = reportedAvg * (lease.percentage_rate / 100);
  const actualRentType: "min_rent" | "percentage" = percentageRentWouldBe > lease.min_rent_monthly_egp ? "percentage" : "min_rent";
  const monthlyRentAmount = Math.max(lease.min_rent_monthly_egp, percentageRentWouldBe);
  const rentToSalesRatio = reportedAvg > 0 ? monthlyRentAmount / reportedAvg : 0;
  const ifAccurateRentWouldBe = estimatedAvg * (lease.percentage_rate / 100);

  const avgDailyVisitors = footfall.days > 0 ? Math.round(footfall.total_in / footfall.days) : 0;
  const model = CATEGORY_MODELS[lease.tenant.category] || CATEGORY_MODELS.services;
  const avgTicket = Math.sqrt(model.avg_ticket[0] * model.avg_ticket[1]);
  const avgConversionRate = footfall.total_in > 0 && avgTicket > 0
    ? reportedAvg * (sales.count || 1) / (footfall.total_in * avgTicket)
    : 0;
  const visitorsPerSqm = area > 0 ? avgDailyVisitors / area : 0;
  const dwellTimeAvg = footfall.dwell_count > 0 ? Math.round(footfall.dwell_sum / footfall.dwell_count) : 0;

  // Get zone benchmarks for scoring
  const zoneBenchmarks = await getZoneBenchmarks(supabase, propertyId);
  const zoneBench = zoneBenchmarks.find((z) => z.zone_id === lease.unit.zone_id);
  const zoneAvgRevPerSqm = zoneBench?.avg_revenue_per_sqm || revenuePerSqm;
  const zoneAvgFootfallPerSqm = zoneBench?.avg_footfall_per_sqm || visitorsPerSqm;

  // Performance scores (0-100)
  const productivityScore = clamp(
    zoneAvgRevPerSqm > 0 ? Math.round((revenuePerSqm / zoneAvgRevPerSqm) * 60 + 20) : 50,
    0, 100
  );
  const rentEfficiencyScore = clamp(
    actualRentType === "percentage"
      ? Math.round(70 + (percentageRentWouldBe - lease.min_rent_monthly_egp) / Math.max(lease.min_rent_monthly_egp, 1) * 30)
      : Math.round(40 + rentToSalesRatio * 100),
    0, 100
  );
  const footfallScore = clamp(
    zoneAvgFootfallPerSqm > 0 ? Math.round((visitorsPerSqm / zoneAvgFootfallPerSqm) * 60 + 20) : 50,
    0, 100
  );
  const paymentScore = payment.total > 0
    ? Math.round((payment.on_time / payment.total) * 100)
    : 80;
  const overallScore = Math.round(
    productivityScore * 0.35 +
    rentEfficiencyScore * 0.20 +
    footfallScore * 0.20 +
    paymentScore * 0.25
  );

  // AI verdict
  let verdict: string;
  if (overallScore >= 75 && revenuePerSqm > zoneAvgRevPerSqm * 1.2) {
    verdict = "High performer — consider expansion";
  } else if (revenueGapPct > 25 && estimatedAvg > reportedAvg * 1.3) {
    verdict = "Suspected underreporter — investigate";
  } else if (overallScore < 40 || revenuePerSqm < zoneAvgRevPerSqm * 0.5) {
    verdict = "Underperformer — renegotiate or replace";
  } else {
    verdict = "Average — maintain";
  }

  // Build monthly history (merge sales + estimates)
  const monthlyHistory: TenantScorecard["monthly_history"] = [];
  const allMonths = new Set<string>();
  sales.monthly.forEach((m) => allMonths.add(`${m.year}-${m.month}`));
  estimates.monthly.forEach((m) => allMonths.add(`${m.year}-${m.month}`));

  const salesByMonth: Record<string, number> = {};
  sales.monthly.forEach((m) => { salesByMonth[`${m.year}-${m.month}`] = m.amount; });
  const estByMonth: Record<string, number> = {};
  estimates.monthly.forEach((m) => { estByMonth[`${m.year}-${m.month}`] = m.amount; });

  Array.from(allMonths)
    .sort()
    .forEach((key) => {
      const [y, m] = key.split("-").map(Number);
      monthlyHistory.push({
        month: m,
        year: y,
        reported_sales: salesByMonth[key] || 0,
        estimated_sales: estByMonth[key] || 0,
      });
    });

  return {
    tenant_id: tenantId,
    tenant_name: lease.tenant.name,
    brand_name: lease.tenant.brand_name,
    category: lease.tenant.category,
    brand_type: lease.tenant.brand_type,
    area_sqm: area,
    unit_number: lease.unit.unit_number,
    zone_name: lease.unit.zone?.name || "Unknown",
    zone_id: lease.unit.zone_id,
    lease_id: lease.id,
    min_rent: lease.min_rent_monthly_egp,
    percentage_rate: lease.percentage_rate,
    start_date: lease.start_date,
    end_date: lease.end_date,
    monthly_rent_amount: Math.round(monthlyRentAmount),
    reported_sales_monthly_avg: Math.round(reportedAvg),
    estimated_sales_monthly_avg: Math.round(estimatedAvg),
    revenue_per_sqm_monthly: Math.round(revenuePerSqm),
    estimated_revenue_per_sqm: Math.round(estimatedRevenuePerSqm),
    revenue_gap_egp: Math.round(revenueGap),
    revenue_gap_pct: Math.round(revenueGapPct * 10) / 10,
    min_rent_per_sqm: Math.round(minRentPerSqm),
    percentage_rent_would_be: Math.round(percentageRentWouldBe),
    actual_rent_type: actualRentType,
    rent_to_sales_ratio: Math.round(rentToSalesRatio * 1000) / 1000,
    if_accurate_rent_would_be: Math.round(ifAccurateRentWouldBe),
    avg_daily_visitors: avgDailyVisitors,
    avg_conversion_rate: Math.round(avgConversionRate * 1000) / 10,
    visitors_per_sqm: Math.round(visitorsPerSqm * 10) / 10,
    dwell_time_avg: dwellTimeAvg,
    productivity_score: productivityScore,
    rent_efficiency_score: rentEfficiencyScore,
    footfall_attraction_score: footfallScore,
    payment_reliability_score: paymentScore,
    overall_score: overallScore,
    ai_verdict: verdict,
    monthly_history: monthlyHistory,
  };
}

// ── 2. Tenant Rankings ──────────────────────────────────────

export async function getTenantRankings(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<TenantRanking[]> {
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) return [];

  const tenantIds = leases.map((l) => l.tenant_id);
  const unitIds = leases.map((l) => l.unit_id);
  const leaseIds = leases.map((l) => l.id);

  const [salesMap, estimatesMap, footfallMap, paymentMap] = await Promise.all([
    getSalesData(supabase, tenantIds),
    getEstimatesData(supabase, tenantIds),
    getFootfallData(supabase, unitIds),
    getPaymentData(supabase, leaseIds),
  ]);

  // Pre-compute zone best profit per sqm
  const zoneBestProfit: Record<string, number> = {};

  // First pass: compute profit_per_sqm for every tenant
  const rawItems = leases.map((lease) => {
    const area = lease.unit.area_sqm || 0;
    const sales = salesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };
    const estimates = estimatesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };
    const footfall = footfallMap[lease.unit_id] || { total_in: 0, days: 0, dwell_sum: 0, dwell_count: 0 };
    const payment = paymentMap[lease.id] || { total: 0, on_time: 0, total_paid: 0, total_due: 0 };

    const reportedAvg = sales.count > 0 ? sales.total / sales.count : 0;
    const estimatedAvg = estimates.count > 0 ? estimates.total / estimates.count : 0;
    const pctRent = reportedAvg * (lease.percentage_rate / 100);
    const monthlyRent = Math.max(lease.min_rent_monthly_egp, pctRent);
    const profitPerSqm = area > 0 ? monthlyRent / area : 0;

    const reportedPerSqm = area > 0 ? reportedAvg / area : 0;
    const estimatedPerSqm = area > 0 ? estimatedAvg / area : 0;
    const rentPerSqm = area > 0 ? monthlyRent / area : 0;

    const avgDailyVisitors = footfall.days > 0 ? footfall.total_in / footfall.days : 0;
    const visitorsPerSqm = area > 0 ? avgDailyVisitors / area : 0;

    const paymentScore = payment.total > 0 ? Math.round((payment.on_time / payment.total) * 100) : 80;

    const zoneId = lease.unit.zone_id;
    if (!zoneBestProfit[zoneId] || profitPerSqm > zoneBestProfit[zoneId]) {
      zoneBestProfit[zoneId] = profitPerSqm;
    }

    return {
      lease,
      area,
      reportedAvg,
      estimatedAvg,
      monthlyRent,
      profitPerSqm,
      reportedPerSqm,
      estimatedPerSqm,
      rentPerSqm,
      visitorsPerSqm,
      paymentScore,
    };
  });

  // Second pass: compute scores and opportunity cost
  const items: TenantRanking[] = rawItems.map((item) => {
    const zoneId = item.lease.unit.zone_id;
    const bestInZone = zoneBestProfit[zoneId] || item.profitPerSqm;
    const opportunityCost = Math.max(0, bestInZone - item.profitPerSqm);

    // Simple overall score (0-100)
    const productivityScore = clamp(Math.round(item.reportedPerSqm / 20), 0, 40);
    const rentScore = clamp(Math.round(item.profitPerSqm / 10), 0, 30);
    const paymentPart = Math.round(item.paymentScore * 0.3);
    const overallScore = clamp(productivityScore + rentScore + paymentPart, 0, 100);

    return {
      tenant_id: item.lease.tenant_id,
      tenant_name: item.lease.tenant.name,
      brand_name: item.lease.tenant.brand_name,
      category: item.lease.tenant.category,
      area_sqm: item.area,
      unit_number: item.lease.unit.unit_number,
      zone_name: item.lease.unit.zone?.name || "Unknown",
      zone_id: zoneId,
      monthly_rent: Math.round(item.monthlyRent),
      rent_per_sqm: Math.round(item.rentPerSqm),
      reported_sales_per_sqm: Math.round(item.reportedPerSqm),
      estimated_sales_per_sqm: Math.round(item.estimatedPerSqm),
      percentage_rate: item.lease.percentage_rate,
      profit_per_sqm: Math.round(item.profitPerSqm),
      opportunity_cost_per_sqm: Math.round(opportunityCost),
      overall_score: overallScore,
      rank: 0,
    };
  });

  // Sort by overall_score descending, assign rank
  items.sort((a, b) => b.overall_score - a.overall_score);
  items.forEach((item, i) => { item.rank = i + 1; });

  return items;
}

// ── 3. Zone Benchmarks ──────────────────────────────────────

export async function getZoneBenchmarks(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<ZoneBenchmark[]> {
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) return [];

  const tenantIds = leases.map((l) => l.tenant_id);
  const unitIds = leases.map((l) => l.unit_id);

  const [salesMap, footfallMap] = await Promise.all([
    getSalesData(supabase, tenantIds),
    getFootfallData(supabase, unitIds),
  ]);

  // Group by zone
  const zones: Record<string, {
    zone_name: string;
    tenants: Array<{
      brand_name: string;
      area: number;
      revenuePerSqm: number;
      rentPerSqm: number;
      footfallPerSqm: number;
    }>;
  }> = {};

  for (const lease of leases) {
    const zoneId = lease.unit.zone_id;
    const zoneName = lease.unit.zone?.name || "Unknown";
    if (!zones[zoneId]) {
      zones[zoneId] = { zone_name: zoneName, tenants: [] };
    }

    const area = lease.unit.area_sqm || 0;
    const sales = salesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };
    const footfall = footfallMap[lease.unit_id] || { total_in: 0, days: 0, dwell_sum: 0, dwell_count: 0 };

    const avgSales = sales.count > 0 ? sales.total / sales.count : 0;
    const avgDailyVisitors = footfall.days > 0 ? footfall.total_in / footfall.days : 0;
    const pctRent = avgSales * (lease.percentage_rate / 100);
    const monthlyRent = Math.max(lease.min_rent_monthly_egp, pctRent);

    zones[zoneId].tenants.push({
      brand_name: lease.tenant.brand_name,
      area,
      revenuePerSqm: area > 0 ? avgSales / area : 0,
      rentPerSqm: area > 0 ? monthlyRent / area : 0,
      footfallPerSqm: area > 0 ? avgDailyVisitors / area : 0,
    });
  }

  return Object.entries(zones).map(([zoneId, zone]) => {
    const tenants = zone.tenants;
    const totalArea = tenants.reduce((sum, t) => sum + t.area, 0);
    const avgRevPerSqm = tenants.length > 0
      ? tenants.reduce((sum, t) => sum + t.revenuePerSqm, 0) / tenants.length
      : 0;
    const avgRentPerSqm = tenants.length > 0
      ? tenants.reduce((sum, t) => sum + t.rentPerSqm, 0) / tenants.length
      : 0;
    const avgFootfallPerSqm = tenants.length > 0
      ? tenants.reduce((sum, t) => sum + t.footfallPerSqm, 0) / tenants.length
      : 0;

    const sorted = [...tenants].sort((a, b) => b.revenuePerSqm - a.revenuePerSqm);
    const best = sorted.length > 0
      ? { name: sorted[0].brand_name, revenue_per_sqm: Math.round(sorted[0].revenuePerSqm) }
      : null;
    const worst = sorted.length > 1
      ? { name: sorted[sorted.length - 1].brand_name, revenue_per_sqm: Math.round(sorted[sorted.length - 1].revenuePerSqm) }
      : null;

    const productivityScore = clamp(Math.round(avgRevPerSqm / 15), 0, 100);

    return {
      zone_id: zoneId,
      zone_name: zone.zone_name,
      tenant_count: tenants.length,
      total_area_sqm: Math.round(totalArea),
      avg_revenue_per_sqm: Math.round(avgRevPerSqm),
      avg_rent_per_sqm: Math.round(avgRentPerSqm),
      avg_footfall_per_sqm: Math.round(avgFootfallPerSqm * 10) / 10,
      best_tenant: best,
      worst_tenant: worst,
      zone_productivity_score: productivityScore,
    };
  }).sort((a, b) => b.avg_revenue_per_sqm - a.avg_revenue_per_sqm);
}

// ── 4. SQM Value Analysis ───────────────────────────────────

export async function getSqmValueAnalysis(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<SqmValueItem[]> {
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) return [];

  const tenantIds = leases.map((l) => l.tenant_id);
  const [salesMap, estimatesMap] = await Promise.all([
    getSalesData(supabase, tenantIds),
    getEstimatesData(supabase, tenantIds),
  ]);

  // Pre-compute zone best profit per sqm
  const zoneBestProfit: Record<string, number> = {};
  const items: Array<{ lease: LeaseWithDetails; profitPerSqm: number; salesPerSqm: number; estimatedPerSqm: number; rentPerSqm: number }> = [];

  for (const lease of leases) {
    const area = lease.unit.area_sqm || 0;
    const sales = salesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };
    const estimates = estimatesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };

    const avgSales = sales.count > 0 ? sales.total / sales.count : 0;
    const avgEstimated = estimates.count > 0 ? estimates.total / estimates.count : 0;
    const pctRent = avgSales * (lease.percentage_rate / 100);
    const monthlyRent = Math.max(lease.min_rent_monthly_egp, pctRent);
    const profitPerSqm = area > 0 ? monthlyRent / area : 0;
    const salesPerSqm = area > 0 ? avgSales / area : 0;
    const estimatedPerSqm = area > 0 ? avgEstimated / area : 0;
    const rentPerSqm = area > 0 ? monthlyRent / area : 0;

    const zoneId = lease.unit.zone_id;
    if (!zoneBestProfit[zoneId] || profitPerSqm > zoneBestProfit[zoneId]) {
      zoneBestProfit[zoneId] = profitPerSqm;
    }

    items.push({ lease, profitPerSqm, salesPerSqm, estimatedPerSqm, rentPerSqm });
  }

  const result: SqmValueItem[] = items.map((item) => {
    const zoneId = item.lease.unit.zone_id;
    const bestInZone = zoneBestProfit[zoneId] || item.profitPerSqm;
    const opportunityCost = Math.max(0, bestInZone - item.profitPerSqm);
    const area = item.lease.unit.area_sqm || 0;

    return {
      tenant_id: item.lease.tenant_id,
      tenant_name: item.lease.tenant.name,
      brand_name: item.lease.tenant.brand_name,
      category: item.lease.tenant.category,
      area_sqm: area,
      unit_number: item.lease.unit.unit_number,
      zone_name: item.lease.unit.zone?.name || "Unknown",
      zone_id: zoneId,
      rent_per_sqm_monthly: Math.round(item.rentPerSqm),
      sales_per_sqm_monthly: Math.round(item.salesPerSqm),
      estimated_sales_per_sqm: Math.round(item.estimatedPerSqm),
      profit_per_sqm: Math.round(item.profitPerSqm),
      opportunity_cost_per_sqm: Math.round(opportunityCost),
      opportunity_cost_total: Math.round(opportunityCost * area),
      zone_best_profit_per_sqm: Math.round(bestInZone),
    };
  });

  // Sort by profit_per_sqm ascending — worst performers first
  result.sort((a, b) => a.profit_per_sqm - b.profit_per_sqm);
  return result;
}

// ── 5. Tenant Mix Analysis ──────────────────────────────────

export async function getTenantMixAnalysis(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<TenantMixAnalysis> {
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) {
    return { categories: [], ai_recommendation: "No active leases found.", total_area_sqm: 0, total_revenue_egp: 0, total_footfall: 0 };
  }

  const tenantIds = leases.map((l) => l.tenant_id);
  const unitIds = leases.map((l) => l.unit_id);

  const [salesMap, footfallMap] = await Promise.all([
    getSalesData(supabase, tenantIds),
    getFootfallData(supabase, unitIds),
  ]);

  const categories: Record<string, {
    area: number;
    revenue: number;
    footfall: number;
    count: number;
  }> = {};

  let totalArea = 0;
  let totalRevenue = 0;
  let totalFootfall = 0;

  for (const lease of leases) {
    const cat = lease.tenant.category;
    const area = lease.unit.area_sqm || 0;
    const sales = salesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };
    const footfall = footfallMap[lease.unit_id] || { total_in: 0, days: 0, dwell_sum: 0, dwell_count: 0 };
    const avgSales = sales.count > 0 ? sales.total / sales.count : 0;
    const avgDailyFootfall = footfall.days > 0 ? footfall.total_in / footfall.days : 0;

    if (!categories[cat]) {
      categories[cat] = { area: 0, revenue: 0, footfall: 0, count: 0 };
    }
    categories[cat].area += area;
    categories[cat].revenue += avgSales;
    categories[cat].footfall += avgDailyFootfall;
    categories[cat].count++;

    totalArea += area;
    totalRevenue += avgSales;
    totalFootfall += avgDailyFootfall;
  }

  const categoryList = Object.entries(categories).map(([cat, data]) => {
    const areaPct = totalArea > 0 ? (data.area / totalArea) * 100 : 0;
    const revPct = totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0;
    const ffPct = totalFootfall > 0 ? (data.footfall / totalFootfall) * 100 : 0;
    const revPerSqm = data.area > 0 ? data.revenue / data.area : 0;

    const mismatchMagnitude = Math.abs(areaPct - revPct);
    let mismatchDirection: "over_spaced" | "under_spaced" | "balanced";
    if (areaPct > revPct + 5) {
      mismatchDirection = "over_spaced";
    } else if (revPct > areaPct + 5) {
      mismatchDirection = "under_spaced";
    } else {
      mismatchDirection = "balanced";
    }

    return {
      category: cat,
      area_sqm: Math.round(data.area),
      area_pct: Math.round(areaPct * 10) / 10,
      revenue_egp: Math.round(data.revenue),
      revenue_pct: Math.round(revPct * 10) / 10,
      footfall: Math.round(data.footfall),
      footfall_pct: Math.round(ffPct * 10) / 10,
      revenue_per_sqm: Math.round(revPerSqm),
      tenant_count: data.count,
      mismatch_direction: mismatchDirection,
      mismatch_magnitude: Math.round(mismatchMagnitude * 10) / 10,
    };
  }).sort((a, b) => b.area_pct - a.area_pct);

  // AI recommendation
  const overSpaced = categoryList.filter((c) => c.mismatch_direction === "over_spaced" && c.mismatch_magnitude > 8);
  const underSpaced = categoryList.filter((c) => c.mismatch_direction === "under_spaced" && c.mismatch_magnitude > 8);

  let recommendation = "";
  if (overSpaced.length > 0 && underSpaced.length > 0) {
    const biggest = overSpaced[0];
    const efficient = underSpaced[0];
    recommendation = `${biggest.category.charAt(0).toUpperCase() + biggest.category.slice(1)} uses ${biggest.area_pct}% of space but generates only ${biggest.revenue_pct}% of revenue. ${efficient.category.charAt(0).toUpperCase() + efficient.category.slice(1)} uses ${efficient.area_pct}% of space but generates ${efficient.revenue_pct}% of revenue. Consider reallocating ${Math.round(biggest.mismatch_magnitude / 2)}% of space from ${biggest.category} to ${efficient.category} for better revenue efficiency.`;
  } else if (overSpaced.length > 0) {
    const biggest = overSpaced[0];
    recommendation = `${biggest.category.charAt(0).toUpperCase() + biggest.category.slice(1)} is over-allocated: uses ${biggest.area_pct}% of space but only generates ${biggest.revenue_pct}% of revenue (EGP ${biggest.revenue_per_sqm}/sqm). Review tenant placement and consider higher-performing categories for upcoming vacancies.`;
  } else {
    recommendation = "Tenant mix is reasonably balanced. Revenue distribution aligns well with space allocation across categories. Continue monitoring for emerging trends.";
  }

  return {
    categories: categoryList,
    ai_recommendation: recommendation,
    total_area_sqm: Math.round(totalArea),
    total_revenue_egp: Math.round(totalRevenue),
    total_footfall: Math.round(totalFootfall),
  };
}

// ── 6. Percentage Rate Analysis ─────────────────────────────

export async function getPercentageRateAnalysis(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<PercentageRateAnalysis> {
  const leases = await getActiveLeases(supabase, propertyId);
  if (leases.length === 0) {
    return { tenants: [], total_potential_uplift_egp: 0, avg_rate: 0, avg_rate_by_category: {} };
  }

  const tenantIds = leases.map((l) => l.tenant_id);
  const salesMap = await getSalesData(supabase, tenantIds);

  // Calculate category average rates
  const categoryRates: Record<string, number[]> = {};
  leases.forEach((l) => {
    const cat = l.tenant.category;
    if (!categoryRates[cat]) categoryRates[cat] = [];
    categoryRates[cat].push(l.percentage_rate);
  });

  const avgRateByCategory: Record<string, number> = {};
  Object.entries(categoryRates).forEach(([cat, rates]) => {
    avgRateByCategory[cat] = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10;
  });

  const allRates = leases.map((l) => l.percentage_rate);
  const avgRate = allRates.length > 0
    ? Math.round((allRates.reduce((a, b) => a + b, 0) / allRates.length) * 10) / 10
    : 0;

  let totalUplift = 0;

  const tenants: PercentageRateItem[] = leases.map((lease) => {
    const sales = salesMap[lease.tenant_id] || { total: 0, count: 0, monthly: [] };
    const avgSales = sales.count > 0 ? sales.total / sales.count : 0;
    const catAvg = avgRateByCategory[lease.tenant.category] || lease.percentage_rate;
    const rateGap = catAvg - lease.percentage_rate;

    const pctRentAtCurrent = avgSales * (lease.percentage_rate / 100);
    const actualPaying: "min_rent" | "percentage" = pctRentAtCurrent > lease.min_rent_monthly_egp ? "percentage" : "min_rent";

    const impactPlus1 = avgSales * ((lease.percentage_rate + 1) / 100) - Math.max(lease.min_rent_monthly_egp, pctRentAtCurrent);
    const impactPlus2 = avgSales * ((lease.percentage_rate + 2) / 100) - Math.max(lease.min_rent_monthly_egp, pctRentAtCurrent);
    const impactPlus5 = avgSales * ((lease.percentage_rate + 5) / 100) - Math.max(lease.min_rent_monthly_egp, pctRentAtCurrent);

    // Breakeven: at what sales level does percentage rent exceed min rent?
    const breakeven = lease.percentage_rate > 0
      ? Math.round(lease.min_rent_monthly_egp / (lease.percentage_rate / 100))
      : 0;

    // Potential uplift: if this tenant paid category average rate
    const atCatAvg = avgSales * (catAvg / 100);
    const currentRent = Math.max(lease.min_rent_monthly_egp, pctRentAtCurrent);
    const uplift = Math.max(0, atCatAvg - currentRent);
    totalUplift += uplift;

    return {
      tenant_id: lease.tenant_id,
      tenant_name: lease.tenant.name,
      brand_name: lease.tenant.brand_name,
      category: lease.tenant.category,
      unit_number: lease.unit.unit_number,
      area_sqm: lease.unit.area_sqm || 0,
      current_rate: lease.percentage_rate,
      category_avg_rate: catAvg,
      rate_gap: Math.round(rateGap * 10) / 10,
      reported_sales: Math.round(avgSales),
      percentage_rent_at_current: Math.round(pctRentAtCurrent),
      min_rent: lease.min_rent_monthly_egp,
      actual_paying: actualPaying,
      impact_at_plus_1: Math.round(Math.max(0, impactPlus1)),
      impact_at_plus_2: Math.round(Math.max(0, impactPlus2)),
      impact_at_plus_5: Math.round(Math.max(0, impactPlus5)),
      breakeven_sales: breakeven,
      potential_uplift_egp: Math.round(uplift),
    };
  });

  tenants.sort((a, b) => b.potential_uplift_egp - a.potential_uplift_egp);

  return {
    tenants,
    total_potential_uplift_egp: Math.round(totalUplift),
    avg_rate: avgRate,
    avg_rate_by_category: avgRateByCategory,
  };
}

// ── 7. Replacement Analysis ─────────────────────────────────

export async function getReplacementAnalysis(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<ReplacementAnalysis> {
  const rankings = await getTenantRankings(supabase, propertyId);
  if (rankings.length === 0) {
    return { bottom_tenants: [], total_potential_monthly_gain: 0, total_vacancy_risk: 0 };
  }

  const zoneBenchmarks = await getZoneBenchmarks(supabase, propertyId);
  const zoneMap: Record<string, ZoneBenchmark> = {};
  zoneBenchmarks.forEach((z) => { zoneMap[z.zone_id] = z; });

  // Sort by overall_score ascending — worst first
  const sorted = [...rankings].sort((a, b) => a.overall_score - b.overall_score);
  const bottom = sorted.slice(0, 10);

  const VACANCY_MONTHS_ESTIMATE = 3; // Average time to replace a tenant
  let totalGain = 0;
  let totalVacancyRisk = 0;

  const bottomTenants: ReplacementItem[] = bottom.map((tenant) => {
    const zone = zoneMap[tenant.zone_id];
    const zoneAvgRevPerSqm = zone?.avg_revenue_per_sqm || tenant.reported_sales_per_sqm;
    const zoneTopRevPerSqm = zone?.best_tenant?.revenue_per_sqm || zoneAvgRevPerSqm;

    const currentRevPerSqm = tenant.reported_sales_per_sqm;
    const area = tenant.area_sqm;
    const currentRent = tenant.monthly_rent;

    // If replaced with average performer
    const avgPerformerPctRate = 10; // assume 10% baseline
    const ifAvgRevenue = zoneAvgRevPerSqm * area;
    const ifAvgRent = Math.max(currentRent, ifAvgRevenue * (avgPerformerPctRate / 100));
    const revenueIncreaseAvg = Math.max(0, ifAvgRent - currentRent);

    // If replaced with top performer
    const ifTopRevenue = zoneTopRevPerSqm * area;
    const ifTopRent = Math.max(currentRent, ifTopRevenue * (avgPerformerPctRate / 100));
    const revenueIncreaseTop = Math.max(0, ifTopRent - currentRent);

    const vacancyCost = currentRent * VACANCY_MONTHS_ESTIMATE;
    const breakEvenAvg = revenueIncreaseAvg > 0 ? Math.ceil(vacancyCost / revenueIncreaseAvg) + VACANCY_MONTHS_ESTIMATE : 999;
    const breakEvenTop = revenueIncreaseTop > 0 ? Math.ceil(vacancyCost / revenueIncreaseTop) + VACANCY_MONTHS_ESTIMATE : 999;

    totalGain += revenueIncreaseAvg;
    totalVacancyRisk += vacancyCost;

    return {
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.tenant_name,
      brand_name: tenant.brand_name,
      category: tenant.category,
      unit_number: tenant.unit_number,
      area_sqm: area,
      zone_name: tenant.zone_name,
      current_revenue_per_sqm: currentRevPerSqm,
      zone_avg_revenue_per_sqm: zoneAvgRevPerSqm,
      zone_top_revenue_per_sqm: zoneTopRevPerSqm,
      current_monthly_rent: currentRent,
      if_avg_performer_rent: Math.round(ifAvgRent),
      if_top_performer_rent: Math.round(ifTopRent),
      revenue_increase_avg: Math.round(revenueIncreaseAvg),
      revenue_increase_top: Math.round(revenueIncreaseTop),
      vacancy_cost_per_month: currentRent,
      vacancy_months_estimate: VACANCY_MONTHS_ESTIMATE,
      break_even_months_avg: breakEvenAvg,
      break_even_months_top: breakEvenTop,
      overall_score: tenant.overall_score,
    };
  });

  return {
    bottom_tenants: bottomTenants,
    total_potential_monthly_gain: Math.round(totalGain),
    total_vacancy_risk: Math.round(totalVacancyRisk),
  };
}
