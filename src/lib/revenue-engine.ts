import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Custis Revenue Verification Engine
//
// The core intelligence that catches tenant underreporting.
//
// METHODOLOGY:
// 1. We know how many people walk into each store (footfall from cameras/counters)
// 2. Each retail category has known conversion rates and average ticket sizes
//    (industry benchmarks calibrated for Egyptian retail market)
// 3. estimated_revenue = footfall x conversion_rate x avg_ticket_size
// 4. If reported revenue < estimated revenue by a significant margin,
//    the tenant is likely underreporting to pay lower percentage rent
//
// CONFIDENCE SCORING:
// - Based on footfall data quality, sample size, and category model fit
// - Higher confidence = more footfall data points, better category match
// - Scores range from 0.0 to 1.0
//
// MODEL VERSION: 1.0.0 — Initial category-based estimation
// ============================================================

const MODEL_VERSION = "1.0.0";
const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Category Revenue Models ─────────────────────────────────
//
// conversion: [low, high] — % of footfall that makes a purchase
// avg_ticket: [low, high] — average transaction value in EGP
//
// Sources: Egyptian retail benchmarks, MENA mall operator data
// These should be calibrated per-property over time as actual
// data accumulates.

export const CATEGORY_MODELS: Record<
  string,
  { conversion: [number, number]; avg_ticket: [number, number] }
> = {
  fashion: { conversion: [0.15, 0.25], avg_ticket: [300, 800] },
  food: { conversion: [0.4, 0.6], avg_ticket: [100, 250] },
  entertainment: { conversion: [0.3, 0.5], avg_ticket: [80, 200] },
  grocery: { conversion: [0.6, 0.8], avg_ticket: [200, 500] },
  services: { conversion: [0.2, 0.35], avg_ticket: [150, 400] },
  electronics: { conversion: [0.1, 0.2], avg_ticket: [500, 2000] },
};

// ── Types ───────────────────────────────────────────────────

export interface RevenueEstimate {
  low_egp: number;
  mid_egp: number;
  high_egp: number;
  confidence: number;
  methodology: string;
}

export interface TenantVerificationResult {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_id: string;
  unit_number: string;
  lease_id: string;
  footfall: number;
  reported_revenue_egp: number | null;
  estimated_low_egp: number;
  estimated_mid_egp: number;
  estimated_high_egp: number;
  variance_egp: number;
  variance_pct: number;
  confidence: number;
  status: "flagged" | "investigating" | "resolved" | "dismissed" | "ok";
  methodology: string;
}

export interface VerificationRunResult {
  property_id: string;
  month: number;
  year: number;
  run_at: string;
  total_tenants: number;
  total_with_sales: number;
  total_discrepancies: number;
  total_variance_egp: number;
  results: TenantVerificationResult[];
}

export interface DiscrepancySummary {
  total_discrepancies: number;
  total_variance_egp: number;
  avg_variance_pct: number;
  by_confidence: { high: number; medium: number; low: number };
  by_status: {
    flagged: number;
    investigating: number;
    resolved: number;
    dismissed: number;
  };
  top_discrepancies: Array<{
    tenant_id: string;
    tenant_name: string;
    brand_name: string;
    category: string;
    unit_number: string;
    period_month: number;
    period_year: number;
    reported_revenue_egp: number;
    estimated_revenue_egp: number;
    variance_egp: number;
    variance_pct: number;
    confidence: number;
    status: string;
  }>;
  total_potential_recovery_egp: number;
}

export interface TenantRevenueProfile {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  monthly_history: Array<{
    month: number;
    year: number;
    reported_egp: number | null;
    estimated_egp: number | null;
    variance_egp: number | null;
    variance_pct: number | null;
    confidence: number | null;
  }>;
  pattern: string;
  avg_variance_pct: number;
  confidence_trend: number[];
  risk_score: number;
}

export interface VerificationReport {
  summary: {
    total_tenants: number;
    tenants_with_sales: number;
    total_discrepancies: number;
    high_confidence_flags: number;
    total_reported_egp: number;
    total_estimated_egp: number;
    total_variance_egp: number;
    avg_variance_pct: number;
    potential_recovery_egp: number;
  };
  tenants: TenantVerificationResult[];
  run_at: string;
}

