import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Wedja Anomaly Detection Engine — The Watchdog
//
// Watches footfall, energy, revenue, queues, parking,
// maintenance, and cross-data correlations 24/7.
// Flags anything unusual with severity, confidence, and
// estimated financial impact.
//
// Works with REAL Senzo Mall data: 166 tenants, 47K footfall
// readings, 11K energy readings, 1,618 rent transactions.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export type AnomalyType =
  | "footfall_spike"
  | "footfall_drop"
  | "energy_spike"
  | "energy_drop"
  | "revenue_anomaly"
  | "rent_delay_pattern"
  | "queue_anomaly"
  | "parking_anomaly"
  | "security_pattern"
  | "maintenance_pattern"
  | "conversion_anomaly"
  | "occupancy_anomaly"
  | "correlation_break";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export type AnomalyStatus =
  | "active"
  | "acknowledged"
  | "investigating"
  | "resolved"
  | "false_alarm";

export interface Anomaly {
  id: string;
  property_id: string;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  zone_id: string | null;
  unit_id: string | null;
  tenant_id: string | null;
  title: string;
  description: string;
  expected_value: number | null;
  actual_value: number | null;
  deviation_pct: number | null;
  impact_egp: number | null;
  data_source: string | null;
  related_anomalies: string[] | null;
  status: AnomalyStatus;
  auto_detected: boolean;
  detection_confidence: number;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  // Joined fields
  zone_name?: string;
  zone_type?: string;
  tenant_name?: string;
  unit_number?: string;
}

export interface AnomalyStats {
  active_count: number;
  by_severity: Record<AnomalySeverity, number>;
  by_type: Record<string, number>;
  avg_detection_confidence: number;
  false_alarm_rate: number;
  total_resolved: number;
  total_false_alarms: number;
  most_anomalous_zone: { zone_name: string; count: number } | null;
  most_common_type: { type: string; count: number } | null;
  total_impact_egp: number;
  correlation_patterns: Array<{ types: string[]; count: number }>;
}

interface DetectionResult {
  new_anomalies: number;
  types_checked: string[];
  details: string[];
}

// ── Helper: Date strings ────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function severityFromDeviation(pct: number, financialImpact: number): AnomalySeverity {
  const absPct = Math.abs(pct);
  if (absPct >= 60 || financialImpact >= 100000) return "critical";
  if (absPct >= 40 || financialImpact >= 50000) return "high";
  if (absPct >= 25 || financialImpact >= 15000) return "medium";
  return "low";
}

function confidenceFromSampleSize(samples: number, threshold: number = 20): number {
  // More data = higher confidence, capped at 0.95
  const base = Math.min(samples / threshold, 1);
  return Math.round(Math.min(0.5 + base * 0.45, 0.95) * 100) / 100;
}

// ── Insert Anomaly (avoid duplicates) ───────────────────────

async function insertAnomaly(
  supabase: SupabaseClient,
  anomaly: {
    property_id: string;
    anomaly_type: AnomalyType;
    severity: AnomalySeverity;
    zone_id?: string | null;
    unit_id?: string | null;
    tenant_id?: string | null;
    title: string;
    description: string;
    expected_value?: number | null;
    actual_value?: number | null;
    deviation_pct?: number | null;
    impact_egp?: number | null;
    data_source?: string;
    related_anomalies?: string[];
    detection_confidence?: number;
  }
): Promise<boolean> {
  // Check for existing active anomaly with same type + zone/tenant in last 24 hours
  const query = supabase
    .from("anomalies")
    .select("id")
    .eq("property_id", anomaly.property_id)
    .eq("anomaly_type", anomaly.anomaly_type)
    .in("status", ["active", "acknowledged", "investigating"])
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (anomaly.zone_id) query.eq("zone_id", anomaly.zone_id);
  if (anomaly.tenant_id) query.eq("tenant_id", anomaly.tenant_id);

  const { data: existing } = await query.limit(1);
  if (existing && existing.length > 0) return false; // Duplicate

  const { error } = await supabase.from("anomalies").insert({
    ...anomaly,
    auto_detected: true,
    status: "active",
  });

  return !error;
}

// ── 1. Footfall Anomaly Detection ───────────────────────────

