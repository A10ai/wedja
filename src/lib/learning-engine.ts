import { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_MODELS } from "./revenue-engine";

// ============================================================
// Custis Learning Engine
//
// The intelligence that makes Custis smarter every day.
// Learns from human feedback, calibrates conversion rates,
// detects patterns in footfall/energy/maintenance, and
// tracks confidence over time.
//
// Every learned parameter has a confidence score (0-100).
// Confidence increases with more data and confirmation.
// After 3 months of data, learned values replace defaults.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface LearningCycleResult {
  property_id: string;
  cycle_date: string;
  params_updated: number;
  patterns_found: number;
  patterns_confirmed: number;
  confidence_improvements: Array<{
    param: string;
    entity: string;
    old_confidence: number;
    new_confidence: number;
  }>;
  summary: string;
  duration_ms: number;
}

export interface LearnedParam {
  id: string;
  property_id: string;
  param_type: string;
  entity_id: string | null;
  entity_name: string | null;
  param_key: string;
  initial_value: number;
  learned_value: number;
  confidence: number;
  sample_count: number;
  last_updated: string;
}

export interface AIPattern {
  id: string;
  property_id: string;
  pattern_type: string;
  title: string;
  description: string;
  confidence: number;
  impact_estimate: string | null;
  data_points: number;
  first_detected: string;
  last_confirmed: string;
  status: string;
}

export interface LearningStats {
  total_feedback_received: number;
  params_calibrated: number;
  patterns_discovered: number;
  avg_confidence: number;
  days_of_learning: number;
  top_improvements: Array<{
    entity_name: string;
    param_key: string;
    initial_value: number;
    learned_value: number;
    confidence: number;
  }>;
}

export interface LearningCycleLog {
  id: string;
  property_id: string;
  cycle_date: string;
  params_updated: number;
  patterns_found: number;
  patterns_confirmed: number;
  confidence_improvements: Array<{
    param: string;
    entity: string;
    old_confidence: number;
    new_confidence: number;
  }>;
  summary: string;
  duration_ms: number;
  created_at: string;
}

// ── Core: Run Learning Cycle ────────────────────────────────

/**
 * The daily learning function. Analyses all available data,
 * calibrates parameters, detects patterns, and updates
 * confidence scores.
 */
