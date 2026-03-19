import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Wedja Marketing & Events Engine
//
// Manages events, campaigns, seasonal calendar, tenant promotions,
// and correlates marketing activity with footfall and revenue data.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface MarketingOverview {
  active_events: { count: number; list: EventSummary[] };
  upcoming_events: { count: number; list: EventSummary[] };
  active_campaigns: { count: number; list: CampaignSummary[] };
  active_promotions: number;
  total_marketing_spend_this_month: number;
  next_major_season: SeasonalItem | null;
  days_until_next_season: number;
}

export interface EventSummary {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  status: string;
  expected_footfall_boost_pct: number;
  actual_footfall_boost_pct: number | null;
  budget_egp: number | null;
  location: string | null;
  target_audience: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  campaign_type: string;
  start_date: string;
  end_date: string;
  budget_egp: number | null;
  spend_egp: number;
  status: string;
  roi_pct: number | null;
  channels: string[];
}

export interface SeasonalItem {
  id: string;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  footfall_impact: string;
  revenue_impact: string;
  tourist_ratio_change: string | null;
  planning_notes: string | null;
  is_recurring: boolean;
  days_away: number | null;
  planning_status: string;
  ai_recommendation: string;
}

export interface EventPerformance {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  expected_boost: number;
  actual_boost: number | null;
  budget_egp: number | null;
  actual_cost_egp: number | null;
  revenue_impact_egp: number | null;
  roi_pct: number | null;
  budget_variance_pct: number | null;
  performance_rating: "overperformer" | "on_target" | "underperformer";
}

export interface CampaignROI {
  id: string;
  name: string;
  campaign_type: string;
  budget_egp: number | null;
  spend_egp: number;
  roi_pct: number | null;
  status: string;
  start_date: string;
  end_date: string;
  kpi_target: string | null;
  kpi_actual: string | null;
}

export interface CampaignROISummary {
  campaigns: CampaignROI[];
  total_spend: number;
  avg_roi: number;
  best_campaign_type: string;
  recommendation: string;
}

export interface FootfallCorrelation {
  event_id: string;
  event_title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  baseline_daily_footfall: number;
  event_daily_footfall: number;
  actual_boost_pct: number;
}

export interface SeasonalAlert {
  id: string;
  name: string;
  type: string;
  days_away: number;
  urgency: "critical" | "warning" | "info";
  message: string;
  action_items: string[];
}

export interface TenantPromotion {
  id: string;
  tenant_id: string;
  tenant_name: string;
  title: string;
  promotion_type: string;
  start_date: string;
  end_date: string;
  discount_pct: number | null;
  footfall_impact_pct: number | null;
  revenue_impact_pct: number | null;
  status: string;
}

// ── Helpers ──────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function resolveSeasonDate(
  item: any,
  year: number
): { start: string | null; end: string | null } {
  // Use year-specific dates if available
  if (item.year_specific_start) {
    return {
      start: item.year_specific_start,
      end: item.year_specific_end || item.year_specific_start,
    };
  }
  // Fall back to typical month/day
  if (item.typical_start_month && item.typical_start_day) {
    const startYear =
      item.typical_end_month &&
      item.typical_end_month < item.typical_start_month
        ? year
        : year;
    const endYear =
      item.typical_end_month &&
      item.typical_end_month < item.typical_start_month
        ? year + 1
        : year;

    const start = `${startYear}-${String(item.typical_start_month).padStart(2, "0")}-${String(item.typical_start_day).padStart(2, "0")}`;
    const end = item.typical_end_month
      ? `${endYear}-${String(item.typical_end_month).padStart(2, "0")}-${String(item.typical_end_day || 1).padStart(2, "0")}`
      : start;
    return { start, end };
  }
  return { start: null, end: null };
}

function getPlanningStatus(daysAway: number | null): string {
  if (daysAway === null) return "N/A";
  if (daysAway < 0) return "In Progress";
  if (daysAway <= 7) return "Final Prep";
  if (daysAway <= 30) return "Active Planning";
  if (daysAway <= 60) return "Should Start";
  if (daysAway <= 90) return "Early Planning";
  return "Not Started";
}