// ── Core Functions ──────────────────────────────────────────

/**
 * Estimate revenue for a tenant based on footfall and category.
 *
 * If a learnedConversionRate is provided (from the learning engine),
 * it overrides the category default mid conversion for more accurate estimates.
 * The low and high estimates still use category bounds for range.
 */
export function estimateRevenue(
  footfall: number,
  category: string,
  footfallDaysCount: number = 30,
  learnedConversionRate?: { rate: number; confidence: number; source: "learned" | "default" }
): RevenueEstimate {
  const model = CATEGORY_MODELS[category] || CATEGORY_MODELS.services;
  const isFallback = !CATEGORY_MODELS[category];

  const [convLow, convHigh] = model.conversion;
  const [tickLow, tickHigh] = model.avg_ticket;

  // Mid values use geometric mean for more balanced estimation
  const tickMid = Math.sqrt(tickLow * tickHigh);

  // Use learned conversion rate if available, otherwise geometric mean
  const useLearned = learnedConversionRate && learnedConversionRate.source === "learned";
  const convMid = useLearned ? learnedConversionRate!.rate : Math.sqrt(convLow * convHigh);

  const low_egp = Math.round(footfall * convLow * tickLow);
  const mid_egp = Math.round(footfall * convMid * tickMid);
  const high_egp = Math.round(footfall * convHigh * tickHigh);

  // Confidence scoring (0.0 - 1.0)
  let confidence = 0.5; // base

  // Category model quality
  if (!isFallback) confidence += 0.15;

  // Learned rate bonus — significantly more confident
  if (useLearned) confidence += 0.15;

  // Footfall data coverage (more days = more confident)
  if (footfallDaysCount >= 25) confidence += 0.2;
  else if (footfallDaysCount >= 15) confidence += 0.1;
  else if (footfallDaysCount >= 7) confidence += 0.05;

  // Footfall volume (very low footfall = less reliable estimate)
  if (footfall > 5000) confidence += 0.15;
  else if (footfall > 2000) confidence += 0.1;
  else if (footfall > 500) confidence += 0.05;

  confidence = Math.min(confidence, 0.98);

  const conversionNote = useLearned
    ? `Learned conversion: ${(convMid * 100).toFixed(1)}% (confidence: ${learnedConversionRate!.confidence}%)`
    : `Conversion range: ${(convLow * 100).toFixed(0)}%-${(convHigh * 100).toFixed(0)}%`;

  const methodology = [
    `Category model: ${isFallback ? "fallback (services)" : category}`,
    conversionNote,
    `Avg ticket range: EGP ${tickLow}-${tickHigh}`,
    `Footfall: ${footfall.toLocaleString()} visitors`,
    `Data coverage: ${footfallDaysCount} days`,
    `Rate source: ${useLearned ? "AI learned" : "category default"}`,
    `Model version: ${MODEL_VERSION}`,
  ].join(" | ");

  return { low_egp, mid_egp, high_egp, confidence, methodology };
}

/**
 * Run full revenue verification for a property and period.
 *
 * For each tenant with an active lease:
 * 1. Sum their monthly footfall from footfall_daily
 * 2. Get their reported sales from tenant_sales_reported
 * 3. Estimate revenue using the category model
 * 4. Compare reported vs estimated
 * 5. Flag discrepancies and store results in the database
 */