async function detectFootfallAnomalies(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const today = todayStr();
  const dayOfWeek = new Date().getDay();

  // Get zones
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type")
    .eq("property_id", propertyId)
    .not("type", "in", '("parking","common")');

  if (!zones || zones.length === 0) return details;

  // Get today's footfall per zone
  const { data: todayData } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("zone_id", "is", null);

  // Get 4-week same-day-of-week baseline
  const baselineDates: string[] = [];
  for (let w = 1; w <= 4; w++) {
    const d = new Date();
    d.setDate(d.getDate() - w * 7);
    baselineDates.push(d.toISOString().split("T")[0]);
  }

  const { data: baselineData } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in, date")
    .eq("property_id", propertyId)
    .in("date", baselineDates)
    .not("zone_id", "is", null);

  // Aggregate today per zone
  const todayByZone: Record<string, number> = {};
  (todayData || []).forEach((r: any) => {
    todayByZone[r.zone_id] = (todayByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  // Aggregate baseline per zone (average)
  const baselineByZone: Record<string, { total: number; days: number }> = {};
  (baselineData || []).forEach((r: any) => {
    if (!baselineByZone[r.zone_id]) baselineByZone[r.zone_id] = { total: 0, days: 0 };
    baselineByZone[r.zone_id].total += r.total_in || 0;
    baselineByZone[r.zone_id].days += 1;
  });

  // Check each zone
  const zoneMap = Object.fromEntries(zones.map((z) => [z.id, z]));
  const normalZones: string[] = [];
  const anomalousZones: string[] = [];

  for (const zone of zones) {
    const todayCount = todayByZone[zone.id] || 0;
    const baseline = baselineByZone[zone.id];

    if (!baseline || baseline.days === 0 || todayCount === 0) continue;

    const avgBaseline = baseline.total / baseline.days;
    if (avgBaseline === 0) continue;

    const deviation = ((todayCount - avgBaseline) / avgBaseline) * 100;

    if (Math.abs(deviation) >= 25) {
      anomalousZones.push(zone.id);
      const isSpike = deviation > 0;
      const anomalyType: AnomalyType = isSpike ? "footfall_spike" : "footfall_drop";
      const severity = severityFromDeviation(deviation, Math.abs(deviation) * 100);
      const confidence = confidenceFromSampleSize(baseline.days);

      // Estimate revenue impact: ~EGP 15 per visitor in a mall
      const impactEgp = Math.abs(todayCount - avgBaseline) * 15;

      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: anomalyType,
        severity,
        zone_id: zone.id,
        title: isSpike
          ? `${zone.name} traffic ${Math.abs(Math.round(deviation))}% above normal — event nearby?`
          : `${zone.name} traffic ${Math.abs(Math.round(deviation))}% below normal — investigate`,
        description: isSpike
          ? `${zone.name} recorded ${todayCount.toLocaleString()} visitors today vs ${Math.round(avgBaseline).toLocaleString()} same-day average over 4 weeks. This ${Math.round(deviation)}% increase may indicate a nearby event, promotion, or seasonal pattern.`
          : `${zone.name} recorded ${todayCount.toLocaleString()} visitors today vs ${Math.round(avgBaseline).toLocaleString()} same-day average over 4 weeks. This ${Math.abs(Math.round(deviation))}% decline requires investigation — possible causes include construction, competitor event, or tenant issue.`,
        expected_value: Math.round(avgBaseline),
        actual_value: todayCount,
        deviation_pct: Math.round(deviation * 10) / 10,
        impact_egp: Math.round(impactEgp),
        data_source: "footfall_daily",
        detection_confidence: confidence,
      });

      if (inserted) {
        details.push(`${anomalyType}: ${zone.name} (${Math.round(deviation)}%)`);
      }
    } else {
      normalZones.push(zone.id);
    }
  }

  // Cross-zone check: one zone drops while others are normal
  if (anomalousZones.length === 1 && normalZones.length >= 2) {
    const anomZone = zoneMap[anomalousZones[0]];
    if (anomZone) {
      const todayCount = todayByZone[anomalousZones[0]] || 0;
      const baseline = baselineByZone[anomalousZones[0]];
      if (baseline && baseline.days > 0) {
        const avg = baseline.total / baseline.days;
        const dev = ((todayCount - avg) / avg) * 100;
        if (dev < -20) {
          details.push(`isolation: ${anomZone.name} dropped while other zones normal`);
        }
      }
    }
  }

  return details;
}

// ── 2. Energy Anomaly Detection ─────────────────────────────

async function detectEnergyAnomalies(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const today = todayStr();
  const currentHour = new Date().getHours();

  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type")
    .eq("property_id", propertyId);

  if (!zones || zones.length === 0) return details;
  const zoneIds = zones.map((z) => z.id);

  // Get today's energy readings
  const { data: todayReadings } = await supabase
    .from("energy_readings")
    .select("zone_id, consumption_kwh, cost_egp, timestamp")
    .in("zone_id", zoneIds)
    .gte("timestamp", today + "T00:00:00")
    .lt("timestamp", today + "T23:59:59");

  // Get 7-day baseline for same hours
  const weekAgo = daysAgoStr(7);
  const { data: baselineReadings } = await supabase
    .from("energy_readings")
    .select("zone_id, consumption_kwh, timestamp")
    .in("zone_id", zoneIds)
    .gte("timestamp", weekAgo + "T00:00:00")
    .lt("timestamp", today + "T00:00:00");

  // Aggregate today by zone
  const todayByZone: Record<string, { kwh: number; cost: number }> = {};
  (todayReadings || []).forEach((r: any) => {
    if (!todayByZone[r.zone_id]) todayByZone[r.zone_id] = { kwh: 0, cost: 0 };
    todayByZone[r.zone_id].kwh += Number(r.consumption_kwh);
    todayByZone[r.zone_id].cost += Number(r.cost_egp);
  });

  // Aggregate baseline by zone (average daily)
  const baselineByZone: Record<string, { totalKwh: number; days: Set<string> }> = {};
  (baselineReadings || []).forEach((r: any) => {
    if (!baselineByZone[r.zone_id]) baselineByZone[r.zone_id] = { totalKwh: 0, days: new Set() };
    baselineByZone[r.zone_id].totalKwh += Number(r.consumption_kwh);
    baselineByZone[r.zone_id].days.add(r.timestamp.split("T")[0]);
  });

  // Also get footfall for energy-vs-footfall correlation
  const { data: footfallToday } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("zone_id", "is", null);

  const footfallByZone: Record<string, number> = {};
  (footfallToday || []).forEach((r: any) => {
    footfallByZone[r.zone_id] = (footfallByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  // Get footfall baseline for comparison
  const { data: footfallBaseline } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .gte("date", weekAgo)
    .lt("date", today)
    .not("zone_id", "is", null);

  const footfallBaselineByZone: Record<string, { total: number; days: number }> = {};
  (footfallBaseline || []).forEach((r: any) => {
    if (!footfallBaselineByZone[r.zone_id]) footfallBaselineByZone[r.zone_id] = { total: 0, days: 0 };
    footfallBaselineByZone[r.zone_id].total += r.total_in || 0;
    footfallBaselineByZone[r.zone_id].days += 1;
  });

  const zoneMap = Object.fromEntries(zones.map((z) => [z.id, z]));

  for (const zone of zones) {
    const todayEnergy = todayByZone[zone.id];
    const baseline = baselineByZone[zone.id];

    if (!todayEnergy || !baseline || baseline.days.size === 0) continue;

    const avgDailyKwh = baseline.totalKwh / baseline.days.size;
    if (avgDailyKwh === 0) continue;

    const deviation = ((todayEnergy.kwh - avgDailyKwh) / avgDailyKwh) * 100;

    // Energy spike detection (> 30% above normal)
    if (deviation > 30) {
      const impactPerDay = (todayEnergy.kwh - avgDailyKwh) * 2.5; // ~EGP 2.5/kWh
      const monthlyImpact = impactPerDay * 30;

      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: "energy_spike",
        severity: severityFromDeviation(deviation, monthlyImpact),
        zone_id: zone.id,
        title: `Energy spike in ${zone.name} — ${Math.round(deviation)}% above normal`,
        description: `${zone.name} consumed ${Math.round(todayEnergy.kwh).toLocaleString()} kWh today vs 7-day average of ${Math.round(avgDailyKwh).toLocaleString()} kWh. Possible causes: equipment malfunction, HVAC issue, or lights left on. Estimated daily waste: EGP ${Math.round(impactPerDay).toLocaleString()}.`,
        expected_value: Math.round(avgDailyKwh),
        actual_value: Math.round(todayEnergy.kwh),
        deviation_pct: Math.round(deviation * 10) / 10,
        impact_egp: Math.round(monthlyImpact),
        data_source: "energy_readings",
        detection_confidence: confidenceFromSampleSize(baseline.days.size),
      });

      if (inserted) details.push(`energy_spike: ${zone.name} (${Math.round(deviation)}%)`);
    }

    // Energy drop detection (> 30% below normal — might indicate equipment failure)
    if (deviation < -30 && todayEnergy.kwh > 0) {
      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: "energy_drop",
        severity: "medium",
        zone_id: zone.id,
        title: `Energy drop in ${zone.name} — ${Math.abs(Math.round(deviation))}% below normal`,
        description: `${zone.name} consumed only ${Math.round(todayEnergy.kwh).toLocaleString()} kWh vs 7-day average of ${Math.round(avgDailyKwh).toLocaleString()} kWh. This could indicate equipment shutdown, power supply issues, or meter malfunction.`,
        expected_value: Math.round(avgDailyKwh),
        actual_value: Math.round(todayEnergy.kwh),
        deviation_pct: Math.round(deviation * 10) / 10,
        data_source: "energy_readings",
        detection_confidence: confidenceFromSampleSize(baseline.days.size),
      });

      if (inserted) details.push(`energy_drop: ${zone.name} (${Math.round(deviation)}%)`);
    }

    // High energy + low footfall correlation
    const todayFootfall = footfallByZone[zone.id] || 0;
    const footfallBase = footfallBaselineByZone[zone.id];
    if (footfallBase && footfallBase.days > 0) {
      const avgFootfall = footfallBase.total / footfallBase.days;
      const footfallRatio = avgFootfall > 0 ? todayFootfall / avgFootfall : 1;

      // Energy high but footfall low
      if (deviation > 25 && footfallRatio < 0.5 && zone.type !== "parking") {
        const inserted = await insertAnomaly(supabase, {
          property_id: propertyId,
          anomaly_type: "correlation_break",
          severity: "high",
          zone_id: zone.id,
          title: `${zone.name}: ${Math.round(deviation)}% excess energy but only ${Math.round(footfallRatio * 100)}% normal footfall`,
          description: `${zone.name} is consuming ${Math.round(deviation)}% more energy than normal, but footfall is at only ${Math.round(footfallRatio * 100)}% of the baseline. This suggests HVAC or lighting running at full capacity for a near-empty zone. Immediate savings opportunity.`,
          expected_value: Math.round(avgDailyKwh),
          actual_value: Math.round(todayEnergy.kwh),
          deviation_pct: Math.round(deviation * 10) / 10,
          impact_egp: Math.round((todayEnergy.kwh - avgDailyKwh) * 2.5 * 30),
          data_source: "energy_readings + footfall_daily",
          detection_confidence: 0.82,
        });

        if (inserted) details.push(`correlation: ${zone.name} energy-footfall mismatch`);
      }
    }
  }

  // After-hours check: energy at 1AM-5AM above threshold
  const afterHoursReadings = (todayReadings || []).filter((r: any) => {
    const h = new Date(r.timestamp).getHours();
    return h >= 1 && h <= 5;
  });

  if (afterHoursReadings.length > 0) {
    const afterHoursKwh = afterHoursReadings.reduce((s: number, r: any) => s + Number(r.consumption_kwh), 0);
    const baselineAfterHours = (baselineReadings || [])
      .filter((r: any) => {
        const h = new Date(r.timestamp).getHours();
        return h >= 1 && h <= 5;
      })
      .reduce((s: number, r: any) => s + Number(r.consumption_kwh), 0);

    const baselineDays = new Set((baselineReadings || []).map((r: any) => r.timestamp.split("T")[0])).size || 1;
    const avgAfterHours = baselineDays > 0 ? baselineAfterHours / baselineDays : 0;

    if (avgAfterHours > 0) {
      const deviation = ((afterHoursKwh - avgAfterHours) / avgAfterHours) * 100;
      if (deviation > 40) {
        const inserted = await insertAnomaly(supabase, {
          property_id: propertyId,
          anomaly_type: "energy_spike",
          severity: severityFromDeviation(deviation, afterHoursKwh * 2.5 * 30),
          title: `After-hours energy consumption ${Math.round(deviation)}% above baseline`,
          description: `Between 1AM-5AM, total energy consumption was ${Math.round(afterHoursKwh).toLocaleString()} kWh vs baseline of ${Math.round(avgAfterHours).toLocaleString()} kWh. Possible causes: lights left on, HVAC schedules not optimized, or unauthorized after-hours access.`,
          expected_value: Math.round(avgAfterHours),
          actual_value: Math.round(afterHoursKwh),
          deviation_pct: Math.round(deviation * 10) / 10,
          impact_egp: Math.round(afterHoursKwh * 2.5 * 30),
          data_source: "energy_readings",
          detection_confidence: 0.88,
        });

        if (inserted) details.push(`after_hours_energy: ${Math.round(deviation)}% above baseline`);
      }
    }
  }

  return details;
}

