import { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/event-bus";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { runRevenueVerification, type TenantVerificationResult } from "@/lib/revenue-engine";
import { trainFootfallModel, trainRevenueModel } from "@/lib/prediction-model";
import {
  JOB_LOCK_TTL_MS,
  PROPERTY_ID,
  acquireJobLock,
  getBrainConfig,
  readSetting,
  readSettingsByPrefix,
  releaseJobLock,
  runBrainCycleExclusive,
  writeSetting,
} from "@/lib/ai-brain";

// ============================================================
// Wedja Smart Automations Engine
//
// 7 rule-based automations that execute real operations against
// Supabase data for Senzo Mall commercial property management.
//
// State (enabled flag, last_run, actions_taken, latest results) is
// persisted per automation in system_settings ("automation:<id>");
// every run is logged to system_events. Nothing lives in module
// memory, so all serverless instances see the same state.
// ============================================================

// ── Types ───────────────────────────────────────────────────

export interface AutomationResult {
  action: string;
  description: string;
  impact: string;
  timestamp: string;
}

export type AutomationType =
  | "lease_monitor"
  | "rent_collector"
  | "revenue_verifier"
  | "energy_optimizer"
  | "maintenance_detector"
  | "footfall_analyzer"
  | "tenant_scorer";

interface AutomationDefinition {
  id: string;
  name: string;
  type: AutomationType;
  description: string;
  run: (supabase: SupabaseClient) => Promise<AutomationResult[]>;
}

export interface AutomationMeta {
  id: string;
  name: string;
  type: AutomationType;
  description: string;
  enabled: boolean;
  last_run: string | null;
  actions_taken: number;
  results: AutomationResult[];
}

/** Persisted state for one automation (system_settings value). */
interface AutomationState {
  enabled: boolean;
  last_run: string | null;
  actions_taken: number;
  last_results: AutomationResult[];
}

const STATE_PREFIX = "automation:";
const MAX_STORED_RESULTS = 5;
export const AUTOMATION_EVENT_TYPES = ["automation.run", "automation.error"] as const;

// ── Helper ──────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

// ── Automation 1: Lease Monitor ─────────────────────────────

async function runLeaseMonitor(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const ninetyDaysOut = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

  // Query active leases expiring within 90 days
  const { data: expiringLeases } = await supabase
    .from("leases")
    .select("id, tenant_id, unit_id, end_date, min_rent_monthly_egp, tenants(id, name, category), units(unit_number, zone_id, area_sqm, zones(id, name))")
    .eq("status", "active")
    .lte("end_date", ninetyDaysOut)
    .gte("end_date", today);

  if (!expiringLeases || expiringLeases.length === 0) {
    const r: AutomationResult = {
      action: "lease_monitor",
      description: "No leases expiring within 90 days",
      impact: "No action needed",
      timestamp: ts(),
    };
    results.push(r);
    return results;
  }

  // For each expiring lease, check tenant performance
  for (const lease of expiringLeases) {
    const tenant = lease.tenants as unknown as Record<string, unknown> | null;
    const unit = lease.units as unknown as Record<string, unknown> | null;
    const zone = unit?.zones as Record<string, unknown> | null;
    const tenantName = (tenant?.name as string) || "Unknown";
    const tenantId = lease.tenant_id;
    const unitNumber = (unit?.unit_number as string) || "N/A";
    const unitAreaSqm = (unit?.area_sqm as number) || 1;
    const zoneId = (unit?.zone_id as string) || null;
    const zoneName = (zone?.name as string) || "Unknown Zone";
    const endDate = lease.end_date as string;
    const daysLeft = Math.ceil(
      (new Date(endDate).getTime() - now.getTime()) / 86400000
    );

    // Get tenant sales for the last 6 months
    const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);
    const { data: salesData } = await supabase
      .from("tenant_sales_reported")
      .select("reported_revenue_egp")
      .eq("tenant_id", tenantId)
      .gte("submission_date", sixMonthsAgo.toISOString().split("T")[0]);

    const totalSales = (salesData || []).reduce(
      (sum: number, s: Record<string, unknown>) =>
        sum + ((s.reported_revenue_egp as number) || 0),
      0
    );
    const monthlyAvgSales = salesData && salesData.length > 0
      ? totalSales / salesData.length
      : 0;
    const revenuePerSqm = monthlyAvgSales / unitAreaSqm;

    // Get zone average revenue/sqm
    let zoneAvgRevenuePerSqm = 0;
    if (zoneId) {
      const { data: zoneUnits } = await supabase
        .from("units")
        .select("id, area_sqm")
        .eq("zone_id", zoneId)
        .eq("status", "occupied");

      if (zoneUnits && zoneUnits.length > 0) {
        const zoneUnitIds = zoneUnits.map((u: Record<string, unknown>) => u.id as string);
        const { data: zoneLeases } = await supabase
          .from("leases")
          .select("tenant_id, unit_id")
          .eq("status", "active")
          .in("unit_id", zoneUnitIds);

        if (zoneLeases && zoneLeases.length > 0) {
          const zoneTenantIds = zoneLeases.map((l: Record<string, unknown>) => l.tenant_id as string);
          const { data: zoneSales } = await supabase
            .from("tenant_sales_reported")
            .select("reported_revenue_egp, tenant_id")
            .in("tenant_id", zoneTenantIds)
            .gte("submission_date", sixMonthsAgo.toISOString().split("T")[0]);

          const zoneTotalSales = (zoneSales || []).reduce(
            (sum: number, s: Record<string, unknown>) =>
              sum + ((s.reported_revenue_egp as number) || 0),
            0
          );
          const zoneTotalArea = zoneUnits.reduce(
            (sum: number, u: Record<string, unknown>) =>
              sum + ((u.area_sqm as number) || 0),
            0
          );
          if (zoneTotalArea > 0 && zoneSales && zoneSales.length > 0) {
            const uniqueMonths = new Set(
              (zoneSales || []).map(() => 1)
            ).size || 1;
            zoneAvgRevenuePerSqm = zoneTotalSales / uniqueMonths / zoneTotalArea;
          }
        }
      }
    }

    const isUnderperformer =
      zoneAvgRevenuePerSqm > 0 && revenuePerSqm < zoneAvgRevenuePerSqm * 0.7;
    const isTopPerformer =
      zoneAvgRevenuePerSqm > 0 && revenuePerSqm > zoneAvgRevenuePerSqm * 1.3;

    let recommendation: string;
    let impact: string;

    if (isUnderperformer) {
      recommendation = `Do not renew - ${tenantName} (Unit ${unitNumber}) revenue/sqm EGP ${Math.round(revenuePerSqm)}/sqm is below ${zoneName} zone average of EGP ${Math.round(zoneAvgRevenuePerSqm)}/sqm`;
      impact = `Potential to replace with higher-performing tenant — EGP ${Math.round((zoneAvgRevenuePerSqm - revenuePerSqm) * unitAreaSqm)}/month uplift`;
    } else if (isTopPerformer) {
      recommendation = `Priority renewal - retain ${tenantName} (Unit ${unitNumber}), top performer with EGP ${Math.round(revenuePerSqm)}/sqm vs zone avg EGP ${Math.round(zoneAvgRevenuePerSqm)}/sqm`;
      impact = `Retain revenue of EGP ${Math.round(monthlyAvgSales)}/month`;
    } else {
      recommendation = `Lease expiring in ${daysLeft} days - ${tenantName} (Unit ${unitNumber}), review renewal terms`;
      impact = `${daysLeft} days until expiry — monthly rent EGP ${((lease.min_rent_monthly_egp as number) || 0).toLocaleString()}`;
    }

    const r: AutomationResult = {
      action: "lease_monitor",
      description: recommendation,
      impact,
      timestamp: ts(),
    };
    results.push(r);

    // Emit event
    await emitEvent("lease.expiring", "automations-engine", {
      lease_id: lease.id,
      tenant_id: tenantId,
      tenant_name: tenantName,
      unit_number: unitNumber,
      end_date: endDate,
      days_until_expiry: daysLeft,
      revenue_per_sqm: Math.round(revenuePerSqm),
      zone_avg_per_sqm: Math.round(zoneAvgRevenuePerSqm),
      is_underperformer: isUnderperformer,
      is_top_performer: isTopPerformer,
    }, supabase);
  }

  return results;
}