export async function runRevenueVerification(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month: number,
  year: number
): Promise<VerificationRunResult> {
  // 1. Get all tenants with active leases
  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_id, tenants!inner(id, name, brand_name, category), units!inner(id, unit_number)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");

  if (!leases || leases.length === 0) {
    return {
      property_id: propertyId,
      month,
      year,
      run_at: new Date().toISOString(),
      total_tenants: 0,
      total_with_sales: 0,
      total_discrepancies: 0,
      total_variance_egp: 0,
      results: [],
    };
  }

  // 2. Calculate date range for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // 3. Get footfall for all units in this period
  const unitIds = leases.map((l: any) => l.unit_id);

  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("unit_id, total_in, date")
    .in("unit_id", unitIds)
    .gte("date", startDate)
    .lt("date", endDate);

  // Group footfall by unit
  const footfallByUnit: Record<string, { total: number; days: number }> = {};
  (footfallData || []).forEach((r: any) => {
    if (!footfallByUnit[r.unit_id]) {
      footfallByUnit[r.unit_id] = { total: 0, days: 0 };
    }
    footfallByUnit[r.unit_id].total += r.total_in || 0;
    footfallByUnit[r.unit_id].days += 1;
  });

  // 4. Get reported sales for this period
  const tenantIds = leases.map((l: any) => l.tenant_id);

  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);

  const salesByTenant: Record<string, number> = {};
  (salesData || []).forEach((s: any) => {
    salesByTenant[s.tenant_id] = s.reported_revenue_egp;
  });

  // 5. Process each tenant
  const results: TenantVerificationResult[] = [];
  let totalDiscrepancies = 0;
  let totalVariance = 0;

  // Clear previous estimates and discrepancies for this period
  await supabase
    .from("revenue_estimates")
    .delete()
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);

  await supabase
    .from("discrepancies")
    .delete()
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);

  // 5a. Load learned conversion rates for all tenants
  const { data: learnedParams } = await supabase
    .from("ai_learned_params")
    .select("entity_id, learned_value, confidence, sample_count")
    .eq("property_id", propertyId)
    .eq("param_type", "conversion_rate")
    .eq("param_key", "conversion_rate")
    .gt("confidence", 50);

  const learnedRates: Record<
    string,
    { rate: number; confidence: number; source: "learned" | "default"; sample_count: number }
  > = {};
  (learnedParams || []).forEach((p: any) => {
    if (p.entity_id) {
      learnedRates[p.entity_id] = {
        rate: p.learned_value,
        confidence: p.confidence,
        source: "learned",
        sample_count: p.sample_count,
      };
    }
  });

  for (const lease of leases) {
    const tenant = (lease as any).tenants;
    const unit = (lease as any).units;
    const unitFootfall = footfallByUnit[lease.unit_id] || {
      total: 0,
      days: 0,
    };
    const reportedRevenue = salesByTenant[lease.tenant_id] ?? null;

    // Check for learned conversion rate
    const learnedRate = learnedRates[lease.tenant_id] || undefined;

    // Estimate revenue — using learned rate if available
    const estimate = estimateRevenue(
      unitFootfall.total,
      tenant.category,
      unitFootfall.days,
      learnedRate
    );

    // Calculate variance (positive = underreporting, negative = overreporting)
    let varianceEgp = 0;
    let variancePct = 0;
    let status: TenantVerificationResult["status"] = "ok";

    if (reportedRevenue !== null && estimate.mid_egp > 0) {
      varianceEgp = estimate.mid_egp - reportedRevenue;
      variancePct =
        estimate.mid_egp > 0 ? (varianceEgp / estimate.mid_egp) * 100 : 0;

      // Determine flag status
      if (reportedRevenue < estimate.low_egp) {
        status = "flagged"; // HIGH confidence discrepancy
      } else if (reportedRevenue < estimate.mid_egp) {
        status = "flagged"; // MEDIUM confidence — still flagged but lower confidence
      }
    }

    // Store revenue estimate
    await supabase.from("revenue_estimates").insert({
      unit_id: lease.unit_id,
      tenant_id: lease.tenant_id,
      period_month: month,
      period_year: year,
      estimated_revenue_egp: estimate.mid_egp,
      confidence_score: estimate.confidence,
      methodology: estimate.methodology,
      model_version: MODEL_VERSION,
      factors_json: {
        footfall: unitFootfall.total,
        footfall_days: unitFootfall.days,
        category: tenant.category,
        low_egp: estimate.low_egp,
        mid_egp: estimate.mid_egp,
        high_egp: estimate.high_egp,
        conversion_range: CATEGORY_MODELS[tenant.category]?.conversion || [
          0.2, 0.35,
        ],
        ticket_range: CATEGORY_MODELS[tenant.category]?.avg_ticket || [
          150, 400,
        ],
      },
    });

    // Store discrepancy if flagged
    if (status === "flagged" && reportedRevenue !== null) {
      // Adjust confidence: if reported < low_estimate, higher confidence
      const discrepancyConfidence =
        reportedRevenue < estimate.low_egp
          ? Math.min(estimate.confidence + 0.1, 0.98) // boost for extreme cases
          : estimate.confidence * 0.85; // lower for mid-range flags

      await supabase.from("discrepancies").insert({
        unit_id: lease.unit_id,
        tenant_id: lease.tenant_id,
        period_month: month,
        period_year: year,
        reported_revenue_egp: reportedRevenue,
        estimated_revenue_egp: estimate.mid_egp,
        variance_egp: varianceEgp,
        variance_pct: Math.round(variancePct * 100) / 100,
        confidence: Math.round(discrepancyConfidence * 10000) / 10000,
        status: "flagged",
      });

      totalDiscrepancies++;
      totalVariance += varianceEgp;
    }

    results.push({
      tenant_id: lease.tenant_id,
      tenant_name: tenant.name,
      brand_name: tenant.brand_name,
      category: tenant.category,
      unit_id: lease.unit_id,
      unit_number: unit.unit_number,
      lease_id: lease.id,
      footfall: unitFootfall.total,
      reported_revenue_egp: reportedRevenue,
      estimated_low_egp: estimate.low_egp,
      estimated_mid_egp: estimate.mid_egp,
      estimated_high_egp: estimate.high_egp,
      variance_egp: varianceEgp,
      variance_pct: Math.round(variancePct * 100) / 100,
      confidence: estimate.confidence,
      status,
      methodology: estimate.methodology,
    });
  }

  // Sort by variance descending (worst offenders first)
  results.sort((a, b) => b.variance_egp - a.variance_egp);

  return {
    property_id: propertyId,
    month,
    year,
    run_at: new Date().toISOString(),
    total_tenants: leases.length,
    total_with_sales: Object.keys(salesByTenant).length,
    total_discrepancies: totalDiscrepancies,
    total_variance_egp: totalVariance,
    results,
  };
}

