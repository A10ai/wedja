import { SupabaseClient } from "@supabase/supabase-js";
import { getFootfallOverview, getFootfallByZone, getPeakPatterns } from "./footfall-engine";
import { getDiscrepancySummary } from "./revenue-engine";
import { getEnergyOverview, getEnergyByZone, getEnergyVsFootfall } from "./energy-engine";
import { getFinanceOverview } from "./finance-engine";
import { getPortfolioAnalytics, getExpiringLeases, getContractAlerts, getRentVsSalesAnalysis } from "./contract-engine";
import { getTenantRankings, getReplacementAnalysis, getTenantMixAnalysis } from "./tenant-analytics";
import { getMarketingOverview } from "./marketing-engine";
import { getSocialOverview } from "./social-engine";
import { getLearningStats, getLearnedPatterns } from "./learning-engine";

// ============================================================
// Wedja AI Engine — The All-Seeing Eye of Senzo Mall
//
// Cross-references ALL modules to generate insights that no
// single-source tool can produce. Revenue + Footfall + Contracts
// + Energy + Marketing + Social + Finance + Learning.
//
// This is what makes Wedja unique.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface CrossDataInsight {
  id: string;
  type: "revenue_footfall" | "revenue_contracts" | "footfall_energy" | "footfall_marketing" | "contracts_tenants" | "finance_energy" | "social_footfall" | "maintenance_energy" | "general";
  severity: "info" | "opportunity" | "warning" | "critical";
  title: string;
  message: string;
  impact_egp: number;
  confidence: number;
  source_modules: string[];
  recommended_action: string;
  link?: string;
}

export interface HealthScoreDimension {
  score: number;
  max: number;
  detail: string;
  link: string;
}

export interface HealthScore {
  total: number;
  revenue: HealthScoreDimension;
  occupancy: HealthScoreDimension;
  tenant_quality: HealthScoreDimension;
  contracts: HealthScoreDimension;
  energy: HealthScoreDimension;
  maintenance: HealthScoreDimension;
  marketing: HealthScoreDimension;
  financial: HealthScoreDimension;
}

export interface BriefingSection {
  title: string;
  icon: string;
  items: Array<{ text: string; trend?: "up" | "down" | "neutral"; alert?: boolean }>;
}

export interface DailyBriefing {
  greeting: string;
  date: string;
  sections: {
    revenue: BriefingSection;
    footfall: BriefingSection;
    contracts: BriefingSection;
    energy: BriefingSection;
    maintenance: BriefingSection;
    marketing: BriefingSection;
    finance: BriefingSection;
    learning: BriefingSection;
  };
  top_actions: Array<{ text: string; link: string; priority: "high" | "medium" | "low" }>;
}

export interface PropertySnapshot {
  tenants: { total: number; by_category: Record<string, number> };
  occupancy_rate: number;
  revenue_this_month: number;
  revenue_trend: number;
  footfall_today: number;
  footfall_trend: number;
  energy_cost_today: number;
  energy_trend: number;
  open_maintenance: number;
  urgent_maintenance: number;
  discrepancies_count: number;
  discrepancies_variance: number;
  expiring_leases_90d: number;
  active_campaigns: number;
  active_events: number;
  social_followers: number;
  social_growth: number;
  opportunity_cost_monthly: number;
  wale_years: number;
  health_score: number;
  top_insights: CrossDataInsight[];
}

// ── Helpers ─────────────────────────────────────────────────