// ── Automation 2: Rent Collector ────────────────────────────

async function runRentCollector(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Query rent transactions for current month that are unpaid or overdue
  const { data: overdueRent } = await supabase
    .from("rent_transactions")
    .select("id, lease_id, amount_due, amount_paid, status, period_month, period_year, leases(tenant_id, tenants(name))")
    .in("status", ["overdue", "partial"])
    .order("amount_due", { ascending: false });

  if (!overdueRent || overdueRent.length === 0) {
    const r: AutomationResult = {
      action: "rent_collector",
      description: "All rent payments are current — no overdue accounts",
      impact: "EGP 0 outstanding",
      timestamp: ts(),
    };
    results.push(r);
    return results;
  }

  let totalOverdue = 0;
  let chronicCount = 0;

  for (const txn of overdueRent) {
    const leaseData = txn.leases as unknown as Record<string, unknown> | null;
    const tenantData = leaseData?.tenants as Record<string, unknown> | null;
    const tenantName = (tenantData?.name as string) || "Unknown";
    const tenantId = (leaseData?.tenant_id as string) || null;
    const amountDue = (txn.amount_due as number) || 0;
    const amountPaid = (txn.amount_paid as number) || 0;
    const outstanding = amountDue - amountPaid;
    totalOverdue += outstanding;

    // Check for chronic late payment pattern (3+ months overdue in history)
    const { data: overdueHistory } = await supabase
      .from("rent_transactions")
      .select("id")
      .eq("lease_id", txn.lease_id)
      .eq("status", "overdue")
      .limit(5);

    const isChronic = (overdueHistory?.length || 0) >= 3;
    if (isChronic) chronicCount++;

    const description = isChronic
      ? `CHRONIC: ${tenantName} — EGP ${outstanding.toLocaleString()} overdue (${overdueHistory?.length}+ months late pattern). Flag as high risk.`
      : `${tenantName} — EGP ${outstanding.toLocaleString()} overdue for ${txn.period_month}/${txn.period_year}`;

    const r: AutomationResult = {
      action: "rent_collector",
      description,
      impact: `EGP ${outstanding.toLocaleString()} outstanding`,
      timestamp: ts(),
    };
    results.push(r);

    // Emit rent.overdue event
    await emitEvent("rent.overdue", "automations-engine", {
      transaction_id: txn.id,
      lease_id: txn.lease_id,
      tenant_id: tenantId,
      tenant_name: tenantName,
      amount_due: amountDue,
      amount_paid: amountPaid,
      outstanding,
      is_chronic: isChronic,
      period: `${txn.period_month}/${txn.period_year}`,
    }, supabase);
  }

  // Create summary notification
  await createNotification(supabase, {
    title: `Rent Collection: ${overdueRent.length} overdue`,
    message: `Total overdue: EGP ${totalOverdue.toLocaleString()} across ${overdueRent.length} tenants. ${chronicCount} chronic late payers flagged.`,
    type: chronicCount > 0 ? "critical" : "warning",
    category: "revenue",
    link: "/dashboard/revenue",
  });

  const summary: AutomationResult = {
    action: "rent_collector",
    description: `Summary: ${overdueRent.length} overdue tenants, ${chronicCount} chronic late payers`,
    impact: `Total EGP ${totalOverdue.toLocaleString()} outstanding`,
    timestamp: ts(),
  };
  results.push(summary);

  return results;
}

// ── Automation 3: Revenue Verifier ──────────────────────────

/**
 * Most recent COMPLETE month (UTC). Tenants report sales in arrears, so the
 * current month never has a full report yet.
 */
export function lastCompleteMonth(now: Date = new Date()): { month: number; year: number } {
  const m = now.getUTCMonth(); // 0-11 → previous month as 1-12
  return m === 0
    ? { month: 12, year: now.getUTCFullYear() - 1 }
    : { month: m, year: now.getUTCFullYear() };
}

type VerifierTenantResult = TenantVerificationResult & { rent_at_risk_egp?: number };

/**
 * Delegates to the revenue engine (single estimation model, thresholds and
 * discrepancy persistence) and turns its flagged tenants into automation
 * results + tenant.underreporting events.
 */