/**
 * Get discrepancy summary for a property, optionally filtered by period.
 */
export async function getDiscrepancySummary(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month?: number,
  year?: number
): Promise<DiscrepancySummary> {
  // Get all discrepancies with tenant info
  let query = supabase
    .from("discrepancies")
    .select(
      "*, tenants!inner(id, name, brand_name, category), units!inner(unit_number)"
    );

  // Filter by tenants in this property via units
  const { data: propertyUnits } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  const unitIds = (propertyUnits || []).map((u: any) => u.id);

  if (unitIds.length > 0) {
    query = query.in("unit_id", unitIds);
  }

  if (month !== undefined) query = query.eq("period_month", month);
  if (year !== undefined) query = query.eq("period_year", year);

  const { data: discrepancies } = await query.order("variance_egp", {
    ascending: false,
  });

  if (!discrepancies || discrepancies.length === 0) {
    return {
      total_discrepancies: 0,
      total_variance_egp: 0,
      avg_variance_pct: 0,
      by_confidence: { high: 0, medium: 0, low: 0 },
      by_status: { flagged: 0, investigating: 0, resolved: 0, dismissed: 0 },
      top_discrepancies: [],
      total_potential_recovery_egp: 0,
    };
  }

  const totalVariance = discrepancies.reduce(
    (sum: number, d: any) => sum + (d.variance_egp || 0),
    0
  );
  const avgVariancePct =
    discrepancies.reduce(
      (sum: number, d: any) => sum + (d.variance_pct || 0),
      0
    ) / discrepancies.length;

  // Count by confidence level
  const byConfidence = { high: 0, medium: 0, low: 0 };
  discrepancies.forEach((d: any) => {
    const conf = d.confidence || 0;
    if (conf >= 0.75) byConfidence.high++;
    else if (conf >= 0.5) byConfidence.medium++;
    else byConfidence.low++;
  });

  // Count by status
  const byStatus = { flagged: 0, investigating: 0, resolved: 0, dismissed: 0 };
  discrepancies.forEach((d: any) => {
    if (d.status in byStatus)
      byStatus[d.status as keyof typeof byStatus]++;
  });

  // Potential recovery: sum of variance where confidence > 0.6
  const potentialRecovery = discrepancies
    .filter((d: any) => (d.confidence || 0) > 0.6)
    .reduce((sum: number, d: any) => sum + (d.variance_egp || 0), 0);

  // Top 10 discrepancies
  const topDiscrepancies = discrepancies.slice(0, 10).map((d: any) => ({
    tenant_id: d.tenant_id,
    tenant_name: d.tenants?.name || "",
    brand_name: d.tenants?.brand_name || "",
    category: d.tenants?.category || "",
    unit_number: d.units?.unit_number || "",
    period_month: d.period_month,
    period_year: d.period_year,
    reported_revenue_egp: d.reported_revenue_egp,
    estimated_revenue_egp: d.estimated_revenue_egp,
    variance_egp: d.variance_egp,
    variance_pct: d.variance_pct,
    confidence: d.confidence,
    status: d.status,
  }));

  return {
    total_discrepancies: discrepancies.length,
    total_variance_egp: totalVariance,
    avg_variance_pct: Math.round(avgVariancePct * 100) / 100,
    by_confidence: byConfidence,
    by_status: byStatus,
    top_discrepancies: topDiscrepancies,
    total_potential_recovery_egp: potentialRecovery,
  };
}

