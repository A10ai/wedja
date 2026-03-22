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
import { getCCTVDashboardData, getStoreConversion, getDeadZones, getDemographics, getParkingStatus, getSecurityAlerts, getQueueStatus } from "./cctv-engine";
import { calculatePercentageRent, getInflationHedgeAnalysis } from "./percentage-rent-engine";
import { getAnomalyStats } from "./anomaly-engine";
import { forecastFootfall, forecastRevenue } from "./prediction-model";

// ============================================================
// Wedja AI Engine — The All-Seeing Eye of Senzo Mall
//
// Cross-references ALL 11 modules to generate insights that no
// single-source tool can produce. Revenue + Footfall + Contracts
// + Energy + Marketing + Social + Finance + Learning + CCTV
// + Heatmap + Tenant Analytics.
//
// Now powered by REAL JDE data: 166 tenants, EGP 39.5M Q1 2026.
// This is what makes Wedja unique.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface CrossDataInsight {
  id: string;
  type: "revenue_footfall" | "revenue_contracts" | "footfall_energy" | "footfall_marketing" | "contracts_tenants" | "finance_energy" | "social_footfall" | "maintenance_energy" | "cctv_revenue" | "cctv_contracts" | "demographics_marketing" | "finance_contracts" | "learning" | "jde_data" | "general";
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
  cctv_security: HealthScoreDimension;
  social_media: HealthScoreDimension;
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
    cctv: BriefingSection;
    social: BriefingSection;
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
  // New fields
  total_monthly_rent_egp: number;
  top_tenant_by_rent: string;
  kiosk_revenue_total: number;
  cctv_alerts_active: number;
  parking_occupancy_pct: number;
  social_followers_total: number;
  store_avg_conversion_rate: number;
  dead_zones_count: number;
  queue_alerts_active: number;
  anomalies_active: number;
  anomalies_critical: number;
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

  // Pull data from ALL 11 modules in parallel
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
    learnedPatterns,
    cctvOverview,
    storeConversion,
    deadZones,
    demographics,
    parkingData,
    securityData,
    queueStatus,
    maintenanceResult,
    unitsResult,
    rentTransactionsResult,
    kiosksResult,
    percentageRentData,
    inflationHedgeData,
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
    getLearnedPatterns(supabase, propertyId).catch(() => []),
    getCCTVDashboardData(supabase, propertyId).catch(() => null),
    getStoreConversion(supabase, propertyId).catch(() => null),
    getDeadZones(supabase, propertyId).catch(() => []),
    getDemographics(supabase, propertyId).catch(() => null),
    getParkingStatus(supabase, propertyId).catch(() => null),
    getSecurityAlerts(supabase, propertyId, "active").catch(() => null),
    getQueueStatus(supabase, propertyId).catch(() => null),
    supabase
      .from("maintenance_tickets")
      .select("id, priority, status, zone_id, category, estimated_cost_egp, actual_cost_egp")
      .eq("property_id", propertyId)
      .in("status", ["open", "assigned", "in_progress"]),
    supabase.from("units").select("id, status, area_sqm").eq("property_id", propertyId),
    supabase
      .from("rent_transactions")
      .select("amount_paid, amount_due, min_rent_due, percentage_rent_due, lease:leases!inner(property_id, tenant:tenants(brand_name, brand_type, category))")
      .eq("period_month", month)
      .eq("period_year", year)
      .eq("leases.property_id", propertyId),
    supabase
      .from("leases")
      .select("id, min_rent_monthly_egp, unit:units!inner(area_sqm), tenant:tenants!inner(brand_name, brand_type)")
      .eq("property_id", propertyId)
      .eq("status", "active")
      .eq("tenants.brand_type", "kiosk"),
    calculatePercentageRent(supabase, propertyId, month, year).catch(() => null),
    getInflationHedgeAnalysis(supabase, propertyId).catch(() => null),
  ]);

  // ══════════════════════════════════════════════════════════
  // ── Revenue + Footfall Cross-Reference ──
  // ══════════════════════════════════════════════════════════

  if (discrepancySummary && discrepancySummary.total_discrepancies > 0) {
    const ds = discrepancySummary;
    insights.push({
      id: makeId(),
      type: "revenue_footfall",
      severity: ds.total_potential_recovery_egp > 200000 ? "critical" : ds.total_potential_recovery_egp > 50000 ? "warning" : "opportunity",
      title: `${ds.total_discrepancies} tenants flagged for underreporting — total potential recovery: EGP ${Math.round(ds.total_potential_recovery_egp).toLocaleString()}/month`,
      message: `Revenue verification detected ${ds.total_discrepancies} potential underreporting cases using footfall-to-sales cross-reference. High confidence flags: ${ds.by_confidence.high}. Total estimated variance: EGP ${Math.round(ds.total_variance_egp).toLocaleString()}.`,
      impact_egp: Math.round(ds.total_potential_recovery_egp * 12),
      confidence: 0.82,
      source_modules: ["revenue", "footfall"],
      recommended_action: "Review discrepancy report and initiate tenant audits for high-confidence flags",
      link: "/dashboard/discrepancies",
    });
  }

  // High footfall but low sales tenants
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
        message: `${names}${highFootfallLowRevenue.length > 3 ? ` and ${highFootfallLowRevenue.length - 3} more` : ""} have high foot traffic but reported sales significantly below estimates. Possible underreporting or poor sales conversion.`,
        impact_egp: Math.round(totalGap),
        confidence: 0.72,
        source_modules: ["revenue", "footfall", "tenant-analytics"],
        recommended_action: "Cross-reference with POS data if available. Consider mystery shopping or audit visits.",
        link: "/dashboard/tenant-analytics",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── CCTV + Revenue Cross-Reference (NEW) ──
  // ══════════════════════════════════════════════════════════

  if (storeConversion && storeConversion.stores.length > 0 && tenantRankings.length > 0) {
    // Low conversion rate but prime space
    const rankingMap = new Map(tenantRankings.map((t) => [t.tenant_name, t]));
    const lowConverters = storeConversion.bottom_converters.slice(0, 5);

    for (const store of lowConverters) {
      const ranking = rankingMap.get(store.tenant_name);
      if (ranking && ranking.rent_per_sqm > 0) {
        const avgConversionAll = storeConversion.avg_conversion_rate;
        if (store.conversion_rate < avgConversionAll * 0.5 && store.passersby > 100) {
          insights.push({
            id: makeId(),
            type: "cctv_revenue",
            severity: "warning",
            title: `Store conversion for ${store.tenant_name} is ${store.conversion_rate.toFixed(1)}% but revenue/sqm is below zone average`,
            message: `${store.tenant_name} has ${store.passersby.toLocaleString()} passersby but only ${store.conversion_rate.toFixed(1)}% enter (mall avg: ${avgConversionAll.toFixed(1)}%). This is a display/pricing issue, not a traffic problem. The store has enough exposure but fails to attract visitors inside.`,
            impact_egp: Math.round(ranking.monthly_rent * 0.3 * 12),
            confidence: 0.73,
            source_modules: ["cctv", "revenue", "tenant-analytics"],
            recommended_action: "Advise tenant on window display and signage improvements. If no improvement, reconsider at lease renewal.",
            link: "/dashboard/cctv",
          });
          break; // Only the worst one
        }
      }
    }
  }

  // Queue alerts
  if (queueStatus && queueStatus.active_queues.length > 0) {
    const longQueues = queueStatus.active_queues.filter((q) => q.estimated_wait_minutes > 8);
    if (longQueues.length > 0) {
      const worst = longQueues[0];
      insights.push({
        id: makeId(),
        type: "cctv_revenue",
        severity: "warning",
        title: `Queue at ${worst.tenant_name} averages ${worst.estimated_wait_minutes} minutes — consider kitchen expansion or second counter`,
        message: `${worst.tenant_name} has ${worst.queue_length} people queuing with an estimated ${worst.estimated_wait_minutes}-minute wait. Long queues reduce conversion for neighboring stores and create visitor frustration.`,
        impact_egp: Math.round(worst.queue_length * 150 * 30),
        confidence: 0.68,
        source_modules: ["cctv", "revenue"],
        recommended_action: `Work with ${worst.tenant_name} management on capacity expansion. Consider queue management system or mobile ordering.`,
        link: "/dashboard/cctv",
      });
    }
  }

  // Dead zones
  if (deadZones.length > 0) {
    const realDeadZones = deadZones.filter((z) => z.relative_traffic < 20 && z.area_sqm > 50);
    if (realDeadZones.length > 0) {
      const worst = realDeadZones[0];
      insights.push({
        id: makeId(),
        type: "cctv_revenue",
        severity: "opportunity",
        title: `Dead zone near ${worst.zone_name} has ${100 - worst.relative_traffic}% less traffic than busiest zone`,
        message: `${worst.zone_name} (${worst.area_sqm.toLocaleString()} sqm) has extremely low traffic at ${worst.footfall.toLocaleString()} visitors vs the busiest zone. Consider relocating underperforming tenants here or adding wayfinding signage.`,
        impact_egp: Math.round(worst.area_sqm * 50 * 12),
        confidence: 0.65,
        source_modules: ["cctv", "footfall"],
        recommended_action: worst.recommendation,
        link: "/dashboard/cctv",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── CCTV + Contracts (NEW) ──
  // ══════════════════════════════════════════════════════════

  if (storeConversion && storeConversion.bottom_converters.length > 0 && expiringLeases.length > 0) {
    const conversionMap = new Map(storeConversion.stores.map((s) => [s.tenant_name, s]));
    for (const lease of expiringLeases) {
      const conv = conversionMap.get(lease.brand_name);
      if (conv && conv.conversion_rate < storeConversion.avg_conversion_rate * 0.4) {
        insights.push({
          id: makeId(),
          type: "cctv_contracts",
          severity: "warning",
          title: `${lease.brand_name} has lowest store conversion (${conv.conversion_rate.toFixed(1)}%) but occupies prime space`,
          message: `${lease.brand_name} converts only ${conv.conversion_rate.toFixed(1)}% of passersby (avg: ${storeConversion.avg_conversion_rate.toFixed(1)}%). Lease expires in ${lease.days_until_expiry} days. Renegotiate or replace at lease renewal.`,
          impact_egp: Math.round(lease.current_rent * 12 * 0.2),
          confidence: 0.72,
          source_modules: ["cctv", "contracts"],
          recommended_action: `Use low conversion data as leverage in renewal negotiations. Demand higher minimum rent or replace with stronger brand.`,
          link: "/dashboard/contracts",
        });
        break;
      }
    }
  }

  // Parking monetization
  if (parkingData && parkingData.occupancy_pct > 70) {
    const potentialRevenue = Math.round(parkingData.current_occupied * 5 * 30);
    insights.push({
      id: makeId(),
      type: "cctv_contracts",
      severity: "opportunity",
      title: `Parking at ${parkingData.occupancy_pct.toFixed(0)}% capacity during peak — consider paid parking to generate EGP ${potentialRevenue.toLocaleString()}/month`,
      message: `Parking regularly exceeds 70% capacity with ${parkingData.current_occupied} occupied spaces. At EGP 5/hour avg, paid parking could generate EGP ${potentialRevenue.toLocaleString()}/month. First 2 hours free for shoppers to avoid deterring visits.`,
      impact_egp: potentialRevenue * 12,
      confidence: 0.6,
      source_modules: ["cctv", "contracts"],
      recommended_action: "Study comparable malls with paid parking. Implement first-2-hours-free model to avoid deterring shoppers.",
      link: "/dashboard/cctv",
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── Demographics + Marketing (NEW) ──
  // ══════════════════════════════════════════════════════════

  if (demographics && demographics.group_breakdown.length > 0) {
    const familyData = demographics.group_breakdown.find((g) => g.type === "family");
    if (familyData && familyData.pct > 30) {
      insights.push({
        id: makeId(),
        type: "demographics_marketing",
        severity: "opportunity",
        title: `Families are ${familyData.pct.toFixed(0)}% of weekday visitors — focus family-oriented events and promotions`,
        message: `Camera demographic analysis shows families make up ${familyData.pct.toFixed(0)}% of visitors (${familyData.count.toLocaleString()} detected today). Program family activities, kids events, and educational workshops to increase dwell time and spending.`,
        impact_egp: Math.round(familyData.count * 50 * 30),
        confidence: 0.62,
        source_modules: ["cctv", "marketing"],
        recommended_action: "Launch weekly family fun events. Partner with entertainment tenants for bundled promotions.",
        link: "/dashboard/marketing",
      });
    }

    // Evening young adult pattern
    const eveningYA = demographics.time_patterns.filter((t) => t.hour >= 19 && t.hour <= 22);
    const totalEvening = eveningYA.reduce((s, t) => s + t.young_adults, 0);
    if (totalEvening > 100) {
      insights.push({
        id: makeId(),
        type: "demographics_marketing",
        severity: "info",
        title: `Evening visitors skew young adult — program entertainment events for 7-10 PM`,
        message: `${totalEvening.toLocaleString()} young adults visit between 7-10 PM. This demographic responds to live music, food events, and social media activations. Evening programming could boost F&B revenue significantly.`,
        impact_egp: Math.round(totalEvening * 100 * 4),
        confidence: 0.58,
        source_modules: ["cctv", "marketing"],
        recommended_action: "Launch 'Senzo Nights' weekly event series targeting young adults. Include live music and food court specials.",
        link: "/dashboard/marketing",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Social + Footfall (NEW/ENHANCED) ──
  // ══════════════════════════════════════════════════════════

  if (socialOverview && peakPatterns) {
    if (peakPatterns.busiest_day && socialOverview.best_posting_time) {
      insights.push({
        id: makeId(),
        type: "social_footfall",
        severity: "info",
        title: `Best posting time aligns with pre-visit browsing: Thursday 7-9 PM`,
        message: `${peakPatterns.busiest_day} sees ${peakPatterns.busiest_day_avg.toLocaleString()} avg visitors. Best social engagement: ${socialOverview.best_posting_time}. Posting the evening before busiest days drives next-day visits.`,
        impact_egp: 0,
        confidence: 0.55,
        source_modules: ["social", "footfall"],
        recommended_action: `Schedule high-impact social posts for the evening before ${peakPatterns.busiest_day}`,
        link: "/dashboard/social",
      });
    }

    // Content type performance
    if (socialOverview.best_content_type) {
      const multiplier = socialOverview.best_content_type === "reel" ? 3 : socialOverview.best_content_type === "video" ? 2.5 : 1;
      if (multiplier > 1) {
        insights.push({
          id: makeId(),
          type: "social_footfall",
          severity: "opportunity",
          title: `${socialOverview.best_content_type === "reel" ? "TikTok reels" : "Video content"} get ${multiplier}x engagement — invest in video content creation`,
          message: `${socialOverview.best_content_type} posts outperform other formats by ${multiplier}x on engagement. Best platform: ${socialOverview.best_platform}. Invest in short-form video production for maximum reach.`,
          impact_egp: 0,
          confidence: 0.6,
          source_modules: ["social", "footfall"],
          recommended_action: `Allocate 60% of content budget to ${socialOverview.best_content_type} creation. Hire part-time videographer.`,
          link: "/dashboard/social",
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Revenue + Contracts ──
  // ══════════════════════════════════════════════════════════

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
        impact_egp: Math.round(totalPotential * 12),
        confidence: 0.78,
        source_modules: ["revenue", "contracts", "footfall"],
        recommended_action: "Audit these tenants. If confirmed, renegotiate lease terms with higher minimum rent at renewal.",
        link: "/dashboard/contracts",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Finance + Energy + Contracts (NEW) ──
  // ══════════════════════════════════════════════════════════

  if (financeOverview && energyOverview && portfolio) {
    const totalExpenses = financeOverview.total_expenses_egp;
    const totalIncome = financeOverview.total_income_egp;
    const energyCostMonthly = energyOverview.cost_this_month_egp;
    const netMargin = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0;

    insights.push({
      id: makeId(),
      type: "finance_contracts",
      severity: netMargin < 30 ? "warning" : "info",
      title: `Total operating expenses EGP ${Math.round(totalExpenses).toLocaleString()}/month. Rent collection EGP ${Math.round(totalIncome).toLocaleString()}/month. Net margin: ${netMargin.toFixed(1)}%`,
      message: `Monthly P&L shows EGP ${Math.round(totalIncome).toLocaleString()} income vs EGP ${Math.round(totalExpenses).toLocaleString()} expenses. Net margin at ${netMargin.toFixed(1)}%. Industry benchmark for well-managed malls: 35-45%.`,
      impact_egp: netMargin < 30 ? Math.round((0.35 - netMargin / 100) * totalIncome) : 0,
      confidence: 0.92,
      source_modules: ["finance", "contracts"],
      recommended_action: netMargin < 30 ? "Review expense categories for optimization. Target 35% net margin." : "Healthy margin. Focus on growing top-line through occupancy and rent escalation.",
      link: "/dashboard/finance",
    });

    // Energy as % of revenue
    if (energyCostMonthly > 0 && totalIncome > 0) {
      const energyPct = (energyCostMonthly / totalIncome) * 100;
      if (energyPct > 5) {
        insights.push({
          id: makeId(),
          type: "finance_energy",
          severity: energyPct > 8 ? "warning" : "opportunity",
          title: `Energy cost is ${energyPct.toFixed(1)}% of revenue — above industry benchmark of 4-5%`,
          message: `Energy costs EGP ${energyCostMonthly.toLocaleString()} this month, representing ${energyPct.toFixed(1)}% of total revenue. Benchmark for Egyptian malls: 4-5%. Potential saving: EGP ${Math.round(energyCostMonthly * 0.2).toLocaleString()}/month.`,
          impact_egp: Math.round(energyCostMonthly * 0.2 * 12),
          confidence: 0.75,
          source_modules: ["finance", "energy"],
          recommended_action: "Implement LED retrofitting, HVAC scheduling, and motion-sensor lighting in parking",
          link: "/dashboard/energy",
        });
      }
    }

    // Top 5 tenant concentration risk
    if (portfolio.tenant_concentration.length >= 5) {
      const top5Pct = portfolio.tenant_concentration.slice(0, 5).reduce((s, t) => s + t.percentage_of_total, 0);
      if (top5Pct > 40) {
        const top = portfolio.tenant_concentration[0];
        insights.push({
          id: makeId(),
          type: "finance_contracts",
          severity: top5Pct > 60 ? "warning" : "opportunity",
          title: `Top 5 tenants contribute ${top5Pct.toFixed(1)}% of rent — concentration risk`,
          message: `${top.brand_name} alone contributes ${top.percentage_of_total.toFixed(1)}% (EGP ${top.monthly_rent.toLocaleString()}/month). If ${top.brand_name} leaves, the mall loses significant revenue. Diversify tenant base.`,
          impact_egp: Math.round(top.monthly_rent * 6),
          confidence: 0.88,
          source_modules: ["finance", "contracts"],
          recommended_action: `Start early lease renewal negotiations with ${top.brand_name}. Begin recruiting alternative anchor tenants.`,
          link: "/dashboard/contracts",
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Revenue Verification + Contracts + Tenant Analytics ──
  // ══════════════════════════════════════════════════════════

  // Bottom 10 tenants by revenue/sqm
  if (tenantRankings.length > 10) {
    const sorted = [...tenantRankings].sort((a, b) => a.rent_per_sqm - b.rent_per_sqm);
    const bottom10 = sorted.slice(0, 10);
    const totalArea = bottom10.reduce((s, t) => s + t.area_sqm, 0);
    const avgRentPerSqm = portfolio ? portfolio.avg_rent_per_sqm : 150;
    const oppCost = Math.round(bottom10.reduce((s, t) => s + Math.max(0, avgRentPerSqm - t.rent_per_sqm) * t.area_sqm, 0));
    if (oppCost > 20000) {
      insights.push({
        id: makeId(),
        type: "contracts_tenants",
        severity: "opportunity",
        title: `Bottom 10 tenants by revenue/sqm occupy ${totalArea.toLocaleString()} sqm — opportunity cost: EGP ${oppCost.toLocaleString()}/month`,
        message: `The 10 lowest-performing tenants by rent/sqm collectively occupy ${totalArea.toLocaleString()} sqm. If these spaces generated average revenue, the mall would earn an additional EGP ${oppCost.toLocaleString()}/month.`,
        impact_egp: oppCost * 12,
        confidence: 0.7,
        source_modules: ["tenant-analytics", "contracts"],
        recommended_action: "Do not renew these leases without significant rent increases. Begin replacement tenant search.",
        link: "/dashboard/tenant-analytics",
      });
    }
  }

  // Expiring leases breakdown
  if (expiringLeases.length > 0 && tenantRankings.length > 0) {
    const rankingMap = new Map(tenantRankings.map((t) => [t.brand_name, t]));
    const underperformers = expiringLeases.filter((l) => {
      const r = rankingMap.get(l.brand_name);
      return r && r.overall_score < 40;
    });
    const topPerformers = expiringLeases.filter((l) => {
      const r = rankingMap.get(l.brand_name);
      return r && r.overall_score >= 70;
    });

    insights.push({
      id: makeId(),
      type: "contracts_tenants",
      severity: expiringLeases.length > 5 ? "warning" : "info",
      title: `${expiringLeases.length} leases expiring in 90 days — ${underperformers.length} are underperformers, ${topPerformers.length} are top performers needing retention`,
      message: `Upcoming lease expirations: ${underperformers.length} underperformers to replace or renegotiate, ${topPerformers.length} top performers to retain with competitive renewal terms, ${expiringLeases.length - underperformers.length - topPerformers.length} average performers.`,
      impact_egp: Math.round(expiringLeases.reduce((s, l) => s + l.current_rent, 0) * 3),
      confidence: 0.85,
      source_modules: ["contracts", "tenant-analytics"],
      recommended_action: "Prioritize retention of top performers with early renewal offers. Prepare replacement pipeline for underperformers.",
      link: "/dashboard/contracts",
    });
  }

  // Average percentage rate analysis
  if (rentVsSales.length > 0) {
    const avgRate = rentVsSales.reduce((s, r) => s + r.percentage_rate, 0) / rentVsSales.length;
    const belowAvg = rentVsSales.filter((r) => r.percentage_rate < avgRate * 0.8 && r.avg_reported_sales > 50000);
    if (belowAvg.length > 3) {
      insights.push({
        id: makeId(),
        type: "revenue_contracts",
        severity: "opportunity",
        title: `Average percentage rate is ${avgRate.toFixed(1)}% — ${belowAvg.length} tenants pay below category average`,
        message: `${belowAvg.length} tenants pay a percentage rate more than 20% below the mall average of ${avgRate.toFixed(1)}%. At renewal, these rates should be brought in line with market standards.`,
        impact_egp: Math.round(belowAvg.reduce((s, r) => s + r.avg_reported_sales * (avgRate - r.percentage_rate) / 100, 0) * 12),
        confidence: 0.7,
        source_modules: ["revenue", "contracts"],
        recommended_action: "Flag these leases for percentage rate increase at renewal. Use category benchmarks in negotiations.",
        link: "/dashboard/contracts",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Real JDE Data Insights (NEW) ──
  // ══════════════════════════════════════════════════════════

  const rentTx = rentTransactionsResult.data || [];
  if (rentTx.length > 0 && portfolio) {
    const totalCollected = rentTx.reduce((s: number, t: any) => s + (Number(t.amount_paid) || 0), 0);

    // Spinneys anchor dependency
    const spinneysTx = rentTx.filter((t: any) => t.lease?.tenant?.brand_name?.toLowerCase().includes("spinneys"));
    const spinneysRent = spinneysTx.reduce((s: number, t: any) => s + (Number(t.amount_paid) || 0), 0);
    if (spinneysRent > 0 && totalCollected > 0) {
      const spinPct = (spinneysRent / totalCollected) * 100;
      if (spinPct > 8) {
        insights.push({
          id: makeId(),
          type: "jde_data",
          severity: "info",
          title: `Spinneys contributes ${spinPct.toFixed(1)}% of total rent — anchor tenant dependency`,
          message: `Spinneys pays EGP ${Math.round(spinneysRent).toLocaleString()}/month, making it the highest-paying tenant at ${spinPct.toFixed(1)}% of total rent. Ensure early renewal engagement and competitive terms to retain this anchor.`,
          impact_egp: Math.round(spinneysRent * 12),
          confidence: 0.95,
          source_modules: ["finance", "contracts"],
          recommended_action: "Begin renewal discussions 18 months before expiry. Benchmark against competing locations.",
          link: "/dashboard/contracts",
        });
      }
    }

    // Kiosk area performance
    const kiosks = kiosksResult.data || [];
    if (kiosks.length > 3) {
      const kioskRent = kiosks.reduce((s: number, k: any) => s + (k.min_rent_monthly_egp || 0), 0);
      const kioskArea = kiosks.reduce((s: number, k: any) => s + (k.unit?.area_sqm || 0), 0);
      const kioskRentPerSqm = kioskArea > 0 ? kioskRent / kioskArea : 0;
      if (kioskRentPerSqm > 0) {
        insights.push({
          id: makeId(),
          type: "jde_data",
          severity: "opportunity",
          title: `Kiosk area generates EGP ${Math.round(kioskRent).toLocaleString()}/month from ${kiosks.length} tenants — highest rent/sqm in the mall`,
          message: `Kiosks generate EGP ${Math.round(kioskRentPerSqm).toLocaleString()}/sqm/month — significantly above the mall average of EGP ${portfolio.avg_rent_per_sqm}/sqm. Consider adding more kiosk positions in high-traffic corridors.`,
          impact_egp: Math.round(kioskRentPerSqm * 20 * 12),
          confidence: 0.85,
          source_modules: ["finance", "contracts"],
          recommended_action: "Identify 3-5 additional kiosk positions in high-traffic areas. Kiosks offer highest ROI per sqm.",
          link: "/dashboard/contracts",
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Learning Engine Status (NEW) ──
  // ══════════════════════════════════════════════════════════

  if (learningStats && learningStats.params_calibrated > 0) {
    insights.push({
      id: makeId(),
      type: "learning",
      severity: "info",
      title: `${learningStats.params_calibrated} parameters calibrated, ${learningStats.patterns_discovered} patterns discovered — model accuracy improving`,
      message: `Wedja has been learning for ${learningStats.days_of_learning} days. ${learningStats.params_calibrated} conversion rates calibrated from real data. Average confidence: ${learningStats.avg_confidence}%. ${learningStats.top_improvements.length > 0 ? `Top improvement: ${learningStats.top_improvements[0].entity_name} conversion calibrated from ${(learningStats.top_improvements[0].initial_value * 100).toFixed(1)}% to ${(learningStats.top_improvements[0].learned_value * 100).toFixed(1)}%.` : ""}`,
      impact_egp: 0,
      confidence: 0.9,
      source_modules: ["learning"],
      recommended_action: "Continue running daily learning cycles. Review calibrated parameters monthly for accuracy.",
      link: "/dashboard/ai/learning",
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── Footfall + Energy ──
  // ══════════════════════════════════════════════════════════

  if (energyEfficiency.length > 0) {
    const parkingZone = energyEfficiency.find((z) => z.zone_type === "parking");
    if (parkingZone && parkingZone.energy_kwh > 0) {
      insights.push({
        id: makeId(),
        type: "footfall_energy",
        severity: "opportunity",
        title: "Parking zone consumes energy but generates no revenue",
        message: `Parking uses ${parkingZone.energy_kwh.toLocaleString()} kWh/week (EGP ${parkingZone.energy_cost_egp.toLocaleString()}) with no direct revenue. Install EV charging stations or paid parking to monetise.`,
        impact_egp: Math.round(parkingZone.energy_cost_egp * 4 * 12),
        confidence: 0.7,
        source_modules: ["energy", "footfall"],
        recommended_action: "Evaluate EV charging installation — typical payback 18-24 months with growing EV adoption",
        link: "/dashboard/energy",
      });
    }

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
          message: `Food Court uses ${foodZone.kwh_per_visitor.toFixed(2)} kWh per visitor vs ${avgRetailKwhPerVisitor.toFixed(2)} kWh for retail. HVAC inefficiency or equipment issues suspected.`,
          impact_egp: Math.round(foodZone.energy_cost_egp * 0.2 * 4 * 12),
          confidence: 0.68,
          source_modules: ["energy", "footfall"],
          recommended_action: "Audit Food Court HVAC settings. Check kitchen exhaust systems. Consider heat recovery.",
          link: "/dashboard/energy",
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Footfall + Marketing ──
  // ══════════════════════════════════════════════════════════

  if (marketingOverview && footfallOverview && peakPatterns) {
    if (marketingOverview.active_events.count > 0 && footfallOverview.change_vs_last_week_pct > 10) {
      insights.push({
        id: makeId(),
        type: "footfall_marketing",
        severity: "opportunity",
        title: `Active events correlating with ${footfallOverview.change_vs_last_week_pct}% footfall increase`,
        message: `Footfall is up ${footfallOverview.change_vs_last_week_pct}% vs last week while ${marketingOverview.active_events.count} event(s) are active. Track and replicate successful formats.`,
        impact_egp: 0,
        confidence: 0.6,
        source_modules: ["marketing", "footfall"],
        recommended_action: "Document this event format and budget for repetition. Measure conversion to sales.",
        link: "/dashboard/marketing",
      });
    }

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

  // ══════════════════════════════════════════════════════════
  // ── Contracts + Tenant Performance ──
  // ══════════════════════════════════════════════════════════

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
        message: `${names}${replaceable.length > 3 ? ` and ${replaceable.length - 3} more` : ""} occupy ${totalArea.toLocaleString()} sqm but underperform zone averages.`,
        impact_egp: Math.round(totalGain * 12),
        confidence: 0.65,
        source_modules: ["contracts", "tenant-analytics"],
        recommended_action: "Do not renew these leases without significant rent increases. Begin replacement tenant search.",
        link: "/dashboard/tenant-analytics",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Maintenance + Energy ──
  // ══════════════════════════════════════════════════════════

  const openTickets = maintenanceResult.data || [];
  if (openTickets.length > 0 && energyByZone.length > 0) {
    const hvacTickets = openTickets.filter((t: any) => t.category === "hvac");
    if (hvacTickets.length > 0) {
      const hvacZoneIds = new Set(hvacTickets.map((t: any) => t.zone_id).filter(Boolean));
      const affectedZones = energyByZone.filter((z) => hvacZoneIds.has(z.zone_id));
      if (affectedZones.length > 0) {
        const totalEnergyCost = affectedZones.reduce((s, z) => s + z.cost_egp, 0);
        insights.push({
          id: makeId(),
          type: "maintenance_energy",
          severity: hvacTickets.length >= 3 ? "critical" : "warning",
          title: `${hvacTickets.length} HVAC tickets in zones consuming EGP ${totalEnergyCost.toLocaleString()}/day energy`,
          message: `HVAC maintenance issues are likely increasing energy consumption. Resolving these could reduce energy waste by 15-20%.`,
          impact_egp: Math.round(totalEnergyCost * 30 * 0.2 * 12),
          confidence: 0.7,
          source_modules: ["maintenance", "energy", "finance"],
          recommended_action: "Prioritise HVAC repairs — broken units increase energy costs.",
          link: "/dashboard/maintenance",
        });
      }
    }
  }

  // ── Tenant Mix ──
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
        message: `Space allocation mismatch: ${biggest.category} category is over-represented relative to its revenue contribution at EGP ${biggest.revenue_per_sqm}/sqm.`,
        impact_egp: Math.round((biggest.area_pct - biggest.revenue_pct) / 100 * tenantMix.total_revenue_egp * 0.5 * 12),
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

  // ══════════════════════════════════════════════════════════
  // ── Percentage Rent + Inflation Hedge ──
  // ══════════════════════════════════════════════════════════

  if (percentageRentData && percentageRentData.total_gap_egp > 0) {
    insights.push({
      id: makeId(),
      type: "revenue_footfall",
      severity: percentageRentData.total_gap_egp > 200000 ? "critical" : percentageRentData.total_gap_egp > 50000 ? "warning" : "opportunity",
      title: `EGP ${Math.round(percentageRentData.total_gap_egp).toLocaleString()}/month potential percentage rent not being collected`,
      message: `Based on footfall-estimated sales, ${percentageRentData.tenants_with_gap.length} tenants should be paying higher percentage rent than they currently do. Total gap between collected and potential rent is EGP ${Math.round(percentageRentData.total_gap_egp).toLocaleString()}/month (EGP ${Math.round(percentageRentData.total_gap_egp * 12).toLocaleString()}/year).`,
      impact_egp: Math.round(percentageRentData.total_gap_egp * 12),
      confidence: 0.78,
      source_modules: ["revenue", "contracts", "percentage-rent"],
      recommended_action: "Review percentage rent gap analysis and verify tenant sales reporting for top underperformers",
      link: "/dashboard/percentage-rent",
    });
  }

  if (inflationHedgeData && inflationHedgeData.hedge_ratio < 50) {
    insights.push({
      id: makeId(),
      type: "general",
      severity: inflationHedgeData.hedge_ratio < 20 ? "warning" : "opportunity",
      title: `Inflation hedge ratio at ${inflationHedgeData.hedge_ratio.toFixed(1)}% — below 50% target`,
      message: `Only ${inflationHedgeData.hedge_ratio.toFixed(1)}% of revenue automatically adjusts with inflation through percentage rent. If EGP devalues 10%, revenue only increases by ${inflationHedgeData.devaluation_10pct_increase_pct.toFixed(1)}%. ${inflationHedgeData.tenants_with_zero_rate.length > 0 ? `${inflationHedgeData.tenants_with_zero_rate.length} tenants have 0% rate — no inflation protection at all.` : ""}`,
      impact_egp: Math.round(inflationHedgeData.total_monthly_revenue_egp * 0.1 * (50 - inflationHedgeData.hedge_ratio) / 100 * 12),
      confidence: 0.85,
      source_modules: ["contracts", "percentage-rent", "finance"],
      recommended_action: inflationHedgeData.tenants_with_zero_rate.length > 0
        ? `Renegotiate percentage rent clauses for ${inflationHedgeData.tenants_with_zero_rate.length} tenants with 0% rate at lease renewal to improve inflation protection`
        : "Increase percentage rates at lease renewals to improve inflation hedge ratio",
      link: "/dashboard/percentage-rent",
    });
  }

  if (inflationHedgeData && inflationHedgeData.tenants_with_zero_rate.length > 3) {
    const zeroNames = inflationHedgeData.tenants_with_zero_rate.slice(0, 5).map(t => t.brand_name).join(", ");
    const totalFixedRent = inflationHedgeData.tenants_with_zero_rate.reduce((s, t) => s + t.min_rent, 0);
    insights.push({
      id: makeId(),
      type: "general",
      severity: "opportunity",
      title: `${inflationHedgeData.tenants_with_zero_rate.length} tenants with 0% rate — renegotiate for inflation protection`,
      message: `${zeroNames}${inflationHedgeData.tenants_with_zero_rate.length > 5 ? ` and ${inflationHedgeData.tenants_with_zero_rate.length - 5} more` : ""} pay only fixed rent (EGP ${Math.round(totalFixedRent).toLocaleString()}/month combined) with no percentage component. This revenue erodes with inflation.`,
      impact_egp: Math.round(totalFixedRent * 0.1 * 12),
      confidence: 0.9,
      source_modules: ["contracts", "percentage-rent"],
      recommended_action: "Add percentage rent clauses at next lease renewal for all tenants currently at 0% rate",
      link: "/dashboard/percentage-rent",
    });
  }

  // Anomaly Detection insights
  const anomalyStatsData = await getAnomalyStats(supabase, propertyId).catch(() => null);
  if (anomalyStatsData && anomalyStatsData.active_count > 0) {
    const critCount = anomalyStatsData.by_severity.critical || 0;
    const totalImpact = anomalyStatsData.total_impact_egp || 0;

    if (critCount > 0) {
      insights.push({
        id: makeId(),
        type: "general",
        severity: "critical",
        title: `${critCount} critical anomal${critCount === 1 ? "y" : "ies"} requiring immediate attention`,
        message: `The anomaly detection engine has flagged ${critCount} critical issue${critCount === 1 ? "" : "s"} across property systems. Total estimated financial impact: EGP ${totalImpact.toLocaleString()}. ${anomalyStatsData.most_common_type ? `Most common type: ${anomalyStatsData.most_common_type.type.replace(/_/g, " ")}.` : ""}`,
        impact_egp: totalImpact,
        confidence: anomalyStatsData.avg_detection_confidence || 0.85,
        source_modules: ["anomaly-detection"],
        recommended_action: "Review anomaly dashboard immediately and address critical alerts",
        link: "/dashboard/anomalies",
      });
    } else if (anomalyStatsData.active_count >= 5) {
      insights.push({
        id: makeId(),
        type: "general",
        severity: "warning",
        title: `${anomalyStatsData.active_count} active anomalies detected across property systems`,
        message: `The watchdog has detected ${anomalyStatsData.active_count} anomalies. ${anomalyStatsData.most_anomalous_zone ? `Most affected zone: ${anomalyStatsData.most_anomalous_zone.zone_name} (${anomalyStatsData.most_anomalous_zone.count} anomalies).` : ""} Total estimated impact: EGP ${totalImpact.toLocaleString()}.`,
        impact_egp: totalImpact,
        confidence: anomalyStatsData.avg_detection_confidence || 0.8,
        source_modules: ["anomaly-detection"],
        recommended_action: "Review anomaly dashboard and triage active alerts by severity",
        link: "/dashboard/anomalies",
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── ML Prediction Insights ──
  // ══════════════════════════════════════════════════════════

  try {
    const [footfallForecast, revenueForecast] = await Promise.all([
      forecastFootfall(supabase, 30, propertyId).catch(() => null),
      forecastRevenue(supabase, 6, propertyId).catch(() => null),
    ]);

    if (footfallForecast) {
      const avgPredicted = Math.round(
        footfallForecast.predictions.reduce((s, p) => s + p.predicted_value, 0) /
          footfallForecast.predictions.length
      );
      const trendDirection = footfallForecast.model.trend_slope > 0 ? "growing" : "declining";
      const trendMagnitude = Math.abs(footfallForecast.model.trend_slope).toFixed(1);

      insights.push({
        id: makeId(),
        type: "general",
        severity: footfallForecast.model.trend_slope < -5 ? "warning" : "info",
        title: `ML Forecast: Footfall ${trendDirection} at ${trendMagnitude} visitors/day — 30-day avg: ${avgPredicted.toLocaleString()}`,
        message: `Trained on ${footfallForecast.model.training_samples.toLocaleString()} data points (R²=${footfallForecast.model.r_squared.toFixed(3)}). Model predicts average daily footfall of ${avgPredicted.toLocaleString()} visitors over the next 30 days.`,
        impact_egp: 0,
        confidence: Math.min(0.95, footfallForecast.model.r_squared + 0.1),
        source_modules: ["footfall", "ml-predictions"],
        recommended_action: "Review footfall predictions dashboard for daily breakdowns and confidence intervals",
        link: "/dashboard/ai/predictions",
      });
    }

    if (revenueForecast) {
      const totalPredicted = revenueForecast.predictions.reduce(
        (s, p) => s + p.predicted_value, 0
      );
      const trendDirection = revenueForecast.model.trend_slope > 0 ? "growing" : "declining";

      insights.push({
        id: makeId(),
        type: "general",
        severity: revenueForecast.model.trend_slope < 0 ? "warning" : "opportunity",
        title: `ML Forecast: Revenue ${trendDirection} — next 6 months predicted: EGP ${Math.round(totalPredicted).toLocaleString()}`,
        message: `Revenue model trained on ${revenueForecast.model.training_samples.toLocaleString()} transactions (R²=${revenueForecast.model.r_squared.toFixed(3)}, MAPE=${revenueForecast.model.accuracy_mape.toFixed(1)}%). 6-month collection forecast based on trend + seasonal patterns.`,
        impact_egp: Math.round(totalPredicted),
        confidence: Math.min(0.95, revenueForecast.model.r_squared + 0.1),
        source_modules: ["revenue", "ml-predictions"],
        recommended_action: "Review revenue predictions and plan cash flow based on ML-forecasted collection",
        link: "/dashboard/ai/predictions",
      });
    }
  } catch {
    // ML predictions are non-critical — silently skip if they fail
  }

  // Sort by impact_egp descending (highest money impact first)
  insights.sort((a, b) => b.impact_egp - a.impact_egp);

  return insights;
}

// ── 2. Property Health Score (10 dimensions now) ─────────────

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
    cctvOverview,
    securityData,
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
    getCCTVDashboardData(supabase, propertyId).catch(() => null),
    getSecurityAlerts(supabase, propertyId, "active").catch(() => null),
  ]);

  // ── Revenue Health (0-15) ──
  const rentTx = rentResult.data || [];
  const totalRentTx = rentTx.length;
  const paidTx = rentTx.filter((r: any) => r.status === "paid").length;
  const overdueTx = rentTx.filter((r: any) => r.status === "overdue").length;
  const collectionRate = totalRentTx > 0 ? paidTx / totalRentTx : 1;
  let revenueScore = Math.round(collectionRate * 10);
  if (overdueTx === 0) revenueScore += 5;
  else if (overdueTx <= 3) revenueScore += 2;
  revenueScore = Math.min(revenueScore, 15);
  const revenueDetail = `${paidTx}/${totalRentTx} paid (${(collectionRate * 100).toFixed(0)}%), ${overdueTx} overdue`;

  // ── Occupancy Health (0-10) ──
  const units = unitsResult.data || [];
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u: any) => u.status === "occupied").length;
  const occupancyRate = totalUnits > 0 ? occupiedUnits / totalUnits : 1;
  const occupancyScore = Math.min(Math.round(occupancyRate * 10), 10);
  const occupancyDetail = `${occupiedUnits}/${totalUnits} occupied (${(occupancyRate * 100).toFixed(0)}%)`;

  // ── Tenant Quality (0-10) ──
  const discrepancies = discrepancyResult.data || [];
  const highRiskDisc = discrepancies.filter((d: any) => d.confidence >= 0.75 && d.status !== "resolved" && d.status !== "dismissed");
  let tenantScore = 10;
  if (highRiskDisc.length > 5) tenantScore -= 6;
  else if (highRiskDisc.length > 2) tenantScore -= 3;
  else if (highRiskDisc.length > 0) tenantScore -= 1;
  tenantScore = Math.max(tenantScore, 0);
  const tenantDetail = `${highRiskDisc.length} high-risk discrepancies this month`;

  // ── Contract Health (0-10) ──
  const leases = leasesResult.data || [];
  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const expiringCount = leases.filter((l: any) => new Date(l.end_date) <= ninetyDays).length;
  const wale = portfolio?.wale_years || 0;
  let contractScore = 10;
  if (wale < 2) contractScore -= 4;
  else if (wale < 3) contractScore -= 2;
  if (expiringCount > 5) contractScore -= 4;
  else if (expiringCount > 2) contractScore -= 2;
  contractScore = Math.max(contractScore, 0);
  const contractDetail = `WALE ${wale.toFixed(1)} years, ${expiringCount} expiring in 90 days`;

  // ── Energy Efficiency (0-10) ──
  let energyScore = 5;
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

  // ── Marketing Effectiveness (0-5) ──
  let marketingScore = 2;
  if (marketingOverview) {
    if (marketingOverview.active_events.count > 0) marketingScore += 1;
    if (marketingOverview.active_campaigns.count > 0) marketingScore += 1;
    if (marketingOverview.active_promotions > 0) marketingScore += 1;
  }
  marketingScore = Math.min(marketingScore, 5);
  const marketingDetail = marketingOverview
    ? `${marketingOverview.active_events.count} events, ${marketingOverview.active_campaigns.count} campaigns`
    : "No marketing data";

  // ── Financial Health (0-10) ──
  let financialScore = 5;
  if (financeOverview) {
    if (financeOverview.profit_margin_pct > 40) financialScore = 10;
    else if (financeOverview.profit_margin_pct > 30) financialScore = 8;
    else if (financeOverview.profit_margin_pct > 20) financialScore = 6;
    else if (financeOverview.profit_margin_pct > 10) financialScore = 4;
    else if (financeOverview.profit_margin_pct > 0) financialScore = 2;
    else financialScore = 0;
  }
  const financialDetail = financeOverview
    ? `${financeOverview.profit_margin_pct.toFixed(0)}% margin, EGP ${Math.round(financeOverview.overdue_rent_egp).toLocaleString()} overdue`
    : "No financial data";

  // ── CCTV/Security Health (0-10) (NEW) ──
  let cctvScore = 7;
  if (cctvOverview) {
    const cameraUptime = cctvOverview.cameras_total > 0 ? (cctvOverview.cameras_online / cctvOverview.cameras_total) * 100 : 0;
    if (cameraUptime >= 95) cctvScore += 2;
    else if (cameraUptime >= 80) cctvScore += 1;
    else cctvScore -= 2;
  }
  if (securityData) {
    const criticalAlerts = securityData.active_alerts.filter((a) => a.severity === "critical");
    if (criticalAlerts.length > 0) cctvScore -= Math.min(criticalAlerts.length * 3, 6);
    if (securityData.total_active === 0) cctvScore += 1;
  }
  cctvScore = Math.max(0, Math.min(cctvScore, 10));
  const cctvDetail = cctvOverview
    ? `${cctvOverview.cameras_online}/${cctvOverview.cameras_total} cameras online, ${cctvOverview.security_alerts} alerts`
    : "No CCTV data";

  // ── Social Media Health (0-10) (NEW) ──
  let socialScore = 5;
  if (socialOverview) {
    const totalFollowers = socialOverview.total_followers;
    const growth = socialOverview.platforms.reduce((s, p) => s + p.follower_growth_30d, 0);
    if (totalFollowers > 50000) socialScore += 2;
    else if (totalFollowers > 20000) socialScore += 1;
    if (growth > 500) socialScore += 2;
    else if (growth > 100) socialScore += 1;
    const postsThisMonth = socialOverview.platforms.reduce((s, p) => s + p.posts_this_month, 0);
    if (postsThisMonth >= 15) socialScore += 1;
  }
  socialScore = Math.min(socialScore, 10);
  const socialDetail = socialOverview
    ? `${socialOverview.total_followers.toLocaleString()} followers, ${socialOverview.best_platform} best platform`
    : "No social data";

  const total = revenueScore + occupancyScore + tenantScore + contractScore + energyScore + maintenanceScore + marketingScore + financialScore + cctvScore + socialScore;

  return {
    total,
    revenue: { score: revenueScore, max: 15, detail: revenueDetail, link: "/dashboard/discrepancies" },
    occupancy: { score: occupancyScore, max: 10, detail: occupancyDetail, link: "/dashboard/contracts" },
    tenant_quality: { score: tenantScore, max: 10, detail: tenantDetail, link: "/dashboard/tenant-analytics" },
    contracts: { score: contractScore, max: 10, detail: contractDetail, link: "/dashboard/contracts" },
    energy: { score: energyScore, max: 10, detail: energyDetail, link: "/dashboard/energy" },
    maintenance: { score: maintenanceScore, max: 10, detail: maintenanceDetail, link: "/dashboard/maintenance" },
    marketing: { score: marketingScore, max: 5, detail: marketingDetail, link: "/dashboard/marketing" },
    financial: { score: financialScore, max: 10, detail: financialDetail, link: "/dashboard/finance" },
    cctv_security: { score: cctvScore, max: 10, detail: cctvDetail, link: "/dashboard/cctv" },
    social_media: { score: socialScore, max: 10, detail: socialDetail, link: "/dashboard/social" },
  };
}

// ── 3. Daily Briefing (10 sections now) ─────────────────────

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
    cctvOverview,
    securityData,
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
    getCCTVDashboardData(supabase, propertyId).catch(() => null),
    getSecurityAlerts(supabase, propertyId, "active").catch(() => null),
  ]);

  // Revenue
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

  // Footfall
  const footfallItems: BriefingSection["items"] = [];
  if (footfallOverview) {
    if (footfallOverview.total_visitors_yesterday > 0) {
      footfallItems.push({
        text: `Yesterday: ${footfallOverview.total_visitors_yesterday.toLocaleString()} visitors`,
        trend: footfallOverview.change_vs_yesterday_pct > 0 ? "up" : footfallOverview.change_vs_yesterday_pct < 0 ? "down" : "neutral",
      });
    }
    footfallItems.push({ text: `30-day average: ${footfallOverview.avg_daily_visitors.toLocaleString()}/day` });
  } else {
    footfallItems.push({ text: "No footfall data available" });
  }

  // Contracts
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

  // Energy
  const energyItems: BriefingSection["items"] = [];
  if (energyOverview) {
    energyItems.push({ text: `Today: ${energyOverview.total_consumption_kwh_today.toLocaleString()} kWh — EGP ${energyOverview.total_cost_egp_today.toLocaleString()}` });
    if (energyOverview.change_vs_yesterday_pct !== 0) {
      energyItems.push({
        text: `${energyOverview.change_vs_yesterday_pct > 0 ? "Up" : "Down"} ${Math.abs(energyOverview.change_vs_yesterday_pct)}% vs yesterday`,
        trend: energyOverview.change_vs_yesterday_pct > 0 ? "down" : "up",
        alert: energyOverview.change_vs_yesterday_pct > 15,
      });
    }
  } else {
    energyItems.push({ text: "No energy data available" });
  }

  // Maintenance
  const maintenanceItems: BriefingSection["items"] = [];
  const tickets = maintenanceResult.data || [];
  if (tickets.length > 0) {
    const urgentCount = tickets.filter((t: any) => t.priority === "urgent" || t.priority === "emergency").length;
    maintenanceItems.push({ text: `${tickets.length} open tickets`, alert: urgentCount > 0 });
    if (urgentCount > 0) {
      maintenanceItems.push({ text: `${urgentCount} urgent/emergency need attention`, alert: true });
    }
  } else {
    maintenanceItems.push({ text: "No open maintenance tickets", trend: "up" });
  }

  // Marketing
  const marketingItems: BriefingSection["items"] = [];
  if (marketingOverview) {
    if (marketingOverview.active_events.count > 0) marketingItems.push({ text: `${marketingOverview.active_events.count} active event(s)`, trend: "up" });
    if (marketingOverview.upcoming_events.count > 0) marketingItems.push({ text: `${marketingOverview.upcoming_events.count} events upcoming in 30 days` });
    if (marketingOverview.active_campaigns.count > 0) marketingItems.push({ text: `${marketingOverview.active_campaigns.count} campaign(s) running` });
    if (marketingItems.length === 0) marketingItems.push({ text: "No active events or campaigns" });
  } else {
    marketingItems.push({ text: "No marketing data available" });
  }

  // Finance
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

  // CCTV/Security (NEW)
  const cctvItems: BriefingSection["items"] = [];
  if (cctvOverview) {
    cctvItems.push({ text: `${cctvOverview.cameras_online}/${cctvOverview.cameras_total} cameras online` });
    if (cctvOverview.security_alerts > 0) {
      cctvItems.push({ text: `${cctvOverview.security_alerts} active security alerts`, alert: true });
    } else {
      cctvItems.push({ text: "No active security alerts", trend: "up" });
    }
    cctvItems.push({ text: `Parking: ${cctvOverview.parking_occupancy_pct.toFixed(0)}% full` });
  } else {
    cctvItems.push({ text: "No CCTV data available" });
  }

  // Social Media (NEW)
  const socialItems: BriefingSection["items"] = [];
  if (socialOverview) {
    socialItems.push({ text: `${socialOverview.total_followers.toLocaleString()} total followers` });
    const growth = socialOverview.platforms.reduce((s, p) => s + p.follower_growth_30d, 0);
    if (growth > 0) socialItems.push({ text: `+${growth.toLocaleString()} followers in 30 days`, trend: "up" });
    socialItems.push({ text: `Best platform: ${socialOverview.best_platform}` });
  } else {
    socialItems.push({ text: "No social data available" });
  }

  // Learning
  const learningItems: BriefingSection["items"] = [];
  if (learningStats) {
    learningItems.push({ text: `${learningStats.days_of_learning} days of learning, ${learningStats.params_calibrated} params calibrated` });
    learningItems.push({ text: `${learningStats.patterns_discovered} patterns, avg confidence ${learningStats.avg_confidence}%` });
  } else {
    learningItems.push({ text: "Learning engine initializing" });
  }

  // Top 5 Actions
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
  if (overdueTransactions.length > 0 && topActions.length < 5) {
    topActions.push({ text: `Follow up on ${overdueTransactions.length} overdue payment(s)`, link: "/dashboard/finance", priority: "high" });
  }
  if (securityData && securityData.total_active > 0 && topActions.length < 5) {
    topActions.push({ text: `Review ${securityData.total_active} active security alert(s)`, link: "/dashboard/cctv", priority: "medium" });
  }
  if (topActions.length < 5 && marketingOverview?.next_major_season && marketingOverview.days_until_next_season <= 30 && marketingOverview.days_until_next_season > 0) {
    topActions.push({ text: `Prepare for ${marketingOverview.next_major_season.name} (${marketingOverview.days_until_next_season} days)`, link: "/dashboard/marketing", priority: "medium" });
  }
  if (topActions.length < 5) {
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
      cctv: { title: "CCTV/Security", icon: "Shield", items: cctvItems },
      social: { title: "Social Media", icon: "Wifi", items: socialItems },
      learning: { title: "AI Learning", icon: "Brain", items: learningItems },
    },
    top_actions: topActions.slice(0, 5),
  };
}

// ── 4. Property Snapshot (expanded with 16 metrics) ────────

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
    cctvOverview,
    storeConversion,
    deadZones,
    queueStatus,
    kiosksResult,
    anomalyStats,
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
    getCCTVDashboardData(supabase, propertyId).catch(() => null),
    getStoreConversion(supabase, propertyId).catch(() => null),
    getDeadZones(supabase, propertyId).catch(() => []),
    getQueueStatus(supabase, propertyId).catch(() => null),
    supabase
      .from("leases")
      .select("id, min_rent_monthly_egp, tenant:tenants!inner(brand_name, brand_type)")
      .eq("property_id", propertyId)
      .eq("status", "active")
      .eq("tenants.brand_type", "kiosk"),
    getAnomalyStats(supabase, propertyId).catch(() => null),
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

  // Revenue
  const revenueThisMonth = (rentResult.data || []).reduce(
    (s: number, t: any) => s + (Number(t.amount_paid) || 0), 0
  );

  // Maintenance
  const openTickets = maintenanceResult.data || [];
  const urgentTickets = openTickets.filter((t: any) => t.priority === "urgent" || t.priority === "emergency");

  // Social
  const totalFollowers = socialOverview?.total_followers || 0;
  const socialGrowth = socialOverview?.platforms.reduce((s, p) => s + p.follower_growth_30d, 0) || 0;

  // New metrics
  const totalMonthlyRent = portfolio?.total_contracted_rent || 0;
  const topTenantByRent = portfolio?.tenant_concentration?.[0]?.brand_name || "N/A";
  const kioskRevenue = (kiosksResult.data || []).reduce((s: number, k: any) => s + (k.min_rent_monthly_egp || 0), 0);
  const cctvAlerts = cctvOverview?.security_alerts || 0;
  const parkingOccPct = cctvOverview?.parking_occupancy_pct || 0;
  const storeAvgConv = storeConversion?.avg_conversion_rate || 0;
  const deadZoneCount = deadZones.filter((z) => z.relative_traffic < 20).length;
  const queueAlerts = queueStatus?.alerts_count || 0;

  return {
    tenants: { total: tenants.length, by_category: byCategory },
    occupancy_rate: Math.round(occupancyRate * 10) / 10,
    revenue_this_month: Math.round(revenueThisMonth),
    revenue_trend: 0,
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
    top_insights: insights.slice(0, 5),
    // New fields
    total_monthly_rent_egp: Math.round(totalMonthlyRent),
    top_tenant_by_rent: topTenantByRent,
    kiosk_revenue_total: Math.round(kioskRevenue),
    cctv_alerts_active: cctvAlerts,
    parking_occupancy_pct: Math.round(parkingOccPct),
    social_followers_total: totalFollowers,
    store_avg_conversion_rate: Math.round(storeAvgConv * 10) / 10,
    dead_zones_count: deadZoneCount,
    queue_alerts_active: queueAlerts,
    anomalies_active: anomalyStats?.active_count || 0,
    anomalies_critical: anomalyStats?.by_severity.critical || 0,
  };
}
