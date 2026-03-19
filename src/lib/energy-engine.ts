import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Custis Energy Engine
//
// Energy monitoring, zone analysis, efficiency scoring,
// and AI-powered recommendations.
// All values in kWh and EGP.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface EnergyOverview {
  total_consumption_kwh_today: number;
  total_cost_egp_today: number;
  total_this_month_kwh: number;
  cost_this_month_egp: number;
  avg_daily_kwh: number;
  avg_daily_cost_egp: number;
  change_vs_yesterday_pct: number;
  peak_hour: number;
  peak_consumption_kwh: number;
}

export interface ZoneEnergy {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  area_sqm: number;
  consumption_kwh: number;
  cost_egp: number;
  share_pct: number;
  kwh_per_sqm: number;
}

export interface HourlyReading {
  hour: number;
  consumption_kwh: number;
  cost_egp: number;
  is_operating: boolean;
  is_peak: boolean;
}

export interface DailyTrend {
  date: string;
  consumption_kwh: number;
  cost_egp: number;
}

export interface EnergyEfficiency {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  energy_kwh: number;
  energy_cost_egp: number;
  footfall: number;
  kwh_per_visitor: number;
  efficiency_score: number; // 0-100, higher = more efficient
  status: "efficient" | "moderate" | "inefficient";
}

export interface EnergyRecommendation {
  id: string;
  title: string;
  description: string;
  zone_name: string | null;
  severity: "info" | "warning" | "critical";
  estimated_savings_egp: number;
  category: string;
}

// ── Energy Overview ─────────────────────────────────────────