function makeId(prefix: string = "cdi"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ── 1. Cross-Data Insights Generator ────────────────────────

export async function generateCrossDataInsights(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<CrossDataInsight[]> {
  const insights: CrossDataInsight[] = [];
  const { month, year } = currentMonth();

  // Pull data from ALL modules in parallel
  const [
    discrepancySummary,
    footfallOverview,
    footfallByZone,
    peakPatterns,
    energyOverview,
    energyByZone,
    energyEfficiency,
    financeOverview,
    portfolio,
    expiringLeases,
    contractAlerts,
    rentVsSales,
    tenantRankings,
    replacementAnalysis,
    tenantMix,
    marketingOverview,
    socialOverview,
    learningStats,
    maintenanceResult,
    unitsResult,
  ] = await Promise.all([
    getDiscrepancySummary(supabase, propertyId, month, year).catch(() => null),
    getFootfallOverview(supabase, propertyId).catch(() => null),
    getFootfallByZone(supabase, propertyId).catch(() => []),
    getPeakPatterns(supabase, propertyId).catch(() => null),
    getEnergyOverview(supabase, propertyId).catch(() => null),
    getEnergyByZone(supabase, propertyId).catch(() => []),
    getEnergyVsFootfall(supabase, propertyId).catch(() => []),
    getFinanceOverview(supabase, propertyId).catch(() => null),
    getPortfolioAnalytics(supabase, propertyId).catch(() => null),
    getExpiringLeases(supabase, propertyId, 90).catch(() => []),
    getContractAlerts(supabase, propertyId).catch(() => []),
    getRentVsSalesAnalysis(supabase, propertyId).catch(() => []),
    getTenantRankings(supabase, propertyId).catch(() => []),
    getReplacementAnalysis(supabase, propertyId).catch(() => null),
    getTenantMixAnalysis(supabase, propertyId).catch(() => null),
    getMarketingOverview(supabase, propertyId).catch(() => null),
    getSocialOverview(supabase, propertyId).catch(() => null),
    getLearningStats(supabase, propertyId).catch(() => null),
    supabase
      .from("maintenance_tickets")
      .select("id, priority, status, zone_id, category, estimated_cost_egp, actual_cost_egp")
      .eq("property_id", propertyId)
      .in("status", ["open", "assigned", "in_progress"]),
    supabase.from("units").select("id, status").eq("property_id", propertyId),
  ]);

  // ── Revenue + Footfall Cross-Reference ──

  if (discrepancySummary && discrepancySummary.total_discrepancies > 0) {
    const ds = discrepancySummary;
    insights.push({
      id: makeId(),
      type: "revenue_footfall",
      severity: ds.total_potential_recovery_egp > 200000 ? "critical" : ds.total_potential_recovery_egp > 50000 ? "warning" : "opportunity",
      title: `${ds.total_discrepancies} tenants flagged for underreporting`,
      message: `Revenue verification detected ${ds.total_discrepancies} potential underreporting cases using footfall-to-sales cross-reference. High confidence flags: ${ds.by_confidence.high}. Total estimated variance: EGP ${Math.round(ds.total_variance_egp).toLocaleString()}.`,
      impact_egp: Math.round(ds.total_potential_recovery_egp),
      confidence: 0.82,
      source_modules: ["revenue", "footfall"],
      recommended_action: "Review discrepancy report and initiate tenant audits for high-confidence flags",
      link: "/dashboard/discrepancies",
    });
  }

  // Revenue + Footfall: High footfall but low sales tenants
  if (tenantRankings.length > 0 && footfallOverview) {
    const highFootfallLowRevenue = tenantRankings.filter(
      (t) => t.reported_sales_per_sqm < 200 && t.estimated_sales_per_sqm > t.reported_sales_per_sqm * 1.5 && t.estimated_sales_per_sqm > 300
    );
    if (highFootfallLowRevenue.length > 0) {
      const names = highFootfallLowRevenue.slice(0, 3).map((t) => t.brand_name).join(", ");
      const totalGap = highFootfallLowRevenue.reduce((s, t) => s + (t.estimated_sales_per_sqm - t.reported_sales_per_sqm) * t.area_sqm, 0);
      insights.push({
        id: makeId(),
        type: "revenue_footfall",
        severity: totalGap > 100000 ? "warning" : "opportunity",
        title: `${highFootfallLowRevenue.length} tenants: high footfall, low reported sales`,
        message: `${names}${highFootfallLowRevenue.length > 3 ? ` and ${highFootfallLowRevenue.length - 3} more` : ""} have high foot traffic but reported sales are significantly below estimates. Possible underreporting or poor sales conversion.`,
        impact_egp: Math.round(totalGap),
        confidence: 0.72,
        source_modules: ["revenue", "footfall", "tenant-analytics"],
        recommended_action: "Cross-reference with POS data if available. Consider mystery shopping or audit visits.",
        link: "/dashboard/tenant-analytics",
      });
    }
  }

  // ── Revenue + Contracts ──

  // Tenants paying minimum rent only with suspected underreporting
  if (rentVsSales.length > 0) {
    const suspiciousMinRent = rentVsSales.filter(
      (r) => r.paying_type === "min_rent" && r.underreporting_flag && r.estimated_gap && r.estimated_gap > 5000
    );
    if (suspiciousMinRent.length > 0) {
      const totalPotential = suspiciousMinRent.reduce((s, r) => s + (r.estimated_gap || 0), 0);
      insights.push({
        id: makeId(),
        type: "revenue_contracts",
        severity: totalPotential > 100000 ? "critical" : "warning",
        title: `${suspiciousMinRent.length} tenants never trigger percentage rent — suspicious`,
        message: `These tenants only pay minimum rent, but footfall data suggests their actual sales should trigger percentage rent. They may be underreporting to avoid paying the higher amount.`,
        impact_egp: Math.round(totalPotential),
        confidence: 0.78,
        source_modules: ["revenue", "contracts", "footfall"],
        recommended_action: "Audit these tenants. If confirmed, renegotiate lease terms with higher minimum rent at renewal.",
        link: "/dashboard/contracts",
      });
    }

    // All min-rent-only tenants (broader opportunity)
    const allMinRentOnly = rentVsSales.filter((r) => r.paying_type === "min_rent" && r.avg_reported_sales > 0);
    if (allMinRentOnly.length > 10) {
      insights.push({
        id: makeId(),
        type: "revenue_contracts",
        severity: "opportunity",
        title: `${allMinRentOnly.length} tenants paying minimum rent only`,
        message: `Their reported sales never trigger percentage rent. Either minimum rents are set too high (unlikely) or tenants are reporting just enough to stay below the threshold.`,
        impact_egp: 0,
        confidence: 0.65,
        source_modules: ["revenue", "contracts"],
        recommended_action: "Review percentage rates and minimum rent levels at next renewal cycle",
        link: "/dashboard/contracts",
      });
    }
  }

  // ── Footfall + Energy ──

  if (energyEfficiency.length > 0) {
    // Parking zone energy with no revenue
    const parkingZone = energyEfficiency.find((z) => z.zone_type === "parking");
    if (parkingZone && parkingZone.energy_kwh > 0) {
      insights.push({
        id: makeId(),
        type: "footfall_energy",
        severity: "opportunity",
        title: "Parking zone consumes energy but generates no revenue",
        message: `Parking uses ${parkingZone.energy_kwh.toLocaleString()} kWh/week (EGP ${parkingZone.energy_cost_egp.toLocaleString()}) with no direct revenue. Install EV charging stations or paid parking to monetise.`,
        impact_egp: Math.round(parkingZone.energy_cost_egp * 4),
        confidence: 0.7,
        source_modules: ["energy", "footfall"],
        recommended_action: "Evaluate EV charging installation — typical payback 18-24 months with growing EV adoption",
        link: "/dashboard/energy",
      });
    }

    // Food court energy per visitor anomaly
    const foodZone = energyEfficiency.find((z) => z.zone_type === "food");
    const retailZones = energyEfficiency.filter((z) => z.zone_type === "retail" && z.footfall > 0);
    if (foodZone && retailZones.length > 0 && foodZone.kwh_per_visitor > 0) {
      const avgRetailKwhPerVisitor = retailZones.reduce((s, z) => s + z.kwh_per_visitor, 0) / retailZones.length;
      if (foodZone.kwh_per_visitor > avgRetailKwhPerVisitor * 2.5 && avgRetailKwhPerVisitor > 0) {
        const ratio = (foodZone.kwh_per_visitor / avgRetailKwhPerVisitor).toFixed(1);
        insights.push({
          id: makeId(),
          type: "footfall_energy",
          severity: "warning",
          title: `Food Court energy per visitor is ${ratio}x retail average`,
          message: `Food Court uses ${foodZone.kwh_per_visitor.toFixed(2)} kWh per visitor vs ${avgRetailKwhPerVisitor.toFixed(2)} kWh for retail. While cooking equipment adds load, this ratio suggests HVAC inefficiency or equipment issues.`,
          impact_egp: Math.round(foodZone.energy_cost_egp * 0.2 * 4),
          confidence: 0.68,
          source_modules: ["energy", "footfall"],
          recommended_action: "Audit Food Court HVAC settings. Check kitchen exhaust systems. Consider heat recovery.",
          link: "/dashboard/energy",
        });
      }
    }
  }

  // ── Footfall + Marketing ──

  if (marketingOverview && footfallOverview && peakPatterns) {
    // Check if events drove footfall
    if (marketingOverview.active_events.count > 0 && footfallOverview.change_vs_last_week_pct > 10) {
      insights.push({
        id: makeId(),
        type: "footfall_marketing",
        severity: "opportunity",
        title: `Active events correlating with ${footfallOverview.change_vs_last_week_pct}% footfall increase`,
        message: `Footfall is up ${footfallOverview.change_vs_last_week_pct}% vs last week while ${marketingOverview.active_events.count} event(s) are active. This suggests events are driving traffic. Track and replicate successful formats.`,
        impact_egp: 0,
        confidence: 0.6,
        source_modules: ["marketing", "footfall"],
        recommended_action: "Document this event format and budget for repetition. Measure conversion to sales.",
        link: "/dashboard/marketing",
      });
    }

    // Seasonal approach alert
    if (marketingOverview.next_major_season && marketingOverview.days_until_next_season > 0 && marketingOverview.days_until_next_season <= 30) {
      const season = marketingOverview.next_major_season;
      insights.push({
        id: makeId(),
        type: "footfall_marketing",
        severity: marketingOverview.days_until_next_season <= 14 ? "warning" : "info",
        title: `${season.name} in ${marketingOverview.days_until_next_season} days — prepare campaigns`,
        message: `${season.name} is approaching. Expected footfall impact: ${season.footfall_impact}. Ensure marketing campaigns, tenant promotions, and operational adjustments are in place.`,
        impact_egp: 0,
        confidence: 0.9,
        source_modules: ["marketing", "footfall"],
        recommended_action: season.ai_recommendation,
        link: "/dashboard/marketing",
      });
    }
  }

  // ── Contracts + Tenant Performance ──

  if (replacementAnalysis && replacementAnalysis.bottom_tenants.length > 0) {
    const replaceable = replacementAnalysis.bottom_tenants.filter(
      (t) => t.break_even_months_avg < 18 && t.revenue_increase_avg > 5000
    );
    if (replaceable.length > 0) {
      const totalArea = replaceable.reduce((s, t) => s + t.area_sqm, 0);
      const totalGain = replaceable.reduce((s, t) => s + t.revenue_increase_avg, 0);
      const names = replaceable.slice(0, 3).map((t) => t.brand_name).join(", ");
      insights.push({
        id: makeId(),
        type: "contracts_tenants",
        severity: totalGain > 50000 ? "warning" : "opportunity",
        title: `Replacing bottom ${replaceable.length} tenants adds EGP ${totalGain.toLocaleString()}/month`,
        message: `${names}${replaceable.length > 3 ? ` and ${replaceable.length - 3} more` : ""} occupy ${totalArea.toLocaleString()} sqm but underperform zone averages. Replacing with average performers would add EGP ${totalGain.toLocaleString()}/month with break-even in under 18 months.`,
        impact_egp: Math.round(totalGain * 12),
        confidence: 0.65,
        source_modules: ["contracts", "tenant-analytics"],
        recommended_action: "Do not renew these leases without significant rent increases. Begin replacement tenant search.",
        link: "/dashboard/tenant-analytics",
      });
    }
  }

  // Expiring leases for underperformers
  if (expiringLeases.length > 0 && tenantRankings.length > 0) {
    const rankingMap = new Map(tenantRankings.map((t) => [t.brand_name, t]));
    const belowAvgExpiring = expiringLeases.filter((lease) => {
      const ranking = rankingMap.get(lease.brand_name);
      return ranking && ranking.overall_score < 40;
    });
    if (belowAvgExpiring.length > 0) {
      const names = belowAvgExpiring.slice(0, 3).map((l) => l.brand_name).join(", ");
      insights.push({
        id: makeId(),
        type: "contracts_tenants",
        severity: "warning",
        title: `${belowAvgExpiring.length} underperforming leases expiring in 90 days`,
        message: `${names}${belowAvgExpiring.length > 3 ? ` and ${belowAvgExpiring.length - 3} more` : ""} are below-average performers with leases expiring soon. Do not renew without renegotiation.`,
        impact_egp: 0,
        confidence: 0.85,
        source_modules: ["contracts", "tenant-analytics"],
        recommended_action: "Prepare higher rent proposals or replacement tenant shortlist before renewal discussions",
        link: "/dashboard/contracts",
      });
    }
  }

  // ── Finance + Energy ──

  if (financeOverview && energyOverview) {
    const totalExpenses = financeOverview.total_expenses_egp;
    const energyCostMonthly = energyOverview.cost_this_month_egp;
    if (totalExpenses > 0 && energyCostMonthly > 0) {
      const energyPct = (energyCostMonthly / totalExpenses) * 100;
      if (energyPct > 30) {
        const potentialSaving = Math.round(energyCostMonthly * 0.15);
        insights.push({
          id: makeId(),
          type: "finance_energy",
          severity: energyPct > 40 ? "warning" : "opportunity",
          title: `Electricity is ${energyPct.toFixed(0)}% of operating expenses`,
          message: `Energy costs EGP ${energyCostMonthly.toLocaleString()} this month, representing ${energyPct.toFixed(0)}% of total expenses. Industry benchmark for malls is 25-30%. A 15% optimization could save EGP ${potentialSaving.toLocaleString()}/month.`,
          impact_egp: potentialSaving * 12,
          confidence: 0.75,
          source_modules: ["finance", "energy"],
          recommended_action: "Implement LED retrofitting, HVAC scheduling, and motion-sensor lighting in parking",
          link: "/dashboard/energy",
        });
      }
    }
  }

  // ── Social + Footfall ──

  if (socialOverview && peakPatterns) {
    // Correlation hint: best posting time vs busiest day
    if (peakPatterns.busiest_day && socialOverview.best_posting_time) {
      insights.push({
        id: makeId(),
        type: "social_footfall",
        severity: "info",
        title: `Busiest day: ${peakPatterns.busiest_day} — align social posting schedule`,
        message: `${peakPatterns.busiest_day} sees ${peakPatterns.busiest_day_avg.toLocaleString()} avg visitors. Best social posting time: ${socialOverview.best_posting_time}. Post day-before content to drive next-day visits.`,
        impact_egp: 0,
        confidence: 0.55,
        source_modules: ["social", "footfall"],
        recommended_action: `Schedule high-impact social posts for the evening before ${peakPatterns.busiest_day}`,
        link: "/dashboard/social",
      });
    }
  }

  // ── Maintenance + Energy + Finance ──

  const openTickets = maintenanceResult.data || [];
  if (openTickets.length > 0 && energyByZone.length > 0) {
    // HVAC tickets in high-energy zones
    const hvacTickets = openTickets.filter((t: any) => t.category === "hvac");
    if (hvacTickets.length > 0) {
      const hvacZoneIds = new Set(hvacTickets.map((t: any) => t.zone_id).filter(Boolean));
      const affectedZones = energyByZone.filter((z) => hvacZoneIds.has(z.zone_id));
      if (affectedZones.length > 0) {
        const totalRepairCost = hvacTickets.reduce((s: number, t: any) => s + (t.estimated_cost_egp || 0), 0);
        const totalEnergyCost = affectedZones.reduce((s, z) => s + z.cost_egp, 0);
        insights.push({
          id: makeId(),
          type: "maintenance_energy",
          severity: hvacTickets.length >= 3 ? "critical" : "warning",
          title: `${hvacTickets.length} HVAC tickets in zones consuming EGP ${totalEnergyCost.toLocaleString()}/day energy`,
          message: `HVAC maintenance issues are likely increasing energy consumption. ${hvacTickets.length} open HVAC tickets with estimated repair costs of EGP ${totalRepairCost.toLocaleString()}. Resolving these could reduce energy waste.`,
          impact_egp: Math.round(totalEnergyCost * 30 * 0.2),
          confidence: 0.7,
          source_modules: ["maintenance", "energy", "finance"],
          recommended_action: "Prioritise HVAC repairs — broken units increase energy costs. Consider replacement if repair exceeds 50% of new unit cost.",
          link: "/dashboard/maintenance",
        });
      }
    }
  }

  // ── Tenant Mix insight ──

  if (tenantMix && tenantMix.categories.length > 0) {
    const overSpaced = tenantMix.categories.filter(
      (c) => c.mismatch_direction === "over_spaced" && c.mismatch_magnitude > 10
    );
    if (overSpaced.length > 0) {
      const biggest = overSpaced[0];
      insights.push({
        id: makeId(),
        type: "general",
        severity: "opportunity",
        title: `${biggest.category} uses ${biggest.area_pct}% of space but generates ${biggest.revenue_pct}% of revenue`,
        message: `Space allocation mismatch: ${biggest.category} category is over-represented relative to its revenue contribution. EGP ${biggest.revenue_per_sqm}/sqm vs property average. Consider rebalancing at next vacancy.`,
        impact_egp: Math.round((biggest.area_pct - biggest.revenue_pct) / 100 * tenantMix.total_revenue_egp * 0.5),
        confidence: 0.6,
        source_modules: ["tenant-analytics", "contracts"],
        recommended_action: tenantMix.ai_recommendation || "Review tenant mix at next vacancy",
        link: "/dashboard/tenant-analytics",
      });
    }
  }

  // ── Occupancy ──

  const units = unitsResult.data || [];
  const totalUnits = units.length;
  const vacantUnits = units.filter((u: any) => u.status === "vacant").length;
  if (vacantUnits > 0) {
    const occupancyRate = totalUnits > 0 ? ((totalUnits - vacantUnits) / totalUnits) * 100 : 100;
    insights.push({
      id: makeId(),
      type: "general",
      severity: occupancyRate < 70 ? "critical" : occupancyRate < 85 ? "warning" : "info",
      title: `${vacantUnits} units vacant — ${occupancyRate.toFixed(1)}% occupancy`,
      message: `${vacantUnits} out of ${totalUnits} units are currently vacant. ${portfolio ? `Vacancy costs approximately EGP ${portfolio.vacancy_cost_monthly.toLocaleString()}/month in lost revenue.` : ""}`,
      impact_egp: portfolio ? portfolio.vacancy_cost_monthly * 12 : vacantUnits * 25000 * 12,
      confidence: 0.95,
      source_modules: ["contracts"],
      recommended_action: vacantUnits > 3 ? "Launch aggressive leasing campaign with competitive rates" : "Review vacancy list and target specific tenant categories",
      link: "/dashboard/contracts",
    });
  }

  // ── Overdue Rent ──

  if (financeOverview && financeOverview.overdue_rent_egp > 0) {
    insights.push({
      id: makeId(),
      type: "general",
      severity: financeOverview.overdue_rent_egp > 100000 ? "critical" : "warning",
      title: `EGP ${Math.round(financeOverview.overdue_rent_egp).toLocaleString()} in overdue rent`,
      message: `Outstanding rent payments require immediate attention. Overdue amounts affect cash flow and signal potential tenant distress.`,
      impact_egp: Math.round(financeOverview.overdue_rent_egp),
      confidence: 0.98,
      source_modules: ["finance", "contracts"],
      recommended_action: "Send payment reminders. Escalate if overdue > 30 days. Review lease guarantees.",
      link: "/dashboard/finance",
    });
  }

  // Sort by impact_egp descending (highest money impact first)
  insights.sort((a, b) => b.impact_egp - a.impact_egp);

  return insights;
}

// ── 2. Property Health Score ────────────────────────────────

export async function calculatePropertyHealthScore(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<HealthScore> {
  const { month, year } = currentMonth();

  const [
    unitsResult,
    rentResult,
    maintenanceResult,
    leasesResult,
    discrepancyResult,
    energyOverview,
    energyEfficiency,
    financeOverview,
    marketingOverview,
    socialOverview,
    portfolio,
  ] = await Promise.all([
    supabase.from("units").select("id, status").eq("property_id", propertyId),
    supabase.from("rent_transactions").select("id, status, amount_due, amount_paid"),
    supabase
      .from("maintenance_tickets")
      .select("id, priority, status, created_at, resolved_at")
      .eq("property_id", propertyId),
    supabase
      .from("leases")
      .select("id, end_date, status")
      .eq("property_id", propertyId)
      .eq("status", "active"),
    supabase
      .from("discrepancies")
      .select("id, confidence, status")
      .eq("period_month", month)
      .eq("period_year", year),
    getEnergyOverview(supabase, propertyId).catch(() => null),
    getEnergyVsFootfall(supabase, propertyId).catch(() => []),
    getFinanceOverview(supabase, propertyId).catch(() => null),
    getMarketingOverview(supabase, propertyId).catch(() => null),
    getSocialOverview(supabase, propertyId).catch(() => null),
    getPortfolioAnalytics(supabase, propertyId).catch(() => null),
  ]);

  // ── Revenue Health (0-20) ──
  const rentTx = rentResult.data || [];
  const totalRentTx = rentTx.length;
  const paidTx = rentTx.filter((r: any) => r.status === "paid").length;
  const overdueTx = rentTx.filter((r: any) => r.status === "overdue").length;
  const collectionRate = totalRentTx > 0 ? paidTx / totalRentTx : 1;
  let revenueScore = Math.round(collectionRate * 12);
  if (overdueTx === 0) revenueScore += 8;
  else if (overdueTx <= 3) revenueScore += 4;
  revenueScore = Math.min(revenueScore, 20);
  const revenueDetail = `${paidTx}/${totalRentTx} paid (${(collectionRate * 100).toFixed(0)}%), ${overdueTx} overdue`;

  // ── Occupancy Health (0-15) ──
  const units = unitsResult.data || [];
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u: any) => u.status === "occupied").length;
  const occupancyRate = totalUnits > 0 ? occupiedUnits / totalUnits : 1;
  const occupancyScore = Math.min(Math.round(occupancyRate * 15), 15);
  const occupancyDetail = `${occupiedUnits}/${totalUnits} occupied (${(occupancyRate * 100).toFixed(0)}%)`;

  // ── Tenant Quality (0-15) ──
  const discrepancies = discrepancyResult.data || [];
  const highRiskDisc = discrepancies.filter((d: any) => d.confidence >= 0.75 && d.status !== "resolved" && d.status !== "dismissed");
  let tenantScore = 15;
  if (highRiskDisc.length > 5) tenantScore -= 8;
  else if (highRiskDisc.length > 2) tenantScore -= 4;
  else if (highRiskDisc.length > 0) tenantScore -= 2;
  tenantScore = Math.max(tenantScore, 0);
  const tenantDetail = `${highRiskDisc.length} high-risk discrepancies this month`;

  // ── Contract Health (0-15) ──
  const leases = leasesResult.data || [];
  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const expiringCount = leases.filter((l: any) => new Date(l.end_date) <= ninetyDays).length;
  const wale = portfolio?.wale_years || 0;
  let contractScore = 15;
  if (wale < 2) contractScore -= 6;
  else if (wale < 3) contractScore -= 3;
  if (expiringCount > 5) contractScore -= 6;
  else if (expiringCount > 2) contractScore -= 3;
  contractScore = Math.max(contractScore, 0);
  const contractDetail = `WALE ${wale.toFixed(1)} years, ${expiringCount} expiring in 90 days`;

  // ── Energy Efficiency (0-10) ──
  let energyScore = 5; // neutral default
  if (energyEfficiency.length > 0) {
    const efficient = energyEfficiency.filter((z) => z.status === "efficient").length;
    const inefficient = energyEfficiency.filter((z) => z.status === "inefficient").length;
    const total = energyEfficiency.length;
    energyScore = Math.round((efficient / total) * 10);
    if (inefficient > total / 2) energyScore = Math.max(energyScore - 3, 0);
  }
  const energyDetail = energyOverview
    ? `${energyOverview.total_consumption_kwh_today.toLocaleString()} kWh today, EGP ${energyOverview.total_cost_egp_today.toLocaleString()}`
    : "No energy data available";

  // ── Maintenance Health (0-10) ──
  const tickets = maintenanceResult.data || [];
  const openTickets = tickets.filter((t: any) => ["open", "assigned", "in_progress"].includes(t.status));
  const urgentOpen = openTickets.filter((t: any) => t.priority === "urgent" || t.priority === "emergency");
  const resolvedTickets = tickets.filter((t: any) => t.status === "completed" && t.resolved_at);
  let avgResolutionDays = 0;
  if (resolvedTickets.length > 0) {
    const totalDays = resolvedTickets.reduce((sum: number, t: any) => {
      return sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 86400000;
    }, 0);
    avgResolutionDays = totalDays / resolvedTickets.length;
  }
  let maintenanceScore = 10;
  if (urgentOpen.length > 0) maintenanceScore -= Math.min(urgentOpen.length * 3, 7);
  if (openTickets.length > 10) maintenanceScore -= 2;
  if (avgResolutionDays > 7) maintenanceScore -= 2;
  maintenanceScore = Math.max(maintenanceScore, 0);
  const maintenanceDetail = `${openTickets.length} open (${urgentOpen.length} urgent), avg resolution ${avgResolutionDays.toFixed(0)} days`;

  // ── Marketing Effectiveness (0-10) ──
  let marketingScore = 5; // neutral default
  if (marketingOverview) {
    if (marketingOverview.active_events.count > 0) marketingScore += 2;
    if (marketingOverview.active_campaigns.count > 0) marketingScore += 2;
    if (marketingOverview.active_promotions > 0) marketingScore += 1;
  }
  if (socialOverview) {
    const totalFollowers = socialOverview.total_followers;
    if (totalFollowers > 50000) marketingScore = Math.min(marketingScore + 2, 10);
    else if (totalFollowers > 10000) marketingScore = Math.min(marketingScore + 1, 10);
  }
  marketingScore = Math.min(marketingScore, 10);
  const marketingDetail = marketingOverview
    ? `${marketingOverview.active_events.count} events, ${marketingOverview.active_campaigns.count} campaigns, ${socialOverview?.total_followers.toLocaleString() || 0} followers`
    : "No marketing data";

  // ── Financial Health (0-5) ──
  let financialScore = 3; // neutral
  if (financeOverview) {
    if (financeOverview.profit_margin_pct > 30) financialScore = 5;
    else if (financeOverview.profit_margin_pct > 15) financialScore = 4;
    else if (financeOverview.profit_margin_pct > 0) financialScore = 3;
    else financialScore = 1;
  }
  const financialDetail = financeOverview
    ? `${financeOverview.profit_margin_pct.toFixed(0)}% margin, EGP ${Math.round(financeOverview.overdue_rent_egp).toLocaleString()} overdue`
    : "No financial data";

  const total = revenueScore + occupancyScore + tenantScore + contractScore + energyScore + maintenanceScore + marketingScore + financialScore;

  return {
    total,
    revenue: { score: revenueScore, max: 20, detail: revenueDetail, link: "/dashboard/discrepancies" },
    occupancy: { score: occupancyScore, max: 15, detail: occupancyDetail, link: "/dashboard/contracts" },
    tenant_quality: { score: tenantScore, max: 15, detail: tenantDetail, link: "/dashboard/tenant-analytics" },
    contracts: { score: contractScore, max: 15, detail: contractDetail, link: "/dashboard/contracts" },
    energy: { score: energyScore, max: 10, detail: energyDetail, link: "/dashboard/energy" },
    maintenance: { score: maintenanceScore, max: 10, detail: maintenanceDetail, link: "/dashboard/maintenance" },
    marketing: { score: marketingScore, max: 10, detail: marketingDetail, link: "/dashboard/marketing" },
    financial: { score: financialScore, max: 5, detail: financialDetail, link: "/dashboard/finance" },
  };
}

// ── 3. Daily Briefing ──────────────────────────────────────

export async function generateDailyBriefing(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<DailyBriefing> {
  const today = todayStr();
  const { month, year } = currentMonth();
  const hour = new Date().getHours();

  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const [
    footfallOverview,
    discrepancySummary,
    maintenanceResult,
    overdueResult,
    leasesResult,
    energyOverview,
    financeOverview,
    marketingOverview,
    socialOverview,
    learningStats,
  ] = await Promise.all([
    getFootfallOverview(supabase, propertyId).catch(() => null),
    getDiscrepancySummary(supabase, propertyId, month, year).catch(() => null),
    supabase
      .from("maintenance_tickets")
      .select("id, title, priority, status")
      .eq("property_id", propertyId)
      .in("status", ["open", "assigned", "in_progress"])
      .order("priority", { ascending: true }),
    supabase.from("rent_transactions").select("id, amount_due, amount_paid, status").eq("status", "overdue"),
    supabase.from("leases").select("id, end_date, tenants!inner(brand_name)").eq("property_id", propertyId).eq("status", "active"),
    getEnergyOverview(supabase, propertyId).catch(() => null),
    getFinanceOverview(supabase, propertyId).catch(() => null),
    getMarketingOverview(supabase, propertyId).catch(() => null),
    getSocialOverview(supabase, propertyId).catch(() => null),
    getLearningStats(supabase, propertyId).catch(() => null),
  ]);

  // Revenue section
  const revenueItems: BriefingSection["items"] = [];
  if (discrepancySummary && discrepancySummary.total_discrepancies > 0) {
    revenueItems.push({
      text: `${discrepancySummary.total_discrepancies} discrepancies flagged — EGP ${Math.round(discrepancySummary.total_potential_recovery_egp).toLocaleString()} potential recovery`,
      alert: discrepancySummary.by_confidence.high > 0,
    });
  } else {
    revenueItems.push({ text: "No new discrepancies detected this month", trend: "neutral" });
  }
  const overdueTransactions = overdueResult.data || [];
  if (overdueTransactions.length > 0) {
    const totalOverdue = overdueTransactions.reduce((sum: number, r: any) => sum + ((r.amount_due || 0) - (r.amount_paid || 0)), 0);
    revenueItems.push({ text: `EGP ${Math.round(totalOverdue).toLocaleString()} overdue from ${overdueTransactions.length} transactions`, alert: true });
  } else {
    revenueItems.push({ text: "All rent payments up to date", trend: "up" });
  }

  // Footfall section
  const footfallItems: BriefingSection["items"] = [];
  if (footfallOverview) {
    if (footfallOverview.total_visitors_yesterday > 0) {
      footfallItems.push({
        text: `Yesterday: ${footfallOverview.total_visitors_yesterday.toLocaleString()} visitors`,
        trend: footfallOverview.change_vs_yesterday_pct > 0 ? "up" : footfallOverview.change_vs_yesterday_pct < 0 ? "down" : "neutral",
      });
    }
    footfallItems.push({ text: `30-day average: ${footfallOverview.avg_daily_visitors.toLocaleString()}/day` });
    if (footfallOverview.change_vs_last_week_pct !== 0) {
      footfallItems.push({
        text: `${footfallOverview.change_vs_last_week_pct > 0 ? "Up" : "Down"} ${Math.abs(footfallOverview.change_vs_last_week_pct)}% vs last week`,
        trend: footfallOverview.change_vs_last_week_pct > 0 ? "up" : "down",
      });
    }
  } else {
    footfallItems.push({ text: "No footfall data available" });
  }

  // Contracts section
  const contractItems: BriefingSection["items"] = [];
  const activeLeases = leasesResult.data || [];
  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const expiringLeases = activeLeases.filter((l: any) => new Date(l.end_date) <= ninetyDays);
  if (expiringLeases.length > 0) {
    contractItems.push({ text: `${expiringLeases.length} leases expiring within 90 days`, alert: expiringLeases.length > 3 });
  } else {
    contractItems.push({ text: "No leases expiring in 90 days" });
  }
  contractItems.push({ text: `${activeLeases.length} active leases total` });

  // Energy section
  const energyItems: BriefingSection["items"] = [];
  if (energyOverview) {
    energyItems.push({ text: `Today: ${energyOverview.total_consumption_kwh_today.toLocaleString()} kWh — EGP ${energyOverview.total_cost_egp_today.toLocaleString()}` });
    if (energyOverview.change_vs_yesterday_pct !== 0) {
      energyItems.push({
        text: `${energyOverview.change_vs_yesterday_pct > 0 ? "Up" : "Down"} ${Math.abs(energyOverview.change_vs_yesterday_pct)}% vs yesterday`,
        trend: energyOverview.change_vs_yesterday_pct > 0 ? "down" : "up", // Lower energy = good
        alert: energyOverview.change_vs_yesterday_pct > 15,
      });
    }
  } else {
    energyItems.push({ text: "No energy data available" });
  }

  // Maintenance section
  const maintenanceItems: BriefingSection["items"] = [];
  const tickets = maintenanceResult.data || [];
  if (tickets.length > 0) {
    const urgentCount = tickets.filter((t: any) => t.priority === "urgent" || t.priority === "emergency").length;
    maintenanceItems.push({ text: `${tickets.length} open tickets`, alert: urgentCount > 0 });
    if (urgentCount > 0) {
      maintenanceItems.push({ text: `${urgentCount} urgent/emergency tickets need attention`, alert: true });
    }
  } else {
    maintenanceItems.push({ text: "No open maintenance tickets", trend: "up" });
  }

  // Marketing section
  const marketingItems: BriefingSection["items"] = [];
  if (marketingOverview) {
    if (marketingOverview.active_events.count > 0) {
      marketingItems.push({ text: `${marketingOverview.active_events.count} active event(s)`, trend: "up" });
    }
    if (marketingOverview.upcoming_events.count > 0) {
      marketingItems.push({ text: `${marketingOverview.upcoming_events.count} events upcoming in 30 days` });
    }
    if (marketingOverview.active_campaigns.count > 0) {
      marketingItems.push({ text: `${marketingOverview.active_campaigns.count} campaign(s) running` });
    }
    if (marketingItems.length === 0) {
      marketingItems.push({ text: "No active events or campaigns" });
    }
  } else {
    marketingItems.push({ text: "No marketing data available" });
  }

  // Finance section
  const financeItems: BriefingSection["items"] = [];
  if (financeOverview) {
    financeItems.push({ text: `Net profit: EGP ${Math.round(financeOverview.net_profit_egp).toLocaleString()} (${financeOverview.profit_margin_pct.toFixed(0)}% margin)` });
    if (financeOverview.income_vs_last_month_pct !== 0) {
      financeItems.push({
        text: `Income ${financeOverview.income_vs_last_month_pct > 0 ? "up" : "down"} ${Math.abs(financeOverview.income_vs_last_month_pct).toFixed(0)}% vs last month`,
        trend: financeOverview.income_vs_last_month_pct > 0 ? "up" : "down",
      });
    }
  } else {
    financeItems.push({ text: "No financial data available" });
  }

  // Learning section
  const learningItems: BriefingSection["items"] = [];
  if (learningStats) {
    learningItems.push({ text: `${learningStats.days_of_learning} days of learning, ${learningStats.params_calibrated} params calibrated` });
    learningItems.push({ text: `${learningStats.patterns_discovered} patterns discovered, avg confidence ${learningStats.avg_confidence}%` });
  } else {
    learningItems.push({ text: "Learning engine initializing" });
  }

  // Top 3 Actions
  const topActions: DailyBriefing["top_actions"] = [];
  const urgentTickets = tickets.filter((t: any) => t.priority === "urgent" || t.priority === "emergency");
  if (urgentTickets.length > 0) {
    topActions.push({ text: `Resolve ${urgentTickets.length} urgent maintenance ticket(s)`, link: "/dashboard/maintenance", priority: "high" });
  }
  if (discrepancySummary && discrepancySummary.by_confidence.high > 0) {
    topActions.push({ text: `Review ${discrepancySummary.by_confidence.high} high-confidence underreporting flags`, link: "/dashboard/discrepancies", priority: "high" });
  }
  if (expiringLeases.length > 0) {
    topActions.push({ text: `Address ${expiringLeases.length} expiring lease(s) — initiate renewal talks`, link: "/dashboard/contracts", priority: "medium" });
  }
  if (overdueTransactions.length > 0 && topActions.length < 3) {
    topActions.push({ text: `Follow up on ${overdueTransactions.length} overdue payment(s)`, link: "/dashboard/finance", priority: "high" });
  }
  if (topActions.length < 3 && marketingOverview?.next_major_season && marketingOverview.days_until_next_season <= 30) {
    topActions.push({ text: `Prepare for ${marketingOverview.next_major_season.name} (${marketingOverview.days_until_next_season} days)`, link: "/dashboard/marketing", priority: "medium" });
  }
  if (topActions.length < 3) {
    topActions.push({ text: "Review tenant analytics for optimization opportunities", link: "/dashboard/tenant-analytics", priority: "low" });
  }

  return {
    greeting,
    date: today,
    sections: {
      revenue: { title: "Revenue", icon: "TrendingUp", items: revenueItems },
      footfall: { title: "Footfall", icon: "Users", items: footfallItems },
      contracts: { title: "Contracts", icon: "FileText", items: contractItems },
      energy: { title: "Energy", icon: "Zap", items: energyItems },
      maintenance: { title: "Maintenance", icon: "Wrench", items: maintenanceItems },
      marketing: { title: "Marketing", icon: "Megaphone", items: marketingItems },
      finance: { title: "Finance", icon: "DollarSign", items: financeItems },
      learning: { title: "AI Learning", icon: "Brain", items: learningItems },
    },
    top_actions: topActions.slice(0, 3),
  };
}

// ── 4. Property Snapshot ───────────────────────────────────

export async function getPropertySnapshot(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<PropertySnapshot> {
  const { month, year } = currentMonth();

  const [
    tenantsResult,
    unitsResult,
    footfallOverview,
    energyOverview,
    maintenanceResult,
    discrepancySummary,
    expiringLeases,
    marketingOverview,
    socialOverview,
    portfolio,
    replacementAnalysis,
    healthScore,
    insights,
    rentResult,
  ] = await Promise.all([
    supabase.from("tenants").select("id, category, status").eq("status", "active"),
    supabase.from("units").select("id, status").eq("property_id", propertyId),
    getFootfallOverview(supabase, propertyId).catch(() => null),
    getEnergyOverview(supabase, propertyId).catch(() => null),
    supabase
      .from("maintenance_tickets")
      .select("id, priority, status")
      .eq("property_id", propertyId)
      .in("status", ["open", "assigned", "in_progress"]),
    getDiscrepancySummary(supabase, propertyId, month, year).catch(() => null),
    getExpiringLeases(supabase, propertyId, 90).catch(() => []),
    getMarketingOverview(supabase, propertyId).catch(() => null),
    getSocialOverview(supabase, propertyId).catch(() => null),
    getPortfolioAnalytics(supabase, propertyId).catch(() => null),
    getReplacementAnalysis(supabase, propertyId).catch(() => null),
    calculatePropertyHealthScore(supabase, propertyId),
    generateCrossDataInsights(supabase, propertyId),
    supabase
      .from("rent_transactions")
      .select("amount_paid, lease:leases!inner(property_id)")
      .eq("period_month", month)
      .eq("period_year", year)
      .eq("leases.property_id", propertyId),
  ]);

  // Tenant summary
  const tenants = tenantsResult.data || [];
  const byCategory: Record<string, number> = {};
  tenants.forEach((t: any) => {
    byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  });

  // Occupancy
  const units = unitsResult.data || [];
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u: any) => u.status === "occupied").length;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 100;

  // Revenue this month
  const revenueThisMonth = (rentResult.data || []).reduce(
    (s: number, t: any) => s + (Number(t.amount_paid) || 0), 0
  );

  // Maintenance
  const openTickets = maintenanceResult.data || [];
  const urgentTickets = openTickets.filter((t: any) => t.priority === "urgent" || t.priority === "emergency");

  // Social
  const totalFollowers = socialOverview?.total_followers || 0;
  const socialGrowth = socialOverview?.platforms.reduce((s, p) => s + p.follower_growth_30d, 0) || 0;

  return {
    tenants: { total: tenants.length, by_category: byCategory },
    occupancy_rate: Math.round(occupancyRate * 10) / 10,
    revenue_this_month: Math.round(revenueThisMonth),
    revenue_trend: 0, // Would need last month comparison
    footfall_today: footfallOverview?.total_visitors_today || 0,
    footfall_trend: footfallOverview?.change_vs_last_week_pct || 0,
    energy_cost_today: energyOverview?.total_cost_egp_today || 0,
    energy_trend: energyOverview?.change_vs_yesterday_pct || 0,
    open_maintenance: openTickets.length,
    urgent_maintenance: urgentTickets.length,
    discrepancies_count: discrepancySummary?.total_discrepancies || 0,
    discrepancies_variance: discrepancySummary?.total_variance_egp || 0,
    expiring_leases_90d: expiringLeases.length,
    active_campaigns: marketingOverview?.active_campaigns.count || 0,
    active_events: marketingOverview?.active_events.count || 0,
    social_followers: totalFollowers,
    social_growth: socialGrowth,
    opportunity_cost_monthly: replacementAnalysis?.total_potential_monthly_gain || 0,
    wale_years: portfolio?.wale_years || 0,
    health_score: healthScore.total,
    top_insights: insights.slice(0, 3),
  };
}
