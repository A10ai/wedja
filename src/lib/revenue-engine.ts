import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";

// ============================================================
// Wedja Revenue Verification Engine
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

const MODEL_VERSION = "1.1.0";

/** Share of the period's days that must have store footfall before we judge a report. */
export const MIN_FOOTFALL_COVERAGE = 0.8;

/**
 * Learned conversion rates are calibrated from the tenants' own reported
 * sales (learning-engine.ts), so a tenant that underreports consistently
 * teaches the model to expect its low figures and its flag disappears.
 * Keep them out of verification until they are calibrated on verified data
 * (POS feeds or audited months). Set REVENUE_USE_LEARNED_RATES=true only for
 * experiments.
 */
function learnedRatesEnabled(): boolean {
  return process.env.REVENUE_USE_LEARNED_RATES === "true";
}
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
  /**
   * flagged           reported sales are below the conservative (low) estimate
   * ok                reported sales are within or above the estimated range
   * insufficient_data footfall covers less than MIN_FOOTFALL_COVERAGE of the period
   * missing_report    no sales report for the period
   * investigating/resolved/dismissed  a person already handled this flag
   */
  status: VerificationStatus;
  /** Share of days in the period with footfall data (0-1). */
  footfall_coverage: number;
  /** Extra rent owed if true sales were at least the conservative estimate. */
  rent_at_risk_egp: number;
  methodology: string;
}

export type VerificationStatus =
  | "flagged"
  | "investigating"
  | "resolved"
  | "dismissed"
  | "ok"
  | "insufficient_data"
  | "missing_report";

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
 * Monthly rent under "minimum rent or percentage of sales, whichever is
 * higher". percentageRate is stored as a percent (10 = 10%).
 */
export function rentDue(minRent: number, percentageRate: number, sales: number): number {
  return Math.max(minRent || 0, (sales * (percentageRate || 0)) / 100);
}

/**
 * Rent the mall would be owed if true sales were at least `estimatedSales`,
 * beyond what the reported sales already generate. Zero when the minimum rent
 * covers both, or when the lease has no percentage clause.
 */
export function rentAtRisk(
  minRent: number,
  percentageRate: number,
  reportedSales: number,
  estimatedSales: number
): number {
  if (!percentageRate || estimatedSales <= reportedSales) return 0;
  const gap =
    rentDue(minRent, percentageRate, estimatedSales) - rentDue(minRent, percentageRate, reportedSales);
  return Math.max(0, Math.round(gap));
}

export interface LeaseAssessment {
  estimate: RevenueEstimate;
  status: VerificationStatus;
  coverage: number;
  variance_egp: number;
  variance_pct: number;
  rent_at_risk_egp: number;
}

/**
 * Judge one lease's reported sales for one period. Pure — shared by the
 * verification run and the report so both screens always agree.
 *
 * A flag needs the report to fall below the conservative LOW estimate: the
 * category range is 3–8x wide, so "below the midpoint" flags many honest
 * tenants. Variance against the midpoint is kept for information only.
 */
export function assessLease(input: {
  footfall: number;
  footfallDays: number;
  periodDays: number;
  category: string;
  reportedRevenue: number | null;
  minRent: number;
  percentageRate: number;
  learnedRate?: { rate: number; confidence: number; source: "learned" | "default" };
}): LeaseAssessment {
  const estimate = estimateRevenue(input.footfall, input.category, input.footfallDays, input.learnedRate);
  const coverage = input.periodDays > 0 ? Math.min(1, input.footfallDays / input.periodDays) : 0;
  const result: LeaseAssessment = {
    estimate,
    status: "ok",
    coverage,
    variance_egp: 0,
    variance_pct: 0,
    rent_at_risk_egp: 0,
  };

  if (input.reportedRevenue === null) {
    result.status = "missing_report";
    return result;
  }
  // Missing footfall makes the estimate too low and would hide
  // underreporting; don't judge the report either way.
  if (coverage < MIN_FOOTFALL_COVERAGE || estimate.low_egp <= 0) {
    result.status = "insufficient_data";
    return result;
  }

  result.variance_egp = estimate.mid_egp - input.reportedRevenue;
  result.variance_pct = Math.round((result.variance_egp / estimate.mid_egp) * 10000) / 100;
  if (input.reportedRevenue < estimate.low_egp) {
    result.status = "flagged";
    result.rent_at_risk_egp = rentAtRisk(
      input.minRent,
      input.percentageRate,
      input.reportedRevenue,
      estimate.low_egp
    );
  }
  return result;
}