export async function runLearningCycle(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<LearningCycleResult> {
  const startTime = Date.now();
  const today = new Date().toISOString().split("T")[0];
  let paramsUpdated = 0;
  let patternsFound = 0;
  let patternsConfirmed = 0;
  const confidenceImprovements: LearningCycleResult["confidence_improvements"] = [];
  const summaryParts: string[] = [];

  // 1. Calibrate Conversion Rates
  const convResult = await calibrateConversionRates(supabase, propertyId);
  paramsUpdated += convResult.updated;
  confidenceImprovements.push(...convResult.improvements);
  if (convResult.updated > 0) {
    summaryParts.push(
      `Calibrated ${convResult.updated} conversion rate${convResult.updated !== 1 ? "s" : ""}`
    );
  }

  // 2. Detect Footfall Patterns
  const ffPatterns = await detectFootfallPatterns(supabase, propertyId);
  patternsFound += ffPatterns.found;
  if (ffPatterns.found > 0) {
    summaryParts.push(
      `Discovered ${ffPatterns.found} footfall pattern${ffPatterns.found !== 1 ? "s" : ""}`
    );
  }

  // 3. Detect Energy Patterns
  const enPatterns = await detectEnergyPatterns(supabase, propertyId);
  patternsFound += enPatterns.found;
  if (enPatterns.found > 0) {
    summaryParts.push(
      `Discovered ${enPatterns.found} energy pattern${enPatterns.found !== 1 ? "s" : ""}`
    );
  }

  // 4. Detect Maintenance Cycles
  const mtPatterns = await detectMaintenanceCycles(supabase, propertyId);
  patternsFound += mtPatterns.found;
  if (mtPatterns.found > 0) {
    summaryParts.push(
      `Discovered ${mtPatterns.found} maintenance pattern${mtPatterns.found !== 1 ? "s" : ""}`
    );
  }

  // 5. Update Confidence Scores
  const confResult = await updateConfidenceScores(supabase, propertyId);
  patternsConfirmed += confResult.confirmed;
  if (confResult.confirmed > 0) {
    summaryParts.push(`Confirmed ${confResult.confirmed} existing pattern${confResult.confirmed !== 1 ? "s" : ""}`);
  }
  if (confResult.outdated > 0) {
    summaryParts.push(`Marked ${confResult.outdated} pattern${confResult.outdated !== 1 ? "s" : ""} as outdated`);
  }

  const durationMs = Date.now() - startTime;
  const summary =
    summaryParts.length > 0
      ? summaryParts.join(". ") + "."
      : "No new learnings this cycle. Waiting for more data.";

  // Store learning cycle log
  await supabase.from("ai_learning_cycles").insert({
    property_id: propertyId,
    cycle_date: today,
    params_updated: paramsUpdated,
    patterns_found: patternsFound,
    patterns_confirmed: patternsConfirmed,
    confidence_improvements: confidenceImprovements,
    summary,
    duration_ms: durationMs,
  });

  return {
    property_id: propertyId,
    cycle_date: today,
    params_updated: paramsUpdated,
    patterns_found: patternsFound,
    patterns_confirmed: patternsConfirmed,
    confidence_improvements: confidenceImprovements,
    summary,
    duration_ms: durationMs,
  };
}

// ── Calibrate Conversion Rates ──────────────────────────────

async function calibrateConversionRates(
  supabase: SupabaseClient,
  propertyId: string
): Promise<{
  updated: number;
  improvements: LearningCycleResult["confidence_improvements"];
}> {
  let updated = 0;
  const improvements: LearningCycleResult["confidence_improvements"] = [];

  // Get tenants with active leases
  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_id, tenants!inner(id, name, brand_name, category)"
    )
    .eq("property_id", propertyId)
    .eq("status", "active");

  if (!leases || leases.length === 0) return { updated, improvements };

  // Get last 6 months of data
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const startDate = sixMonthsAgo.toISOString().split("T")[0];

  const unitIds = leases.map((l: any) => l.unit_id);
  const tenantIds = leases.map((l: any) => l.tenant_id);

  // Get footfall data
  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("unit_id, total_in, date")
    .in("unit_id", unitIds)
    .gte("date", startDate);

  // Group footfall by unit by month
  const footfallByUnitMonth: Record<string, Record<string, number>> = {};
  (footfallData || []).forEach((r: any) => {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!footfallByUnitMonth[r.unit_id]) footfallByUnitMonth[r.unit_id] = {};
    footfallByUnitMonth[r.unit_id][key] =
      (footfallByUnitMonth[r.unit_id][key] || 0) + (r.total_in || 0);
  });

  // Get reported sales
  const { data: salesData } = await supabase
    .from("tenant_sales_reported")
    .select("tenant_id, period_month, period_year, reported_revenue_egp")
    .in("tenant_id", tenantIds)
    .gte("period_year", sixMonthsAgo.getFullYear());

  // Group sales by tenant by month
  const salesByTenantMonth: Record<string, Record<string, number>> = {};
  (salesData || []).forEach((s: any) => {
    const key = `${s.period_year}-${s.period_month}`;
    if (!salesByTenantMonth[s.tenant_id]) salesByTenantMonth[s.tenant_id] = {};
    salesByTenantMonth[s.tenant_id][key] = s.reported_revenue_egp;
  });

  // For each tenant, calculate actual conversion rate
  for (const lease of leases) {
    const tenant = (lease as any).tenants;
    const category = tenant.category as string;
    const model = CATEGORY_MODELS[category] || CATEGORY_MODELS.services;
    const [, tickHigh] = model.avg_ticket;
    const [tickLow] = model.avg_ticket;
    const avgTicket = Math.sqrt(tickLow * tickHigh);

    const unitFootfall = footfallByUnitMonth[lease.unit_id] || {};
    const tenantSales = salesByTenantMonth[lease.tenant_id] || {};

    // Find months where we have both footfall and sales
    const matchingMonths: Array<{ footfall: number; sales: number }> = [];
    for (const monthKey of Object.keys(tenantSales)) {
      const ff = unitFootfall[monthKey];
      const sales = tenantSales[monthKey];
      if (ff && ff > 0 && sales && sales > 0) {
        matchingMonths.push({ footfall: ff, sales });
      }
    }

    if (matchingMonths.length < 2) continue; // Need at least 2 months

    // Calculate actual conversion rate: sales / (footfall x avg_ticket)
    const conversionRates = matchingMonths.map(
      (m) => m.sales / (m.footfall * avgTicket)
    );
    const avgConversion =
      conversionRates.reduce((a, b) => a + b, 0) / conversionRates.length;

    // Clamp to reasonable range (1% to 95%)
    const clampedConversion = Math.max(0.01, Math.min(0.95, avgConversion));

    // Category default (midpoint)
    const [convLow, convHigh] = model.conversion;
    const defaultConversion = (convLow + convHigh) / 2;

    // Calculate confidence based on sample count
    // 2 months = 30, 3 months = 45, 6 months = 75, max 90
    const confidence = Math.min(
      90,
      Math.round(15 * matchingMonths.length + matchingMonths.length * 2)
    );

    // Check if we already have a learned param
    const { data: existing } = await supabase
      .from("ai_learned_params")
      .select("id, confidence, learned_value")
      .eq("property_id", propertyId)
      .eq("param_type", "conversion_rate")
      .eq("entity_id", lease.tenant_id)
      .eq("param_key", "conversion_rate")
      .maybeSingle();

    const oldConfidence = existing?.confidence || 0;

    // Upsert the learned parameter
    await supabase.from("ai_learned_params").upsert(
      {
        property_id: propertyId,
        param_type: "conversion_rate",
        entity_id: lease.tenant_id,
        entity_name: tenant.brand_name,
        param_key: "conversion_rate",
        initial_value: Math.round(defaultConversion * 10000) / 10000,
        learned_value: Math.round(clampedConversion * 10000) / 10000,
        confidence,
        sample_count: matchingMonths.length,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: "property_id,param_type,entity_id,param_key",
      }
    );

    updated++;

    if (confidence > oldConfidence) {
      improvements.push({
        param: "conversion_rate",
        entity: tenant.brand_name,
        old_confidence: oldConfidence,
        new_confidence: confidence,
      });
    }
  }

  return { updated, improvements };
}