// ── 3. Revenue Anomaly Detection ────────────────────────────

async function detectRevenueAnomalies(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const dayOfMonth = now.getDate();

  // Check for late rent payments — tenants who usually pay by the 5th
  if (dayOfMonth >= 10) {
    const { data: overdueRent } = await supabase
      .from("rent_transactions")
      .select("id, lease_id, amount_due, status, leases!inner(tenant_id, tenants!inner(brand_name))")
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .in("status", ["overdue", "partial"])
      .limit(20);

    if (overdueRent && overdueRent.length >= 3) {
      // Check if this is a pattern or just this month
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      const { data: prevOverdue } = await supabase
        .from("rent_transactions")
        .select("id")
        .eq("period_month", prevMonth)
        .eq("period_year", prevYear)
        .in("status", ["overdue", "partial"]);

      const isPattern = prevOverdue && prevOverdue.length >= 3;

      const totalOverdue = overdueRent.reduce((s: number, r: any) => s + Number(r.amount_due || 0), 0);

      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: "rent_delay_pattern",
        severity: overdueRent.length >= 8 ? "critical" : overdueRent.length >= 5 ? "high" : "medium",
        title: `${overdueRent.length} tenants with overdue rent — ${isPattern ? "recurring pattern" : "this month"}`,
        description: `${overdueRent.length} tenants have overdue or partial rent payments for ${currentMonth}/${currentYear}, totaling EGP ${totalOverdue.toLocaleString()}. ${isPattern ? "This is a recurring pattern — " + (prevOverdue?.length || 0) + " were overdue last month as well." : "Check if this is due to a system/posting delay or genuine payment issues."}`,
        expected_value: 0,
        actual_value: overdueRent.length,
        deviation_pct: null,
        impact_egp: totalOverdue,
        data_source: "rent_transactions",
        detection_confidence: isPattern ? 0.88 : 0.75,
      });

      if (inserted) details.push(`rent_delay: ${overdueRent.length} overdue tenants`);
    }
  }

  // Check tenant sales vs estimates (if sales data exists)
  const { data: recentSales } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, reported_revenue_egp, period_month, period_year, tenants!inner(brand_name)")
    .gte("period_year", currentYear - 1)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(100);

  if (recentSales && recentSales.length > 0) {
    // Group by tenant and check for drops
    const byTenant: Record<string, Array<{ month: number; year: number; revenue: number; name: string }>> = {};
    recentSales.forEach((s: any) => {
      const tid = s.tenant_id;
      if (!byTenant[tid]) byTenant[tid] = [];
      byTenant[tid].push({
        month: s.period_month,
        year: s.period_year,
        revenue: Number(s.reported_revenue_egp),
        name: (s.tenants as any)?.brand_name || "Unknown",
      });
    });

    for (const [tenantId, records] of Object.entries(byTenant)) {
      if (records.length < 3) continue;

      // Sort by date descending
      records.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));

      const latest = records[0];
      const previous = records.slice(1, 4); // 3-month lookback
      const avgPrevious = previous.reduce((s, r) => s + r.revenue, 0) / previous.length;

      if (avgPrevious === 0) continue;

      const deviation = ((latest.revenue - avgPrevious) / avgPrevious) * 100;

      if (deviation < -30) {
        const inserted = await insertAnomaly(supabase, {
          property_id: propertyId,
          anomaly_type: "revenue_anomaly",
          severity: severityFromDeviation(deviation, Math.abs(latest.revenue - avgPrevious)),
          tenant_id: tenantId,
          title: `${latest.name} sales dropped ${Math.abs(Math.round(deviation))}% vs 3-month average`,
          description: `${latest.name} reported EGP ${latest.revenue.toLocaleString()} in sales for ${latest.month}/${latest.year}, compared to a 3-month average of EGP ${Math.round(avgPrevious).toLocaleString()}. This ${Math.abs(Math.round(deviation))}% decline requires verification — possible underreporting or genuine performance issue.`,
          expected_value: Math.round(avgPrevious),
          actual_value: latest.revenue,
          deviation_pct: Math.round(deviation * 10) / 10,
          impact_egp: Math.round(Math.abs(latest.revenue - avgPrevious) * 12),
          data_source: "tenant_sales_reported",
          detection_confidence: confidenceFromSampleSize(previous.length, 3),
        });

        if (inserted) details.push(`revenue_drop: ${latest.name} (${Math.round(deviation)}%)`);
      }
    }
  }

  return details;
}

