import { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/event-bus";
import { createNotification } from "@/lib/notifications";

// ============================================================
// Wedja AI Brain — The Decision Engine of Senzo Mall
//
// Gathers data from ALL engines, reasons about the property,
// and produces actionable decisions. Works in two modes:
//   - Supervised: decisions require human approval
//   - Autonomous: safe decisions auto-execute via Event Bus
//
// Uses Claude API when ANTHROPIC_API_KEY is set, otherwise
// falls back to rule-based analysis.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export type BrainCategory =
  | "revenue"
  | "leasing"
  | "operations"
  | "energy"
  | "tenant"
  | "marketing"
  | "maintenance";

export interface BrainDecision {
  id?: string;
  cycle_id: string;
  category: BrainCategory;
  action: string;
  reasoning: string;
  confidence: number;
  impact_estimate: string | null;
  auto_executable: boolean;
  executed: boolean;
  approved: boolean | null;
  mode: "supervised" | "autonomous";
  event_type: string | null;
  event_payload: Record<string, unknown>;
  data_snapshot: Record<string, unknown>;
  summary: string | null;
  created_at?: string;
}

export interface PropertySnapshot {
  timestamp: string;
  tenants: {
    total: number;
    by_category: Record<string, number>;
    vacant_units: number;
    occupancy_rate: number;
  };
  revenue: {
    total_rent_collected_this_month: number;
    overdue_amount: number;
    overdue_count: number;
    percentage_rent_premium: number;
  };
  leases: {
    expiring_within_90_days: number;
    expiring_leases: Array<{ tenant_name: string; end_date: string; unit: string }>;
    wale_years: number;
    total_active: number;
  };
  footfall: {
    today_total: number;
    yesterday_total: number;
    change_pct: number;
    busiest_zone: string | null;
    trend: "up" | "down" | "stable";
  };
  energy: {
    today_consumption_kwh: number;
    today_cost_egp: number;
    waste_estimate_egp: number;
  };
  maintenance: {
    open_tickets: number;
    urgent_count: number;
  };
  anomalies: {
    active_count: number;
    critical_count: number;
  };
  discrepancies: {
    flagged_count: number;
    total_variance_egp: number;
  };
  marketing: {
    active_campaigns: number;
    upcoming_events: number;
  };
  social: {
    followers_total: number;
    engagement_rate: number;
  };
}

export interface BrainConfig {
  mode: "supervised" | "autonomous";
  enabled: boolean;
  interval_minutes: number;
  last_cycle: string | null;
  total_cycles: number;
  total_decisions: number;
  total_executed: number;
}

export interface BrainCycleResult {
  cycle_id: string;
  timestamp: string;
  snapshot: PropertySnapshot;
  decisions: BrainDecision[];
  summary: string;
  source: "claude" | "rules";
  duration_ms: number;
}

// ── In-memory config (resets on deploy) ─────────────────────

let brainConfig: BrainConfig = {
  mode: "supervised",
  enabled: true,
  interval_minutes: 30,
  last_cycle: null,
  total_cycles: 0,
  total_decisions: 0,
  total_executed: 0,
};

// ── Config accessors ────────────────────────────────────────

export function getBrainConfig(): BrainConfig {
  return { ...brainConfig };
}

export function updateBrainConfig(
  updates: Partial<Pick<BrainConfig, "mode" | "enabled" | "interval_minutes">>
): BrainConfig {
  if (updates.mode !== undefined) brainConfig.mode = updates.mode;
  if (updates.enabled !== undefined) brainConfig.enabled = updates.enabled;
  if (updates.interval_minutes !== undefined) {
    brainConfig.interval_minutes = Math.max(5, Math.min(120, updates.interval_minutes));
  }
  return { ...brainConfig };
}

// ── Data Gathering ──────────────────────────────────────────

export async function gatherPropertySnapshot(
  supabase: SupabaseClient
): Promise<PropertySnapshot> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const ninetyDaysOut = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

  // Run all queries in parallel
  const [
    tenantsRes,
    unitsRes,
    rentRes,
    overdueRes,
    percentRentRes,
    leasesExpiringRes,
    allLeasesRes,
    footfallTodayRes,
    footfallYesterdayRes,
    footfallZonesRes,
    energyRes,
    maintenanceRes,
    urgentMaintenanceRes,
    anomaliesRes,
    criticalAnomaliesRes,
    discrepanciesRes,
    campaignsRes,
    eventsRes,
    socialRes,
  ] = await Promise.all([
    // Tenants
    supabase.from("tenants").select("id, category, status").eq("status", "active"),
    // Units
    supabase.from("units").select("id, status"),
    // Rent collected this month
    supabase
      .from("rent_transactions")
      .select("amount_paid")
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .eq("status", "paid"),
    // Overdue rent
    supabase
      .from("rent_transactions")
      .select("amount_due, amount_paid")
      .eq("status", "overdue"),
    // Percentage rent premium
    supabase
      .from("rent_transactions")
      .select("percentage_rent_due")
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .gt("percentage_rent_due", 0),
    // Expiring leases
    supabase
      .from("leases")
      .select("id, tenant_id, end_date, unit_id, tenants(name), units(unit_number)")
      .eq("status", "active")
      .lte("end_date", ninetyDaysOut)
      .gte("end_date", today),
    // All active leases (for WALE)
    supabase
      .from("leases")
      .select("id, start_date, end_date")
      .eq("status", "active"),
    // Footfall today
    supabase.from("footfall_daily").select("total_in, zone_id").eq("date", today),
    // Footfall yesterday
    supabase.from("footfall_daily").select("total_in").eq("date", yesterday),
    // Footfall by zone (today)
    supabase
      .from("footfall_daily")
      .select("total_in, zone_id, zones(name)")
      .eq("date", today)
      .order("total_in", { ascending: false })
      .limit(1),
    // Energy today
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .gte("timestamp", today),
    // Open maintenance tickets
    supabase
      .from("maintenance_tickets")
      .select("id")
      .in("status", ["open", "assigned", "in_progress"]),
    // Urgent maintenance
    supabase
      .from("maintenance_tickets")
      .select("id")
      .in("status", ["open", "assigned", "in_progress"])
      .in("priority", ["urgent", "emergency"]),
    // Active anomalies
    supabase.from("anomalies").select("id").eq("status", "active"),
    // Critical anomalies
    supabase
      .from("anomalies")
      .select("id")
      .eq("status", "active")
      .eq("severity", "critical"),
    // Discrepancies
    supabase
      .from("discrepancies")
      .select("variance_egp")
      .eq("status", "flagged"),
    // Active marketing campaigns
    supabase
      .from("marketing_campaigns")
      .select("id")
      .eq("status", "active"),
    // Upcoming events
    supabase
      .from("marketing_campaigns")
      .select("id")
      .eq("status", "planned")
      .gte("start_date", today),
    // Social followers (latest)
    supabase
      .from("social_metrics")
      .select("followers, engagement_rate")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Process tenants by category
  const tenants = tenantsRes.data || [];
  const byCategory: Record<string, number> = {};
  for (const t of tenants) {
    const cat = (t as Record<string, unknown>).category as string || "other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  const allUnits = unitsRes.data || [];
  const vacantUnits = allUnits.filter((u: Record<string, unknown>) => u.status === "vacant").length;
  const totalUnits = allUnits.length || 1;

  // Revenue
  const rentCollected = (rentRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.amount_paid as number) || 0),
    0
  );
  const overdueData = overdueRes.data || [];
  const overdueAmount = overdueData.reduce(
    (sum: number, r: Record<string, unknown>) =>
      sum + ((r.amount_due as number) || 0) - ((r.amount_paid as number) || 0),
    0
  );
  const percentRentPremium = (percentRentRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.percentage_rent_due as number) || 0),
    0
  );

  // Leases
  const expiringLeases = (leasesExpiringRes.data || []).map((l: Record<string, unknown>) => ({
    tenant_name: ((l.tenants as Record<string, unknown>)?.name as string) || "Unknown",
    end_date: l.end_date as string,
    unit: ((l.units as Record<string, unknown>)?.unit_number as string) || "N/A",
  }));

  // WALE calculation
  const activeLeases = allLeasesRes.data || [];
  let waleYears = 0;
  if (activeLeases.length > 0) {
    const nowMs = now.getTime();
    let totalRemaining = 0;
    for (const lease of activeLeases) {
      const endMs = new Date((lease as Record<string, unknown>).end_date as string).getTime();
      const remainingYears = Math.max(0, (endMs - nowMs) / (365.25 * 86400000));
      totalRemaining += remainingYears;
    }
    waleYears = Math.round((totalRemaining / activeLeases.length) * 10) / 10;
  }

  // Footfall
  const todayTotal = (footfallTodayRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.total_in as number) || 0),
    0
  );
  const yesterdayTotal = (footfallYesterdayRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.total_in as number) || 0),
    0
  );
  const changePct =
    yesterdayTotal > 0
      ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
      : 0;
  const busiestZoneRow = (footfallZonesRes.data || [])[0] as Record<string, unknown> | undefined;
  const busiestZone = busiestZoneRow
    ? ((busiestZoneRow.zones as Record<string, unknown>)?.name as string) || null
    : null;

  // Energy
  const energyData = energyRes.data || [];
  const todayKwh = energyData.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.consumption_kwh as number) || 0),
    0
  );
  const todayCost = energyData.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.cost_egp as number) || 0),
    0
  );
  // Rough waste estimate: 15% of energy cost is typically wasted
  const wasteEstimate = Math.round(todayCost * 0.15);

  // Discrepancies
  const discrepancies = discrepanciesRes.data || [];
  const totalVariance = discrepancies.reduce(
    (sum: number, r: Record<string, unknown>) =>
      sum + Math.abs((r.variance_egp as number) || 0),
    0
  );

  // Social
  const socialData = socialRes.data || [];
  const followersTotal = socialData.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.followers as number) || 0),
    0
  );
  const avgEngagement =
    socialData.length > 0
      ? socialData.reduce(
          (sum: number, r: Record<string, unknown>) =>
            sum + ((r.engagement_rate as number) || 0),
          0
        ) / socialData.length
      : 0;

  return {
    timestamp: now.toISOString(),
    tenants: {
      total: tenants.length,
      by_category: byCategory,
      vacant_units: vacantUnits,
      occupancy_rate: Math.round(((totalUnits - vacantUnits) / totalUnits) * 100),
    },
    revenue: {
      total_rent_collected_this_month: Math.round(rentCollected),
      overdue_amount: Math.round(overdueAmount),
      overdue_count: overdueData.length,
      percentage_rent_premium: Math.round(percentRentPremium),
    },
    leases: {
      expiring_within_90_days: expiringLeases.length,
      expiring_leases: expiringLeases,
      wale_years: waleYears,
      total_active: activeLeases.length,
    },
    footfall: {
      today_total: todayTotal,
      yesterday_total: yesterdayTotal,
      change_pct: changePct,
      busiest_zone: busiestZone,
      trend: changePct > 5 ? "up" : changePct < -5 ? "down" : "stable",
    },
    energy: {
      today_consumption_kwh: Math.round(todayKwh),
      today_cost_egp: Math.round(todayCost),
      waste_estimate_egp: wasteEstimate,
    },
    maintenance: {
      open_tickets: (maintenanceRes.data || []).length,
      urgent_count: (urgentMaintenanceRes.data || []).length,
    },
    anomalies: {
      active_count: (anomaliesRes.data || []).length,
      critical_count: (criticalAnomaliesRes.data || []).length,
    },
    discrepancies: {
      flagged_count: discrepancies.length,
      total_variance_egp: Math.round(totalVariance),
    },
    marketing: {
      active_campaigns: (campaignsRes.data || []).length,
      upcoming_events: (eventsRes.data || []).length,
    },
    social: {
      followers_total: followersTotal,
      engagement_rate: Math.round(avgEngagement * 100) / 100,
    },
  };
}