// ── Detect Footfall Patterns ────────────────────────────────

async function detectFootfallPatterns(
  supabase: SupabaseClient,
  propertyId: string
): Promise<{ found: number }> {
  let found = 0;

  // Get last 30 days of footfall by zone
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("zone_id, date, total_in, peak_hour, peak_count")
    .eq("property_id", propertyId)
    .gte("date", startDate)
    .order("date", { ascending: true });

  if (!footfallData || footfallData.length < 7) return { found };

  // Get zone names
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name")
    .eq("property_id", propertyId);

  const zoneNames: Record<string, string> = {};
  (zones || []).forEach((z: any) => {
    zoneNames[z.id] = z.name;
  });

  // Group by zone
  const byZone: Record<
    string,
    Array<{ date: string; total_in: number; peak_hour: number; dayOfWeek: number }>
  > = {};
  footfallData.forEach((r: any) => {
    if (!r.zone_id) return;
    if (!byZone[r.zone_id]) byZone[r.zone_id] = [];
    const d = new Date(r.date);
    byZone[r.zone_id].push({
      date: r.date,
      total_in: r.total_in || 0,
      peak_hour: r.peak_hour || 0,
      dayOfWeek: d.getDay(),
    });
  });

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  for (const [zoneId, data] of Object.entries(byZone)) {
    if (data.length < 7) continue;
    const zoneName = zoneNames[zoneId] || "Unknown Zone";

    // Day-of-week pattern: which day is busiest?
    const byDay: Record<number, number[]> = {};
    data.forEach((d) => {
      if (!byDay[d.dayOfWeek]) byDay[d.dayOfWeek] = [];
      byDay[d.dayOfWeek].push(d.total_in);
    });

    const dayAverages = Object.entries(byDay).map(([day, values]) => ({
      day: parseInt(day),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }));

    if (dayAverages.length >= 5) {
      dayAverages.sort((a, b) => b.avg - a.avg);
      const busiest = dayAverages[0];
      const quietest = dayAverages[dayAverages.length - 1];
      const ratio =
        quietest.avg > 0
          ? Math.round((busiest.avg / quietest.avg) * 10) / 10
          : 0;

      if (ratio > 1.3) {
        const patternResult = await upsertPattern(supabase, {
          property_id: propertyId,
          pattern_type: "weekly",
          title: `${zoneName}: ${dayNames[busiest.day]} is ${ratio}x busier than ${dayNames[quietest.day]}`,
          description: `In ${zoneName}, ${dayNames[busiest.day]} averages ${Math.round(busiest.avg).toLocaleString()} visitors while ${dayNames[quietest.day]} averages ${Math.round(quietest.avg).toLocaleString()}. Consider adjusting staffing and promotions accordingly.`,
          confidence: Math.min(85, data.length * 3),
          impact_estimate: "Staffing and promotional optimization",
          data_points: data.length,
        });
        if (patternResult) found++;
      }
    }

    // Peak hour pattern
    const peakHours = data
      .filter((d) => d.peak_hour > 0)
      .map((d) => d.peak_hour);
    if (peakHours.length >= 7) {
      const hourCounts: Record<number, number> = {};
      peakHours.forEach((h) => {
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      });
      const sortedHours = Object.entries(hourCounts).sort(
        ([, a], [, b]) => b - a
      );
      const topHour = parseInt(sortedHours[0][0]);
      const topCount = sortedHours[0][1];
      const pct = Math.round((topCount / peakHours.length) * 100);

      if (pct > 40) {
        const patternResult = await upsertPattern(supabase, {
          property_id: propertyId,
          pattern_type: "footfall_trend",
          title: `${zoneName}: Peak hour is consistently ${topHour}:00`,
          description: `${zoneName} peaks at ${topHour}:00 in ${pct}% of days analysed. This is the best time for tenant promotions and ensuring adequate staffing.`,
          confidence: Math.min(80, pct),
          impact_estimate: "Operational scheduling optimization",
          data_points: peakHours.length,
        });
        if (patternResult) found++;
      }
    }

    // Weekly trend: growing or declining?
    if (data.length >= 14) {
      const halfPoint = Math.floor(data.length / 2);
      const firstHalf = data.slice(0, halfPoint);
      const secondHalf = data.slice(halfPoint);

      const firstAvg =
        firstHalf.reduce((s, d) => s + d.total_in, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((s, d) => s + d.total_in, 0) / secondHalf.length;

      const changePct =
        firstAvg > 0
          ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100)
          : 0;

      if (Math.abs(changePct) > 10) {
        const direction = changePct > 0 ? "growing" : "declining";
        const patternResult = await upsertPattern(supabase, {
          property_id: propertyId,
          pattern_type: "footfall_trend",
          title: `${zoneName}: Footfall ${direction} by ${Math.abs(changePct)}%`,
          description: `${zoneName} footfall is ${direction}. First half average: ${Math.round(firstAvg).toLocaleString()}/day, recent average: ${Math.round(secondAvg).toLocaleString()}/day. ${
            changePct < 0
              ? "Investigate potential causes and consider remedial actions."
              : "Positive trend — consider capitalising with targeted promotions."
          }`,
          confidence: Math.min(70, Math.abs(changePct) + data.length),
          impact_estimate:
            changePct < -15
              ? "Revenue risk — declining traffic"
              : changePct > 15
                ? "Revenue opportunity — growing traffic"
                : "Moderate trend — monitor closely",
          data_points: data.length,
        });
        if (patternResult) found++;
      }
    }
  }

  return { found };
}

