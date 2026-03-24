import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────

export interface FootfallOverview {
  total_visitors_today: number;
  total_visitors_yesterday: number;
  total_visitors_this_week: number;
  total_visitors_this_month: number;
  avg_daily_visitors: number;
  peak_hour: number;
  peak_count: number;
  change_vs_yesterday_pct: number;
  change_vs_last_week_pct: number;
}

export interface FootfallByZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  total_in: number;
  total_out: number;
  avg_dwell_seconds: number;
  share_of_total_pct: number;
}

export interface FootfallByUnit {
  unit_id: string;
  unit_number: string;
  tenant_name: string;
  count_in: number;
  count_out: number;
  dwell_seconds: number;
}

export interface HourlyFootfall {
  hour: number;
  count: number;
}

export interface DailyFootfall {
  date: string;
  total_in: number;
  total_out: number;
  day_of_week: number;
}

export interface FootfallHeatmapItem {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  unit_count: number;
  total_footfall: number;
  intensity: number;
}

export interface PeakPatterns {
  busiest_day: string;
  busiest_day_avg: number;
  quietest_day: string;
  quietest_day_avg: number;
  weekend_avg: number;
  weekday_avg: number;
  weekend_vs_weekday_ratio: number;
  peak_hour: number;
  peak_hour_avg: number;
}

// ── Helpers ───────────────────────────────────────────────────

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function todayStr(date?: string): string {
  return date || new Date().toISOString().split("T")[0];
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0];
}

function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

function yesterdayStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function lastWeekSameDayStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

function daysAgoStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ── Engine Functions ──────────────────────────────────────────