function getAIRecommendation(name: string, daysAway: number | null, type: string, footfallImpact: string): string {
  if (daysAway === null) return "Set dates for this season to enable planning.";
  if (daysAway < 0) return "Currently active — monitor performance and adjust in real-time.";

  const urgencyMap: Record<string, number> = {
    very_high: 60,
    high: 45,
    moderate: 30,
    low: 14,
  };
  const planningLead = urgencyMap[footfallImpact] || 30;

  if (daysAway <= 7) {
    return `${name} is in ${daysAway} days — final preparations only. Ensure all logistics are confirmed.`;
  }
  if (daysAway <= planningLead) {
    return `Start ${name} campaign NOW. ${daysAway} days remaining. Book advertising, brief tenants, confirm event logistics.`;
  }
  if (daysAway <= planningLead * 1.5) {
    return `Begin planning for ${name}. ${daysAway} days away. Set budget, brief creative team, coordinate with tenants.`;
  }

  const typeHints: Record<string, string> = {
    religious: "Coordinate Eid/Ramadan decorations, extended hours, and tenant promotions.",
    national: "Plan family-oriented activities and food court specials.",
    international: "Prepare multilingual signage (English, Russian, German). Coordinate with hotels.",
    tourist_season: "Activate hotel partnerships, airport advertising, and multilingual content.",
    school_holiday: "Focus on family shopping promotions and kids activities.",
    shopping_event: "Coordinate tenant-wide discounts. Plan social media and billboard campaigns.",
  };

  return `${name} in ${daysAway} days. ${typeHints[type] || "Start strategic planning."} Recommended planning start: ${planningLead} days before.`;
}

// ── Engine Functions ──────────────────────────────────────────

export async function getMarketingOverview(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<MarketingOverview> {
  const today = todayStr();
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const thirtyDaysStr = thirtyDaysOut.toISOString().split("T")[0];

  const monthStart = today.slice(0, 7) + "-01";

  const [eventsResult, campaignsResult, promotionsResult, calendarResult] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, event_type, start_date, end_date, status, expected_footfall_boost_pct, actual_footfall_boost_pct, budget_egp, location, target_audience")
        .eq("property_id", propertyId)
        .in("status", ["active", "planned"])
        .order("start_date", { ascending: true }),
      supabase
        .from("campaigns")
        .select("id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, status, roi_pct, channels")
        .eq("property_id", propertyId)
        .in("status", ["active", "draft"]),
      supabase
        .from("tenant_promotions")
        .select("id")
        .eq("property_id", propertyId)
        .eq("status", "active"),
      supabase
        .from("seasonal_calendar")
        .select("*")
        .eq("property_id", propertyId),
    ]);

  const events = (eventsResult.data || []) as EventSummary[];
  const activeEvents = events.filter((e) => e.status === "active");
  const upcomingEvents = events.filter(
    (e) =>
      e.status === "planned" &&
      e.start_date <= thirtyDaysStr &&
      e.start_date >= today
  );

  const campaigns = (campaignsResult.data || []) as CampaignSummary[];
  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  // Calculate this month's marketing spend
  const allActiveCampaigns = (
    await supabase
      .from("campaigns")
      .select("spend_egp, start_date, end_date")
      .eq("property_id", propertyId)
      .lte("start_date", today)
      .gte("end_date", monthStart)
  ).data || [];

  const totalSpend = allActiveCampaigns.reduce(
    (sum: number, c: any) => sum + (c.spend_egp || 0),
    0
  );

  // Find next major season
  const currentYear = new Date().getFullYear();
  const calendarItems = (calendarResult.data || [])
    .map((item: any) => {
      const dates = resolveSeasonDate(item, currentYear);
      const da = dates.start ? daysUntil(dates.start) : null;
      return {
        ...item,
        resolved_start: dates.start,
        resolved_end: dates.end,
        days_away: da,
      };
    })
    .filter(
      (item: any) =>
        item.days_away !== null &&
        item.days_away > 0 &&
        (item.footfall_impact === "very_high" || item.footfall_impact === "high")
    )
    .sort((a: any, b: any) => (a.days_away || 999) - (b.days_away || 999));

  const nextSeason = calendarItems.length > 0 ? calendarItems[0] : null;
  const nextSeasonItem: SeasonalItem | null = nextSeason
    ? {
        id: nextSeason.id,
        name: nextSeason.name,
        type: nextSeason.type,
        start_date: nextSeason.resolved_start,
        end_date: nextSeason.resolved_end,
        footfall_impact: nextSeason.footfall_impact,
        revenue_impact: nextSeason.revenue_impact,
        tourist_ratio_change: nextSeason.tourist_ratio_change,
        planning_notes: nextSeason.planning_notes,
        is_recurring: nextSeason.is_recurring,
        days_away: nextSeason.days_away,
        planning_status: getPlanningStatus(nextSeason.days_away),
        ai_recommendation: getAIRecommendation(
          nextSeason.name,
          nextSeason.days_away,
          nextSeason.type,
          nextSeason.footfall_impact
        ),
      }
    : null;

  return {
    active_events: { count: activeEvents.length, list: activeEvents },
    upcoming_events: { count: upcomingEvents.length, list: upcomingEvents },
    active_campaigns: { count: activeCampaigns.length, list: activeCampaigns },
    active_promotions: (promotionsResult.data || []).length,
    total_marketing_spend_this_month: totalSpend,
    next_major_season: nextSeasonItem,
    days_until_next_season: nextSeasonItem?.days_away ?? -1,
  };
}