export async function getEnergyOverview(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<EnergyOverview> {
  const today = date || new Date().toISOString().split("T")[0];
  const yesterday = new Date(new Date(today).getTime() - 86400000)
    .toISOString()
    .split("T")[0];

  // Get first day of month
  const d = new Date(today);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .split("T")[0];

  // Get zones for this property
  const { data: zones } = await supabase
    .from("zones")
    .select("id")
    .eq("property_id", propertyId);

  const zoneIds = (zones || []).map((z) => z.id);
  if (zoneIds.length === 0) {
    return {
      total_consumption_kwh_today: 0,
      total_cost_egp_today: 0,
      total_this_month_kwh: 0,
      cost_this_month_egp: 0,
      avg_daily_kwh: 0,
      avg_daily_cost_egp: 0,
      change_vs_yesterday_pct: 0,
      peak_hour: 0,
      peak_consumption_kwh: 0,
    };
  }

  const [todayRes, yesterdayRes, monthRes, last30Res] = await Promise.all([
    // Today's readings
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp, timestamp")
      .in("zone_id", zoneIds)
      .gte("timestamp", today + "T00:00:00")
      .lt("timestamp", today + "T23:59:59"),

    // Yesterday's readings
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .in("zone_id", zoneIds)
      .gte("timestamp", yesterday + "T00:00:00")
      .lt("timestamp", yesterday + "T23:59:59"),

    // Month to date
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .in("zone_id", zoneIds)
      .gte("timestamp", monthStart + "T00:00:00")
      .lte("timestamp", today + "T23:59:59"),

    // Last 30 days for average
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .in("zone_id", zoneIds)
      .gte(
        "timestamp",
        new Date(new Date(today).getTime() - 30 * 86400000)
          .toISOString()
          .split("T")[0] + "T00:00:00"
      )
      .lte("timestamp", today + "T23:59:59"),
  ]);

  const todayKwh = (todayRes.data || []).reduce(
    (s, r) => s + Number(r.consumption_kwh),
    0
  );
  const todayCost = (todayRes.data || []).reduce(
    (s, r) => s + Number(r.cost_egp),
    0
  );
  const yesterdayKwh = (yesterdayRes.data || []).reduce(
    (s, r) => s + Number(r.consumption_kwh),
    0
  );
  const monthKwh = (monthRes.data || []).reduce(
    (s, r) => s + Number(r.consumption_kwh),
    0
  );
  const monthCost = (monthRes.data || []).reduce(
    (s, r) => s + Number(r.cost_egp),
    0
  );
  const totalLast30Kwh = (last30Res.data || []).reduce(
    (s, r) => s + Number(r.consumption_kwh),
    0
  );
  const totalLast30Cost = (last30Res.data || []).reduce(
    (s, r) => s + Number(r.cost_egp),
    0
  );

  // Find peak hour today
  const hourlyMap: Record<number, number> = {};
  (todayRes.data || []).forEach((r) => {
    const h = new Date(r.timestamp).getHours();
    hourlyMap[h] = (hourlyMap[h] || 0) + Number(r.consumption_kwh);
  });

  let peakHour = 0;
  let peakKwh = 0;
  Object.entries(hourlyMap).forEach(([h, kwh]) => {
    if (kwh > peakKwh) {
      peakHour = parseInt(h);
      peakKwh = kwh;
    }
  });

  const changeVsYesterday =
    yesterdayKwh > 0 ? ((todayKwh - yesterdayKwh) / yesterdayKwh) * 100 : 0;

  return {
    total_consumption_kwh_today: Math.round(todayKwh),
    total_cost_egp_today: Math.round(todayCost),
    total_this_month_kwh: Math.round(monthKwh),
    cost_this_month_egp: Math.round(monthCost),
    avg_daily_kwh: Math.round(totalLast30Kwh / 30),
    avg_daily_cost_egp: Math.round(totalLast30Cost / 30),
    change_vs_yesterday_pct: Math.round(changeVsYesterday * 10) / 10,
    peak_hour: peakHour,
    peak_consumption_kwh: Math.round(peakKwh),
  };
}

// ── Energy by Zone ──────────────────────────────────────────

export async function getEnergyByZone(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<ZoneEnergy[]> {
  const today = date || new Date().toISOString().split("T")[0];

  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm")
    .eq("property_id", propertyId);

  if (!zones || zones.length === 0) return [];

  const { data: readings } = await supabase
    .from("energy_readings")
    .select("zone_id, consumption_kwh, cost_egp")
    .in(
      "zone_id",
      zones.map((z) => z.id)
    )
    .gte("timestamp", today + "T00:00:00")
    .lt("timestamp", today + "T23:59:59");

  // Aggregate by zone
  const zoneMap: Record<string, { kwh: number; cost: number }> = {};
  (readings || []).forEach((r) => {
    if (!zoneMap[r.zone_id]) zoneMap[r.zone_id] = { kwh: 0, cost: 0 };
    zoneMap[r.zone_id].kwh += Number(r.consumption_kwh);
    zoneMap[r.zone_id].cost += Number(r.cost_egp);
  });

  const totalKwh = Object.values(zoneMap).reduce((s, z) => s + z.kwh, 0);

  return zones
    .map((zone) => {
      const data = zoneMap[zone.id] || { kwh: 0, cost: 0 };
      const areaSqm = Number(zone.area_sqm) || 1;
      return {
        zone_id: zone.id,
        zone_name: zone.name,
        zone_type: zone.type,
        area_sqm: areaSqm,
        consumption_kwh: Math.round(data.kwh),
        cost_egp: Math.round(data.cost),
        share_pct:
          totalKwh > 0 ? Math.round((data.kwh / totalKwh) * 1000) / 10 : 0,
        kwh_per_sqm: Math.round((data.kwh / areaSqm) * 100) / 100,
      };
    })
    .sort((a, b) => b.consumption_kwh - a.consumption_kwh);
}

// ── Hourly Consumption ──────────────────────────────────────

export async function getEnergyHourly(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<HourlyReading[]> {
  const today = date || new Date().toISOString().split("T")[0];

  const { data: zones } = await supabase
    .from("zones")
    .select("id")
    .eq("property_id", propertyId);

  const zoneIds = (zones || []).map((z) => z.id);
  if (zoneIds.length === 0) return [];

  const { data } = await supabase
    .from("energy_readings")
    .select("timestamp, consumption_kwh, cost_egp")
    .in("zone_id", zoneIds)
    .gte("timestamp", today + "T00:00:00")
    .lt("timestamp", today + "T23:59:59");

  const hourlyMap: Record<number, { kwh: number; cost: number }> = {};
  (data || []).forEach((r) => {
    const h = new Date(r.timestamp).getHours();
    if (!hourlyMap[h]) hourlyMap[h] = { kwh: 0, cost: 0 };
    hourlyMap[h].kwh += Number(r.consumption_kwh);
    hourlyMap[h].cost += Number(r.cost_egp);
  });

  // Find peak for marking
  let peakKwh = 0;
  Object.values(hourlyMap).forEach((v) => {
    if (v.kwh > peakKwh) peakKwh = v.kwh;
  });

  return Array.from({ length: 24 }, (_, i) => {
    const d = hourlyMap[i] || { kwh: 0, cost: 0 };
    return {
      hour: i,
      consumption_kwh: Math.round(d.kwh),
      cost_egp: Math.round(d.cost),
      is_operating: i >= 10 && i <= 23,
      is_peak: d.kwh >= peakKwh * 0.95 && d.kwh > 0,
    };
  });
}

// ── Daily Trend ─────────────────────────────────────────────

export async function getEnergyTrend(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  days: number = 30
): Promise<DailyTrend[]> {
  const today = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];

  const { data: zones } = await supabase
    .from("zones")
    .select("id")
    .eq("property_id", propertyId);

  const zoneIds = (zones || []).map((z) => z.id);
  if (zoneIds.length === 0) return [];

  const { data } = await supabase
    .from("energy_readings")
    .select("timestamp, consumption_kwh, cost_egp")
    .in("zone_id", zoneIds)
    .gte("timestamp", startDate + "T00:00:00")
    .lte("timestamp", today + "T23:59:59");

  const dayMap: Record<string, { kwh: number; cost: number }> = {};
  (data || []).forEach((r) => {
    const day = r.timestamp.split("T")[0];
    if (!dayMap[day]) dayMap[day] = { kwh: 0, cost: 0 };
    dayMap[day].kwh += Number(r.consumption_kwh);
    dayMap[day].cost += Number(r.cost_egp);
  });

  return Object.entries(dayMap)
    .map(([date, { kwh, cost }]) => ({
      date,
      consumption_kwh: Math.round(kwh),
      cost_egp: Math.round(cost),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Energy vs Footfall Efficiency ───────────────────────────

export async function getEnergyVsFootfall(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<EnergyEfficiency[]> {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];

  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm")
    .eq("property_id", propertyId);

  if (!zones || zones.length === 0) return [];

  const [energyRes, footfallRes] = await Promise.all([
    supabase
      .from("energy_readings")
      .select("zone_id, consumption_kwh, cost_egp")
      .in(
        "zone_id",
        zones.map((z) => z.id)
      )
      .gte("timestamp", weekAgo + "T00:00:00")
      .lte("timestamp", today + "T23:59:59"),
    supabase
      .from("footfall_daily")
      .select("zone_id, total_in")
      .in(
        "zone_id",
        zones.map((z) => z.id)
      )
      .gte("date", weekAgo)
      .lte("date", today),
  ]);

  // Aggregate energy by zone
  const energyMap: Record<string, { kwh: number; cost: number }> = {};
  (energyRes.data || []).forEach((r) => {
    if (!energyMap[r.zone_id]) energyMap[r.zone_id] = { kwh: 0, cost: 0 };
    energyMap[r.zone_id].kwh += Number(r.consumption_kwh);
    energyMap[r.zone_id].cost += Number(r.cost_egp);
  });

  // Aggregate footfall by zone
  const footfallMap: Record<string, number> = {};
  (footfallRes.data || []).forEach((f) => {
    footfallMap[f.zone_id] = (footfallMap[f.zone_id] || 0) + (f.total_in || 0);
  });

  return zones.map((zone) => {
    const energy = energyMap[zone.id] || { kwh: 0, cost: 0 };
    const footfall = footfallMap[zone.id] || 0;
    const kwhPerVisitor = footfall > 0 ? energy.kwh / footfall : energy.kwh;

    // Efficiency score: lower kWh per visitor = better
    // Score inversely proportional to kWh/visitor, normalized
    let score = 0;
    if (footfall > 0) {
      // parking and common areas have different benchmarks
      if (zone.type === "parking" || zone.type === "common") {
        score = 50; // neutral for non-commercial zones
      } else {
        // For commercial zones: < 1 kWh/visitor = great, > 5 = bad
        score = Math.max(0, Math.min(100, 100 - (kwhPerVisitor - 0.5) * 20));
      }
    } else {
      score = zone.type === "parking" || zone.type === "common" ? 50 : 20;
    }

    let status: "efficient" | "moderate" | "inefficient" = "moderate";
    if (score >= 65) status = "efficient";
    else if (score < 40) status = "inefficient";

    return {
      zone_id: zone.id,
      zone_name: zone.name,
      zone_type: zone.type,
      energy_kwh: Math.round(energy.kwh),
      energy_cost_egp: Math.round(energy.cost),
      footfall,
      kwh_per_visitor: Math.round(kwhPerVisitor * 100) / 100,
      efficiency_score: Math.round(score),
      status,
    };
  });
}

// ── AI Recommendations ──────────────────────────────────────

export async function getEnergyRecommendations(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<EnergyRecommendation[]> {
  // Get zone energy data and footfall for analysis
  const [zoneEnergy, efficiency, hourly] = await Promise.all([
    getEnergyByZone(supabase, propertyId),
    getEnergyVsFootfall(supabase, propertyId),
    getEnergyHourly(supabase, propertyId),
  ]);

  const recommendations: EnergyRecommendation[] = [];
  const totalKwh = zoneEnergy.reduce((s, z) => s + z.consumption_kwh, 0);

  // 1. Check for high-energy zones with low efficiency
  efficiency.forEach((zone) => {
    if (zone.status === "inefficient" && zone.energy_kwh > 0) {
      const sharePct =
        totalKwh > 0
          ? Math.round((zone.energy_kwh / totalKwh) * 100)
          : 0;
      recommendations.push({
        id: `inefficient-${zone.zone_id}`,
        title: `${zone.zone_name} has low energy efficiency`,
        description: `${zone.zone_name} consumes ${sharePct}% of total energy but has an efficiency score of only ${zone.efficiency_score}/100. Investigate HVAC settings and lighting schedules.`,
        zone_name: zone.zone_name,
        severity: "warning",
        estimated_savings_egp: Math.round(zone.energy_cost_egp * 0.15 / 7 * 30),
        category: "efficiency",
      });
    }
  });

  // 2. Off-hours consumption analysis
  const operatingHoursKwh = hourly
    .filter((h) => h.is_operating)
    .reduce((s, h) => s + h.consumption_kwh, 0);
  const offHoursKwh = hourly
    .filter((h) => !h.is_operating)
    .reduce((s, h) => s + h.consumption_kwh, 0);
  const totalDayKwh = operatingHoursKwh + offHoursKwh;

  if (totalDayKwh > 0 && offHoursKwh / totalDayKwh > 0.25) {
    const offHoursPct = Math.round((offHoursKwh / totalDayKwh) * 100);
    recommendations.push({
      id: "off-hours-high",
      title: "High off-hours energy consumption",
      description: `Off-hours consumption is ${offHoursPct}% of total daily energy. Check if HVAC schedules are optimized and unnecessary systems are powered down after closing.`,
      zone_name: null,
      severity: "warning",
      estimated_savings_egp: Math.round(offHoursKwh * 2.5 * 0.3 * 30),
      category: "scheduling",
    });
  }

  // 3. Parking zone motion-sensor opportunity
  const parkingZone = zoneEnergy.find((z) => z.zone_type === "parking");
  if (parkingZone && parkingZone.consumption_kwh > 0) {
    recommendations.push({
      id: "parking-motion-sensors",
      title: "Install motion-sensor lighting in parking",
      description: `Parking zone consumes ${parkingZone.consumption_kwh.toLocaleString()} kWh/day. Motion-sensor lighting can reduce parking energy by 40%.`,
      zone_name: parkingZone.zone_name,
      severity: "info",
      estimated_savings_egp: Math.round(
        parkingZone.cost_egp * 0.4 * 30
      ),
      category: "infrastructure",
    });
  }

  // 4. Food court high consumption
  const foodZone = zoneEnergy.find((z) => z.zone_type === "food");
  if (foodZone && totalKwh > 0) {
    const foodShare = (foodZone.consumption_kwh / totalKwh) * 100;
    if (foodShare > 30) {
      recommendations.push({
        id: "food-court-hvac",
        title: "Food Court energy optimization",
        description: `Food Court consumes ${Math.round(foodShare)}% of total energy. Consider HVAC zoning, kitchen exhaust heat recovery, and LED lighting upgrades for estimated 15-20% reduction.`,
        zone_name: foodZone.zone_name,
        severity: "info",
        estimated_savings_egp: Math.round(foodZone.cost_egp * 0.17 * 30),
        category: "efficiency",
      });
    }
  }

  // 5. Peak demand management
  const peakHours = hourly.filter((h) => h.is_peak);
  if (peakHours.length > 0) {
    recommendations.push({
      id: "peak-demand",
      title: "Implement peak demand management",
      description: `Peak consumption reaches ${peakHours[0]?.consumption_kwh.toLocaleString()} kWh at ${peakHours[0]?.hour}:00. Staggering HVAC startup and non-essential loads can reduce peak demand charges by 10-15%.`,
      zone_name: null,
      severity: "info",
      estimated_savings_egp: Math.round(totalKwh * 2.5 * 0.05 * 30),
      category: "demand_management",
    });
  }

  return recommendations.sort(
    (a, b) => b.estimated_savings_egp - a.estimated_savings_egp
  );
}