// ── 4. Queue Anomaly Detection ──────────────────────────────

async function detectQueueAnomalies(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const today = todayStr();
  const currentHour = new Date().getHours();

  // Only check during operating hours (10AM - 11PM)
  if (currentHour < 10 || currentHour > 23) return details;

  const { data: queueData } = await supabase
    .from("queue_readings")
    .select("unit_id, queue_length, wait_time_seconds, timestamp")
    .gte("timestamp", today + "T00:00:00")
    .lt("timestamp", today + "T23:59:59")
    .order("timestamp", { ascending: false })
    .limit(500);

  if (!queueData || queueData.length === 0) return details;

  // Get unit info and tenant names
  const unitIds = Array.from(new Set(queueData.map((r: any) => r.unit_id).filter(Boolean)));
  if (unitIds.length === 0) return details;

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, zone_id")
    .in("id", unitIds);

  const { data: leases } = await supabase
    .from("leases")
    .select("unit_id, tenant:tenants(brand_name)")
    .eq("status", "active")
    .in("unit_id", unitIds);

  const tenantMap: Record<string, string> = {};
  (leases || []).forEach((l: any) => {
    if (l.unit_id && l.tenant?.brand_name) tenantMap[l.unit_id] = l.tenant.brand_name;
  });

  // Check for abnormally long queues (> 15 min wait)
  const longQueues = queueData.filter((r: any) => r.wait_time_seconds > 900);
  const recentLong = longQueues.filter((r: any) => {
    const h = new Date(r.timestamp).getHours();
    return Math.abs(h - currentHour) <= 1;
  });

  if (recentLong.length > 0) {
    // Group by unit
    const byUnit: Record<string, any[]> = {};
    recentLong.forEach((r: any) => {
      if (!byUnit[r.unit_id]) byUnit[r.unit_id] = [];
      byUnit[r.unit_id].push(r);
    });

    for (const [unitId, readings] of Object.entries(byUnit)) {
      const avgWait = readings.reduce((s: number, r: any) => s + r.wait_time_seconds, 0) / readings.length;
      const tenantName = tenantMap[unitId] || "Unknown Store";

      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: "queue_anomaly",
        severity: avgWait > 1200 ? "high" : "medium",
        unit_id: unitId,
        title: `Long queue at ${tenantName} — estimated ${Math.round(avgWait / 60)} min wait`,
        description: `${tenantName} has a sustained queue with average wait time of ${Math.round(avgWait / 60)} minutes. Average queue length: ${Math.round(readings.reduce((s: number, r: any) => s + r.queue_length, 0) / readings.length)} people. Consider deploying additional staff or opening extra service points.`,
        expected_value: 5, // 5 min typical
        actual_value: Math.round(avgWait / 60),
        deviation_pct: Math.round(((avgWait / 60 - 5) / 5) * 100),
        data_source: "queue_readings",
        detection_confidence: 0.85,
      });

      if (inserted) details.push(`queue_long: ${tenantName} (${Math.round(avgWait / 60)} min)`);
    }
  }

  return details;
}