export async function getSeasonalCalendar(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  year?: number
): Promise<SeasonalItem[]> {
  const currentYear = year || new Date().getFullYear();

  const { data } = await supabase
    .from("seasonal_calendar")
    .select("*")
    .eq("property_id", propertyId)
    .order("typical_start_month", { ascending: true });

  if (!data || data.length === 0) return [];

  return data.map((item: any) => {
    const dates = resolveSeasonDate(item, currentYear);
    const da = dates.start ? daysUntil(dates.start) : null;

    return {
      id: item.id,
      name: item.name,
      type: item.type,
      start_date: dates.start,
      end_date: dates.end,
      footfall_impact: item.footfall_impact,
      revenue_impact: item.revenue_impact,
      tourist_ratio_change: item.tourist_ratio_change,
      planning_notes: item.planning_notes,
      is_recurring: item.is_recurring,
      days_away: da,
      planning_status: getPlanningStatus(da),
      ai_recommendation: getAIRecommendation(
        item.name,
        da,
        item.type,
        item.footfall_impact
      ),
    };
  });
}

export async function getEventPerformance(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<{ events: EventPerformance[]; ai_insight: string }> {
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .order("start_date", { ascending: false });

  if (!data || data.length === 0) {
    return { events: [], ai_insight: "No completed events to analyze yet." };
  }

  const events: EventPerformance[] = data.map((e: any) => {
    const actualBoost = e.actual_footfall_boost_pct;
    const expectedBoost = e.expected_footfall_boost_pct || 0;
    const budget = e.budget_egp;
    const actualCost = e.actual_cost_egp;
    const revenueImpact = e.revenue_impact_egp;

    // ROI: (revenue - cost) / cost * 100
    const roi =
      actualCost && revenueImpact
        ? Math.round(((revenueImpact - actualCost) / actualCost) * 10000) / 100
        : null;

    // Budget variance
    const budgetVar =
      budget && actualCost
        ? Math.round(((actualCost - budget) / budget) * 10000) / 100
        : null;

    // Performance rating
    let rating: EventPerformance["performance_rating"] = "on_target";
    if (actualBoost !== null && expectedBoost > 0) {
      const boostRatio = actualBoost / expectedBoost;
      if (boostRatio >= 1.1) rating = "overperformer";
      else if (boostRatio < 0.85) rating = "underperformer";
    }

    return {
      id: e.id,
      title: e.title,
      event_type: e.event_type,
      start_date: e.start_date,
      end_date: e.end_date,
      expected_boost: expectedBoost,
      actual_boost: actualBoost,
      budget_egp: budget,
      actual_cost_egp: actualCost,
      revenue_impact_egp: revenueImpact,
      roi_pct: roi,
      budget_variance_pct: budgetVar,
      performance_rating: rating,
    };
  });

  // Generate AI insight
  const overperformers = events.filter((e) => e.performance_rating === "overperformer");
  const underperformers = events.filter((e) => e.performance_rating === "underperformer");

  // Average ROI by event type
  const typeROI: Record<string, number[]> = {};
  events.forEach((e) => {
    if (e.roi_pct !== null) {
      if (!typeROI[e.event_type]) typeROI[e.event_type] = [];
      typeROI[e.event_type].push(e.roi_pct);
    }
  });

  let bestType = "";
  let bestAvgROI = 0;
  Object.entries(typeROI).forEach(([type, rois]) => {
    const avg = rois.reduce((a, b) => a + b, 0) / rois.length;
    if (avg > bestAvgROI) {
      bestAvgROI = avg;
      bestType = type;
    }
  });

  const insights: string[] = [];
  if (overperformers.length > 0) {
    const avgActualBoost =
      overperformers.reduce((sum, e) => sum + (e.actual_boost || 0), 0) /
      overperformers.length;
    insights.push(
      `${overperformers.length} events overperformed — avg actual boost of ${Math.round(avgActualBoost)}% vs expectations`
    );
  }
  if (underperformers.length > 0) {
    insights.push(
      `${underperformers.length} events underperformed. Review targeting and budget allocation.`
    );
  }
  if (bestType) {
    insights.push(
      `Best event type by ROI: ${bestType} events (avg ${Math.round(bestAvgROI)}% ROI). Allocate more budget here.`
    );
  }

  return {
    events,
    ai_insight:
      insights.length > 0
        ? insights.join(" ")
        : "Event performance data is building up. More analysis will be available after additional events.",
  };
}

export async function getCampaignROI(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<CampaignROISummary> {
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("property_id", propertyId)
    .order("start_date", { ascending: false });

  if (!data || data.length === 0) {
    return {
      campaigns: [],
      total_spend: 0,
      avg_roi: 0,
      best_campaign_type: "N/A",
      recommendation: "No campaign data available yet.",
    };
  }

  const campaigns: CampaignROI[] = data.map((c: any) => ({
    id: c.id,
    name: c.name,
    campaign_type: c.campaign_type,
    budget_egp: c.budget_egp,
    spend_egp: c.spend_egp || 0,
    roi_pct: c.roi_pct,
    status: c.status,
    start_date: c.start_date,
    end_date: c.end_date,
    kpi_target: c.kpi_target,
    kpi_actual: c.kpi_actual,
  }));

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend_egp, 0);

  // Average ROI from completed campaigns
  const completedWithROI = campaigns.filter(
    (c) => c.roi_pct !== null && c.status === "completed"
  );
  const avgROI =
    completedWithROI.length > 0
      ? Math.round(
          (completedWithROI.reduce((sum, c) => sum + (c.roi_pct || 0), 0) /
            completedWithROI.length) *
            100
        ) / 100
      : 0;

  // Best performing type
  const typeROI: Record<string, number[]> = {};
  completedWithROI.forEach((c) => {
    if (!typeROI[c.campaign_type]) typeROI[c.campaign_type] = [];
    typeROI[c.campaign_type].push(c.roi_pct || 0);
  });

  let bestType = "N/A";
  let bestAvg = 0;
  Object.entries(typeROI).forEach(([type, rois]) => {
    const avg = rois.reduce((a, b) => a + b, 0) / rois.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestType = type;
    }
  });

  const recommendation =
    bestType !== "N/A"
      ? `${bestType.replace(/_/g, " ")} campaigns deliver the highest ROI (avg ${Math.round(bestAvg)}%). Consider increasing budget allocation for this channel. Total marketing spend: EGP ${totalSpend.toLocaleString()}.`
      : "Continue building campaign data for better ROI analysis.";

  return {
    campaigns,
    total_spend: totalSpend,
    avg_roi: avgROI,
    best_campaign_type: bestType,
    recommendation,
  };
}