/**
 * Get a single tenant's revenue profile with historical data.
 */
export async function getTenantRevenueProfile(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantRevenueProfile> {
  // Get tenant info
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, brand_name, category")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // Get last 12 months of reported sales
  const now = new Date();
  const months: Array<{ month: number; year: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("period_month, period_year, reported_revenue_egp")
    .eq("tenant_id", tenantId)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  const salesMap: Record<string, number> = {};
  (salesData || []).forEach((s: any) => {
    salesMap[`${s.period_year}-${s.period_month}`] = s.reported_revenue_egp;
  });

  // Get estimates
  const { data: estimateData } = await supabase
    .from("revenue_estimates")
    .select(
      "period_month, period_year, estimated_revenue_egp, confidence_score"
    )
    .eq("tenant_id", tenantId)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  const estimateMap: Record<string, { egp: number; conf: number }> = {};
  (estimateData || []).forEach((e: any) => {
    estimateMap[`${e.period_year}-${e.period_month}`] = {
      egp: e.estimated_revenue_egp,
      conf: e.confidence_score,
    };
  });

  // Build monthly history
  const monthlyHistory = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const reported = salesMap[key] ?? null;
    const est = estimateMap[key] ?? null;
    let varianceEgp: number | null = null;
    let variancePct: number | null = null;

    if (reported !== null && est !== null) {
      varianceEgp = est.egp - reported;
      variancePct = est.egp > 0 ? (varianceEgp / est.egp) * 100 : 0;
    }

    return {
      month: m.month,
      year: m.year,
      reported_egp: reported,
      estimated_egp: est?.egp ?? null,
      variance_egp: varianceEgp !== null ? Math.round(varianceEgp) : null,
      variance_pct:
        variancePct !== null ? Math.round(variancePct * 100) / 100 : null,
      confidence: est?.conf ?? null,
    };
  });

  // Pattern analysis
  const variancePcts = monthlyHistory
    .filter((m) => m.variance_pct !== null)
    .map((m) => m.variance_pct as number);

  const avgVariancePct =
    variancePcts.length > 0
      ? variancePcts.reduce((a, b) => a + b, 0) / variancePcts.length
      : 0;

  let pattern: string;
  if (variancePcts.length < 2) {
    pattern = "Insufficient data for pattern analysis";
  } else if (avgVariancePct > 25) {
    pattern = `Consistent underreporter: averages ${Math.round(avgVariancePct)}% below estimate`;
  } else if (avgVariancePct > 15) {
    pattern = `Moderate underreporting: averages ${Math.round(avgVariancePct)}% below estimate`;
  } else if (avgVariancePct > 5) {
    pattern = `Slight underreporting tendency: ${Math.round(avgVariancePct)}% below estimate`;
  } else if (avgVariancePct < -10) {
    pattern = `Reports above estimates by ${Math.round(Math.abs(avgVariancePct))}% — model may underestimate`;
  } else {
    pattern = "Within normal range";
  }

  // Confidence trend
  const confidenceTrend = monthlyHistory
    .filter((m) => m.confidence !== null)
    .map((m) => m.confidence as number);

  // Risk score (0-100)
  // Based on: frequency of underreporting, magnitude, and consistency
  let riskScore = 0;

  // Frequency: what % of months have >10% underreporting?
  const underreportingMonths = variancePcts.filter((v) => v > 10).length;
  const frequency =
    variancePcts.length > 0 ? underreportingMonths / variancePcts.length : 0;
  riskScore += frequency * 40;

  // Magnitude: average variance
  if (avgVariancePct > 30) riskScore += 35;
  else if (avgVariancePct > 20) riskScore += 25;
  else if (avgVariancePct > 10) riskScore += 15;
  else if (avgVariancePct > 5) riskScore += 5;

  // Consistency: is it getting worse?
  if (variancePcts.length >= 3) {
    const recent = variancePcts.slice(-2);
    const earlier = variancePcts.slice(0, -2);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg =
      earlier.length > 0
        ? earlier.reduce((a, b) => a + b, 0) / earlier.length
        : 0;
    if (recentAvg > earlierAvg + 5) riskScore += 25;
    else if (recentAvg > earlierAvg) riskScore += 10;
  }

  riskScore = Math.min(Math.round(riskScore), 100);

  return {
    tenant_id: tenantId,
    tenant_name: tenant.name,
    brand_name: tenant.brand_name,
    category: tenant.category,
    monthly_history: monthlyHistory,
    pattern,
    avg_variance_pct: Math.round(avgVariancePct * 100) / 100,
    confidence_trend: confidenceTrend,
    risk_score: riskScore,
  };
}