// ── 5. Parking Anomaly Detection ────────────────────────────

async function detectParkingAnomalies(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const today = todayStr();

  const { data: parkingData } = await supabase
    .from("parking_readings")
    .select("zone_id, occupancy_pct, total_spaces, occupied_spaces, timestamp")
    .gte("timestamp", today + "T00:00:00")
    .lt("timestamp", today + "T23:59:59")
    .order("timestamp", { ascending: false })
    .limit(100);

  if (!parkingData || parkingData.length === 0) return details;

  // Get the most recent reading
  const latest = parkingData[0];
  const occupancy = Number(latest.occupancy_pct || 0);

  // Near capacity (> 90%)
  if (occupancy >= 90) {
    // Check if mall footfall justifies the parking load
    const { data: footfall } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("property_id", propertyId)
      .eq("date", today);

    const totalFootfall = (footfall || []).reduce((s: number, r: any) => s + (r.total_in || 0), 0);

    // Compare with 4-week average
    const weekAgo = daysAgoStr(28);
    const { data: avgFootfall } = await supabase
      .from("footfall_daily")
      .select("total_in, date")
      .eq("property_id", propertyId)
      .gte("date", weekAgo)
      .lt("date", today);

    const dailyTotals: Record<string, number> = {};
    (avgFootfall || []).forEach((r: any) => {
      dailyTotals[r.date] = (dailyTotals[r.date] || 0) + (r.total_in || 0);
    });
    const avgDaily = Object.values(dailyTotals).length > 0
      ? Object.values(dailyTotals).reduce((a, b) => a + b, 0) / Object.values(dailyTotals).length
      : 0;

    const footfallRatio = avgDaily > 0 ? totalFootfall / avgDaily : 1;
    const isUnexpected = footfallRatio < 1.1; // parking full but footfall not higher than normal

    const inserted = await insertAnomaly(supabase, {
      property_id: propertyId,
      anomaly_type: "parking_anomaly",
      severity: occupancy >= 95 ? "high" : "medium",
      title: `Parking ${occupancy}% full${isUnexpected ? " — footfall doesn't justify it" : " — approaching capacity"}`,
      description: isUnexpected
        ? `Parking at ${occupancy}% capacity but mall footfall is at ${Math.round(footfallRatio * 100)}% of normal. Possible external event using the lot, or visitors struggling to find parking and leaving.`
        : `Parking has reached ${occupancy}% occupancy. ${latest.total_spaces ? `${latest.occupied_spaces || 0} of ${latest.total_spaces} spaces occupied.` : ""} Recommend activating overflow signage and directing to lower levels.`,
      expected_value: 78,
      actual_value: occupancy,
      deviation_pct: Math.round(((occupancy - 78) / 78) * 100),
      impact_egp: occupancy >= 95 ? 25000 : 10000,
      data_source: "parking_readings",
      detection_confidence: 0.92,
    });

    if (inserted) details.push(`parking: ${occupancy}% capacity`);
  }

  return details;
}