async function runRevenueVerifier(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const { month, year } = lastCompleteMonth();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const run = await runRevenueVerification(supabase, PROPERTY_ID, month, year);
  const all = (run.results || []) as VerifierTenantResult[];

  if (all.length === 0) {
    return [{
      action: "revenue_verifier",
      description: `No active tenants to verify for ${period}`,
      impact: "No verification needed",
      timestamp: ts(),
    }];
  }

  const results: AutomationResult[] = [];
  const flagged = all
    .filter((r) => r.status === "flagged")
    .sort((a, b) => (b.variance_egp || 0) - (a.variance_egp || 0));
  let totalVariance = 0;
  let totalRentAtRisk = 0;

  for (const r of flagged) {
    const variance = Math.round(r.variance_egp || 0);
    const rentAtRisk = Math.round(r.rent_at_risk_egp ?? 0);
    totalVariance += variance;
    totalRentAtRisk += rentAtRisk;
    const reported = Math.round(r.reported_revenue_egp ?? 0);
    const estimated = Math.round(r.estimated_mid_egp || 0);

    results.push({
      action: "revenue_verifier",
      description: `${r.tenant_name} (${r.category}, unit ${r.unit_number}) — ${period}: reported EGP ${reported.toLocaleString()} vs estimated EGP ${estimated.toLocaleString()} (${Math.round(r.variance_pct || 0)}% variance, confidence ${r.confidence})`,
      impact: `EGP ${variance.toLocaleString()} potential underreporting — EGP ${rentAtRisk.toLocaleString()} percentage rent at risk`,
      timestamp: ts(),
    });

    await emitEvent("tenant.underreporting", "automations-engine", {
      tenant_id: r.tenant_id,
      tenant_name: r.tenant_name,
      unit_id: r.unit_id,
      lease_id: r.lease_id,
      period_month: month,
      period_year: year,
      reported_revenue: reported,
      estimated_revenue: estimated,
      variance_egp: variance,
      variance_pct: Math.round(r.variance_pct || 0),
      rent_at_risk_egp: rentAtRisk,
      confidence: r.confidence,
      category: r.category,
    }, supabase);
  }

  const count = (status: string) => all.filter((r) => (r.status as string) === status).length;
  const missing = count("missing_report");
  const insufficient = count("insufficient_data");

  if (flagged.length > 0) {
    await createNotification(supabase, {
      title: `Revenue verification ${period}: ${flagged.length} tenant(s) flagged`,
      message: `${flagged.slice(0, 3).map((r) => r.tenant_name).join(", ")}${flagged.length > 3 ? ` and ${flagged.length - 3} more` : ""} — EGP ${totalRentAtRisk.toLocaleString()} percentage rent at risk (EGP ${totalVariance.toLocaleString()} sales variance).`,
      type: "warning",
      category: "revenue",
      link: "/dashboard/discrepancies",
    });
  }

  results.push({
    action: "revenue_verifier",
    description: `Revenue verification ${period} complete — ${all.length} tenants checked, ${flagged.length} flagged, ${missing} missing reports, ${insufficient} with insufficient data`,
    impact: `EGP ${totalRentAtRisk.toLocaleString()} percentage rent at risk (EGP ${totalVariance.toLocaleString()} sales variance)`,
    timestamp: ts(),
  });

  return results;
}

// ── Automation 4: Energy Optimizer ──────────────────────────

async function runEnergyOptimizer(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const today = new Date().toISOString().split("T")[0];

  // Get zones with energy and footfall data
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm")
    .eq("property_id", PROPERTY_ID);

  if (!zones || zones.length === 0) {
    const r: AutomationResult = {
      action: "energy_optimizer",
      description: "No zones configured for energy analysis",
      impact: "No action needed",
      timestamp: ts(),
    };
    results.push(r);
    return results;
  }

  let totalPotentialSavings = 0;

  for (const zone of zones) {
    const zoneId = zone.id as string;
    const zoneName = (zone.name as string) || "Unknown";

    // Get today's energy for this zone
    const { data: energyData } = await supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .eq("zone_id", zoneId)
      .gte("timestamp", today);

    const totalCost = (energyData || []).reduce(
      (sum: number, r: Record<string, unknown>) =>
        sum + ((r.cost_egp as number) || 0),
      0
    );
    const totalKwh = (energyData || []).reduce(
      (sum: number, r: Record<string, unknown>) =>
        sum + ((r.consumption_kwh as number) || 0),
      0
    );

    if (totalCost === 0) continue;

    // Get today's footfall for this zone
    const { data: footfallData } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("zone_id", zoneId)
      .eq("date", today);

    const totalFootfall = (footfallData || []).reduce(
      (sum: number, f: Record<string, unknown>) =>
        sum + ((f.total_in as number) || 0),
      0
    );

    // Calculate energy per visitor
    const energyPerVisitor = totalFootfall > 0 ? totalKwh / totalFootfall : 0;

    // Flag if high energy but low footfall (waste indicator)
    // Threshold: cost > EGP 500 and footfall below 100 visitors
    if (totalCost > 500 && totalFootfall < 100) {
      const potentialSaving = Math.round(totalCost * 0.4); // 40% potential reduction
      totalPotentialSavings += potentialSaving;

      const r: AutomationResult = {
        action: "energy_optimizer",
        description: `${zoneName} — high energy (${Math.round(totalKwh)} kWh / EGP ${Math.round(totalCost)}) with only ${totalFootfall} visitors. Reduce HVAC/lighting.`,
        impact: `EGP ${potentialSaving.toLocaleString()}/day potential saving`,
        timestamp: ts(),
      };
      results.push(r);

      await emitEvent("energy.waste_detected", "automations-engine", {
        zone_id: zoneId,
        zone_name: zoneName,
        daily_cost_egp: Math.round(totalCost),
        daily_kwh: Math.round(totalKwh),
        footfall: totalFootfall,
        potential_saving_egp: potentialSaving,
      }, supabase);
    } else if (totalFootfall > 0 && energyPerVisitor > 5) {
      // High energy per visitor ratio
      const potentialSaving = Math.round(totalCost * 0.2);
      totalPotentialSavings += potentialSaving;

      const r: AutomationResult = {
        action: "energy_optimizer",
        description: `${zoneName} — energy efficiency below target (${energyPerVisitor.toFixed(1)} kWh/visitor vs target 5.0)`,
        impact: `EGP ${potentialSaving.toLocaleString()}/day optimization potential`,
        timestamp: ts(),
      };
      results.push(r);
    }
  }

  const summary: AutomationResult = {
    action: "energy_optimizer",
    description: `Energy audit complete — ${results.length} zone(s) flagged for optimization`,
    impact: `Total daily saving potential: EGP ${totalPotentialSavings.toLocaleString()}`,
    timestamp: ts(),
  };
  results.push(summary);

  return results;
}