// ── Detect Energy Patterns ──────────────────────────────────

async function detectEnergyPatterns(
  supabase: SupabaseClient,
  propertyId: string
): Promise<{ found: number }> {
  let found = 0;

  // Get last 30 days of energy data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString();

  const { data: energyData } = await supabase
    .from("energy_readings")
    .select("zone_id, timestamp, consumption_kwh, cost_egp")
    .gte("timestamp", startDate)
    .order("timestamp", { ascending: true });

  if (!energyData || energyData.length < 10) return { found };

  // Get zone info
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, property_id")
    .eq("property_id", propertyId);

  const zoneNames: Record<string, string> = {};
  const propertyZoneIds: Set<string> = new Set();
  (zones || []).forEach((z: any) => {
    zoneNames[z.id] = z.name;
    propertyZoneIds.add(z.id);
  });

  // Filter to property zones
  const propertyEnergy = energyData.filter(
    (e: any) => e.zone_id && propertyZoneIds.has(e.zone_id)
  );

  if (propertyEnergy.length < 10) return { found };

  // Get footfall for correlation
  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("zone_id, date, total_in")
    .eq("property_id", propertyId)
    .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

  // Daily footfall by zone
  const ffByZoneDate: Record<string, Record<string, number>> = {};
  (footfallData || []).forEach((f: any) => {
    if (!f.zone_id) return;
    if (!ffByZoneDate[f.zone_id]) ffByZoneDate[f.zone_id] = {};
    ffByZoneDate[f.zone_id][f.date] = f.total_in || 0;
  });

  // Group energy by zone by date
  const energyByZoneDate: Record<string, Record<string, number>> = {};
  propertyEnergy.forEach((e: any) => {
    const date = new Date(e.timestamp).toISOString().split("T")[0];
    if (!energyByZoneDate[e.zone_id]) energyByZoneDate[e.zone_id] = {};
    energyByZoneDate[e.zone_id][date] =
      (energyByZoneDate[e.zone_id][date] || 0) + (e.consumption_kwh || 0);
  });

  // Detect: high energy + low footfall = waste
  for (const [zoneId, dailyEnergy] of Object.entries(energyByZoneDate)) {
    const zoneName = zoneNames[zoneId] || "Unknown Zone";
    const zoneFootfall = ffByZoneDate[zoneId] || {};

    const dates = Object.keys(dailyEnergy);
    if (dates.length < 7) continue;

    // Find days with high energy but low footfall
    const avgEnergy =
      Object.values(dailyEnergy).reduce((a, b) => a + b, 0) / dates.length;
    const ffValues = Object.values(zoneFootfall);
    const avgFootfall =
      ffValues.length > 0 ? ffValues.reduce((a, b) => a + b, 0) / ffValues.length : 0;

    let wasteDays = 0;
    for (const date of dates) {
      const energy = dailyEnergy[date];
      const ff = zoneFootfall[date] || 0;
      // High energy (>80% of avg) but low footfall (<30% of avg)
      if (energy > avgEnergy * 0.8 && avgFootfall > 0 && ff < avgFootfall * 0.3) {
        wasteDays++;
      }
    }

    if (wasteDays >= 3) {
      const patternResult = await upsertPattern(supabase, {
        property_id: propertyId,
        pattern_type: "energy_waste",
        title: `${zoneName}: Energy waste detected on ${wasteDays} days`,
        description: `${zoneName} consumed near-average energy (${Math.round(avgEnergy)} kWh/day) on ${wasteDays} days when footfall was below 30% of normal. Consider implementing occupancy-based energy controls.`,
        confidence: Math.min(75, wasteDays * 10 + 20),
        impact_estimate: `Potential ${Math.round(wasteDays * avgEnergy * 0.3)} kWh/month savings`,
        data_points: dates.length,
      });
      if (patternResult) found++;
    }

    // Weekend vs weekday energy pattern
    const weekdayEnergy: number[] = [];
    const weekendEnergy: number[] = [];
    for (const date of dates) {
      const dayOfWeek = new Date(date).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
        weekendEnergy.push(dailyEnergy[date]);
      } else {
        weekdayEnergy.push(dailyEnergy[date]);
      }
    }

    if (weekdayEnergy.length >= 3 && weekendEnergy.length >= 2) {
      const wdAvg =
        weekdayEnergy.reduce((a, b) => a + b, 0) / weekdayEnergy.length;
      const weAvg =
        weekendEnergy.reduce((a, b) => a + b, 0) / weekendEnergy.length;
      const diff = Math.round(((weAvg - wdAvg) / wdAvg) * 100);

      if (Math.abs(diff) > 15) {
        const higher = diff > 0 ? "weekends" : "weekdays";
        const patternResult = await upsertPattern(supabase, {
          property_id: propertyId,
          pattern_type: "energy_waste",
          title: `${zoneName}: ${Math.abs(diff)}% more energy on ${higher}`,
          description: `${zoneName} uses ${Math.abs(diff)}% more energy on ${higher}. Weekday avg: ${Math.round(wdAvg)} kWh, Weekend avg: ${Math.round(weAvg)} kWh. ${
            diff > 20
              ? "Weekend energy usage is disproportionately high — review HVAC schedules."
              : "Investigate if the pattern correlates with occupancy."
          }`,
          confidence: Math.min(70, dates.length * 2 + 10),
          impact_estimate: "Energy cost optimization opportunity",
          data_points: dates.length,
        });
        if (patternResult) found++;
      }
    }
  }

  return { found };
}