function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type LeaseRow = Record<string, any>;

interface PeriodInputs {
  leases: LeaseRow[];
  tenantIds: string[];
  periodDays: number;
  footfallByUnit: Record<string, { total: number; days: number }>;
  reportedFor: (lease: LeaseRow) => number | null;
}

/** Load everything needed to assess every active lease for one month. */
async function loadPeriodInputs(
  supabase: SupabaseClient,
  propertyId: string,
  month: number,
  year: number
): Promise<PeriodInputs> {
  const { data: leaseRows } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_id, min_rent_monthly_egp, percentage_rate, tenants!inner(id, name, brand_name, category), units!inner(id, unit_number)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");
  const leases = (leaseRows || []) as LeaseRow[];
  const periodDays = daysInMonth(month, year);
  if (leases.length === 0) {
    return { leases, tenantIds: [], periodDays, footfallByUnit: {}, reportedFor: () => null };
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const unitIds = leases.map((l) => l.unit_id);
  const tenantIds = leases.map((l) => l.tenant_id);

  // Paged: a month of daily rows for ~170 units exceeds PostgREST's 1000-row cap
  const footfallData = await fetchAll<LeaseRow>((from, to) =>
    supabase
      .from("footfall_daily")
      .select("id, unit_id, total_in, date")
      .in("unit_id", unitIds)
      .gte("date", startDate)
      .lt("date", endDate)
      .order("id")
      .range(from, to)
  );

  // One value per unit per day: duplicate rows for the same day (re-entered
  // manual counts, retried pushes) must not double the estimate.
  const dailyByUnit: Record<string, Map<string, number>> = {};
  footfallData.forEach((r) => {
    const days = (dailyByUnit[r.unit_id] ??= new Map());
    days.set(r.date, Math.max(days.get(r.date) ?? 0, r.total_in || 0));
  });
  const footfallByUnit: Record<string, { total: number; days: number }> = {};
  for (const [unitId, days] of Object.entries(dailyByUnit)) {
    let total = 0;
    days.forEach((v) => (total += v));
    footfallByUnit[unitId] = { total, days: days.size };
  }

  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("lease_id, tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);

  // Match sales to the lease (unit), not the tenant: a tenant with two units
  // reports per unit, and comparing one unit's footfall with the other unit's
  // sales flags honest tenants. Rows without lease_id fall back to the tenant
  // only when that tenant has a single active lease.
  const leasesPerTenant: Record<string, number> = {};
  leases.forEach((l) => {
    leasesPerTenant[l.tenant_id] = (leasesPerTenant[l.tenant_id] || 0) + 1;
  });
  const salesByLease: Record<string, number> = {};
  const salesByTenant: Record<string, number> = {};
  (salesData || []).forEach((row: LeaseRow) => {
    const amount = Number(row.reported_revenue_egp || 0);
    if (row.lease_id) {
      salesByLease[row.lease_id] = (salesByLease[row.lease_id] || 0) + amount;
    } else if (leasesPerTenant[row.tenant_id] === 1) {
      salesByTenant[row.tenant_id] = (salesByTenant[row.tenant_id] || 0) + amount;
    }
  });

  return {
    leases,
    tenantIds,
    periodDays,
    footfallByUnit,
    reportedFor: (lease) => salesByLease[lease.id] ?? salesByTenant[lease.tenant_id] ?? null,
  };
}

function toResult(lease: LeaseRow, footfall: number, reported: number | null, a: LeaseAssessment): TenantVerificationResult {
  return {
    tenant_id: lease.tenant_id,
    tenant_name: lease.tenants.name,
    brand_name: lease.tenants.brand_name,
    category: lease.tenants.category,
    unit_id: lease.unit_id,
    unit_number: lease.units.unit_number,
    lease_id: lease.id,
    footfall,
    reported_revenue_egp: reported,
    estimated_low_egp: a.estimate.low_egp,
    estimated_mid_egp: a.estimate.mid_egp,
    estimated_high_egp: a.estimate.high_egp,
    variance_egp: Math.round(a.variance_egp),
    variance_pct: a.variance_pct,
    confidence: a.estimate.confidence,
    status: a.status,
    footfall_coverage: Math.round(a.coverage * 10000) / 10000,
    rent_at_risk_egp: a.rent_at_risk_egp,
    methodology: a.estimate.methodology,
  };
}

function discrepancyReasoning(r: TenantVerificationResult, footfallDays: number, periodDays: number, minRent: number, pctRate: number): string {
  const reported = Math.round(r.reported_revenue_egp ?? 0);
  return [
    `Reported EGP ${reported.toLocaleString()} is EGP ${Math.round(r.estimated_low_egp - reported).toLocaleString()} below the conservative estimate of EGP ${r.estimated_low_egp.toLocaleString()}`,
    `(range EGP ${r.estimated_low_egp.toLocaleString()}–${r.estimated_high_egp.toLocaleString()}, midpoint ${r.estimated_mid_egp.toLocaleString()})`,
    `from ${r.footfall.toLocaleString()} visitors over ${footfallDays}/${periodDays} days.`,
    pctRate
      ? `Lease: minimum rent EGP ${minRent.toLocaleString()} or ${pctRate}% of sales; extra rent if sales were at least the conservative estimate: EGP ${r.rent_at_risk_egp.toLocaleString()}.`
      : "The lease has no percentage-rent clause, so no extra rent is at stake.",
    "Treat as a lead to request POS data, not as proof.",
  ].join(" ");
}

/**
 * Run full revenue verification for a property and period.
 *
 * For each tenant with an active lease:
 * 1. Sum the unit's footfall for the month (one value per day)
 * 2. Get the lease's reported sales
 * 3. Estimate revenue using the category model
 * 4. Flag reports below the conservative estimate, with the rent at stake
 * 5. Store estimates and flags; keep flags a person already handled
 */
export async function runRevenueVerification(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month: number,
  year: number
): Promise<VerificationRunResult> {
  const { leases, tenantIds, periodDays, footfallByUnit, reportedFor } = await loadPeriodInputs(
    supabase,
    propertyId,
    month,
    year
  );

  if (leases.length === 0) {
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

  // Replace this period's estimates, and only the machine flags: discrepancies
  // a person has picked up (investigating / resolved / dismissed) keep their
  // status and notes.
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
    .eq("period_year", year)
    .eq("status", "flagged");

  const { data: handled } = await supabase
    .from("discrepancies")
    .select("unit_id, tenant_id, status")
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year)
    .neq("status", "flagged");
  const handledStatus: Record<string, VerificationStatus> = {};
  (handled || []).forEach((d: Record<string, any>) => {
    handledStatus[`${d.unit_id}:${d.tenant_id}`] = d.status;
  });

  // Learned conversion rates (off by default — see learnedRatesEnabled)
  const learnedRates: Record<string, { rate: number; confidence: number; source: "learned" | "default" }> = {};
  if (learnedRatesEnabled()) {
    const { data: learnedParams } = await supabase
      .from("ai_learned_params")
      .select("entity_id, learned_value, confidence, sample_count")
      .eq("property_id", propertyId)
      .eq("param_type", "conversion_rate")
      .eq("param_key", "conversion_rate")
      .gt("confidence", 50);
    (learnedParams || []).forEach((p: Record<string, any>) => {
      if (p.entity_id) {
        learnedRates[p.entity_id] = { rate: p.learned_value, confidence: p.confidence, source: "learned" };
      }
    });
  }

  const results: TenantVerificationResult[] = [];
  let totalDiscrepancies = 0;
  let totalVariance = 0;

  for (const lease of leases) {
    const unitFootfall = footfallByUnit[lease.unit_id] || { total: 0, days: 0 };
    const reportedRevenue = reportedFor(lease);
    const minRent = Number(lease.min_rent_monthly_egp || 0);
    const pctRate = Number(lease.percentage_rate || 0);

    const assessment = assessLease({
      footfall: unitFootfall.total,
      footfallDays: unitFootfall.days,
      periodDays,
      category: lease.tenants.category,
      reportedRevenue,
      minRent,
      percentageRate: pctRate,
      learnedRate: learnedRates[lease.tenant_id],
    });
    const result = toResult(lease, unitFootfall.total, reportedRevenue, assessment);
    const { estimate } = assessment;

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
        period_days: periodDays,
        coverage: result.footfall_coverage,
        category: lease.tenants.category,
        low_egp: estimate.low_egp,
        mid_egp: estimate.mid_egp,
        high_egp: estimate.high_egp,
        conversion_range: CATEGORY_MODELS[lease.tenants.category]?.conversion || [0.2, 0.35],
        ticket_range: CATEGORY_MODELS[lease.tenants.category]?.avg_ticket || [150, 400],
      },
    });

    const handledAs = handledStatus[`${lease.unit_id}:${lease.tenant_id}`];
    if (result.status === "flagged" && handledAs) {
      result.status = handledAs;
    } else if (result.status === "flagged") {
      const { error: insertError } = await supabase.from("discrepancies").insert({
        unit_id: lease.unit_id,
        tenant_id: lease.tenant_id,
        period_month: month,
        period_year: year,
        reported_revenue_egp: reportedRevenue,
        estimated_revenue_egp: estimate.mid_egp,
        estimated_low_egp: estimate.low_egp,
        variance_egp: result.variance_egp,
        variance_pct: result.variance_pct,
        rent_at_risk_egp: result.rent_at_risk_egp,
        footfall_coverage: result.footfall_coverage,
        confidence: Math.round(estimate.confidence * 10000) / 10000,
        model_version: MODEL_VERSION,
        reasoning: discrepancyReasoning(result, unitFootfall.days, periodDays, minRent, pctRate),
        status: "flagged",
      });
      if (insertError) {
        throw new Error(`Failed to store discrepancy for tenant ${lease.tenant_id}: ${insertError.message}`);
      }
      totalDiscrepancies++;
      totalVariance += result.variance_egp;
    }

    results.push(result);
  }

  // Sort by variance descending (worst offenders first)
  results.sort((a, b) => b.variance_egp - a.variance_egp);

  return {
    property_id: propertyId,
    month,
    year,
    run_at: new Date().toISOString(),
    total_tenants: leases.length,
    total_with_sales: results.filter((r) => r.reported_revenue_egp !== null).length,
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

  const unitIds = (propertyUnits || []).map((u: Record<string, any>) => u.id);

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
    (sum: number, d: Record<string, any>) => sum + (d.variance_egp || 0),
    0
  );
  const avgVariancePct =
    discrepancies.reduce(
      (sum: number, d: Record<string, any>) => sum + (d.variance_pct || 0),
      0
    ) / discrepancies.length;

  // Count by confidence level
  const byConfidence = { high: 0, medium: 0, low: 0 };
  discrepancies.forEach((d: Record<string, any>) => {
    const conf = d.confidence || 0;
    if (conf >= 0.75) byConfidence.high++;
    else if (conf >= 0.5) byConfidence.medium++;
    else byConfidence.low++;
  });

  // Count by status
  const byStatus = { flagged: 0, investigating: 0, resolved: 0, dismissed: 0 };
  discrepancies.forEach((d: Record<string, any>) => {
    if (d.status in byStatus)
      byStatus[d.status as keyof typeof byStatus]++;
  });

  // Potential recovery is RENT, not sales: the extra rent owed on open cases
  // if true sales were at least the conservative estimate. Rows written
  // before rent_at_risk_egp existed contribute nothing until re-verified.
  const potentialRecovery = discrepancies
    .filter((d: Record<string, any>) => d.status === "flagged" || d.status === "investigating")
    .reduce((sum: number, d: Record<string, any>) => sum + Number(d.rent_at_risk_egp || 0), 0);

  // Top 10 discrepancies
  const topDiscrepancies = discrepancies.slice(0, 10).map((d: Record<string, any>) => ({
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
  (salesData || []).forEach((s: Record<string, any>) => {
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
  (estimateData || []).forEach((e: Record<string, any>) => {
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
 * Uses the same assessment as runRevenueVerification, and shows the status a
 * person gave to any flag that was already handled.
 */
export async function getVerificationReport(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month: number,
  year: number
): Promise<VerificationReport> {
  const { leases, tenantIds, periodDays, footfallByUnit, reportedFor } = await loadPeriodInputs(
    supabase,
    propertyId,
    month,
    year
  );

  if (leases.length === 0) {
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

  const { data: existingDiscrepancies } = await supabase
    .from("discrepancies")
    .select("unit_id, tenant_id, status")
    .in("tenant_id", tenantIds)
    .eq("period_month", month)
    .eq("period_year", year);
  const statusByLease: Record<string, VerificationStatus> = {};
  (existingDiscrepancies || []).forEach((d: Record<string, any>) => {
    statusByLease[`${d.unit_id}:${d.tenant_id}`] = d.status;
  });

  const tenants: TenantVerificationResult[] = [];
  let totalReported = 0;
  let totalEstimated = 0;
  let totalVariance = 0;
  let totalDiscrepancies = 0;
  let highConfidenceFlags = 0;
  let potentialRecovery = 0;

  for (const lease of leases) {
    const unitFootfall = footfallByUnit[lease.unit_id] || { total: 0, days: 0 };
    const reportedRevenue = reportedFor(lease);
    const assessment = assessLease({
      footfall: unitFootfall.total,
      footfallDays: unitFootfall.days,
      periodDays,
      category: lease.tenants.category,
      reportedRevenue,
      minRent: Number(lease.min_rent_monthly_egp || 0),
      percentageRate: Number(lease.percentage_rate || 0),
    });
    const result = toResult(lease, unitFootfall.total, reportedRevenue, assessment);

    if (result.status === "flagged") {
      result.status = statusByLease[`${lease.unit_id}:${lease.tenant_id}`] ?? "flagged";
      totalDiscrepancies++;
      totalVariance += result.variance_egp;
      if (result.confidence >= 0.75) highConfidenceFlags++;
      if (result.status === "flagged" || result.status === "investigating") {
        potentialRecovery += result.rent_at_risk_egp;
      }
    }
    if (reportedRevenue !== null && result.status !== "insufficient_data") {
      totalReported += reportedRevenue;
      totalEstimated += result.estimated_mid_egp;
    }
    tenants.push(result);
  }

  tenants.sort((a, b) => b.variance_egp - a.variance_egp);

  const judged = tenants.filter(
    (t) => t.reported_revenue_egp !== null && t.status !== "insufficient_data"
  );
  const avgVariancePct =
    judged.length > 0 ? judged.reduce((sum, t) => sum + t.variance_pct, 0) / judged.length : 0;

  return {
    summary: {
      total_tenants: leases.length,
      tenants_with_sales: tenants.filter((t) => t.reported_revenue_egp !== null).length,
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
