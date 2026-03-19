import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Wedja Contract Analytics Engine
//
// Portfolio-level lease intelligence for commercial real estate.
//
// KEY METRICS:
// - WALE (Weighted Average Lease Expiry) — industry standard
// - Rent Roll — forward 24 months contracted revenue
// - Rent vs Sales Gap — the money you're leaving on the table
// - Escalation tracking — future rent increases
// - Tenant concentration risk — dependency on top tenants
//
// The rent_vs_sales analysis is the unique insight: connecting
// lease structures (min rent OR % of sales) with revenue
// verification data to find where percentage rent should be
// higher but tenants are only paying minimum rent.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface ContractOverview {
  total_leases: number;
  active_leases: number;
  expired_leases: number;
  pending_leases: number;
  total_monthly_min_rent_egp: number;
  total_monthly_percentage_potential_egp: number;
  avg_lease_duration_years: number;
  avg_rent_per_sqm: number;
  occupancy_rate: number;
  total_leased_area_sqm: number;
  vacant_area_sqm: number;
  total_units: number;
  occupied_units: number;
}

export interface ExpiringLease {
  lease_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  current_rent: number;
  percentage_rate: number;
  expiry_date: string;
  days_until_expiry: number;
  escalation_rate: number;
  ai_recommendation: string;
  recommendation_type: "renew" | "do_not_renew" | "negotiate";
  revenue_per_sqm: number;
  payment_compliance: number;
  has_discrepancy: boolean;
}

export interface LeasePerformanceItem {
  lease_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  min_rent: number;
  percentage_rate: number;
  avg_reported_sales: number;
  percentage_rent: number;
  actually_paying: "min_rent" | "percentage";
  revenue_per_sqm: number;
  payment_compliance: number;
  performance_score: "good" | "watch" | "underperforming";
  total_paid: number;
  total_due: number;
  months_on_time: number;
  total_months: number;
  expiry_date: string;
}

export interface EscalationItem {
  lease_id: string;
  tenant_name: string;
  brand_name: string;
  unit_number: string;
  escalation_rate: number;
  current_rent: number;
  post_escalation_rent: number;
  increase_amount: number;
  next_escalation_date: string;
  start_date: string;
  end_date: string;
}

export interface RentVsSalesItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  min_rent: number;
  percentage_rate: number;
  avg_reported_sales: number;
  percentage_rent: number;
  actual_paying: number;
  gap_egp: number;
  paying_type: "min_rent" | "percentage";
  should_pay_type: "min_rent" | "percentage";
  underreporting_flag: boolean;
  estimated_sales: number | null;
  estimated_gap: number | null;
  revenue_verification_note: string | null;
}

export interface ContractAlert {
  id: string;
  severity: "critical" | "warning" | "info" | "opportunity";
  title: string;
  message: string;
  category: string;
  recommended_action: string;
  tenant_name?: string;
  unit_number?: string;
  impact_egp?: number;
}

export interface PortfolioAnalytics {
  rent_roll: Array<{
    month: string;
    year: number;
    month_num: number;
    contracted_rent: number;
    expiring_rent: number;
    active_leases: number;
  }>;
  wale_years: number;
  tenant_concentration: Array<{
    tenant_name: string;
    brand_name: string;
    monthly_rent: number;
    percentage_of_total: number;
  }>;
  category_diversification: Array<{
    category: string;
    monthly_rent: number;
    lease_count: number;
    percentage_of_total: number;
  }>;
  vacancy_cost_monthly: number;
  avg_rent_per_sqm: number;
  total_contracted_rent: number;
}

// ── Helper: Get all leases with joins ───────────────────────