// ── Detect Maintenance Cycles ───────────────────────────────

async function detectMaintenanceCycles(
  supabase: SupabaseClient,
  propertyId: string
): Promise<{ found: number }> {
  let found = 0;

  // Get all completed maintenance tickets
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select("id, zone_id, unit_id, category, title, created_at, resolved_at, status")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true });

  if (!tickets || tickets.length < 5) return { found };

  // Get zone and unit names
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name")
    .eq("property_id", propertyId);

  const zoneNames: Record<string, string> = {};
  (zones || []).forEach((z: any) => {
    zoneNames[z.id] = z.name;
  });

  // Detect recurring issues by zone + category
  const byZoneCategory: Record<string, Array<{ created_at: string; title: string }>> = {};
  tickets.forEach((t: any) => {
    const key = `${t.zone_id || "none"}::${t.category}`;
    if (!byZoneCategory[key]) byZoneCategory[key] = [];
    byZoneCategory[key].push({ created_at: t.created_at, title: t.title });
  });

  for (const [key, occurrences] of Object.entries(byZoneCategory)) {
    if (occurrences.length < 3) continue;

    const [zoneId, category] = key.split("::");
    const zoneName = zoneNames[zoneId] || "General";

    // Calculate average interval between occurrences
    const timestamps = occurrences.map((o) => new Date(o.created_at).getTime());
    timestamps.sort((a, b) => a - b);

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(
        (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24)
      );
    }

    const avgIntervalDays =
      intervals.reduce((a, b) => a + b, 0) / intervals.length;

    if (avgIntervalDays < 180) {
      // Predict next occurrence
      const lastDate = new Date(timestamps[timestamps.length - 1]);
      const predictedNext = new Date(
        lastDate.getTime() + avgIntervalDays * 24 * 60 * 60 * 1000
      );
      const daysUntilNext = Math.round(
        (predictedNext.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      const patternResult = await upsertPattern(supabase, {
        property_id: propertyId,
        pattern_type: "maintenance_cycle",
        title: `${zoneName}: ${category} issues every ~${Math.round(avgIntervalDays)} days`,
        description: `${zoneName} has had ${occurrences.length} ${category} issues, recurring approximately every ${Math.round(avgIntervalDays)} days. ${
          daysUntilNext <= 14
            ? `Next occurrence predicted within ${Math.max(0, daysUntilNext)} days — schedule preventive maintenance.`
            : `Next occurrence predicted around ${predictedNext.toISOString().split("T")[0]}.`
        }`,
        confidence: Math.min(80, occurrences.length * 12 + 10),
        impact_estimate:
          daysUntilNext <= 7
            ? "Preventive maintenance recommended immediately"
            : daysUntilNext <= 30
              ? "Schedule preventive maintenance soon"
              : "Monitor — preventive window available",
        data_points: occurrences.length,
      });
      if (patternResult) found++;

      // Also store as learned param (failure interval)
      await supabase.from("ai_learned_params").upsert(
        {
          property_id: propertyId,
          param_type: "maintenance_cycle",
          entity_id: zoneId === "none" ? null : zoneId,
          entity_name: `${zoneName} — ${category}`,
          param_key: "failure_interval_days",
          initial_value: 90, // Default assumption
          learned_value: Math.round(avgIntervalDays * 10) / 10,
          confidence: Math.min(80, occurrences.length * 12 + 10),
          sample_count: occurrences.length,
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: "property_id,param_type,entity_id,param_key",
        }
      );
    }
  }

  return { found };
}