// ── Automation 5: Maintenance Detector ──────────────────────

async function runMaintenanceDetector(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000).toISOString();

  // Query maintenance tickets from last 30 days
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select("id, zone_id, category, priority, status, title, created_at, zones(name)")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  if (!tickets || tickets.length === 0) {
    const r: AutomationResult = {
      action: "maintenance_detector",
      description: "No maintenance tickets in the last 30 days",
      impact: "No patterns detected",
      timestamp: ts(),
    };
    results.push(r);
    return results;
  }

  // Group by zone + category
  const groupKey = (t: Record<string, unknown>) =>
    `${t.zone_id || "unknown"}::${t.category || "other"}`;

  const groups: Record<string, Array<Record<string, unknown>>> = {};
  for (const ticket of tickets) {
    const key = groupKey(ticket as Record<string, unknown>);
    if (!groups[key]) groups[key] = [];
    groups[key].push(ticket as Record<string, unknown>);
  }

  // Find patterns (3+ tickets in same zone/category)
  let patternsFound = 0;
  for (const [key, group] of Object.entries(groups)) {
    if (group.length >= 3) {
      patternsFound++;
      const sample = group[0];
      const zoneData = sample.zones as Record<string, unknown> | null;
      const zoneName = (zoneData?.name as string) || "Unknown Zone";
      const category = (sample.category as string) || "other";

      const r: AutomationResult = {
        action: "maintenance_detector",
        description: `Pattern: ${group.length} ${category} tickets in ${zoneName} within 30 days — possible systemic issue`,
        impact: `Investigate root cause to prevent recurring maintenance`,
        timestamp: ts(),
      };
      results.push(r);

      await emitEvent("anomaly.detected", "automations-engine", {
        description: `Maintenance pattern: ${group.length} ${category} tickets in ${zoneName} within 30 days`,
        severity: "warning",
        zone_id: sample.zone_id,
        zone_name: zoneName,
        category,
        ticket_count: group.length,
        source_event: "maintenance_detector",
      }, supabase);
    }
  }

  // Check for urgent tickets unresolved > 48 hours
  const urgentUnresolved = tickets.filter(
    (t: Record<string, unknown>) =>
      ((t.priority as string) === "urgent" || (t.priority as string) === "emergency") &&
      ((t.status as string) === "open" || (t.status as string) === "assigned") &&
      (t.created_at as string) < fortyEightHoursAgo
  );

  for (const ticket of urgentUnresolved) {
    const zoneData = (ticket as Record<string, unknown>).zones as Record<string, unknown> | null;
    const zoneName = (zoneData?.name as string) || "Unknown Zone";
    const title = ((ticket as Record<string, unknown>).title as string) || "Untitled";
    const hoursOpen = Math.round(
      (Date.now() - new Date((ticket as Record<string, unknown>).created_at as string).getTime()) / 3600000
    );

    const r: AutomationResult = {
      action: "maintenance_detector",
      description: `ESCALATION: Urgent ticket "${title}" in ${zoneName} unresolved for ${hoursOpen} hours`,
      impact: "Requires immediate attention — SLA breach risk",
      timestamp: ts(),
    };
    results.push(r);

    await emitEvent("maintenance.created", "automations-engine", {
      ticket_id: (ticket as Record<string, unknown>).id,
      title,
      priority: (ticket as Record<string, unknown>).priority,
      zone_name: zoneName,
      hours_open: hoursOpen,
      escalated: true,
    }, supabase);
  }

  const summary: AutomationResult = {
    action: "maintenance_detector",
    description: `Maintenance scan: ${tickets.length} tickets reviewed, ${patternsFound} patterns, ${urgentUnresolved.length} escalations`,
    impact: patternsFound > 0 ? `${patternsFound} systemic issue(s) require root cause analysis` : "No systemic issues detected",
    timestamp: ts(),
  };
  results.push(summary);

  return results;
}

// ── Automation 6: Footfall Analyzer ─────────────────────────

async function runFootfallAnalyzer(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Get zones
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name")
    .eq("property_id", PROPERTY_ID);

  if (!zones || zones.length === 0) {
    const r: AutomationResult = {
      action: "footfall_analyzer",
      description: "No zones configured for footfall analysis",
      impact: "No action needed",
      timestamp: ts(),
    };
    results.push(r);
    return results;
  }

  // Get active campaigns for cross-reference
  const { data: campaigns } = await supabase
    .from("marketing_campaigns")
    .select("id, name, status, target_zones")
    .eq("status", "active");

  for (const zone of zones) {
    const zoneId = zone.id as string;
    const zoneName = (zone.name as string) || "Unknown";

    // Today's footfall
    const { data: todayData } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("zone_id", zoneId)
      .eq("date", today);

    const todayTotal = (todayData || []).reduce(
      (sum: number, f: Record<string, unknown>) =>
        sum + ((f.total_in as number) || 0),
      0
    );

    // 7-day average
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const { data: weekData } = await supabase
      .from("footfall_daily")
      .select("total_in, date")
      .eq("zone_id", zoneId)
      .gte("date", sevenDaysAgo)
      .lt("date", today);

    const weekTotal = (weekData || []).reduce(
      (sum: number, f: Record<string, unknown>) =>
        sum + ((f.total_in as number) || 0),
      0
    );
    const daysWithData = new Set((weekData || []).map((f: Record<string, unknown>) => f.date)).size;
    const weekAvg = daysWithData > 0 ? weekTotal / daysWithData : 0;

    if (weekAvg === 0 || todayTotal === 0) continue;

    const changePct = ((todayTotal - weekAvg) / weekAvg) * 100;

    // Check if any active campaign targets this zone
    const zoneCampaigns = (campaigns || []).filter((c: Record<string, unknown>) => {
      const targets = c.target_zones as string[] | null;
      return targets && targets.includes(zoneId);
    });

    if (changePct < -25) {
      // Drop > 25%
      const r: AutomationResult = {
        action: "footfall_analyzer",
        description: `ALERT: ${zoneName} footfall dropped ${Math.abs(Math.round(changePct))}% vs 7-day average (${todayTotal} vs avg ${Math.round(weekAvg)})`,
        impact: zoneCampaigns.length > 0
          ? `Active campaign "${(zoneCampaigns[0] as Record<string, unknown>).name}" may need adjustment`
          : "No active campaign — consider promotional response",
        timestamp: ts(),
      };
      results.push(r);

      await emitEvent("footfall.drop", "automations-engine", {
        zone_id: zoneId,
        zone_name: zoneName,
        today_total: todayTotal,
        week_avg: Math.round(weekAvg),
        drop_pct: Math.round(Math.abs(changePct)),
        has_campaign: zoneCampaigns.length > 0,
      }, supabase);
    } else if (changePct > 30) {
      // Spike > 30%
      const r: AutomationResult = {
        action: "footfall_analyzer",
        description: `SPIKE: ${zoneName} footfall up ${Math.round(changePct)}% vs 7-day average (${todayTotal} vs avg ${Math.round(weekAvg)})`,
        impact: zoneCampaigns.length > 0
          ? `Campaign "${(zoneCampaigns[0] as Record<string, unknown>).name}" appears to be driving traffic`
          : "Investigate cause — capitalize on increased traffic",
        timestamp: ts(),
      };
      results.push(r);

      await emitEvent("footfall.spike", "automations-engine", {
        zone_id: zoneId,
        zone_name: zoneName,
        today_total: todayTotal,
        week_avg: Math.round(weekAvg),
        spike_pct: Math.round(changePct),
        has_campaign: zoneCampaigns.length > 0,
      }, supabase);
    }
  }

  if (results.length === 0) {
    const r: AutomationResult = {
      action: "footfall_analyzer",
      description: "All zones within normal footfall range",
      impact: "No alerts",
      timestamp: ts(),
    };
    results.push(r);
  }

  return results;
}