// ── Claude API Call ─────────────────────────────────────────

async function callClaudeAPI(
  snapshot: PropertySnapshot
): Promise<{ decisions: BrainDecision[]; summary: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You are Wedja Brain — the AI that runs Senzo Mall, Hurghada.
170,000 sqm, 166 tenants, 15,000+ daily visitors.

Analyze the property snapshot and return ACTIONABLE decisions.
Categories: revenue, leasing, operations, energy, tenant, marketing, maintenance

For each decision provide:
- category (one of: revenue, leasing, operations, energy, tenant, marketing, maintenance)
- action (specific actionable step, 1-2 sentences)
- reasoning (why this action matters, referencing data)
- confidence (0-100, how sure you are)
- impact_estimate (in EGP where possible, e.g. "EGP 50,000/month savings")
- auto_executable (true ONLY for safe routine actions like sending reminders)

Focus on:
- Revenue protection (underreporting detection, % rent optimization)
- Lease management (expiring leases, renewal terms)
- Operational efficiency (energy waste, maintenance patterns)
- Tenant performance (underperformers, replacement candidates)
- Marketing opportunities (seasonal events, campaigns)
- Maintenance urgency and preventive scheduling

Return ONLY valid JSON with no markdown formatting:
{ "decisions": [...], "summary": "2-3 sentence executive summary" }`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Property Snapshot (${snapshot.timestamp}):\n\n${JSON.stringify(snapshot, null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const text =
      result.content?.[0]?.type === "text" ? result.content[0].text : "";

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      decisions: (parsed.decisions || []).map(
        (d: Record<string, unknown>) => ({
          cycle_id: "",
          category: d.category as BrainCategory,
          action: d.action as string,
          reasoning: d.reasoning as string,
          confidence: (d.confidence as number) || 50,
          impact_estimate: (d.impact_estimate as string) || null,
          auto_executable: (d.auto_executable as boolean) || false,
          executed: false,
          approved: null,
          mode: "supervised" as const,
          event_type: null,
          event_payload: {},
          data_snapshot: {},
          summary: null,
        })
      ),
      summary: parsed.summary || "Brain cycle completed.",
    };
  } catch (err) {
    console.error("Claude API call failed:", err);
    return null;
  }
}

// ── Rule-Based Analysis (Fallback) ──────────────────────────

export function runRuleBasedAnalysis(
  snapshot: PropertySnapshot
): { decisions: BrainDecision[]; summary: string } {
  const decisions: BrainDecision[] = [];
  const cycleId = ""; // Will be set by caller
  const base: Omit<BrainDecision, "category" | "action" | "reasoning" | "confidence" | "impact_estimate" | "auto_executable" | "event_type"> = {
    cycle_id: cycleId,
    executed: false,
    approved: null,
    mode: "supervised",
    event_payload: {},
    data_snapshot: {},
    summary: null,
  };

  // Rule 1: Low occupancy
  if (snapshot.tenants.occupancy_rate < 85) {
    decisions.push({
      ...base,
      category: "leasing",
      action: `Occupancy at ${snapshot.tenants.occupancy_rate}% — consider rent reduction or marketing push for ${snapshot.tenants.vacant_units} vacant units`,
      reasoning: `${snapshot.tenants.vacant_units} units are vacant. Every empty unit costs approximately EGP 15,000-30,000/month in lost rent.`,
      confidence: 85,
      impact_estimate: `EGP ${(snapshot.tenants.vacant_units * 20000).toLocaleString()}/month potential`,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 2: High footfall + discrepancies = revenue leakage
  if (snapshot.footfall.today_total > 5000 && snapshot.discrepancies.flagged_count > 0) {
    decisions.push({
      ...base,
      category: "revenue",
      action: `Revenue leakage detected — ${snapshot.discrepancies.flagged_count} tenants flagged with EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()} total variance`,
      reasoning: `High footfall (${snapshot.footfall.today_total.toLocaleString()}) indicates strong traffic, but ${snapshot.discrepancies.flagged_count} tenants show discrepancies. Verify tenant sales reporting.`,
      confidence: 80,
      impact_estimate: `EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()} at risk`,
      auto_executable: false,
      event_type: "tenant.underreporting",
    });
  }

  // Rule 3: Expiring leases for review
  if (snapshot.leases.expiring_within_90_days > 0) {
    const leaseList = snapshot.leases.expiring_leases
      .slice(0, 3)
      .map((l) => `${l.tenant_name} (${l.end_date})`)
      .join(", ");
    decisions.push({
      ...base,
      category: "leasing",
      action: `${snapshot.leases.expiring_within_90_days} leases expiring within 90 days — review renewal terms. Priority: ${leaseList}`,
      reasoning: `Proactive lease management prevents vacancy gaps. WALE is ${snapshot.leases.wale_years} years.`,
      confidence: 90,
      impact_estimate: null,
      auto_executable: false,
      event_type: "lease.expiring",
    });
  }

  // Rule 4: Energy waste
  if (snapshot.energy.waste_estimate_egp > 500) {
    decisions.push({
      ...base,
      category: "energy",
      action: `Reduce HVAC and lighting in low-traffic zones — estimated EGP ${snapshot.energy.waste_estimate_egp.toLocaleString()} waste today`,
      reasoning: `Today's energy cost is EGP ${snapshot.energy.today_cost_egp.toLocaleString()} with ~15% estimated waste. Reduce in off-peak zones.`,
      confidence: 70,
      impact_estimate: `EGP ${(snapshot.energy.waste_estimate_egp * 30).toLocaleString()}/month savings`,
      auto_executable: false,
      event_type: "energy.waste_detected",
    });
  }

  // Rule 5: Multiple discrepancies — investigate
  if (snapshot.discrepancies.flagged_count >= 3) {
    decisions.push({
      ...base,
      category: "revenue",
      action: `Priority: investigate top ${Math.min(3, snapshot.discrepancies.flagged_count)} underreporters — ${snapshot.discrepancies.flagged_count} total flagged`,
      reasoning: `Multiple discrepancies suggest systemic underreporting. Total variance: EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()}.`,
      confidence: 85,
      impact_estimate: `EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()} recovery potential`,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 6: Overdue rent
  if (snapshot.revenue.overdue_count > 0) {
    decisions.push({
      ...base,
      category: "revenue",
      action: `Send payment reminders to ${snapshot.revenue.overdue_count} tenants — EGP ${snapshot.revenue.overdue_amount.toLocaleString()} overdue`,
      reasoning: `Overdue rent impacts cash flow. Automated reminders improve collection rates by 30-40%.`,
      confidence: 95,
      impact_estimate: `EGP ${snapshot.revenue.overdue_amount.toLocaleString()} collection`,
      auto_executable: true,
      event_type: "rent.overdue",
    });
  }

  // Rule 7: Critical anomalies
  if (snapshot.anomalies.critical_count > 0) {
    decisions.push({
      ...base,
      category: "operations",
      action: `Immediate attention: ${snapshot.anomalies.critical_count} critical anomalies detected (${snapshot.anomalies.active_count} total active)`,
      reasoning: `Critical anomalies may indicate security issues, system failures, or significant operational problems.`,
      confidence: 95,
      impact_estimate: null,
      auto_executable: false,
      event_type: "anomaly.critical",
    });
  }

  // Rule 8: Seasonal/marketing opportunity
  if (snapshot.marketing.active_campaigns === 0 && snapshot.footfall.today_total > 0) {
    decisions.push({
      ...base,
      category: "marketing",
      action: "No active marketing campaigns — plan promotional event to boost footfall and tenant sales",
      reasoning: `No campaigns running. Seasonal promotions typically increase footfall by 20-35% and tenant sales by 15-25%.`,
      confidence: 65,
      impact_estimate: "10-25% footfall increase potential",
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 9: High percentage of min-rent tenants
  if (snapshot.revenue.percentage_rent_premium < snapshot.revenue.total_rent_collected_this_month * 0.05) {
    decisions.push({
      ...base,
      category: "revenue",
      action: "Low percentage rent contribution — renegotiate percentage rates or verify tenant sales data",
      reasoning: `Percentage rent premium (EGP ${snapshot.revenue.percentage_rent_premium.toLocaleString()}) is below 5% of total rent. Many tenants may be paying only minimum rent.`,
      confidence: 70,
      impact_estimate: "10-20% additional rent potential",
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 10: Maintenance patterns
  if (snapshot.maintenance.urgent_count > 0) {
    decisions.push({
      ...base,
      category: "maintenance",
      action: `${snapshot.maintenance.urgent_count} urgent maintenance tickets — schedule preventive maintenance review`,
      reasoning: `Urgent tickets indicate reactive maintenance. Preventive scheduling reduces emergency costs by 40-60%.`,
      confidence: 80,
      impact_estimate: "30-50% maintenance cost reduction",
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 11: Social engagement
  if (snapshot.social.engagement_rate < 2.0 && snapshot.social.followers_total > 0) {
    decisions.push({
      ...base,
      category: "marketing",
      action: `Social media engagement at ${snapshot.social.engagement_rate}% — refresh content strategy`,
      reasoning: `Engagement below 2% indicates stale content. Target 3-5% for retail properties.`,
      confidence: 60,
      impact_estimate: null,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 12: WALE declining
  if (snapshot.leases.wale_years < 2.0 && snapshot.leases.total_active > 0) {
    decisions.push({
      ...base,
      category: "leasing",
      action: `WALE at ${snapshot.leases.wale_years} years — accelerate lease renewals to stabilize income`,
      reasoning: `Weighted Average Lease Expiry below 2 years signals instability. Target 3+ years for portfolio health.`,
      confidence: 85,
      impact_estimate: null,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 13: Footfall drop
  if (snapshot.footfall.trend === "down" && snapshot.footfall.change_pct < -15) {
    decisions.push({
      ...base,
      category: "operations",
      action: `Footfall dropped ${Math.abs(snapshot.footfall.change_pct)}% vs yesterday — investigate cause and consider promotional response`,
      reasoning: `Significant drop may indicate external factors (weather, competition) or internal issues (maintenance, events).`,
      confidence: 75,
      impact_estimate: null,
      auto_executable: false,
      event_type: "footfall.drop",
    });
  }

  // Build summary
  const summaryParts: string[] = [];
  if (decisions.length === 0) {
    summaryParts.push("All systems operating within normal parameters.");
  } else {
    const critical = decisions.filter((d) => d.confidence >= 85).length;
    const revenue = decisions.filter((d) => d.category === "revenue").length;
    if (critical > 0) summaryParts.push(`${critical} high-confidence action(s) require attention.`);
    if (revenue > 0) summaryParts.push(`${revenue} revenue-related finding(s).`);
    summaryParts.push(`${decisions.length} total decisions from rule-based analysis.`);
  }

  return {
    decisions,
    summary: summaryParts.join(" "),
  };
}

// ── Main Brain Cycle ────────────────────────────────────────

export async function runBrainCycle(
  supabase: SupabaseClient
): Promise<BrainCycleResult> {
  const start = Date.now();
  const cycleId = `brain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Gather snapshot
  const snapshot = await gatherPropertySnapshot(supabase);

  // 2. Try Claude API, fallback to rules
  let result: { decisions: BrainDecision[]; summary: string };
  let source: "claude" | "rules" = "rules";

  const claudeResult = await callClaudeAPI(snapshot);
  if (claudeResult && claudeResult.decisions.length > 0) {
    result = claudeResult;
    source = "claude";
  } else {
    result = runRuleBasedAnalysis(snapshot);
  }

  // 3. Finalize decisions
  const mode = brainConfig.mode;
  const decisions: BrainDecision[] = result.decisions.map((d) => ({
    ...d,
    cycle_id: cycleId,
    mode,
    data_snapshot: snapshot as unknown as Record<string, unknown>,
    summary: result.summary,
  }));

  // 4. Store decisions in brain_decisions table
  if (decisions.length > 0) {
    const rows = decisions.map((d) => ({
      cycle_id: d.cycle_id,
      category: d.category,
      action: d.action,
      reasoning: d.reasoning,
      confidence: d.confidence,
      impact_estimate: d.impact_estimate,
      auto_executable: d.auto_executable,
      executed: false,
      approved: null,
      mode: d.mode,
      event_type: d.event_type,
      event_payload: d.event_payload,
      data_snapshot: d.data_snapshot,
      summary: d.summary,
    }));

    const { data: inserted, error } = await supabase
      .from("brain_decisions")
      .insert(rows)
      .select();

    if (error) {
      console.error("Failed to store brain decisions:", error);
    } else if (inserted) {
      // Update decisions with IDs
      for (let i = 0; i < inserted.length && i < decisions.length; i++) {
        decisions[i].id = (inserted[i] as Record<string, unknown>).id as string;
      }
    }
  }

  // 5. In autonomous mode, auto-execute safe decisions
  let executedCount = 0;
  if (mode === "autonomous") {
    for (const decision of decisions) {
      if (decision.auto_executable && decision.event_type) {
        try {
          await emitEvent(
            decision.event_type as Parameters<typeof emitEvent>[0],
            "ai-brain",
            {
              brain_cycle_id: cycleId,
              decision_id: decision.id,
              action: decision.action,
              ...decision.event_payload,
            },
            supabase
          );

          // Mark as executed
          if (decision.id) {
            await supabase
              .from("brain_decisions")
              .update({ executed: true, approved: true })
              .eq("id", decision.id);
          }
          decision.executed = true;
          decision.approved = true;
          executedCount++;
        } catch (err) {
          console.error("Auto-execute failed for decision:", decision.id, err);
        }
      }
    }
  }

  // 6. Create notification
  await createNotification(supabase, {
    title: `Brain Cycle Complete — ${decisions.length} decision(s)`,
    message: result.summary,
    type: source === "claude" ? "info" : "info",
    category: "ai-brain",
    link: "/dashboard/ai/brain",
  });

  // 7. Update stats
  brainConfig.last_cycle = new Date().toISOString();
  brainConfig.total_cycles++;
  brainConfig.total_decisions += decisions.length;
  brainConfig.total_executed += executedCount;

  return {
    cycle_id: cycleId,
    timestamp: snapshot.timestamp,
    snapshot,
    decisions,
    summary: result.summary,
    source,
    duration_ms: Date.now() - start,
  };
}

// ── Decision Actions ────────────────────────────────────────

export async function approveDecision(
  supabase: SupabaseClient,
  decisionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("brain_decisions")
    .update({ approved: true })
    .eq("id", decisionId)
    .select()
    .single();

  if (error || !data) return false;

  // If it has an event type, execute it
  const decision = data as Record<string, unknown>;
  if (decision.event_type && !decision.executed) {
    try {
      await emitEvent(
        decision.event_type as Parameters<typeof emitEvent>[0],
        "ai-brain",
        {
          brain_decision_id: decisionId,
          action: decision.action,
          ...(decision.event_payload as Record<string, unknown>),
        },
        supabase
      );
      await supabase
        .from("brain_decisions")
        .update({ executed: true })
        .eq("id", decisionId);
      brainConfig.total_executed++;
    } catch {
      // Event emission failed but approval stands
    }
  }

  return true;
}

export async function rejectDecision(
  supabase: SupabaseClient,
  decisionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("brain_decisions")
    .update({ approved: false })
    .eq("id", decisionId);

  return !error;
}

export async function getRecentDecisions(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<BrainDecision[]> {
  const { data, error } = await supabase
    .from("brain_decisions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch brain decisions:", error);
    return [];
  }

  return (data || []) as BrainDecision[];
}

export async function getDecisionsByCycle(
  supabase: SupabaseClient,
  cycleId: string
): Promise<BrainDecision[]> {
  const { data, error } = await supabase
    .from("brain_decisions")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("confidence", { ascending: false });

  if (error) return [];
  return (data || []) as BrainDecision[];
}