// ── Update Confidence Scores ────────────────────────────────

async function updateConfidenceScores(
  supabase: SupabaseClient,
  propertyId: string
): Promise<{ confirmed: number; outdated: number }> {
  let confirmed = 0;
  let outdated = 0;

  // Get all active patterns
  const { data: patterns } = await supabase
    .from("ai_patterns")
    .select("*")
    .eq("property_id", propertyId)
    .in("status", ["active", "confirmed"]);

  if (!patterns || patterns.length === 0) return { confirmed, outdated };

  const now = new Date();

  for (const pattern of patterns) {
    const lastConfirmed = new Date(pattern.last_confirmed);
    const daysSinceConfirmed = Math.round(
      (now.getTime() - lastConfirmed.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Decay confidence if not recently confirmed
    let newConfidence = pattern.confidence;
    if (daysSinceConfirmed > 30) {
      // Lose 5% confidence per month without confirmation
      const monthsStale = Math.floor(daysSinceConfirmed / 30);
      newConfidence = Math.max(0, pattern.confidence - monthsStale * 5);
    }

    // Mark as outdated if confidence drops below 20
    if (newConfidence < 20 && pattern.status !== "outdated") {
      await supabase
        .from("ai_patterns")
        .update({ status: "outdated", confidence: newConfidence })
        .eq("id", pattern.id);
      outdated++;
    } else if (newConfidence !== pattern.confidence) {
      await supabase
        .from("ai_patterns")
        .update({ confidence: newConfidence })
        .eq("id", pattern.id);
    }

    // If pattern was recently re-detected (within this cycle),
    // the detect functions already updated last_confirmed.
    // Here we just boost confirmed patterns.
    if (daysSinceConfirmed <= 1 && pattern.status === "active") {
      await supabase
        .from("ai_patterns")
        .update({
          status: "confirmed",
          confidence: Math.min(95, pattern.confidence + 5),
        })
        .eq("id", pattern.id);
      confirmed++;
    }
  }

  return { confirmed, outdated };
}

// ── Helper: Upsert Pattern ──────────────────────────────────

async function upsertPattern(
  supabase: SupabaseClient,
  pattern: {
    property_id: string;
    pattern_type: string;
    title: string;
    description: string;
    confidence: number;
    impact_estimate: string;
    data_points: number;
  }
): Promise<boolean> {
  // Check if a similar pattern already exists (by type + similar title)
  const { data: existing } = await supabase
    .from("ai_patterns")
    .select("id, confidence, data_points, status")
    .eq("property_id", pattern.property_id)
    .eq("pattern_type", pattern.pattern_type)
    .eq("title", pattern.title)
    .maybeSingle();

  if (existing) {
    // Update existing pattern — increase confidence and confirm
    const newConfidence = Math.min(
      95,
      Math.max(existing.confidence, pattern.confidence) + 3
    );
    await supabase
      .from("ai_patterns")
      .update({
        description: pattern.description,
        confidence: newConfidence,
        data_points: pattern.data_points,
        last_confirmed: new Date().toISOString(),
        impact_estimate: pattern.impact_estimate,
        status: existing.status === "outdated" ? "active" : existing.status,
      })
      .eq("id", existing.id);
    return false; // Updated, not new
  }

  // Insert new pattern
  await supabase.from("ai_patterns").insert({
    ...pattern,
    status: "active",
    first_detected: new Date().toISOString(),
    last_confirmed: new Date().toISOString(),
  });
  return true; // New pattern
}

// ── Record Feedback ─────────────────────────────────────────

/**
 * Records human feedback on an AI decision.
 * This is how humans teach the AI.
 */
export async function recordFeedback(
  supabase: SupabaseClient,
  decisionId: string,
  feedbackType: "approve" | "modify" | "reject" | "correct",
  correctedValue: Record<string, unknown> | null,
  reason: string | null,
  staffId: string | null,
  propertyId: string = PROPERTY_ID
): Promise<{ id: string }> {
  // Get the original decision
  const { data: decision } = await supabase
    .from("ai_decisions")
    .select("*")
    .eq("id", decisionId)
    .single();

  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`);
  }

  // Record the feedback
  const { data: feedback, error } = await supabase
    .from("ai_feedback")
    .insert({
      property_id: propertyId,
      decision_id: decisionId,
      feedback_type: feedbackType,
      original_value: decision.context_json,
      corrected_value: correctedValue,
      reason,
      staff_id: staffId,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Update the decision with human action
  const actionMap: Record<string, string> = {
    approve: "approved",
    modify: "modified",
    reject: "rejected",
    correct: "modified",
  };

  await supabase
    .from("ai_decisions")
    .update({
      human_action: actionMap[feedbackType] || "modified",
      human_feedback: reason,
    })
    .eq("id", decisionId);

  return { id: feedback.id };
}

// ── Get Learned Conversion Rate ─────────────────────────────

/**
 * Returns the learned conversion rate for a tenant if available
 * (confidence > 50), otherwise returns null (fall back to category default).
 */
export async function getLearnedConversionRate(
  supabase: SupabaseClient,
  tenantId: string,
  propertyId: string = PROPERTY_ID
): Promise<{
  rate: number;
  confidence: number;
  source: "learned" | "default";
  sample_count: number;
} | null> {
  const { data } = await supabase
    .from("ai_learned_params")
    .select("learned_value, confidence, sample_count")
    .eq("property_id", propertyId)
    .eq("param_type", "conversion_rate")
    .eq("entity_id", tenantId)
    .eq("param_key", "conversion_rate")
    .maybeSingle();

  if (data && data.confidence > 50) {
    return {
      rate: data.learned_value,
      confidence: data.confidence,
      source: "learned",
      sample_count: data.sample_count,
    };
  }

  return null;
}

// ── Get Learned Patterns ────────────────────────────────────

/**
 * Returns active patterns, sorted by confidence descending.
 */
export async function getLearnedPatterns(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  type?: string
): Promise<AIPattern[]> {
  let query = supabase
    .from("ai_patterns")
    .select("*")
    .eq("property_id", propertyId)
    .in("status", ["active", "confirmed"])
    .order("confidence", { ascending: false });

  if (type) {
    query = query.eq("pattern_type", type);
  }

  const { data } = await query;
  return (data || []) as AIPattern[];
}

// ── Get Learning History ────────────────────────────────────

/**
 * Returns recent learning cycles with what was learned.
 */
export async function getLearningHistory(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  days: number = 30
): Promise<LearningCycleLog[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data } = await supabase
    .from("ai_learning_cycles")
    .select("*")
    .eq("property_id", propertyId)
    .gte("cycle_date", cutoff.toISOString().split("T")[0])
    .order("cycle_date", { ascending: false });

  return (data || []) as LearningCycleLog[];
}

// ── Get Learning Stats ──────────────────────────────────────

/**
 * Returns overall learning statistics.
 */
export async function getLearningStats(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<LearningStats> {
  // Run all queries in parallel
  const [feedbackResult, paramsResult, patternsResult, cyclesResult] =
    await Promise.all([
      supabase
        .from("ai_feedback")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId),
      supabase
        .from("ai_learned_params")
        .select("*")
        .eq("property_id", propertyId),
      supabase
        .from("ai_patterns")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .in("status", ["active", "confirmed"]),
      supabase
        .from("ai_learning_cycles")
        .select("cycle_date")
        .eq("property_id", propertyId)
        .order("cycle_date", { ascending: true })
        .limit(1),
    ]);

  const params = paramsResult.data || [];
  const avgConfidence =
    params.length > 0
      ? Math.round(
          params.reduce((s: number, p: any) => s + (p.confidence || 0), 0) /
            params.length
        )
      : 0;

  // Days of learning
  let daysOfLearning = 0;
  if (cyclesResult.data && cyclesResult.data.length > 0) {
    const firstCycle = new Date(cyclesResult.data[0].cycle_date);
    daysOfLearning = Math.max(
      1,
      Math.round(
        (Date.now() - firstCycle.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
  }

  // Top improvements: params with biggest learned vs initial difference
  const topImprovements = params
    .filter((p: any) => p.confidence > 40)
    .map((p: any) => ({
      entity_name: p.entity_name || "Unknown",
      param_key: p.param_key,
      initial_value: p.initial_value,
      learned_value: p.learned_value,
      confidence: p.confidence,
    }))
    .sort((a: any, b: any) => b.confidence - a.confidence)
    .slice(0, 5);

  return {
    total_feedback_received: feedbackResult.count || 0,
    params_calibrated: params.length,
    patterns_discovered: patternsResult.count || 0,
    avg_confidence: avgConfidence,
    days_of_learning: daysOfLearning,
    top_improvements: topImprovements,
  };
}