// ── Automation 7: Tenant Scorer ─────────────────────────────

async function runTenantScorer(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000).toISOString().split("T")[0];

  // Get all active tenants with lease and unit info
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, category, leases(id, unit_id, status, units(area_sqm, zone_id))")
    .eq("status", "active");

  if (!tenants || tenants.length === 0) {
    const r: AutomationResult = {
      action: "tenant_scorer",
      description: "No active tenants to score",
      impact: "No scoring needed",
      timestamp: ts(),
    };
    results.push(r);
    return results;
  }

  interface TenantScore {
    id: string;
    name: string;
    category: string;
    score: number;
    revenuePerSqm: number;
    paymentReliability: number;
    discrepancyRisk: boolean;
    footfallShare: number;
  }

  const scores: TenantScore[] = [];

  for (const tenant of tenants) {
    const tenantId = tenant.id as string;
    const tenantName = (tenant.name as string) || "Unknown";
    const category = (tenant.category as string) || "other";

    const leases = (tenant.leases as Array<Record<string, unknown>>) || [];
    const activeLease = leases.find((l: Record<string, unknown>) => l.status === "active");
    if (!activeLease) continue;

    const unitData = activeLease.units as Record<string, unknown> | null;
    const areaSqm = (unitData?.area_sqm as number) || 1;
    const zoneId = (unitData?.zone_id as string) || null;

    // 1. Revenue/sqm
    const { data: salesData } = await supabase
      .from("tenant_sales_reported")
      .select("reported_revenue_egp")
      .eq("tenant_id", tenantId)
      .gte("submission_date", sixMonthsAgo);

    const totalSales = (salesData || []).reduce(
      (sum: number, s: Record<string, unknown>) =>
        sum + ((s.reported_revenue_egp as number) || 0),
      0
    );
    const months = Math.max(1, salesData?.length || 1);
    const monthlyRevenue = totalSales / months;
    const revenuePerSqm = monthlyRevenue / areaSqm;

    // 2. Payment reliability (on-time %)
    const leaseId = activeLease.id as string;
    const { data: allPayments } = await supabase
      .from("rent_transactions")
      .select("status")
      .eq("lease_id", leaseId)
      .limit(12);

    const totalPayments = allPayments?.length || 0;
    const onTimePayments = (allPayments || []).filter(
      (p: Record<string, unknown>) => p.status === "paid"
    ).length;
    const paymentReliability = totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 50;

    // 3. Discrepancy risk
    const { data: discrepancies } = await supabase
      .from("discrepancies")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "flagged")
      .limit(1);

    const hasDiscrepancy = (discrepancies?.length || 0) > 0;

    // 4. Footfall contribution (approximate)
    let footfallShare = 0;
    if (zoneId) {
      const today = now.toISOString().split("T")[0];
      const { data: zoneFootfall } = await supabase
        .from("footfall_daily")
        .select("total_in")
        .eq("zone_id", zoneId)
        .eq("date", today);

      const zoneTotal = (zoneFootfall || []).reduce(
        (sum: number, f: Record<string, unknown>) =>
          sum + ((f.total_in as number) || 0),
        0
      );

      // Get total zone area
      const { data: zoneUnits } = await supabase
        .from("units")
        .select("area_sqm")
        .eq("zone_id", zoneId)
        .eq("status", "occupied");

      const totalZoneArea = (zoneUnits || []).reduce(
        (sum: number, u: Record<string, unknown>) =>
          sum + ((u.area_sqm as number) || 0),
        0
      );

      footfallShare = totalZoneArea > 0 ? (areaSqm / totalZoneArea) * 100 : 0;
    }

    // Calculate composite score (0-100)
    let score = 0;
    score += Math.min(40, (revenuePerSqm / 200) * 40); // Up to 40 points for revenue/sqm
    score += (paymentReliability / 100) * 30; // Up to 30 points for payment reliability
    score += hasDiscrepancy ? 0 : 15; // 15 points for no discrepancies
    score += Math.min(15, (footfallShare / 10) * 15); // Up to 15 points for footfall contribution

    scores.push({
      id: tenantId,
      name: tenantName,
      category,
      score: Math.round(score),
      revenuePerSqm: Math.round(revenuePerSqm),
      paymentReliability: Math.round(paymentReliability),
      discrepancyRisk: hasDiscrepancy,
      footfallShare: Math.round(footfallShare * 10) / 10,
    });
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // Top 10
  const top10 = scores.slice(0, 10);
  for (const t of top10) {
    const r: AutomationResult = {
      action: "tenant_scorer",
      description: `TOP: ${t.name} (${t.category}) — Score ${t.score}/100, EGP ${t.revenuePerSqm}/sqm, ${t.paymentReliability}% on-time`,
      impact: "Retain and prioritize for renewal",
      timestamp: ts(),
    };
    results.push(r);
  }

  // Bottom 10
  const bottom10 = scores.slice(-Math.min(10, scores.length)).reverse();
  for (const t of bottom10) {
    const r: AutomationResult = {
      action: "tenant_scorer",
      description: `FLAGGED: ${t.name} (${t.category}) — Score ${t.score}/100, EGP ${t.revenuePerSqm}/sqm, ${t.paymentReliability}% on-time${t.discrepancyRisk ? ", DISCREPANCY" : ""}`,
      impact: `Consider replacement — below portfolio average`,
      timestamp: ts(),
    };
    results.push(r);
  }

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;

  const summary: AutomationResult = {
    action: "tenant_scorer",
    description: `Tenant scoring complete — ${scores.length} tenants scored, portfolio avg ${avgScore}/100`,
    impact: `Top: ${top10[0]?.name || "N/A"} (${top10[0]?.score || 0}), Bottom: ${bottom10[0]?.name || "N/A"} (${bottom10[0]?.score || 0})`,
    timestamp: ts(),
  };
  results.push(summary);

  return results;
}

