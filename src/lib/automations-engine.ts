import { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/event-bus";
import { createNotification } from "@/lib/notifications";

// ============================================================
// Wedja Smart Automations Engine
//
// 7 rule-based automations that execute real operations against
// Supabase data for Senzo Mall commercial property management.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

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

export interface Automation {
  id: string;
  name: string;
  type: AutomationType;
  description: string;
  enabled: boolean;
  last_run: string | null;
  actions_taken: number;
  results: AutomationResult[];
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

// ── In-memory state ────────────────────────────────────────

const automationLog: AutomationResult[] = [];
const MAX_LOG = 200;

function logResult(result: AutomationResult): void {
  automationLog.unshift(result);
  if (automationLog.length > MAX_LOG) automationLog.length = MAX_LOG;
}

export function getAutomationLog(): AutomationResult[] {
  return [...automationLog];
}

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
    logResult(r);
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
    logResult(r);

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
    logResult(r);
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
    logResult(r);

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
  logResult(summary);

  return results;
}

// ── Automation 3: Revenue Verifier ──────────────────────────

async function runRevenueVerifier(supabase: SupabaseClient): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Category-based conversion rates and average ticket sizes
  const categoryParams: Record<string, { conversion: number; avgTicket: number }> = {
    fashion: { conversion: 0.20, avgTicket: 550 },
    food: { conversion: 0.50, avgTicket: 175 },
    entertainment: { conversion: 0.40, avgTicket: 140 },
    grocery: { conversion: 0.70, avgTicket: 350 },
    services: { conversion: 0.27, avgTicket: 275 },
    electronics: { conversion: 0.15, avgTicket: 1200 },
    other: { conversion: 0.25, avgTicket: 300 },
  };

  // Get tenants with their categories and units
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, category, leases(id, unit_id, units(id, zone_id, area_sqm))")
    .eq("status", "active");

  if (!tenants || tenants.length === 0) {
    const r: AutomationResult = {
      action: "revenue_verifier",
      description: "No active tenants to verify",
      impact: "No verification needed",
      timestamp: ts(),
    };
    results.push(r);
    logResult(r);
    return results;
  }

  let totalVariance = 0;
  let flaggedCount = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id as string;
    const tenantName = (tenant.name as string) || "Unknown";
    const category = ((tenant.category as string) || "other").toLowerCase();
    const params = categoryParams[category] || categoryParams.other;

    // Get leases for this tenant
    const leases = (tenant.leases as Array<Record<string, unknown>>) || [];
    if (leases.length === 0) continue;

    // Get reported sales for current month
    const { data: salesData } = await supabase
      .from("tenant_sales_reported")
      .select("reported_revenue_egp")
      .eq("tenant_id", tenantId)
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .limit(1);

    const reportedRevenue = (salesData && salesData.length > 0)
      ? (salesData[0] as Record<string, unknown>).reported_revenue_egp as number || 0
      : 0;

    if (reportedRevenue === 0) continue; // No reported data to verify

    // Get unit zone IDs for footfall
    const unitData = leases[0]?.units as Record<string, unknown> | null;
    const zoneId = unitData?.zone_id as string | null;

    if (!zoneId) continue;

    // Get zone footfall for current month (using daily aggregates)
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const { data: footfallData } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("zone_id", zoneId)
      .gte("date", monthStart);

    const totalFootfall = (footfallData || []).reduce(
      (sum: number, f: Record<string, unknown>) =>
        sum + ((f.total_in as number) || 0),
      0
    );

    if (totalFootfall === 0) continue;

    // Estimate revenue: footfall * conversion * avg_ticket
    // Weighted by tenant's unit area as proportion of zone
    const unitArea = (unitData?.area_sqm as number) || 50;

    // Get total zone area for proportion
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

    const areaShare = totalZoneArea > 0 ? unitArea / totalZoneArea : 0.1;
    const estimatedFootfall = totalFootfall * areaShare;
    const estimatedRevenue = estimatedFootfall * params.conversion * params.avgTicket;

    if (estimatedRevenue === 0) continue;

    const varianceEgp = estimatedRevenue - reportedRevenue;
    const variancePct = (varianceEgp / estimatedRevenue) * 100;

    // Flag if variance > 25%
    if (variancePct > 25 && varianceEgp > 5000) {
      flaggedCount++;
      totalVariance += varianceEgp;

      // Create or update discrepancy record
      const { data: existing } = await supabase
        .from("discrepancies")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("period_month", currentMonth)
        .eq("period_year", currentYear)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("discrepancies")
          .update({
            estimated_revenue_egp: Math.round(estimatedRevenue),
            reported_revenue_egp: Math.round(reportedRevenue),
            variance_egp: Math.round(varianceEgp),
            variance_pct: Math.round(variancePct),
            status: "flagged",
            flagged_at: ts(),
          })
          .eq("id", (existing[0] as Record<string, unknown>).id);
      } else {
        await supabase.from("discrepancies").insert({
          property_id: PROPERTY_ID,
          unit_id: unitData?.id || null,
          tenant_id: tenantId,
          period_month: currentMonth,
          period_year: currentYear,
          reported_revenue_egp: Math.round(reportedRevenue),
          estimated_revenue_egp: Math.round(estimatedRevenue),
          variance_egp: Math.round(varianceEgp),
          variance_pct: Math.round(variancePct),
          confidence: Math.min(90, 50 + (footfallData?.length || 0) * 2),
          status: "flagged",
          flagged_at: ts(),
        });
      }

      const r: AutomationResult = {
        action: "revenue_verifier",
        description: `${tenantName} (${category}) — reported EGP ${reportedRevenue.toLocaleString()} vs estimated EGP ${Math.round(estimatedRevenue).toLocaleString()} (${Math.round(variancePct)}% variance)`,
        impact: `EGP ${Math.round(varianceEgp).toLocaleString()} potential underreporting`,
        timestamp: ts(),
      };
      results.push(r);
      logResult(r);

      // Emit underreporting event
      await emitEvent("tenant.underreporting", "automations-engine", {
        tenant_id: tenantId,
        tenant_name: tenantName,
        reported_revenue: Math.round(reportedRevenue),
        estimated_revenue: Math.round(estimatedRevenue),
        variance_egp: Math.round(varianceEgp),
        variance_pct: Math.round(variancePct),
        category,
      }, supabase);
    }
  }

  const summary: AutomationResult = {
    action: "revenue_verifier",
    description: `Revenue verification complete — ${flaggedCount} tenants flagged for underreporting`,
    impact: `Total potential recovery: EGP ${Math.round(totalVariance).toLocaleString()}`,
    timestamp: ts(),
  };
  results.push(summary);
  logResult(summary);

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
    logResult(r);
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
      logResult(r);

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
      logResult(r);
    }
  }

  const summary: AutomationResult = {
    action: "energy_optimizer",
    description: `Energy audit complete — ${results.length} zone(s) flagged for optimization`,
    impact: `Total daily saving potential: EGP ${totalPotentialSavings.toLocaleString()}`,
    timestamp: ts(),
  };
  results.push(summary);
  logResult(summary);

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
    logResult(r);
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
      logResult(r);

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
    logResult(r);

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
  logResult(summary);

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
    logResult(r);
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
      logResult(r);

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
      logResult(r);

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
    logResult(r);
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
    logResult(r);
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
    logResult(r);
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
    logResult(r);
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
  logResult(summary);

  return results;
}