// ── 6. Maintenance Pattern Detection ────────────────────────

async function detectMaintenancePatterns(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const thirtyDaysAgo = daysAgoStr(30);

  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select("id, title, description, category, zone_id, unit_id, status, created_at, zones(name)")
    .eq("property_id", propertyId)
    .gte("created_at", thirtyDaysAgo + "T00:00:00")
    .order("created_at", { ascending: false });

  if (!tickets || tickets.length === 0) return details;

  // Check for repeated failures on same equipment/zone
  const byZoneCategory: Record<string, { tickets: any[]; zone_name: string }> = {};
  tickets.forEach((t: any) => {
    const key = `${t.zone_id || "none"}-${t.category}`;
    if (!byZoneCategory[key]) {
      byZoneCategory[key] = {
        tickets: [],
        zone_name: (t.zones as any)?.name || "Unknown",
      };
    }
    byZoneCategory[key].tickets.push(t);
  });

  for (const [key, { tickets: groupTickets, zone_name }] of Object.entries(byZoneCategory)) {
    if (groupTickets.length >= 2) {
      const category = groupTickets[0].category;
      const daysSpan = Math.ceil(
        (new Date(groupTickets[0].created_at).getTime() -
          new Date(groupTickets[groupTickets.length - 1].created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: "maintenance_pattern",
        severity: groupTickets.length >= 4 ? "critical" : groupTickets.length >= 3 ? "high" : "medium",
        zone_id: groupTickets[0].zone_id,
        title: `${zone_name} ${category}: ${groupTickets.length} tickets in ${daysSpan} days — replacement assessment needed`,
        description: `${zone_name} has generated ${groupTickets.length} ${category} maintenance tickets in the last ${daysSpan} days. Repeated failures on the same system suggest end-of-life or a systemic issue. Latest: "${groupTickets[0].title}". Review repair-vs-replace cost analysis.`,
        expected_value: 0,
        actual_value: groupTickets.length,
        deviation_pct: null,
        impact_egp: groupTickets.length * 15000,
        data_source: "maintenance_tickets",
        detection_confidence: confidenceFromSampleSize(groupTickets.length, 3),
      });

      if (inserted) details.push(`maintenance_pattern: ${zone_name} ${category} (${groupTickets.length}x)`);
    }
  }

  return details;
}

// ── 7. Correlation Break Detection ──────────────────────────

async function detectCorrelationBreaks(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string[]> {
  const details: string[] = [];
  const today = todayStr();
  const weekAgo = daysAgoStr(7);
  const twoWeeksAgo = daysAgoStr(14);

  // Get zones
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type")
    .eq("property_id", propertyId)
    .not("type", "in", '("parking","common")');

  if (!zones || zones.length === 0) return details;
  const zoneIds = zones.map((z) => z.id);

  // This week footfall
  const { data: thisWeekFootfall } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .gte("date", weekAgo)
    .lte("date", today)
    .not("zone_id", "is", null);

  // Last week footfall
  const { data: lastWeekFootfall } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .gte("date", twoWeeksAgo)
    .lt("date", weekAgo)
    .not("zone_id", "is", null);

  const thisWeekByZone: Record<string, number> = {};
  (thisWeekFootfall || []).forEach((r: any) => {
    thisWeekByZone[r.zone_id] = (thisWeekByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  const lastWeekByZone: Record<string, number> = {};
  (lastWeekFootfall || []).forEach((r: any) => {
    lastWeekByZone[r.zone_id] = (lastWeekByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  // This week energy
  const { data: thisWeekEnergy } = await supabase
    .from("energy_readings")
    .select("zone_id, consumption_kwh")
    .in("zone_id", zoneIds)
    .gte("timestamp", weekAgo + "T00:00:00")
    .lte("timestamp", today + "T23:59:59");

  const { data: lastWeekEnergy } = await supabase
    .from("energy_readings")
    .select("zone_id, consumption_kwh")
    .in("zone_id", zoneIds)
    .gte("timestamp", twoWeeksAgo + "T00:00:00")
    .lt("timestamp", weekAgo + "T00:00:00");

  const thisWeekEnergyByZone: Record<string, number> = {};
  (thisWeekEnergy || []).forEach((r: any) => {
    thisWeekEnergyByZone[r.zone_id] = (thisWeekEnergyByZone[r.zone_id] || 0) + Number(r.consumption_kwh);
  });

  const lastWeekEnergyByZone: Record<string, number> = {};
  (lastWeekEnergy || []).forEach((r: any) => {
    lastWeekEnergyByZone[r.zone_id] = (lastWeekEnergyByZone[r.zone_id] || 0) + Number(r.consumption_kwh);
  });

  const zoneMap = Object.fromEntries(zones.map((z) => [z.id, z]));

  for (const zone of zones) {
    const thisFootfall = thisWeekByZone[zone.id] || 0;
    const lastFootfall = lastWeekByZone[zone.id] || 0;
    const thisEnergy = thisWeekEnergyByZone[zone.id] || 0;
    const lastEnergy = lastWeekEnergyByZone[zone.id] || 0;

    if (lastFootfall === 0 || lastEnergy === 0) continue;

    const footfallChange = ((thisFootfall - lastFootfall) / lastFootfall) * 100;
    const energyChange = ((thisEnergy - lastEnergy) / lastEnergy) * 100;

    // Energy up but occupancy/footfall down
    if (energyChange > 15 && footfallChange < -10) {
      const wasteCost = (thisEnergy - lastEnergy) * 2.5;

      const inserted = await insertAnomaly(supabase, {
        property_id: propertyId,
        anomaly_type: "correlation_break",
        severity: "high",
        zone_id: zone.id,
        title: `${zone.name}: Energy up ${Math.round(energyChange)}% but footfall down ${Math.abs(Math.round(footfallChange))}% — waste detected`,
        description: `${zone.name} energy consumption increased ${Math.round(energyChange)}% week-over-week while footfall declined ${Math.abs(Math.round(footfallChange))}%. This means the zone is using more energy to serve fewer visitors. Check HVAC schedules and lighting automation.`,
        expected_value: Math.round(lastEnergy),
        actual_value: Math.round(thisEnergy),
        deviation_pct: Math.round(energyChange * 10) / 10,
        impact_egp: Math.round(wasteCost * 4), // monthly
        data_source: "energy_readings + footfall_daily",
        detection_confidence: 0.79,
      });

      if (inserted) details.push(`correlation: ${zone.name} energy-up footfall-down`);
    }
  }

  return details;
}

// ── Master Detection Runner ─────────────────────────────────

export async function runAnomalyDetection(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<DetectionResult> {
  const allDetails: string[] = [];
  const typesChecked: string[] = [];

  // Run all detectors in parallel
  const [footfall, energy, revenue, queues, parking, maintenance, correlations] =
    await Promise.allSettled([
      detectFootfallAnomalies(supabase, propertyId),
      detectEnergyAnomalies(supabase, propertyId),
      detectRevenueAnomalies(supabase, propertyId),
      detectQueueAnomalies(supabase, propertyId),
      detectParkingAnomalies(supabase, propertyId),
      detectMaintenancePatterns(supabase, propertyId),
      detectCorrelationBreaks(supabase, propertyId),
    ]);

  const results = [
    { name: "footfall", result: footfall },
    { name: "energy", result: energy },
    { name: "revenue", result: revenue },
    { name: "queue", result: queues },
    { name: "parking", result: parking },
    { name: "maintenance", result: maintenance },
    { name: "correlation", result: correlations },
  ];

  for (const { name, result } of results) {
    typesChecked.push(name);
    if (result.status === "fulfilled") {
      allDetails.push(...result.value);
    } else {
      allDetails.push(`${name}: detection error — ${result.reason}`);
    }
  }

  return {
    new_anomalies: allDetails.filter((d) => !d.includes("error")).length,
    types_checked: typesChecked,
    details: allDetails,
  };
}

// ── Get Active Anomalies ────────────────────────────────────

export async function getActiveAnomalies(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  severity?: AnomalySeverity,
  anomalyType?: AnomalyType
): Promise<Anomaly[]> {
  let query = supabase
    .from("anomalies")
    .select(`
      *,
      zones(name, type),
      tenants(brand_name),
      units(unit_number)
    `)
    .eq("property_id", propertyId)
    .in("status", ["active", "acknowledged", "investigating"])
    .order("created_at", { ascending: false });

  if (severity) query = query.eq("severity", severity);
  if (anomalyType) query = query.eq("anomaly_type", anomalyType);

  const { data, error } = await query.limit(100);

  if (error || !data) return [];

  return data.map((row: any) => ({
    ...row,
    zone_name: row.zones?.name || null,
    zone_type: row.zones?.type || null,
    tenant_name: row.tenants?.brand_name || null,
    unit_number: row.units?.unit_number || null,
  }));
}

// ── Get Anomaly History ─────────────────────────────────────

export async function getAnomalyHistory(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  days: number = 30
): Promise<Anomaly[]> {
  const since = daysAgoStr(days);

  const { data, error } = await supabase
    .from("anomalies")
    .select(`
      *,
      zones(name, type),
      tenants(brand_name),
      units(unit_number)
    `)
    .eq("property_id", propertyId)
    .in("status", ["resolved", "false_alarm"])
    .gte("created_at", since + "T00:00:00")
    .order("resolved_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row: any) => ({
    ...row,
    zone_name: row.zones?.name || null,
    zone_type: row.zones?.type || null,
    tenant_name: row.tenants?.brand_name || null,
    unit_number: row.units?.unit_number || null,
  }));
}

// ── Anomaly Stats ───────────────────────────────────────────

export async function getAnomalyStats(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<AnomalyStats> {
  // Get all anomalies for this property
  const { data: allAnomalies } = await supabase
    .from("anomalies")
    .select("id, anomaly_type, severity, status, zone_id, detection_confidence, impact_egp, related_anomalies, zones(name)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(500);

  const anomalies = allAnomalies || [];

  const active = anomalies.filter((a: any) => ["active", "acknowledged", "investigating"].includes(a.status));
  const resolved = anomalies.filter((a: any) => a.status === "resolved");
  const falseAlarms = anomalies.filter((a: any) => a.status === "false_alarm");

  // By severity
  const bySeverity: Record<AnomalySeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  active.forEach((a: any) => {
    bySeverity[a.severity as AnomalySeverity] = (bySeverity[a.severity as AnomalySeverity] || 0) + 1;
  });

  // By type
  const byType: Record<string, number> = {};
  active.forEach((a: any) => {
    byType[a.anomaly_type] = (byType[a.anomaly_type] || 0) + 1;
  });

  // Avg confidence
  const avgConfidence = active.length > 0
    ? Math.round(active.reduce((s: number, a: any) => s + Number(a.detection_confidence || 0), 0) / active.length * 100) / 100
    : 0;

  // False alarm rate
  const totalResolved = resolved.length + falseAlarms.length;
  const falseAlarmRate = totalResolved > 0
    ? Math.round((falseAlarms.length / totalResolved) * 1000) / 10
    : 0;

  // Most anomalous zone
  const zoneCount: Record<string, { name: string; count: number }> = {};
  active.forEach((a: any) => {
    if (a.zone_id) {
      const zoneName = (a.zones as any)?.name || "Unknown";
      if (!zoneCount[a.zone_id]) zoneCount[a.zone_id] = { name: zoneName, count: 0 };
      zoneCount[a.zone_id].count += 1;
    }
  });
  const mostAnomalousZone = Object.values(zoneCount).sort((a, b) => b.count - a.count)[0] || null;

  // Most common type
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const mostCommonType = typeEntries.length > 0 ? { type: typeEntries[0][0], count: typeEntries[0][1] } : null;

  // Total impact
  const totalImpact = active.reduce((s: number, a: any) => s + Number(a.impact_egp || 0), 0);

  // Correlation patterns — which types tend to co-occur
  const correlationPatterns: Array<{ types: string[]; count: number }> = [];
  const relatedPairs: Record<string, number> = {};
  anomalies.forEach((a: any) => {
    if (a.related_anomalies && a.related_anomalies.length > 0) {
      a.related_anomalies.forEach((relatedId: string) => {
        const related = anomalies.find((x: any) => x.id === relatedId);
        if (related) {
          const pair = [a.anomaly_type, related.anomaly_type].sort().join(" + ");
          relatedPairs[pair] = (relatedPairs[pair] || 0) + 1;
        }
      });
    }
  });
  Object.entries(relatedPairs).forEach(([pair, count]) => {
    correlationPatterns.push({ types: pair.split(" + "), count });
  });

  return {
    active_count: active.length,
    by_severity: bySeverity,
    by_type: byType,
    avg_detection_confidence: avgConfidence,
    false_alarm_rate: falseAlarmRate,
    total_resolved: resolved.length,
    total_false_alarms: falseAlarms.length,
    most_anomalous_zone: mostAnomalousZone ? { zone_name: mostAnomalousZone.name, count: mostAnomalousZone.count } : null,
    most_common_type: mostCommonType,
    total_impact_egp: Math.round(totalImpact),
    correlation_patterns: correlationPatterns.sort((a, b) => b.count - a.count),
  };
}

// ── Acknowledge Anomaly ─────────────────────────────────────

export async function acknowledgeAnomaly(
  supabase: SupabaseClient,
  anomalyId: string,
  staffId?: string
): Promise<boolean> {
  const { error } = await supabase
    .from("anomalies")
    .update({
      status: "acknowledged",
      acknowledged_by: staffId || null,
    })
    .eq("id", anomalyId);

  return !error;
}

// ── Resolve Anomaly ─────────────────────────────────────────

export async function resolveAnomaly(
  supabase: SupabaseClient,
  anomalyId: string,
  staffId?: string,
  notes?: string,
  isFalseAlarm: boolean = false
): Promise<boolean> {
  const { error } = await supabase
    .from("anomalies")
    .update({
      status: isFalseAlarm ? "false_alarm" : "resolved",
      acknowledged_by: staffId || null,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes || null,
    })
    .eq("id", anomalyId);

  return !error;
}