async function getAllLeasesWithDetails(supabase: SupabaseClient, propertyId: string) {
  const { data, error } = await supabase
    .from("leases")
    .select(
      "*, tenant:tenants(id, name, brand_name, category, status), unit:units(id, name, unit_number, area_sqm, status, zone:zones(id, name))"
    )
    .eq("property_id", propertyId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ── 1. Contract Overview ────────────────────────────────────

export async function getContractOverview(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<ContractOverview> {
  const leases = await getAllLeasesWithDetails(supabase, propertyId);

  // Get all units for occupancy calculation
  const { data: allUnits } = await supabase
    .from("units")
    .select("id, area_sqm, status")
    .eq("property_id", propertyId);

  const units = allUnits || [];
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u: any) => u.status === "occupied").length;
  const totalArea = units.reduce((sum: number, u: any) => sum + (u.area_sqm || 0), 0);
  const occupiedArea = units
    .filter((u: any) => u.status === "occupied")
    .reduce((sum: number, u: any) => sum + (u.area_sqm || 0), 0);
  const vacantArea = totalArea - occupiedArea;

  const activeLeases = leases.filter((l: any) => l.status === "active");
  const expiredLeases = leases.filter((l: any) => l.status === "expired");
  const pendingLeases = leases.filter((l: any) => l.status === "pending");

  const totalMonthlyMinRent = activeLeases.reduce(
    (sum: number, l: any) => sum + (l.min_rent_monthly_egp || 0),
    0
  );

  // Estimate percentage potential from recent sales data
  const tenantIds = activeLeases.map((l: any) => l.tenant_id);
  let totalPercentagePotential = 0;

  if (tenantIds.length > 0) {
    const { data: salesData } = await supabase
      .from("tenant_sales_reported")
      .select("tenant_id, reported_revenue_egp, lease_id")
      .in("tenant_id", tenantIds)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    // Get latest month of sales per tenant
    const latestSalesByTenant: Record<string, number> = {};
    (salesData || []).forEach((s: any) => {
      if (!latestSalesByTenant[s.tenant_id]) {
        latestSalesByTenant[s.tenant_id] = s.reported_revenue_egp;
      }
    });

    activeLeases.forEach((l: any) => {
      const sales = latestSalesByTenant[l.tenant_id] || 0;
      const pctRent = sales * (l.percentage_rate / 100);
      totalPercentagePotential += pctRent;
    });
  }

  // Average lease duration
  const durations = activeLeases.map((l: any) => {
    const start = new Date(l.start_date);
    const end = new Date(l.end_date);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  });
  const avgDuration = durations.length > 0
    ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
    : 0;

  // Average rent per sqm
  const rentPerSqm = activeLeases.map((l: any) => {
    const area = (l as any).unit?.area_sqm || 0;
    return area > 0 ? l.min_rent_monthly_egp / area : 0;
  });
  const avgRentPerSqm = rentPerSqm.length > 0
    ? rentPerSqm.reduce((a: number, b: number) => a + b, 0) / rentPerSqm.length
    : 0;

  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  return {
    total_leases: leases.length,
    active_leases: activeLeases.length,
    expired_leases: expiredLeases.length,
    pending_leases: pendingLeases.length,
    total_monthly_min_rent_egp: totalMonthlyMinRent,
    total_monthly_percentage_potential_egp: Math.round(totalPercentagePotential),
    avg_lease_duration_years: Math.round(avgDuration * 10) / 10,
    avg_rent_per_sqm: Math.round(avgRentPerSqm),
    occupancy_rate: Math.round(occupancyRate * 10) / 10,
    total_leased_area_sqm: Math.round(occupiedArea),
    vacant_area_sqm: Math.round(vacantArea),
    total_units: totalUnits,
    occupied_units: occupiedUnits,
  };
}

// ── 2. Expiring Leases ──────────────────────────────────────

export async function getExpiringLeases(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  withinDays: number = 180
): Promise<ExpiringLease[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const { data: leases } = await supabase
    .from("leases")
    .select(
      "*, tenant:tenants(id, name, brand_name, category), unit:units(id, unit_number, area_sqm)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active")
    .lte("end_date", cutoff.toISOString().split("T")[0])
    .gte("end_date", now.toISOString().split("T")[0])
    .order("end_date", { ascending: true });

  if (!leases || leases.length === 0) return [];

  // Get payment history for compliance calculation
  const leaseIds = leases.map((l: any) => l.id);
  const { data: transactions } = await supabase
    .from("rent_transactions")
    .select("lease_id, status")
    .in("lease_id", leaseIds);

  const complianceByLease: Record<string, { total: number; onTime: number }> = {};
  (transactions || []).forEach((t: any) => {
    if (!complianceByLease[t.lease_id]) {
      complianceByLease[t.lease_id] = { total: 0, onTime: 0 };
    }
    complianceByLease[t.lease_id].total++;
    if (t.status === "paid") complianceByLease[t.lease_id].onTime++;
  });

  // Get sales data for revenue/sqm
  const tenantIds = leases.map((l: any) => l.tenant_id);
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds);

  const avgSalesByTenant: Record<string, number> = {};
  const salesCountByTenant: Record<string, number> = {};
  (salesData || []).forEach((s: any) => {
    avgSalesByTenant[s.tenant_id] = (avgSalesByTenant[s.tenant_id] || 0) + s.reported_revenue_egp;
    salesCountByTenant[s.tenant_id] = (salesCountByTenant[s.tenant_id] || 0) + 1;
  });
  Object.keys(avgSalesByTenant).forEach((tid) => {
    avgSalesByTenant[tid] = avgSalesByTenant[tid] / (salesCountByTenant[tid] || 1);
  });

  // Check for discrepancies
  const { data: discrepancies } = await supabase
    .from("discrepancies")
    .select("tenant_id")
    .in("tenant_id", tenantIds)
    .in("status", ["flagged", "investigating"]);

  const tenantsWithDiscrepancy = new Set(
    (discrepancies || []).map((d: any) => d.tenant_id)
  );

  return leases.map((l: any) => {
    const tenant = l.tenant;
    const unit = l.unit;
    const area = unit?.area_sqm || 0;
    const daysLeft = Math.ceil(
      (new Date(l.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    const compliance = complianceByLease[l.id];
    const compliancePct = compliance && compliance.total > 0
      ? Math.round((compliance.onTime / compliance.total) * 100)
      : 100;
    const avgSales = avgSalesByTenant[l.tenant_id] || 0;
    const revPerSqm = area > 0 ? Math.round(avgSales / area) : 0;
    const hasDiscrepancy = tenantsWithDiscrepancy.has(l.tenant_id);

    // AI recommendation logic
    let recommendation: string;
    let recommendationType: "renew" | "do_not_renew" | "negotiate";

    if (hasDiscrepancy && compliancePct < 80) {
      recommendation = "Do not renew - underperforming with discrepancy flags";
      recommendationType = "do_not_renew";
    } else if (compliancePct < 70) {
      recommendation = "Do not renew - poor payment compliance";
      recommendationType = "do_not_renew";
    } else if (hasDiscrepancy) {
      recommendation = `Negotiate higher % rate (currently ${l.percentage_rate}%) - suspected underreporting`;
      recommendationType = "negotiate";
    } else if (revPerSqm < 200 && area > 50) {
      recommendation = "Negotiate higher minimum rent - low revenue per sqm";
      recommendationType = "negotiate";
    } else if (compliancePct >= 90 && !hasDiscrepancy) {
      const escalation = l.escalation_rate > 0 ? l.escalation_rate : 10;
      recommendation = `Renew with ${escalation}% escalation - strong performer`;
      recommendationType = "renew";
    } else {
      recommendation = `Renew with ${Math.max(l.escalation_rate || 10, 10)}% escalation`;
      recommendationType = "renew";
    }

    return {
      lease_id: l.id,
      tenant_name: tenant?.name || "Unknown",
      brand_name: tenant?.brand_name || "Unknown",
      category: tenant?.category || "other",
      unit_number: unit?.unit_number || "-",
      area_sqm: area,
      current_rent: l.min_rent_monthly_egp,
      percentage_rate: l.percentage_rate,
      expiry_date: l.end_date,
      days_until_expiry: daysLeft,
      escalation_rate: l.escalation_rate || 0,
      ai_recommendation: recommendation,
      recommendation_type: recommendationType,
      revenue_per_sqm: revPerSqm,
      payment_compliance: compliancePct,
      has_discrepancy: hasDiscrepancy,
    };
  });
}

// ── 3. Lease Performance ────────────────────────────────────

export async function getLeasePerformance(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<LeasePerformanceItem[]> {
  const leases = await getAllLeasesWithDetails(supabase, propertyId);
  const activeLeases = leases.filter((l: any) => l.status === "active");

  if (activeLeases.length === 0) return [];

  const leaseIds = activeLeases.map((l: any) => l.id);
  const tenantIds = activeLeases.map((l: any) => l.tenant_id);

  // Payment history
  const { data: transactions } = await supabase
    .from("rent_transactions")
    .select("lease_id, amount_due, amount_paid, status")
    .in("lease_id", leaseIds);

  const paymentByLease: Record<string, {
    totalDue: number; totalPaid: number; onTime: number; total: number;
  }> = {};
  (transactions || []).forEach((t: any) => {
    if (!paymentByLease[t.lease_id]) {
      paymentByLease[t.lease_id] = { totalDue: 0, totalPaid: 0, onTime: 0, total: 0 };
    }
    paymentByLease[t.lease_id].totalDue += t.amount_due || 0;
    paymentByLease[t.lease_id].totalPaid += t.amount_paid || 0;
    paymentByLease[t.lease_id].total++;
    if (t.status === "paid") paymentByLease[t.lease_id].onTime++;
  });

  // Sales data
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds);

  const salesByTenant: Record<string, { total: number; count: number }> = {};
  (salesData || []).forEach((s: any) => {
    if (!salesByTenant[s.tenant_id]) {
      salesByTenant[s.tenant_id] = { total: 0, count: 0 };
    }
    salesByTenant[s.tenant_id].total += s.reported_revenue_egp;
    salesByTenant[s.tenant_id].count++;
  });

  return activeLeases.map((l: any) => {
    const tenant = l.tenant;
    const unit = l.unit;
    const area = unit?.area_sqm || 0;
    const payment = paymentByLease[l.id] || { totalDue: 0, totalPaid: 0, onTime: 0, total: 0 };
    const salesInfo = salesByTenant[l.tenant_id] || { total: 0, count: 0 };
    const avgSales = salesInfo.count > 0 ? salesInfo.total / salesInfo.count : 0;
    const pctRent = avgSales * (l.percentage_rate / 100);
    const actuallyPaying: "min_rent" | "percentage" = pctRent > l.min_rent_monthly_egp ? "percentage" : "min_rent";
    const revPerSqm = area > 0 ? Math.round(avgSales / area) : 0;
    const compliancePct = payment.total > 0 ? Math.round((payment.onTime / payment.total) * 100) : 100;

    let performanceScore: "good" | "watch" | "underperforming";
    if (compliancePct >= 90 && actuallyPaying === "percentage") {
      performanceScore = "good";
    } else if (compliancePct >= 80 || (actuallyPaying === "min_rent" && compliancePct >= 85)) {
      performanceScore = "watch";
    } else {
      performanceScore = "underperforming";
    }

    return {
      lease_id: l.id,
      tenant_name: tenant?.name || "Unknown",
      brand_name: tenant?.brand_name || "Unknown",
      category: tenant?.category || "other",
      unit_number: unit?.unit_number || "-",
      area_sqm: area,
      min_rent: l.min_rent_monthly_egp,
      percentage_rate: l.percentage_rate,
      avg_reported_sales: Math.round(avgSales),
      percentage_rent: Math.round(pctRent),
      actually_paying: actuallyPaying,
      revenue_per_sqm: revPerSqm,
      payment_compliance: compliancePct,
      performance_score: performanceScore,
      total_paid: payment.totalPaid,
      total_due: payment.totalDue,
      months_on_time: payment.onTime,
      total_months: payment.total,
      expiry_date: l.end_date,
    };
  });
}

// ── 4. Escalation Tracker ───────────────────────────────────

export async function getEscalationTracker(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<EscalationItem[]> {
  const { data: leases } = await supabase
    .from("leases")
    .select(
      "*, tenant:tenants(id, name, brand_name), unit:units(id, unit_number)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active")
    .gt("escalation_rate", 0)
    .order("start_date", { ascending: true });

  if (!leases || leases.length === 0) return [];

  const now = new Date();

  return leases.map((l: any) => {
    const tenant = l.tenant;
    const unit = l.unit;

    // Calculate next escalation date (annual from start_date)
    const start = new Date(l.start_date);
    const nextEscalation = new Date(start);

    // Find next anniversary date that's in the future
    while (nextEscalation <= now) {
      nextEscalation.setFullYear(nextEscalation.getFullYear() + 1);
    }

    const postEscalationRent = Math.round(
      l.min_rent_monthly_egp * (1 + l.escalation_rate / 100)
    );
    const increase = postEscalationRent - l.min_rent_monthly_egp;

    return {
      lease_id: l.id,
      tenant_name: tenant?.name || "Unknown",
      brand_name: tenant?.brand_name || "Unknown",
      unit_number: unit?.unit_number || "-",
      escalation_rate: l.escalation_rate,
      current_rent: l.min_rent_monthly_egp,
      post_escalation_rent: postEscalationRent,
      increase_amount: increase,
      next_escalation_date: nextEscalation.toISOString().split("T")[0],
      start_date: l.start_date,
      end_date: l.end_date,
    };
  }).sort((a: EscalationItem, b: EscalationItem) =>
    new Date(a.next_escalation_date).getTime() - new Date(b.next_escalation_date).getTime()
  );
}

// ── 5. Rent vs Sales Analysis ───────────────────────────────

export async function getRentVsSalesAnalysis(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<RentVsSalesItem[]> {
  const leases = await getAllLeasesWithDetails(supabase, propertyId);
  const activeLeases = leases.filter((l: any) => l.status === "active");

  if (activeLeases.length === 0) return [];

  const tenantIds = activeLeases.map((l: any) => l.tenant_id);

  // Get average reported sales per tenant
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp")
    .in("tenant_id", tenantIds);

  const salesByTenant: Record<string, { total: number; count: number }> = {};
  (salesData || []).forEach((s: any) => {
    if (!salesByTenant[s.tenant_id]) {
      salesByTenant[s.tenant_id] = { total: 0, count: 0 };
    }
    salesByTenant[s.tenant_id].total += s.reported_revenue_egp;
    salesByTenant[s.tenant_id].count++;
  });

  // Get estimated revenue from revenue_estimates (latest period)
  const { data: estimates } = await supabase
    .from("revenue_estimates")
    .select("tenant_id, estimated_revenue_egp, period_month, period_year")
    .in("tenant_id", tenantIds)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const latestEstimateByTenant: Record<string, number> = {};
  (estimates || []).forEach((e: any) => {
    if (!latestEstimateByTenant[e.tenant_id]) {
      latestEstimateByTenant[e.tenant_id] = e.estimated_revenue_egp;
    }
  });

  // Get discrepancy flags
  const { data: discrepancies } = await supabase
    .from("discrepancies")
    .select("tenant_id, variance_egp, status")
    .in("tenant_id", tenantIds)
    .in("status", ["flagged", "investigating"]);

  const discrepancyByTenant: Record<string, number> = {};
  (discrepancies || []).forEach((d: any) => {
    discrepancyByTenant[d.tenant_id] = (discrepancyByTenant[d.tenant_id] || 0) + d.variance_egp;
  });

  return activeLeases.map((l: any) => {
    const tenant = l.tenant;
    const unit = l.unit;
    const area = unit?.area_sqm || 0;
    const salesInfo = salesByTenant[l.tenant_id] || { total: 0, count: 0 };
    const avgSales = salesInfo.count > 0 ? salesInfo.total / salesInfo.count : 0;
    const pctRent = avgSales * (l.percentage_rate / 100);
    const minRent = l.min_rent_monthly_egp;

    // What they should pay based on reported sales
    const payingType: "min_rent" | "percentage" = pctRent > minRent ? "percentage" : "min_rent";
    const shouldPayType: "min_rent" | "percentage" = pctRent > minRent ? "percentage" : "min_rent";
    const actualPaying = Math.max(minRent, pctRent);

    // Gap: if percentage rent > min rent but they're only paying min rent
    // This means the lease model is working correctly — they should be paying the higher amount
    // The gap shows potential if sales are actually higher
    const gap = pctRent > minRent ? pctRent - minRent : 0;

    // Check estimated sales
    const estimatedSales = latestEstimateByTenant[l.tenant_id] || null;
    const estimatedPctRent = estimatedSales ? estimatedSales * (l.percentage_rate / 100) : null;
    const estimatedGap = estimatedPctRent && estimatedPctRent > minRent
      ? Math.round(estimatedPctRent - minRent)
      : null;

    // Underreporting flag
    const hasDiscrepancy = l.tenant_id in discrepancyByTenant;
    const underreportingFlag = hasDiscrepancy && estimatedGap !== null && estimatedGap > gap;

    // Build verification note
    let verificationNote: string | null = null;
    if (underreportingFlag && estimatedGap) {
      verificationNote = `Estimated sales suggest gap is EGP ${estimatedGap.toLocaleString()} — ${Math.round(((estimatedGap - gap) / Math.max(gap, 1)) * 100)}% larger than reported`;
    } else if (hasDiscrepancy) {
      verificationNote = "Revenue verification flagged discrepancy";
    } else if (estimatedSales && estimatedSales > avgSales * 1.15) {
      verificationNote = "Estimated sales moderately exceed reported";
    }

    return {
      tenant_id: l.tenant_id,
      tenant_name: tenant?.name || "Unknown",
      brand_name: tenant?.brand_name || "Unknown",
      category: tenant?.category || "other",
      unit_number: unit?.unit_number || "-",
      area_sqm: area,
      min_rent: minRent,
      percentage_rate: l.percentage_rate,
      avg_reported_sales: Math.round(avgSales),
      percentage_rent: Math.round(pctRent),
      actual_paying: Math.round(actualPaying),
      gap_egp: Math.round(gap),
      paying_type: payingType,
      should_pay_type: shouldPayType,
      underreporting_flag: underreportingFlag,
      estimated_sales: estimatedSales ? Math.round(estimatedSales) : null,
      estimated_gap: estimatedGap,
      revenue_verification_note: verificationNote,
    };
  }).sort((a: RentVsSalesItem, b: RentVsSalesItem) => b.gap_egp - a.gap_egp);
}

// ── 6. Contract Alerts ──────────────────────────────────────

export async function getContractAlerts(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<ContractAlert[]> {
  const alerts: ContractAlert[] = [];
  const now = new Date();
  let alertId = 0;

  // 1. Expiring leases alerts
  const expiring90 = await getExpiringLeases(supabase, propertyId, 90);
  const expiring180 = await getExpiringLeases(supabase, propertyId, 180);

  if (expiring90.length > 0) {
    alerts.push({
      id: `alert-${++alertId}`,
      severity: "critical",
      title: `${expiring90.length} lease${expiring90.length > 1 ? "s" : ""} expiring in 90 days`,
      message: `Urgent action required for: ${expiring90.map((l) => l.brand_name).join(", ")}`,
      category: "expiring",
      recommended_action: "Review each lease and initiate renewal negotiations immediately",
    });
  }

  if (expiring180.length > expiring90.length) {
    const count180only = expiring180.length - expiring90.length;
    alerts.push({
      id: `alert-${++alertId}`,
      severity: "warning",
      title: `${count180only} additional lease${count180only > 1 ? "s" : ""} expiring in 90-180 days`,
      message: "Plan renewal strategy for upcoming expirations",
      category: "expiring",
      recommended_action: "Schedule meetings with tenants and prepare renewal terms",
    });
  }

  // 2. Rent vs sales alerts
  const rentVsSales = await getRentVsSalesAnalysis(supabase, propertyId);
  const underreporters = rentVsSales.filter((r) => r.underreporting_flag);

  for (const ur of underreporters.slice(0, 3)) {
    alerts.push({
      id: `alert-${++alertId}`,
      severity: "critical",
      title: `${ur.brand_name} - potential underreporting`,
      message: `Paying min rent of EGP ${ur.min_rent.toLocaleString()} but estimated sales suggest percentage rent should be EGP ${ur.estimated_gap?.toLocaleString() || "?"} higher`,
      category: "revenue",
      recommended_action: "Cross-reference with revenue verification and initiate audit",
      tenant_name: ur.brand_name,
      unit_number: ur.unit_number,
      impact_egp: ur.estimated_gap || 0,
    });
  }

  // 3. Overdue rent alerts
  const { data: overdueTransactions } = await supabase
    .from("rent_transactions")
    .select("lease_id, amount_due, amount_paid, lease:leases!inner(property_id, tenant:tenants(brand_name))")
    .eq("status", "overdue");

  const overdueForProperty = (overdueTransactions || []).filter(
    (t: any) => t.lease?.property_id === propertyId
  );

  if (overdueForProperty.length > 0) {
    const totalOverdue = overdueForProperty.reduce(
      (sum: number, t: any) => sum + ((t.amount_due || 0) - (t.amount_paid || 0)),
      0
    );
    alerts.push({
      id: `alert-${++alertId}`,
      severity: "critical",
      title: `${overdueForProperty.length} tenant${overdueForProperty.length > 1 ? "s have" : " has"} overdue rent`,
      message: `Total EGP ${totalOverdue.toLocaleString()} outstanding`,
      category: "payment",
      recommended_action: "Send payment reminders and escalate if overdue > 30 days",
      impact_egp: totalOverdue,
    });
  }

  // 4. No escalation clause alerts
  const { data: noEscalation } = await supabase
    .from("leases")
    .select("id, tenant:tenants(brand_name), unit:units(unit_number)")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .or("escalation_rate.eq.0,escalation_rate.is.null");

  if (noEscalation && noEscalation.length > 0) {
    alerts.push({
      id: `alert-${++alertId}`,
      severity: "warning",
      title: `${noEscalation.length} lease${noEscalation.length > 1 ? "s" : ""} without escalation clause`,
      message: `Leases without annual rent escalation: ${noEscalation.slice(0, 5).map((l: any) => l.tenant?.brand_name || "Unknown").join(", ")}${noEscalation.length > 5 ? ` +${noEscalation.length - 5} more` : ""}`,
      category: "contract_terms",
      recommended_action: "Renegotiate at renewal to include escalation clause",
    });
  }

  // 5. Anchor tenant early negotiation
  const anchorLeases = await supabase
    .from("leases")
    .select("id, end_date, min_rent_monthly_egp, tenant:tenants(brand_name, brand_type), unit:units(area_sqm)")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("min_rent_monthly_egp", { ascending: false })
    .limit(5);

  if (anchorLeases.data) {
    for (const anchor of anchorLeases.data) {
      const endDate = new Date(anchor.end_date);
      const monthsUntil = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      const area = (anchor as any).unit?.area_sqm || 0;

      if (monthsUntil > 6 && monthsUntil <= 24 && area > 500) {
        alerts.push({
          id: `alert-${++alertId}`,
          severity: "info",
          title: `${(anchor as any).tenant?.brand_name || "Anchor tenant"} lease expires in ${Math.round(monthsUntil)} months`,
          message: `Large tenant (${area.toLocaleString()} sqm) — start early negotiation to ensure retention`,
          category: "strategic",
          recommended_action: "Schedule meeting with tenant, prepare market rent analysis",
          tenant_name: (anchor as any).tenant?.brand_name,
          impact_egp: anchor.min_rent_monthly_egp * 12,
        });
      }
    }
  }

  // 6. Tenants paying min rent only (opportunity)
  const minRentOnly = rentVsSales.filter(
    (r) => r.paying_type === "min_rent" && r.avg_reported_sales > 0
  );
  if (minRentOnly.length > 10) {
    alerts.push({
      id: `alert-${++alertId}`,
      severity: "opportunity" as any,
      title: `${minRentOnly.length} tenants paying minimum rent only`,
      message: "Sales too low to trigger percentage rent — consider adjusting lease terms at renewal",
      category: "revenue",
      recommended_action: "Review minimum rent levels vs market rates for these tenants",
    });
  }

  // Sort: critical first, then warning, info, opportunity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, opportunity: 3 };
  alerts.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

  return alerts;
}

// ── 7. Portfolio Analytics ──────────────────────────────────

export async function getPortfolioAnalytics(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<PortfolioAnalytics> {
  const leases = await getAllLeasesWithDetails(supabase, propertyId);
  const activeLeases = leases.filter((l: any) => l.status === "active");

  const now = new Date();
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── Rent Roll (24 months forward) ──
  const rentRoll: PortfolioAnalytics["rent_roll"] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);

    let contractedRent = 0;
    let expiringRent = 0;
    let activeCount = 0;

    for (const lease of activeLeases) {
      const leaseEnd = new Date((lease as any).end_date);
      const leaseStart = new Date((lease as any).start_date);

      if (leaseStart <= monthEnd && leaseEnd >= d) {
        contractedRent += (lease as any).min_rent_monthly_egp || 0;
        activeCount++;

        // Check if lease expires this month
        if (leaseEnd.getMonth() === d.getMonth() && leaseEnd.getFullYear() === d.getFullYear()) {
          expiringRent += (lease as any).min_rent_monthly_egp || 0;
        }
      }
    }

    rentRoll.push({
      month: MONTH_NAMES[d.getMonth()],
      year: d.getFullYear(),
      month_num: d.getMonth() + 1,
      contracted_rent: Math.round(contractedRent),
      expiring_rent: Math.round(expiringRent),
      active_leases: activeCount,
    });
  }

  // ── WALE (Weighted Average Lease Expiry) ──
  let totalWeightedYears = 0;
  let totalRent = 0;

  for (const lease of activeLeases) {
    const endDate = new Date((lease as any).end_date);
    const yearsRemaining = Math.max(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
      0
    );
    const rent = (lease as any).min_rent_monthly_egp || 0;
    totalWeightedYears += yearsRemaining * rent;
    totalRent += rent;
  }

  const wale = totalRent > 0 ? totalWeightedYears / totalRent : 0;

  // ── Tenant Concentration ──
  const tenantRents = activeLeases.map((l: any) => ({
    tenant_name: l.tenant?.name || "Unknown",
    brand_name: l.tenant?.brand_name || "Unknown",
    monthly_rent: l.min_rent_monthly_egp || 0,
  }));

  // Aggregate by tenant name (some tenants may have multiple units)
  const aggregatedTenants: Record<string, { name: string; brand: string; rent: number }> = {};
  tenantRents.forEach((t) => {
    const key = t.brand_name;
    if (!aggregatedTenants[key]) {
      aggregatedTenants[key] = { name: t.tenant_name, brand: t.brand_name, rent: 0 };
    }
    aggregatedTenants[key].rent += t.monthly_rent;
  });

  const sortedTenants = Object.values(aggregatedTenants)
    .sort((a, b) => b.rent - a.rent)
    .slice(0, 10);

  const tenantConcentration = sortedTenants.map((t) => ({
    tenant_name: t.name,
    brand_name: t.brand,
    monthly_rent: t.rent,
    percentage_of_total: totalRent > 0 ? Math.round((t.rent / totalRent) * 1000) / 10 : 0,
  }));

  // ── Category Diversification ──
  const categoryRents: Record<string, { rent: number; count: number }> = {};
  activeLeases.forEach((l: any) => {
    const cat = l.tenant?.category || "other";
    if (!categoryRents[cat]) categoryRents[cat] = { rent: 0, count: 0 };
    categoryRents[cat].rent += l.min_rent_monthly_egp || 0;
    categoryRents[cat].count++;
  });

  const categoryDiversification = Object.entries(categoryRents)
    .map(([category, data]) => ({
      category,
      monthly_rent: data.rent,
      lease_count: data.count,
      percentage_of_total: totalRent > 0 ? Math.round((data.rent / totalRent) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.monthly_rent - a.monthly_rent);

  // ── Vacancy Cost ──
  const avgRentPerSqm = totalRent > 0 && activeLeases.length > 0
    ? totalRent / activeLeases.reduce((sum: number, l: any) => sum + ((l as any).unit?.area_sqm || 0), 0)
    : 0;

  const { data: allUnits } = await supabase
    .from("units")
    .select("area_sqm, status")
    .eq("property_id", propertyId);

  const vacantSqm = (allUnits || [])
    .filter((u: any) => u.status === "vacant")
    .reduce((sum: number, u: any) => sum + (u.area_sqm || 0), 0);

  const vacancyCost = Math.round(vacantSqm * avgRentPerSqm);

  return {
    rent_roll: rentRoll,
    wale_years: Math.round(wale * 10) / 10,
    tenant_concentration: tenantConcentration,
    category_diversification: categoryDiversification,
    vacancy_cost_monthly: vacancyCost,
    avg_rent_per_sqm: Math.round(avgRentPerSqm),
    total_contracted_rent: totalRent,
  };
}