// ── Automation Registry ─────────────────────────────────────

const automations: Automation[] = [
  {
    id: "auto-lease-monitor",
    name: "Lease Monitor",
    type: "lease_monitor",
    description: "Flags expiring leases, checks tenant performance, recommends renewals or replacements",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runLeaseMonitor,
  },
  {
    id: "auto-rent-collector",
    name: "Rent Collector",
    type: "rent_collector",
    description: "Identifies overdue rent, detects chronic late payers, creates finance notifications",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runRentCollector,
  },
  {
    id: "auto-revenue-verifier",
    name: "Revenue Verifier",
    type: "revenue_verifier",
    description: "Cross-references reported sales with footfall estimates, flags underreporting discrepancies",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runRevenueVerifier,
  },
  {
    id: "auto-energy-optimizer",
    name: "Energy Optimizer",
    type: "energy_optimizer",
    description: "Compares energy usage with footfall per zone, identifies waste and calculates savings",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runEnergyOptimizer,
  },
  {
    id: "auto-maintenance-detector",
    name: "Maintenance Detector",
    type: "maintenance_detector",
    description: "Detects ticket patterns by zone/category, escalates overdue urgent tickets",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runMaintenanceDetector,
  },
  {
    id: "auto-footfall-analyzer",
    name: "Footfall Analyzer",
    type: "footfall_analyzer",
    description: "Compares zone footfall vs 7-day average, cross-references with active campaigns",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runFootfallAnalyzer,
  },
  {
    id: "auto-tenant-scorer",
    name: "Tenant Scorer",
    type: "tenant_scorer",
    description: "Scores all tenants on revenue, payment reliability, discrepancies, and footfall contribution",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    results: [],
    run: runTenantScorer,
  },
];

// ── Public API ──────────────────────────────────────────────

export function getAutomations(): AutomationMeta[] {
  return automations.map(({ run: _run, ...meta }) => meta);
}

export function toggleAutomation(id: string, enabled: boolean): AutomationMeta | null {
  const automation = automations.find((a) => a.id === id);
  if (!automation) return null;
  automation.enabled = enabled;
  const { run: _run, ...meta } = automation;
  return meta;
}

export async function runAutomation(
  id: string,
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const automation = automations.find((a) => a.id === id);
  if (!automation) return [];

  try {
    const runResults = await automation.run(supabase);
    automation.last_run = new Date().toISOString();
    automation.actions_taken += runResults.length;
    automation.results = runResults;
    return runResults;
  } catch (err) {
    const errorResult: AutomationResult = {
      action: automation.type,
      description: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      impact: "Automation failed — check logs",
      timestamp: new Date().toISOString(),
    };
    logResult(errorResult);
    return [errorResult];
  }
}

export async function runAllAutomations(
  supabase: SupabaseClient
): Promise<{ total_actions: number; results: Record<string, AutomationResult[]> }> {
  const allResults: Record<string, AutomationResult[]> = {};
  let totalActions = 0;

  for (const automation of automations) {
    if (!automation.enabled) {
      allResults[automation.id] = [{
        action: automation.type,
        description: `${automation.name} is disabled — skipped`,
        impact: "No action",
        timestamp: new Date().toISOString(),
      }];
      continue;
    }

    try {
      const runResults = await automation.run(supabase);
      automation.last_run = new Date().toISOString();
      automation.actions_taken += runResults.length;
      automation.results = runResults;
      allResults[automation.id] = runResults;
      totalActions += runResults.length;
    } catch (err) {
      const errorResult: AutomationResult = {
        action: automation.type,
        description: `Error in ${automation.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
        impact: "Automation failed",
        timestamp: new Date().toISOString(),
      };
      allResults[automation.id] = [errorResult];
      logResult(errorResult);
    }
  }

  // Create summary notification
  await createNotification(supabase, {
    title: `Smart Automations Complete`,
    message: `${automations.filter((a) => a.enabled).length} automations ran, ${totalActions} total actions taken`,
    type: "info",
    category: "automations",
    link: "/dashboard/ai/automations",
  });

  return { total_actions: totalActions, results: allResults };
}