// ── Automation Registry ─────────────────────────────────────

const automations: AutomationDefinition[] = [
  {
    id: "auto-lease-monitor",
    name: "Lease Monitor",
    type: "lease_monitor",
    description: "Flags expiring leases, checks tenant performance, recommends renewals or replacements",
    run: runLeaseMonitor,
  },
  {
    id: "auto-rent-collector",
    name: "Rent Collector",
    type: "rent_collector",
    description: "Identifies overdue rent, detects chronic late payers, creates finance notifications",
    run: runRentCollector,
  },
  {
    id: "auto-revenue-verifier",
    name: "Revenue Verifier",
    type: "revenue_verifier",
    description: "Cross-references reported sales with footfall estimates, flags underreporting discrepancies",
    run: runRevenueVerifier,
  },
  {
    id: "auto-energy-optimizer",
    name: "Energy Optimizer",
    type: "energy_optimizer",
    description: "Compares energy usage with footfall per zone, identifies waste and calculates savings",
    run: runEnergyOptimizer,
  },
  {
    id: "auto-maintenance-detector",
    name: "Maintenance Detector",
    type: "maintenance_detector",
    description: "Detects ticket patterns by zone/category, escalates overdue urgent tickets",
    run: runMaintenanceDetector,
  },
  {
    id: "auto-footfall-analyzer",
    name: "Footfall Analyzer",
    type: "footfall_analyzer",
    description: "Compares zone footfall vs 7-day average, cross-references with active campaigns",
    run: runFootfallAnalyzer,
  },
  {
    id: "auto-tenant-scorer",
    name: "Tenant Scorer",
    type: "tenant_scorer",
    description: "Scores all tenants on revenue, payment reliability, discrepancies, and footfall contribution",
    run: runTenantScorer,
  },
];

// ── State persistence ───────────────────────────────────────

function sanitizeState(raw: Record<string, unknown> | null | undefined): AutomationState {
  const r = raw || {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    last_run: typeof r.last_run === "string" ? r.last_run : null,
    actions_taken:
      typeof r.actions_taken === "number" && Number.isFinite(r.actions_taken) && r.actions_taken > 0
        ? Math.floor(r.actions_taken)
        : 0,
    last_results: Array.isArray(r.last_results) ? (r.last_results as AutomationResult[]) : [],
  };
}

async function loadStates(supabase: SupabaseClient): Promise<Map<string, AutomationState>> {
  const rows = await readSettingsByPrefix(supabase, STATE_PREFIX);
  const out = new Map<string, AutomationState>();
  for (const def of automations) out.set(def.id, sanitizeState(rows.get(STATE_PREFIX + def.id)));
  return out;
}

function toMeta(def: AutomationDefinition, state: AutomationState): AutomationMeta {
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    description: def.description,
    enabled: state.enabled,
    last_run: state.last_run,
    actions_taken: state.actions_taken,
    results: state.last_results,
  };
}

/** Append a run (or failure) to the system_events log. Best effort. */
async function logRun(
  supabase: SupabaseClient,
  def: AutomationDefinition,
  results: AutomationResult[],
  failed: boolean,
  trigger: string
): Promise<void> {
  const { error } = await supabase.from("system_events").insert({
    type: failed ? "automation.error" : "automation.run",
    source_system: "automations",
    payload: {
      property_id: PROPERTY_ID,
      automation_id: def.id,
      automation_type: def.type,
      name: def.name,
      trigger,
      action_count: failed ? 0 : results.length,
      results,
    },
    processed: true,
    results: [],
  });
  if (error) logger.error({ err: error, automationId: def.id }, "Failed to log automation run");
}

/**
 * Execute one automation, persist its state and log the run.
 * A thrown error becomes a single error result; last_run is left unchanged.
 */