export async function getEventFootfallCorrelation(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<FootfallCorrelation[]> {
  // Get completed events
  const { data: events } = await supabase
    .from("events")
    .select("id, title, event_type, start_date, end_date, actual_footfall_boost_pct")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .order("start_date", { ascending: false })
    .limit(10);

  if (!events || events.length === 0) return [];

  const correlations: FootfallCorrelation[] = [];

  for (const event of events) {
    // Get footfall during event
    const { data: eventFootfall } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("property_id", propertyId)
      .gte("date", event.start_date)
      .lte("date", event.end_date);

    const eventDays = daysBetween(event.start_date, event.end_date);
    const eventTotal = (eventFootfall || []).reduce(
      (sum: number, r: any) => sum + (r.total_in || 0),
      0
    );
    const eventDailyAvg = eventDays > 0 ? Math.round(eventTotal / eventDays) : 0;

    // Get baseline (30 days before event, excluding other events)
    const baselineStart = new Date(event.start_date + "T00:00:00");
    baselineStart.setDate(baselineStart.getDate() - 37);
    const baselineEnd = new Date(event.start_date + "T00:00:00");
    baselineEnd.setDate(baselineEnd.getDate() - 7);

    const { data: baselineFootfall } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("property_id", propertyId)
      .gte("date", baselineStart.toISOString().split("T")[0])
      .lte("date", baselineEnd.toISOString().split("T")[0]);

    const baselineTotal = (baselineFootfall || []).reduce(
      (sum: number, r: any) => sum + (r.total_in || 0),
      0
    );
    const baselineDays = (baselineFootfall || []).length || 1;
    const baselineDailyAvg = Math.round(baselineTotal / baselineDays);

    const boost =
      baselineDailyAvg > 0
        ? Math.round(
            ((eventDailyAvg - baselineDailyAvg) / baselineDailyAvg) * 100
          )
        : 0;

    correlations.push({
      event_id: event.id,
      event_title: event.title,
      event_type: event.event_type,
      start_date: event.start_date,
      end_date: event.end_date,
      baseline_daily_footfall: baselineDailyAvg,
      event_daily_footfall: eventDailyAvg,
      actual_boost_pct: boost,
    });
  }

  return correlations;
}

export async function getUpcomingSeasonalAlerts(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<SeasonalAlert[]> {
  const currentYear = new Date().getFullYear();

  const { data } = await supabase
    .from("seasonal_calendar")
    .select("*")
    .eq("property_id", propertyId);

  if (!data || data.length === 0) return [];

  const alerts: SeasonalAlert[] = [];

  data.forEach((item: any) => {
    const dates = resolveSeasonDate(item, currentYear);
    if (!dates.start) return;

    const da = daysUntil(dates.start);

    // Only alert for upcoming events within 90 days or currently active
    if (da > 90 || (da < 0 && daysUntil(dates.end || dates.start) < -7)) return;

    let urgency: SeasonalAlert["urgency"] = "info";
    if (da <= 14 && da >= 0) urgency = "critical";
    else if (da <= 45 && da >= 0) urgency = "warning";
    else if (da < 0) urgency = "info";

    const actionItems: string[] = [];

    if (item.type === "religious") {
      actionItems.push("Confirm decorations and extended operating hours");
      actionItems.push("Brief all tenants on Eid/Ramadan promotions");
      actionItems.push("Arrange extra security and parking management");
      if (da > 14) actionItems.push("Launch marketing campaign 30 days before");
    } else if (item.type === "international" || item.type === "tourist_season") {
      actionItems.push("Prepare multilingual signage (English, Russian, German)");
      actionItems.push("Activate hotel and airport partnerships");
      actionItems.push("Ensure international brand inventory is stocked");
    } else if (item.type === "national") {
      actionItems.push("Plan family entertainment and food court expansion");
      actionItems.push("Coordinate outdoor activities if weather permits");
    } else if (item.type === "shopping_event") {
      actionItems.push("Coordinate tenant-wide discount program");
      actionItems.push("Book billboards and radio spots");
      actionItems.push("Prepare social media campaign with influencers");
    } else if (item.type === "school_holiday") {
      actionItems.push("Launch back-to-school promotions with fashion tenants");
      actionItems.push("Set up school supply activity stations for kids");
    }

    let message = "";
    if (da < 0) {
      message = `${item.name} is currently active — monitor performance and optimize in real-time.`;
    } else if (da <= 7) {
      message = `${item.name} starts in ${da} day${da === 1 ? "" : "s"} — final preparations. Ensure all logistics are locked in.`;
    } else if (da <= 30) {
      message = `${item.name} in ${da} days — active planning phase. Campaign should be LIVE now.`;
    } else if (da <= 60) {
      message = `${item.name} in ${da} days — start planning NOW. Book venues, brief tenants, set budgets.`;
    } else {
      message = `${item.name} in ${da} days — early planning window. Start strategic discussions.`;
    }

    alerts.push({
      id: item.id,
      name: item.name,
      type: item.type,
      days_away: da,
      urgency,
      message,
      action_items: actionItems,
    });
  });

  // Sort by urgency then by days_away
  const urgencyOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  alerts.sort((a, b) => {
    const urgDiff =
      (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
    if (urgDiff !== 0) return urgDiff;
    return (a.days_away ?? 999) - (b.days_away ?? 999);
  });

  return alerts;
}

export async function getTenantPromotions(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  status?: string
): Promise<TenantPromotion[]> {
  let query = supabase
    .from("tenant_promotions")
    .select("*, tenants!inner(brand_name)")
    .eq("property_id", propertyId)
    .order("start_date", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data } = await query;

  if (!data || data.length === 0) return [];

  return data.map((p: any) => ({
    id: p.id,
    tenant_id: p.tenant_id,
    tenant_name: p.tenants?.brand_name || "Unknown",
    title: p.title,
    promotion_type: p.promotion_type,
    start_date: p.start_date,
    end_date: p.end_date,
    discount_pct: p.discount_pct,
    footfall_impact_pct: p.footfall_impact_pct,
    revenue_impact_pct: p.revenue_impact_pct,
    status: p.status,
  }));
}