/**
 * Generate a complete verification report for a property and period.
 */
export async function getVerificationReport(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month: number,
  year: number
): Promise<VerificationReport> {
  // Get all tenants with active leases
  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_id, tenants!inner(id, name, brand_name, category), units!inner(id, unit_number)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");

  if (!leases || leases.length === 0) {
    return {
      summary: {
        total_tenants: 0,
        tenants_with_sales: 0,
        total_discrepancies: 0,
        high_confidence_flags: 0,
        total_reported_egp: 0,
        total_estimated_egp: 0,
        total_variance_egp: 0,
        avg_variance_pct: 0,
        potential_recovery_egp: 0,
      },
      tenants: [],
      run_at: new Date().toISOString(),
    };
  }

  // Get date range
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const unitIds = leases.map((l: any) => l.unit_id);
  const tenantIds = leases.map((l: any) => l.tenant_id);

  // Get footfall
  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("unit_id, total_in, date")
    .in("unit_id", unitIds)
    .gte("date", startDate)
    .lt("date", endDate);

  const footfallByUnit: Record<string, { total: number; days: number }> = {};
  (footfallData || []).forEach((r: any) => {
    if (!footfallByUnit[r.unit_id]) {
      footfallByUnit[r.unit_id] = { total: 0, days: 0 };
    }
    footfallByUnit[r.unit_id].total += r.total_in || 0;
    footfallByUnit[r.unit_id].days += 1;
  });

  // Get reported sales
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);

  const salesByTenant: Record<string, number> = {};
  (salesData || []).forEach((s: any) => {
    salesByTenant[s.tenant_id] = s.reported_revenue_egp;
  });

  // Get existing discrepancies (with their status)
  const { data: existingDiscrepancies } = await supabase
    .from("discrepancies")
    .select("tenant_id, status, confidence")
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);

  const discrepancyMap: Record<string, { status: string; confidence: number }> =
    {};
  (existingDiscrepancies || []).forEach((d: any) => {
    discrepancyMap[d.tenant_id] = {
      status: d.status,
      confidence: d.confidence,
    };
  });

  // Build results
  const tenants: TenantVerificationResult[] = [];
  let totalReported = 0;
  let totalEstimated = 0;
  let totalVariance = 0;
  let totalDiscrepancies = 0;
  let highConfidenceFlags = 0;

  for (const lease of leases) {
    const tenant = (lease as any).tenants;
    const unit = (lease as any).units;
    const unitFootfall = footfallByUnit[lease.unit_id] || {
      total: 0,
      days: 0,
    };
    const reportedRevenue = salesByTenant[lease.tenant_id] ?? null;

    const estimate = estimateRevenue(
      unitFootfall.total,
      tenant.category,
      unitFootfall.days
    );

    let varianceEgp = 0;
    let variancePct = 0;
    let status: TenantVerificationResult["status"] = "ok";

    if (reportedRevenue !== null && estimate.mid_egp > 0) {
      varianceEgp = estimate.mid_egp - reportedRevenue;
      variancePct = (varianceEgp / estimate.mid_egp) * 100;

      totalReported += reportedRevenue;
      totalEstimated += estimate.mid_egp;

      // Use existing discrepancy status if present
      const existing = discrepancyMap[lease.tenant_id];
      if (existing) {
        status = existing.status as TenantVerificationResult["status"];
        if (existing.confidence >= 0.75) highConfidenceFlags++;
        totalDiscrepancies++;
        totalVariance += varianceEgp;
      } else if (reportedRevenue < estimate.low_egp) {
        status = "flagged";
        highConfidenceFlags++;
        totalDiscrepancies++;
        totalVariance += varianceEgp;
      } else if (reportedRevenue < estimate.mid_egp * 0.85) {
        status = "flagged";
        totalDiscrepancies++;
        totalVariance += varianceEgp;
      }
    }

    tenants.push({
      tenant_id: lease.tenant_id,
      tenant_name: tenant.name,
      brand_name: tenant.brand_name,
      category: tenant.category,
      unit_id: lease.unit_id,
      unit_number: unit.unit_number,
      lease_id: lease.id,
      footfall: unitFootfall.total,
      reported_revenue_egp: reportedRevenue,
      estimated_low_egp: estimate.low_egp,
      estimated_mid_egp: estimate.mid_egp,
      estimated_high_egp: estimate.high_egp,
      variance_egp: Math.round(varianceEgp),
      variance_pct: Math.round(variancePct * 100) / 100,
      confidence: estimate.confidence,
      status,
      methodology: estimate.methodology,
    });
  }

  // Sort by variance descending
  tenants.sort((a, b) => b.variance_egp - a.variance_egp);

  const avgVariancePct =
    tenants.filter((t) => t.reported_revenue_egp !== null).length > 0
      ? tenants
          .filter((t) => t.reported_revenue_egp !== null)
          .reduce((sum, t) => sum + t.variance_pct, 0) /
        tenants.filter((t) => t.reported_revenue_egp !== null).length
      : 0;

  // Potential recovery: variance where confidence > 0.6 and status is not resolved/dismissed
  const potentialRecovery = tenants
    .filter(
      (t) =>
        t.confidence > 0.6 &&
        t.status !== "resolved" &&
        t.status !== "dismissed" &&
        t.variance_egp > 0
    )
    .reduce((sum, t) => sum + t.variance_egp, 0);

  return {
    summary: {
      total_tenants: leases.length,
      tenants_with_sales: Object.keys(salesByTenant).length,
      total_discrepancies: totalDiscrepancies,
      high_confidence_flags: highConfidenceFlags,
      total_reported_egp: totalReported,
      total_estimated_egp: totalEstimated,
      total_variance_egp: totalVariance,
      avg_variance_pct: Math.round(avgVariancePct * 100) / 100,
      potential_recovery_egp: potentialRecovery,
    },
    tenants,
    run_at: new Date().toISOString(),
  };
}