async function executeAutomation(
  supabase: SupabaseClient,
  def: AutomationDefinition,
  trigger: string
): Promise<{ results: AutomationResult[]; failed: boolean }> {
  let results: AutomationResult[];
  let failed = false;
  try {
    results = await def.run(supabase);
  } catch (err) {
    failed = true;
    results = [{
      action: def.type,
      description: `Error in ${def.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
      impact: "Automation failed — check logs",
      timestamp: ts(),
    }];
  }

  // Persistence is best effort: a logging failure must not hide the results.
  try {
    if (!failed) {
      // Re-read just before writing so a concurrent toggle is not overwritten.
      const state = sanitizeState(await readSetting(supabase, STATE_PREFIX + def.id));
      await writeSetting(supabase, STATE_PREFIX + def.id, {
        ...state,
        last_run: ts(),
        actions_taken: state.actions_taken + results.length,
        last_results: results.slice(0, MAX_STORED_RESULTS),
      });
    }
    await logRun(supabase, def, results, failed, trigger);
  } catch (err) {
    logger.error({ err, automationId: def.id }, "Failed to persist automation run");
  }
  return { results, failed };
}

// ── Public API ──────────────────────────────────────────────

export async function getAutomations(supabase: SupabaseClient): Promise<AutomationMeta[]> {
  const states = await loadStates(supabase);
  return automations.map((def) => toMeta(def, states.get(def.id)!));
}

/** Persist an enabled flag. Returns null for an unknown id; throws if the write fails. */
export async function toggleAutomation(
  supabase: SupabaseClient,
  id: string,
  enabled: boolean,
  opts: { updatedBy?: string | null } = {}
): Promise<AutomationMeta | null> {
  const def = automations.find((a) => a.id === id);
  if (!def) return null;
  const state = sanitizeState(await readSetting(supabase, STATE_PREFIX + id));
  const next = { ...state, enabled };
  const ok = await writeSetting(supabase, STATE_PREFIX + id, { ...next }, { updatedBy: opts.updatedBy });
  if (!ok) throw new Error("Failed to save automation state");
  return toMeta(def, next);
}

/** Newest-first flattened results from the system_events run log. */
export async function getAutomationLog(
  supabase: SupabaseClient,
  limit: number = 100
): Promise<AutomationResult[]> {
  const { data, error } = await supabase
    .from("system_events")
    .select("payload, created_at")
    .in("type", [...AUTOMATION_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return [];
  const out: AutomationResult[] = [];
  for (const row of data as Array<{ payload?: { results?: unknown } }>) {
    const results = row?.payload?.results;
    if (Array.isArray(results)) out.push(...(results as AutomationResult[]));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Run one automation now (manual trigger — runs even when disabled). */
export async function runAutomation(
  id: string,
  supabase: SupabaseClient,
  trigger: string = "manual"
): Promise<AutomationResult[]> {
  const def = automations.find((a) => a.id === id);
  if (!def) return [];
  return (await executeAutomation(supabase, def, trigger)).results;
}

export async function runAllAutomations(
  supabase: SupabaseClient,
  trigger: string = "manual"
): Promise<{ total_actions: number; results: Record<string, AutomationResult[]> }> {
  const allResults: Record<string, AutomationResult[]> = {};
  let totalActions = 0;
  let ranCount = 0;
  const states = await loadStates(supabase);

  for (const def of automations) {
    if (!states.get(def.id)!.enabled) {
      allResults[def.id] = [{
        action: def.type,
        description: `${def.name} is disabled — skipped`,
        impact: "No action",
        timestamp: ts(),
      }];
      continue;
    }
    ranCount++;
    const { results, failed } = await executeAutomation(supabase, def, trigger);
    allResults[def.id] = results;
    if (!failed) totalActions += results.length;
  }

  // Create summary notification
  await createNotification(supabase, {
    title: `Smart Automations Complete`,
    message: `${ranCount} automations ran, ${totalActions} total actions taken`,
    type: "info",
    category: "automations",
    link: "/dashboard/ai/automations",
  });

  return { total_actions: totalActions, results: allResults };
}

// ── Scheduler (driven by Vercel Cron → /api/v1/ai/cron) ─────

export type ScheduledJob = "cycle" | "automations";

export interface SchedulerState {
  /** Master switch for scheduled jobs (manual "run now" ignores it). */
  enabled: boolean;
  /** Minimum minutes between scheduler cycles. Cron fires hourly, so ≥ 60. */
  interval_minutes: number;
  last_run: string | null;
  total_cycles: number;
  automations_last_run: string | null;
}

const SCHEDULER_KEY = "scheduler";
export const SCHEDULER_INTERVAL_MIN = 60;
export const SCHEDULER_INTERVAL_MAX = 1440;
/** Cron jitter allowance so an hourly cron is not skipped for being 1s early. */
const DUE_SLACK_MS = 5 * 60 * 1000;

function clampSchedulerInterval(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(SCHEDULER_INTERVAL_MIN, Math.min(SCHEDULER_INTERVAL_MAX, Math.round(v)));
}

function sanitizeScheduler(raw: Record<string, unknown> | null): SchedulerState {
  const r = raw || {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    interval_minutes: clampSchedulerInterval(r.interval_minutes) ?? SCHEDULER_INTERVAL_MIN,
    last_run: typeof r.last_run === "string" ? r.last_run : null,
    total_cycles:
      typeof r.total_cycles === "number" && Number.isFinite(r.total_cycles) && r.total_cycles > 0
        ? Math.floor(r.total_cycles)
        : 0,
    automations_last_run: typeof r.automations_last_run === "string" ? r.automations_last_run : null,
  };
}

export async function getSchedulerState(supabase: SupabaseClient): Promise<SchedulerState> {
  return sanitizeScheduler(await readSetting(supabase, SCHEDULER_KEY));
}

/** Persist enabled / interval changes. Throws if the write fails. */
export async function updateSchedulerState(
  supabase: SupabaseClient,
  updates: { enabled?: boolean; interval_minutes?: number },
  opts: { updatedBy?: string | null } = {}
): Promise<SchedulerState> {
  const state = await getSchedulerState(supabase);
  const next = { ...state };
  if (typeof updates.enabled === "boolean") next.enabled = updates.enabled;
  const interval = clampSchedulerInterval(updates.interval_minutes);
  if (interval !== null) next.interval_minutes = interval;
  const ok = await writeSetting(supabase, SCHEDULER_KEY, { ...next }, { updatedBy: opts.updatedBy });
  if (!ok) throw new Error("Failed to save scheduler state");
  return next;
}

/** Shallow merge into the scheduler row, re-reading first (best effort). */
async function patchSchedulerState(
  supabase: SupabaseClient,
  patch: (s: SchedulerState) => Partial<SchedulerState>
): Promise<void> {
  const state = await getSchedulerState(supabase);
  await writeSetting(supabase, SCHEDULER_KEY, { ...state, ...patch(state) });
}

export interface ScheduledJobOutcome {
  job: ScheduledJob;
  status: "ran" | "skipped" | "locked";
  reason?: string;
  results?: Record<string, unknown>;
}

/**
 * Run a scheduled job idempotently. Cron calls this with force=false (honours
 * the scheduler switch and interval); an owner's "run now" passes force=true.
 * A lock row in system_settings guarantees at most one run of a job at a time.
 */
export async function runScheduledJob(
  supabase: SupabaseClient,
  job: ScheduledJob,
  opts: { force?: boolean; trigger?: "cron" | "manual" } = {}
): Promise<ScheduledJobOutcome> {
  const force = opts.force ?? false;
  const trigger = opts.trigger ?? "cron";
  const state = await getSchedulerState(supabase);

  if (!force && !state.enabled) return { job, status: "skipped", reason: "scheduler disabled" };
  if (!force && job === "cycle" && state.last_run) {
    const elapsed = Date.now() - new Date(state.last_run).getTime();
    if (elapsed + DUE_SLACK_MS < state.interval_minutes * 60_000) {
      return { job, status: "skipped", reason: `not due (interval ${state.interval_minutes}m)` };
    }
  }

  const lockName = job === "cycle" ? "scheduler_cycle" : "automations";
  const holder = await acquireJobLock(supabase, lockName, JOB_LOCK_TTL_MS);
  if (!holder) return { job, status: "locked", reason: "another run is in progress" };

  try {
    const results =
      job === "cycle"
        ? await executeSchedulerCycle(supabase, trigger)
        : await executeAutomationsJob(supabase, trigger);
    return { job, status: "ran", results };
  } finally {
    await releaseJobLock(supabase, lockName, holder);
  }
}

/** Daily job: smart automations + ML model retraining. */
async function executeAutomationsJob(
  supabase: SupabaseClient,
  trigger: string
): Promise<Record<string, unknown>> {
  const start = Date.now();
  const results: Record<string, unknown> = { timestamp: ts(), trigger };

  try {
    const autoResult = await runAllAutomations(supabase, trigger);
    results.automations = {
      total_actions: autoResult.total_actions,
      automation_count: Object.keys(autoResult.results).length,
    };
  } catch (err) {
    results.automations_error = err instanceof Error ? err.message : "Automations failed";
  }

  try {
    const [footfallModel, revenueModel] = await Promise.all([
      trainFootfallModel(supabase),
      trainRevenueModel(supabase),
    ]);
    results.predictions = {
      footfall_r2: footfallModel.r_squared,
      footfall_samples: footfallModel.training_samples,
      revenue_r2: revenueModel.r_squared,
      revenue_samples: revenueModel.training_samples,
    };
  } catch (err) {
    results.predictions_error = err instanceof Error ? err.message : "ML retraining failed";
  }

  results.duration_ms = Date.now() - start;
  await patchSchedulerState(supabase, () => ({ automations_last_run: results.timestamp as string }));
  await supabase.from("system_events").insert({
    type: "scheduler.automations_completed",
    source_system: "scheduler",
    payload: results,
    processed: true,
    results: [],
  });
  return results;
}

/** Hourly job: AI Brain cycle + operational checks. */
async function executeSchedulerCycle(
  supabase: SupabaseClient,
  trigger: string
): Promise<Record<string, unknown>> {
  const start = Date.now();
  const timestamp = ts();
  const results: Record<string, unknown> = { timestamp, trigger };

  try {
    // 0. AI Brain cycle (if enabled; skipped if a manual cycle is running)
    const brainConfig = await getBrainConfig(supabase);
    if (brainConfig.enabled) {
      try {
        const brainResult = await runBrainCycleExclusive(supabase);
        results.brain = brainResult
          ? {
              cycle_id: brainResult.cycle_id,
              decisions: brainResult.decisions.length,
              source: brainResult.source,
              model: brainResult.model,
              fallback_reason: brainResult.fallback_reason,
              summary: brainResult.summary,
              duration_ms: brainResult.duration_ms,
            }
          : { skipped: true, reason: "Brain cycle already running" };
      } catch (err) {
        results.brain_error = err instanceof Error ? err.message : "Brain cycle failed";
      }
    } else {
      results.brain = { skipped: true, reason: "Brain disabled" };
    }

    // 1. Expiring leases (within 90 days)
    const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
    const { data: expiringLeases } = await supabase
      .from("leases")
      .select("id, tenant_id, end_date, tenants(name)")
      .eq("status", "active")
      .lte("end_date", ninetyDaysOut);

    if (expiringLeases && expiringLeases.length > 0) {
      for (const lease of expiringLeases.slice(0, 3)) {
        const tenantName = (lease.tenants as unknown as Record<string, unknown> | null)?.name || "Unknown";
        await emitEvent("lease.expiring", "scheduler", {
          lease_id: lease.id,
          tenant_id: lease.tenant_id,
          tenant_name: tenantName,
          end_date: lease.end_date,
        }, supabase);
      }
      results.expiring_leases = expiringLeases.length;
    }

    // 2. Overdue rent
    const { data: overdueRent } = await supabase
      .from("rent_transactions")
      .select("id")
      .eq("status", "overdue")
      .limit(10);
    results.overdue_rent = overdueRent?.length || 0;

    // 3. Anomalies
    const { data: activeAnomalies } = await supabase
      .from("anomalies")
      .select("id, severity")
      .eq("status", "active");
    results.active_anomalies = activeAnomalies?.length || 0;
    results.critical_anomalies = (activeAnomalies || []).filter(
      (a: Record<string, unknown>) => a.severity === "critical"
    ).length;

    // 4. Footfall today vs yesterday
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const [{ data: todayFootfall }, { data: yesterdayFootfall }] = await Promise.all([
      supabase.from("footfall_daily").select("total_in").eq("date", today),
      supabase.from("footfall_daily").select("total_in").eq("date", yesterday),
    ]);
    const sum = (rows: Array<Record<string, unknown>> | null) =>
      (rows || []).reduce((s: number, r) => s + ((r.total_in as number) || 0), 0);
    const todayTotal = sum(todayFootfall);
    const yesterdayTotal = sum(yesterdayFootfall);
    if (yesterdayTotal > 0 && todayTotal < yesterdayTotal * 0.7) {
      await emitEvent("footfall.drop", "scheduler", {
        today_total: todayTotal,
        yesterday_total: yesterdayTotal,
        drop_pct: Math.round((1 - todayTotal / yesterdayTotal) * 100),
      }, supabase);
      results.footfall_alert = true;
    }
    results.footfall_today = todayTotal;

    // 5. Energy today
    const { data: energyToday } = await supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .gte("timestamp", today);
    results.energy_kwh_today = Math.round(
      (energyToday || []).reduce((s: number, r: Record<string, unknown>) => s + ((r.consumption_kwh as number) || 0), 0)
    );
    results.energy_cost_today = Math.round(
      (energyToday || []).reduce((s: number, r: Record<string, unknown>) => s + ((r.cost_egp as number) || 0), 0)
    );
  } catch (err) {
    results.error = err instanceof Error ? err.message : "Cycle failed";
  }

  results.duration_ms = Date.now() - start;
  await patchSchedulerState(supabase, (s) => ({ last_run: timestamp, total_cycles: s.total_cycles + 1 }));
  await supabase.from("system_events").insert({
    type: "scheduler.cycle_completed",
    source_system: "scheduler",
    payload: results,
    processed: true,
    results: [],
  });
  return results;
}