export async function getFootfallOverview(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<FootfallOverview> {
  const today = todayStr(date);
  const yesterday = yesterdayStr(today);
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const lastWeekDay = lastWeekSameDayStr(today);
  const thirtyDaysAgo = daysAgoStr(today, 30);

  // Fetch today's total from footfall_daily (property-level, no unit filter)
  const { data: todayData } = await supabase
    .from("footfall_daily")
    .select("total_in")
    .eq("property_id", propertyId)
    .eq("date", today);

  let total_visitors_today = (todayData || []).reduce(
    (sum: number, r: { total_in: number }) => sum + (r.total_in || 0),
    0
  );

  // Fallback: sum live readings from footfall_readings (CV service data)
  if (total_visitors_today === 0) {
    try {
      const todayStart = today + "T00:00:00Z";
      const { data: liveReadings } = await supabase
        .from("footfall_readings")
        .select("count_in")
        .gte("timestamp", todayStart);
      if (liveReadings && liveReadings.length > 0) {
        total_visitors_today = liveReadings.reduce(
          (sum: number, r: { count_in: number }) => sum + (r.count_in || 0),
          0
        );
      }
    } catch {
      // Live readings optional
    }
  }

  // Yesterday
  const { data: yesterdayData } = await supabase
    .from("footfall_daily")
    .select("total_in")
    .eq("property_id", propertyId)
    .eq("date", yesterday);

  const total_visitors_yesterday = (yesterdayData || []).reduce(
    (sum: number, r: { total_in: number }) => sum + (r.total_in || 0),
    0
  );

  // This week
  const { data: weekData } = await supabase
    .from("footfall_daily")
    .select("total_in")
    .eq("property_id", propertyId)
    .gte("date", weekStart)
    .lte("date", today);

  const total_visitors_this_week = (weekData || []).reduce(
    (sum: number, r: { total_in: number }) => sum + (r.total_in || 0),
    0
  );

  // This month
  const { data: monthData } = await supabase
    .from("footfall_daily")
    .select("total_in")
    .eq("property_id", propertyId)
    .gte("date", monthStart)
    .lte("date", today);

  const total_visitors_this_month = (monthData || []).reduce(
    (sum: number, r: { total_in: number }) => sum + (r.total_in || 0),
    0
  );

  // Average daily (last 30 days)
  const { data: avgData } = await supabase
    .from("footfall_daily")
    .select("date, total_in")
    .eq("property_id", propertyId)
    .gte("date", thirtyDaysAgo)
    .lte("date", today);

  // Group by date first to get per-day totals
  const dailyTotals: Record<string, number> = {};
  (avgData || []).forEach((r: { date: string; total_in: number }) => {
    dailyTotals[r.date] = (dailyTotals[r.date] || 0) + (r.total_in || 0);
  });
  const dailyValues = Object.values(dailyTotals);
  const avg_daily_visitors =
    dailyValues.length > 0
      ? Math.round(
          dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length
        )
      : 0;

  // Peak hour today from hourly readings
  const todayStart = today + "T00:00:00";
  const todayEnd = today + "T23:59:59";
  const { data: allReadingsToday } = await supabase
    .from("footfall_readings")
    .select("timestamp, count_in, unit_id")
    .gte("timestamp", todayStart)
    .lte("timestamp", todayEnd);

  // Filter to our property units
  const { data: propertyUnits } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  const unitIds = new Set((propertyUnits || []).map((u: { id: string }) => u.id));
  const propertyReadings = (allReadingsToday || []).filter(
    (r: { unit_id: string }) => unitIds.has(r.unit_id)
  );

  // Group by hour
  const hourCounts: Record<number, number> = {};
  propertyReadings.forEach(
    (r: { timestamp: string; count_in: number }) => {
      const hour = new Date(r.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + (r.count_in || 0);
    }
  );

  let peak_hour = 0;
  let peak_count = 0;
  Object.entries(hourCounts).forEach(([h, c]) => {
    if (c > peak_count) {
      peak_hour = parseInt(h);
      peak_count = c;
    }
  });

  // If no hourly data, fall back to footfall_daily peak
  if (peak_count === 0 && todayData && todayData.length > 0) {
    const { data: dailyPeak } = await supabase
      .from("footfall_daily")
      .select("peak_hour, peak_count")
      .eq("property_id", propertyId)
      .eq("date", today)
      .not("peak_hour", "is", null)
      .order("peak_count", { ascending: false })
      .limit(1);

    if (dailyPeak && dailyPeak.length > 0) {
      peak_hour = dailyPeak[0].peak_hour || 0;
      peak_count = dailyPeak[0].peak_count || 0;
    }
  }

  // Change vs yesterday
  const change_vs_yesterday_pct =
    total_visitors_yesterday > 0
      ? Math.round(
          ((total_visitors_today - total_visitors_yesterday) /
            total_visitors_yesterday) *
            1000
        ) / 10
      : 0;

  // Change vs last week same day
  const { data: lastWeekData } = await supabase
    .from("footfall_daily")
    .select("total_in")
    .eq("property_id", propertyId)
    .eq("date", lastWeekDay);

  const lastWeekTotal = (lastWeekData || []).reduce(
    (sum: number, r: { total_in: number }) => sum + (r.total_in || 0),
    0
  );

  const change_vs_last_week_pct =
    lastWeekTotal > 0
      ? Math.round(
          ((total_visitors_today - lastWeekTotal) / lastWeekTotal) * 1000
        ) / 10
      : 0;

  return {
    total_visitors_today,
    total_visitors_yesterday,
    total_visitors_this_week,
    total_visitors_this_month,
    avg_daily_visitors,
    peak_hour,
    peak_count,
    change_vs_yesterday_pct,
    change_vs_last_week_pct,
  };
}

export async function getFootfallByZone(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<FootfallByZone[]> {
  const today = todayStr(date);

  const { data } = await supabase
    .from("footfall_daily")
    .select(
      "zone_id, total_in, total_out, avg_dwell_seconds, zones!inner(name, type)"
    )
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("zone_id", "is", null);

  if (!data || data.length === 0) return [];

  // Group by zone
  const zoneMap: Record<
    string,
    {
      zone_name: string;
      zone_type: string;
      total_in: number;
      total_out: number;
      dwell_sum: number;
      count: number;
    }
  > = {};

  let grandTotal = 0;

  data.forEach((row: any) => {
    const zoneId = row.zone_id;
    if (!zoneMap[zoneId]) {
      zoneMap[zoneId] = {
        zone_name: row.zones?.name || "Unknown",
        zone_type: row.zones?.type || "retail",
        total_in: 0,
        total_out: 0,
        dwell_sum: 0,
        count: 0,
      };
    }
    zoneMap[zoneId].total_in += row.total_in || 0;
    zoneMap[zoneId].total_out += row.total_out || 0;
    zoneMap[zoneId].dwell_sum += row.avg_dwell_seconds || 0;
    zoneMap[zoneId].count += 1;
    grandTotal += row.total_in || 0;
  });

  return Object.entries(zoneMap)
    .map(([zoneId, z]) => ({
      zone_id: zoneId,
      zone_name: z.zone_name,
      zone_type: z.zone_type,
      total_in: z.total_in,
      total_out: z.total_out,
      avg_dwell_seconds: z.count > 0 ? Math.round(z.dwell_sum / z.count) : 0,
      share_of_total_pct:
        grandTotal > 0
          ? Math.round((z.total_in / grandTotal) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.total_in - a.total_in);
}

export async function getFootfallByUnit(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  zoneId?: string,
  date?: string
): Promise<FootfallByUnit[]> {
  const today = todayStr(date);

  const { data } = await supabase
    .from("footfall_daily")
    .select(
      "unit_id, total_in, total_out, avg_dwell_seconds, units!inner(unit_number, zone_id)"
    )
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("unit_id", "is", null);

  if (!data || data.length === 0) return [];

  // Get tenant names via leases
  const unitIds = Array.from(
    new Set(data.map((r: any) => r.unit_id).filter(Boolean))
  );

  const { data: leases } = await supabase
    .from("leases")
    .select("unit_id, tenant:tenants(brand_name)")
    .eq("status", "active")
    .in("unit_id", unitIds);

  const tenantMap: Record<string, string> = {};
  (leases || []).forEach((l: any) => {
    if (l.unit_id && l.tenant?.brand_name) {
      tenantMap[l.unit_id] = l.tenant.brand_name;
    }
  });

  let results = data.map((row: any) => ({
    unit_id: row.unit_id,
    unit_number: row.units?.unit_number || "N/A",
    tenant_name: tenantMap[row.unit_id] || "Vacant",
    count_in: row.total_in || 0,
    count_out: row.total_out || 0,
    dwell_seconds: row.avg_dwell_seconds || 0,
    _zone_id: row.units?.zone_id,
  }));

  if (zoneId) {
    results = results.filter((r: any) => r._zone_id === zoneId);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return results
    .map(({ _zone_id, ...rest }: any) => rest as FootfallByUnit)
    .sort((a, b) => b.count_in - a.count_in);
}

export async function getHourlyFootfall(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<HourlyFootfall[]> {
  const today = todayStr(date);
  const dayStart = today + "T00:00:00";
  const dayEnd = today + "T23:59:59";

  // Get property unit ids
  const { data: units } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  const unitIds = (units || []).map((u: { id: string }) => u.id);

  if (unitIds.length === 0) {
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  }

  const { data } = await supabase
    .from("footfall_readings")
    .select("timestamp, count_in")
    .in("unit_id", unitIds)
    .gte("timestamp", dayStart)
    .lte("timestamp", dayEnd);

  const hourCounts: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourCounts[h] = 0;

  (data || []).forEach((r: { timestamp: string; count_in: number }) => {
    const hour = new Date(r.timestamp).getHours();
    hourCounts[hour] += r.count_in || 0;
  });

  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourCounts[i] || 0,
  }));
}

export async function getFootfallTrend(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  days: number = 30
): Promise<DailyFootfall[]> {
  const today = todayStr();
  const startDate = daysAgoStr(today, days);

  const { data } = await supabase
    .from("footfall_daily")
    .select("date, total_in, total_out")
    .eq("property_id", propertyId)
    .gte("date", startDate)
    .lte("date", today)
    .order("date", { ascending: true });

  if (!data || data.length === 0) return [];

  // Group by date
  const dateMap: Record<string, { total_in: number; total_out: number }> = {};

  data.forEach((row: { date: string; total_in: number; total_out: number }) => {
    if (!dateMap[row.date]) {
      dateMap[row.date] = { total_in: 0, total_out: 0 };
    }
    dateMap[row.date].total_in += row.total_in || 0;
    dateMap[row.date].total_out += row.total_out || 0;
  });

  return Object.entries(dateMap)
    .map(([d, v]) => ({
      date: d,
      total_in: v.total_in,
      total_out: v.total_out,
      day_of_week: new Date(d + "T00:00:00").getDay(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getFootfallHeatmap(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  date?: string
): Promise<FootfallHeatmapItem[]> {
  const today = todayStr(date);

  // Get zones
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type")
    .eq("property_id", propertyId)
    .neq("type", "parking")
    .neq("type", "common");

  if (!zones || zones.length === 0) return [];

  // Get footfall by zone
  const { data: dailyData } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in, unit_id")
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("zone_id", "is", null);

  // Count units per zone
  const { data: allUnits } = await supabase
    .from("units")
    .select("id, zone_id")
    .eq("property_id", propertyId)
    .eq("status", "occupied");

  const unitCountByZone: Record<string, number> = {};
  (allUnits || []).forEach((u: { zone_id: string }) => {
    unitCountByZone[u.zone_id] = (unitCountByZone[u.zone_id] || 0) + 1;
  });

  // Sum footfall per zone
  const footfallByZone: Record<string, number> = {};
  (dailyData || []).forEach((r: { zone_id: string; total_in: number }) => {
    footfallByZone[r.zone_id] =
      (footfallByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  const maxFootfall = Math.max(...Object.values(footfallByZone), 1);

  return zones
    .map((z: { id: string; name: string; type: string }) => ({
      zone_id: z.id,
      zone_name: z.name,
      zone_type: z.type,
      unit_count: unitCountByZone[z.id] || 0,
      total_footfall: footfallByZone[z.id] || 0,
      intensity: Math.round(
        ((footfallByZone[z.id] || 0) / maxFootfall) * 100
      ),
    }))
    .sort(
      (a: FootfallHeatmapItem, b: FootfallHeatmapItem) =>
        b.total_footfall - a.total_footfall
    );
}

export async function getPeakPatterns(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<PeakPatterns> {
  const today = todayStr();
  const thirtyDaysAgo = daysAgoStr(today, 30);

  const { data } = await supabase
    .from("footfall_daily")
    .select("date, total_in, peak_hour, peak_count")
    .eq("property_id", propertyId)
    .gte("date", thirtyDaysAgo)
    .lte("date", today);

  if (!data || data.length === 0) {
    return {
      busiest_day: "N/A",
      busiest_day_avg: 0,
      quietest_day: "N/A",
      quietest_day_avg: 0,
      weekend_avg: 0,
      weekday_avg: 0,
      weekend_vs_weekday_ratio: 0,
      peak_hour: 0,
      peak_hour_avg: 0,
    };
  }

  // Group by date first, then by day of week
  const dateGrouped: Record<string, number> = {};
  data.forEach((r: { date: string; total_in: number }) => {
    dateGrouped[r.date] = (dateGrouped[r.date] || 0) + (r.total_in || 0);
  });

  const dayOfWeekTotals: Record<number, number[]> = {};
  for (let i = 0; i < 7; i++) dayOfWeekTotals[i] = [];

  Object.entries(dateGrouped).forEach(([d, total]) => {
    const dow = new Date(d + "T00:00:00").getDay();
    dayOfWeekTotals[dow].push(total);
  });

  const dayAvgs: Record<number, number> = {};
  Object.entries(dayOfWeekTotals).forEach(([dow, vals]) => {
    dayAvgs[parseInt(dow)] =
      vals.length > 0
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 0;
  });

  // Find busiest and quietest
  let busiestDay = 0;
  let busiestAvg = 0;
  let quietestDay = 0;
  let quietestAvg = Infinity;

  Object.entries(dayAvgs).forEach(([dow, avg]) => {
    if (avg > busiestAvg) {
      busiestDay = parseInt(dow);
      busiestAvg = avg;
    }
    if (avg < quietestAvg && avg > 0) {
      quietestDay = parseInt(dow);
      quietestAvg = avg;
    }
  });

  if (quietestAvg === Infinity) quietestAvg = 0;

  // Weekend (Fri=5, Sat=6) vs weekday
  const weekendDays = [5, 6];
  const weekendVals = weekendDays.flatMap((d) => dayOfWeekTotals[d] || []);
  const weekdayVals = [0, 1, 2, 3, 4].flatMap(
    (d) => dayOfWeekTotals[d] || []
  );

  const weekend_avg =
    weekendVals.length > 0
      ? Math.round(weekendVals.reduce((a, b) => a + b, 0) / weekendVals.length)
      : 0;
  const weekday_avg =
    weekdayVals.length > 0
      ? Math.round(weekdayVals.reduce((a, b) => a + b, 0) / weekdayVals.length)
      : 0;

  // Peak hour analysis
  const hourCounts: Record<number, number[]> = {};
  data.forEach(
    (r: { peak_hour: number | null; peak_count: number | null }) => {
      if (r.peak_hour != null && r.peak_count != null) {
        if (!hourCounts[r.peak_hour]) hourCounts[r.peak_hour] = [];
        hourCounts[r.peak_hour].push(r.peak_count);
      }
    }
  );

  let peakHour = 0;
  let peakHourAvg = 0;

  // Find the hour that appears most as peak
  let maxFreq = 0;
  Object.entries(hourCounts).forEach(([h, vals]) => {
    if (vals.length > maxFreq) {
      maxFreq = vals.length;
      peakHour = parseInt(h);
      peakHourAvg = Math.round(
        vals.reduce((a, b) => a + b, 0) / vals.length
      );
    }
  });

  return {
    busiest_day: DAY_NAMES[busiestDay],
    busiest_day_avg: busiestAvg,
    quietest_day: DAY_NAMES[quietestDay],
    quietest_day_avg: quietestAvg,
    weekend_avg,
    weekday_avg,
    weekend_vs_weekday_ratio:
      weekday_avg > 0
        ? Math.round((weekend_avg / weekday_avg) * 100) / 100
        : 0,
    peak_hour: peakHour,
    peak_hour_avg: peakHourAvg,
  };
}
