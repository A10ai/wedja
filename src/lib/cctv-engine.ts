import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────

export interface PeopleCountZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  current_count: number;
  today_total: number;
  capacity: number;
  occupancy_pct: number;
}

export interface VisitorFlowPath {
  from_zone_id: string;
  from_zone_name: string;
  to_zone_id: string;
  to_zone_name: string;
  count: number;
  pct_of_total: number;
}

export interface VisitorFlowData {
  paths: VisitorFlowPath[];
  entry_points: { zone_name: string; count: number; pct: number }[];
  total_movements: number;
}

export interface DwellUnit {
  unit_id: string;
  unit_name: string;
  tenant_name: string;
  zone_name: string;
  avg_dwell_seconds: number;
  max_dwell_seconds: number;
  people_stopped: number;
  people_passed: number;
  stop_rate: number;
}

export interface DwellAnalysis {
  units: DwellUnit[];
  avg_dwell_all: number;
  top_dwell: DwellUnit[];
  bottom_dwell: DwellUnit[];
}

export interface QueueItem {
  unit_id: string;
  unit_name: string;
  tenant_name: string;
  queue_length: number;
  estimated_wait_minutes: number;
  alert_triggered: boolean;
  timestamp: string;
}

export interface QueueStatus {
  active_queues: QueueItem[];
  total_queued: number;
  alerts_count: number;
  avg_wait_minutes: number;
}

export interface OccupancyZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  current_count: number;
  capacity: number;
  occupancy_pct: number;
  status: string;
}

export interface OccupancyStatus {
  zones: OccupancyZone[];
  total_current: number;
  total_capacity: number;
  overall_pct: number;
  alerts: { zone_name: string; status: string; pct: number }[];
}

export interface DeadZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  area_sqm: number;
  footfall: number;
  footfall_per_sqm: number;
  relative_traffic: number; // 0-100 relative to busiest
  recommendation: string;
}

export interface DemographicData {
  group_breakdown: { type: string; count: number; pct: number }[];
  age_breakdown: { range: string; count: number; pct: number }[];
  time_patterns: { hour: number; families: number; young_adults: number; seniors: number }[];
}

export interface ParkingData {
  current_occupied: number;
  total_spaces: number;
  occupancy_pct: number;
  cars_entered_hour: number;
  cars_exited_hour: number;
  avg_duration_minutes: number;
  hourly_trend: { hour: number; occupied: number; pct: number }[];
  peak_hour: number;
  peak_occupancy: number;
}

export interface SecurityAlert {
  id: string;
  zone_name: string;
  camera_name: string;
  alert_type: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export interface SecurityData {
  active_alerts: SecurityAlert[];
  total_active: number;
  total_this_week: number;
  false_alarm_rate: number;
  avg_response_minutes: number;
  by_severity: { severity: string; count: number }[];
}

export interface StoreConversionItem {
  unit_id: string;
  unit_name: string;
  tenant_name: string;
  passersby: number;
  entered: number;
  conversion_rate: number;
  avg_time_in_store_seconds: number;
}

export interface StoreConversionData {
  stores: StoreConversionItem[];
  avg_conversion_rate: number;
  top_converters: StoreConversionItem[];
  bottom_converters: StoreConversionItem[];
}

export interface CCTVOverview {
  total_visitors_now: number;
  parking_occupancy_pct: number;
  active_queues: number;
  security_alerts: number;
  avg_dwell_seconds: number;
  cameras_online: number;
  cameras_total: number;
  zones_monitored: number;
  data_freshness: string;
}

// ── Helpers ───────────────────────────────────────────────────

function todayStr(date?: string): string {
  return date || new Date().toISOString().split("T")[0];
}

function daysAgoStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ── Engine Functions ──────────────────────────────────────────

export async function getPeopleCountLive(
  supabase: SupabaseClient,
  propertyId: string
): Promise<PeopleCountZone[]> {
  // Get latest occupancy reading per zone
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm")
    .eq("property_id", propertyId)
    .neq("type", "parking");

  if (!zones || zones.length === 0) return [];

  const results: PeopleCountZone[] = [];

  for (const zone of zones) {
    // Latest occupancy
    const { data: latest } = await supabase
      .from("occupancy_readings")
      .select("current_count, capacity, occupancy_pct")
      .eq("zone_id", zone.id)
      .order("timestamp", { ascending: false })
      .limit(1);

    // Today's total from footfall_daily
    const today = todayStr();
    const { data: dailyData } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("property_id", propertyId)
      .eq("zone_id", zone.id)
      .eq("date", today);

    const todayTotal = (dailyData || []).reduce(
      (sum: number, r: { total_in: number }) => sum + (r.total_in || 0),
      0
    );

    const occ = latest?.[0];
    results.push({
      zone_id: zone.id,
      zone_name: zone.name,
      zone_type: zone.type,
      current_count: occ?.current_count || 0,
      today_total: todayTotal,
      capacity: occ?.capacity || Math.floor((zone.area_sqm || 1000) / 4),
      occupancy_pct: occ?.occupancy_pct || 0,
    });
  }

  return results.sort((a, b) => b.current_count - a.current_count);
}

export async function getVisitorFlow(
  supabase: SupabaseClient,
  propertyId: string,
  hours: number = 24
): Promise<VisitorFlowData> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("visitor_flow")
    .select("from_zone_id, to_zone_id, count, direction")
    .eq("property_id", propertyId)
    .gte("timestamp", since);

  if (!data || data.length === 0) {
    return { paths: [], entry_points: [], total_movements: 0 };
  }

  // Get zone names
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name")
    .eq("property_id", propertyId);

  const zoneMap: Record<string, string> = {};
  (zones || []).forEach((z: { id: string; name: string }) => {
    zoneMap[z.id] = z.name;
  });

  // Aggregate paths
  const pathMap: Record<string, { from: string; to: string; count: number }> = {};
  let total = 0;

  data.forEach((r: { from_zone_id: string; to_zone_id: string; count: number }) => {
    if (!r.from_zone_id || !r.to_zone_id) return;
    const key = `${r.from_zone_id}|${r.to_zone_id}`;
    if (!pathMap[key]) {
      pathMap[key] = { from: r.from_zone_id, to: r.to_zone_id, count: 0 };
    }
    pathMap[key].count += r.count || 0;
    total += r.count || 0;
  });

  const paths = Object.values(pathMap)
    .map((p) => ({
      from_zone_id: p.from,
      from_zone_name: zoneMap[p.from] || "Unknown",
      to_zone_id: p.to,
      to_zone_name: zoneMap[p.to] || "Unknown",
      count: p.count,
      pct_of_total: total > 0 ? Math.round((p.count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Entry points (from_zone counts)
  const entryMap: Record<string, number> = {};
  data.forEach((r: { from_zone_id: string; count: number; direction: string }) => {
    if (r.direction === "enter" && r.from_zone_id) {
      entryMap[r.from_zone_id] = (entryMap[r.from_zone_id] || 0) + (r.count || 0);
    }
  });

  const entryTotal = Object.values(entryMap).reduce((a, b) => a + b, 0);
  const entry_points = Object.entries(entryMap)
    .map(([zid, c]) => ({
      zone_name: zoneMap[zid] || "Unknown",
      count: c,
      pct: entryTotal > 0 ? Math.round((c / entryTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { paths, entry_points, total_movements: total };
}

export async function getDwellAnalysis(
  supabase: SupabaseClient,
  propertyId: string,
  date?: string
): Promise<DwellAnalysis> {
  const today = todayStr(date);
  const dayStart = today + "T00:00:00";
  const dayEnd = today + "T23:59:59";

  const { data } = await supabase
    .from("dwell_readings")
    .select("unit_id, zone_id, avg_dwell_seconds, max_dwell_seconds, people_stopped, people_passed, stop_rate")
    .eq("property_id", propertyId)
    .gte("timestamp", dayStart)
    .lte("timestamp", dayEnd);

  if (!data || data.length === 0) {
    return { units: [], avg_dwell_all: 0, top_dwell: [], bottom_dwell: [] };
  }

  // Get unit and tenant info
  const unitIds = Array.from(new Set(data.map((r: { unit_id: string }) => r.unit_id).filter(Boolean)));

  const { data: units } = await supabase
    .from("units")
    .select("id, name, unit_number")
    .in("id", unitIds);

  const { data: leases } = await supabase
    .from("leases")
    .select("unit_id, tenant:tenants(brand_name)")
    .eq("status", "active")
    .in("unit_id", unitIds);

  const { data: zoneData } = await supabase
    .from("zones")
    .select("id, name")
    .eq("property_id", propertyId);

  const unitMap: Record<string, string> = {};
  (units || []).forEach((u: { id: string; name: string }) => { unitMap[u.id] = u.name; });

  const tenantMap: Record<string, string> = {};
  (leases || []).forEach((l: any) => {
    if (l.unit_id && l.tenant?.brand_name) tenantMap[l.unit_id] = l.tenant.brand_name;
  });

  const zoneNameMap: Record<string, string> = {};
  (zoneData || []).forEach((z: { id: string; name: string }) => { zoneNameMap[z.id] = z.name; });

  // Aggregate per unit
  const unitAgg: Record<string, {
    zone_id: string; dwell_sum: number; max_dwell: number;
    stopped_sum: number; passed_sum: number; stop_rate_sum: number; count: number;
  }> = {};

  data.forEach((r: any) => {
    const uid = r.unit_id;
    if (!uid) return;
    if (!unitAgg[uid]) {
      unitAgg[uid] = {
        zone_id: r.zone_id, dwell_sum: 0, max_dwell: 0,
        stopped_sum: 0, passed_sum: 0, stop_rate_sum: 0, count: 0
      };
    }
    unitAgg[uid].dwell_sum += r.avg_dwell_seconds || 0;
    unitAgg[uid].max_dwell = Math.max(unitAgg[uid].max_dwell, r.max_dwell_seconds || 0);
    unitAgg[uid].stopped_sum += r.people_stopped || 0;
    unitAgg[uid].passed_sum += r.people_passed || 0;
    unitAgg[uid].stop_rate_sum += r.stop_rate || 0;
    unitAgg[uid].count += 1;
  });

  const dwellUnits: DwellUnit[] = Object.entries(unitAgg).map(([uid, agg]) => ({
    unit_id: uid,
    unit_name: unitMap[uid] || "Unknown",
    tenant_name: tenantMap[uid] || "Vacant",
    zone_name: zoneNameMap[agg.zone_id] || "Unknown",
    avg_dwell_seconds: agg.count > 0 ? Math.round(agg.dwell_sum / agg.count) : 0,
    max_dwell_seconds: agg.max_dwell,
    people_stopped: agg.stopped_sum,
    people_passed: agg.passed_sum,
    stop_rate: agg.count > 0 ? Math.round((agg.stop_rate_sum / agg.count) * 10) / 10 : 0,
  }));

  const sorted = [...dwellUnits].sort((a, b) => b.avg_dwell_seconds - a.avg_dwell_seconds);
  const avgAll = dwellUnits.length > 0
    ? Math.round(dwellUnits.reduce((s, u) => s + u.avg_dwell_seconds, 0) / dwellUnits.length)
    : 0;

  return {
    units: sorted,
    avg_dwell_all: avgAll,
    top_dwell: sorted.slice(0, 10),
    bottom_dwell: sorted.slice(-10).reverse(),
  };
}

export async function getQueueStatus(
  supabase: SupabaseClient,
  propertyId: string
): Promise<QueueStatus> {
  // Get latest queue reading per unit
  const { data: allUnits } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId)
    .eq("status", "occupied");

  if (!allUnits || allUnits.length === 0) {
    return { active_queues: [], total_queued: 0, alerts_count: 0, avg_wait_minutes: 0 };
  }

  const unitIds = allUnits.map((u: { id: string }) => u.id);

  // Get latest queue per unit (last 3 hours)
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("queue_readings")
    .select("unit_id, queue_length, estimated_wait_minutes, alert_triggered, timestamp")
    .eq("property_id", propertyId)
    .gte("timestamp", since)
    .in("unit_id", unitIds)
    .order("timestamp", { ascending: false });

  if (!data || data.length === 0) {
    return { active_queues: [], total_queued: 0, alerts_count: 0, avg_wait_minutes: 0 };
  }

  // Get latest per unit
  const latestMap: Record<string, any> = {};
  data.forEach((r: any) => {
    if (!latestMap[r.unit_id]) latestMap[r.unit_id] = r;
  });

  // Get unit/tenant info
  const { data: units } = await supabase
    .from("units")
    .select("id, name")
    .in("id", Object.keys(latestMap));

  const { data: leases } = await supabase
    .from("leases")
    .select("unit_id, tenant:tenants(brand_name)")
    .eq("status", "active")
    .in("unit_id", Object.keys(latestMap));

  const unitMap: Record<string, string> = {};
  (units || []).forEach((u: { id: string; name: string }) => { unitMap[u.id] = u.name; });

  const tenantMap: Record<string, string> = {};
  (leases || []).forEach((l: any) => {
    if (l.unit_id && l.tenant?.brand_name) tenantMap[l.unit_id] = l.tenant.brand_name;
  });

  const queues: QueueItem[] = Object.entries(latestMap)
    .filter(([, r]: [string, any]) => r.queue_length > 0)
    .map(([uid, r]: [string, any]) => ({
      unit_id: uid,
      unit_name: unitMap[uid] || "Unknown",
      tenant_name: tenantMap[uid] || "Unknown",
      queue_length: r.queue_length,
      estimated_wait_minutes: r.estimated_wait_minutes,
      alert_triggered: r.alert_triggered,
      timestamp: r.timestamp,
    }))
    .sort((a, b) => b.queue_length - a.queue_length);

  const totalQueued = queues.reduce((s, q) => s + q.queue_length, 0);
  const alertsCount = queues.filter((q) => q.alert_triggered).length;
  const avgWait = queues.length > 0
    ? Math.round(queues.reduce((s, q) => s + q.estimated_wait_minutes, 0) / queues.length * 10) / 10
    : 0;

  return {
    active_queues: queues,
    total_queued: totalQueued,
    alerts_count: alertsCount,
    avg_wait_minutes: avgWait,
  };
}

export async function getOccupancyStatus(
  supabase: SupabaseClient,
  propertyId: string
): Promise<OccupancyStatus> {
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type")
    .eq("property_id", propertyId)
    .neq("type", "parking");

  if (!zones || zones.length === 0) {
    return { zones: [], total_current: 0, total_capacity: 0, overall_pct: 0, alerts: [] };
  }

  const results: OccupancyZone[] = [];

  for (const zone of zones) {
    const { data: latest } = await supabase
      .from("occupancy_readings")
      .select("current_count, capacity, occupancy_pct, status")
      .eq("zone_id", zone.id)
      .order("timestamp", { ascending: false })
      .limit(1);

    const occ = latest?.[0];
    if (occ) {
      results.push({
        zone_id: zone.id,
        zone_name: zone.name,
        zone_type: zone.type,
        current_count: occ.current_count,
        capacity: occ.capacity,
        occupancy_pct: occ.occupancy_pct,
        status: occ.status,
      });
    }
  }

  const totalCurrent = results.reduce((s, z) => s + z.current_count, 0);
  const totalCapacity = results.reduce((s, z) => s + z.capacity, 0);
  const overallPct = totalCapacity > 0
    ? Math.round((totalCurrent / totalCapacity) * 1000) / 10
    : 0;

  const alerts = results
    .filter((z) => z.status === "near_capacity" || z.status === "over_capacity")
    .map((z) => ({ zone_name: z.zone_name, status: z.status, pct: z.occupancy_pct }));

  return {
    zones: results.sort((a, b) => b.occupancy_pct - a.occupancy_pct),
    total_current: totalCurrent,
    total_capacity: totalCapacity,
    overall_pct: overallPct,
    alerts,
  };
}

export async function getDeadZones(
  supabase: SupabaseClient,
  propertyId: string,
  date?: string
): Promise<DeadZone[]> {
  const today = todayStr(date);

  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm")
    .eq("property_id", propertyId)
    .neq("type", "parking");

  if (!zones || zones.length === 0) return [];

  // Get footfall per zone today
  const { data: dailyData } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .eq("date", today);

  const footfallByZone: Record<string, number> = {};
  (dailyData || []).forEach((r: { zone_id: string; total_in: number }) => {
    if (r.zone_id) {
      footfallByZone[r.zone_id] = (footfallByZone[r.zone_id] || 0) + (r.total_in || 0);
    }
  });

  const maxFootfall = Math.max(...Object.values(footfallByZone), 1);

  const results: DeadZone[] = zones.map((z: { id: string; name: string; type: string; area_sqm: number }) => {
    const footfall = footfallByZone[z.id] || 0;
    const area = z.area_sqm || 1;
    const perSqm = Math.round((footfall / area) * 100) / 100;
    const relTraffic = Math.round((footfall / maxFootfall) * 100);

    let recommendation = "";
    if (relTraffic < 20) {
      recommendation = `Low traffic area — consider signage, tenant repositioning, or activations to drive footfall`;
    } else if (relTraffic < 40) {
      recommendation = `Below average traffic — review wayfinding and tenant mix`;
    } else if (relTraffic < 60) {
      recommendation = `Moderate traffic — performing adequately`;
    } else {
      recommendation = `Good traffic levels — high performer`;
    }

    return {
      zone_id: z.id,
      zone_name: z.name,
      zone_type: z.type,
      area_sqm: z.area_sqm,
      footfall,
      footfall_per_sqm: perSqm,
      relative_traffic: relTraffic,
      recommendation,
    };
  });

  return results.sort((a, b) => a.relative_traffic - b.relative_traffic);
}

export async function getDemographics(
  supabase: SupabaseClient,
  propertyId: string,
  date?: string
): Promise<DemographicData> {
  const today = todayStr(date);
  const dayStart = today + "T00:00:00";
  const dayEnd = today + "T23:59:59";

  const { data } = await supabase
    .from("demographic_readings")
    .select("group_type, estimated_age_range, count, timestamp")
    .eq("property_id", propertyId)
    .gte("timestamp", dayStart)
    .lte("timestamp", dayEnd);

  if (!data || data.length === 0) {
    return { group_breakdown: [], age_breakdown: [], time_patterns: [] };
  }

  // Group type breakdown
  const groupCounts: Record<string, number> = {};
  const ageCounts: Record<string, number> = {};
  let totalCount = 0;

  data.forEach((r: { group_type: string; estimated_age_range: string; count: number }) => {
    groupCounts[r.group_type] = (groupCounts[r.group_type] || 0) + (r.count || 0);
    ageCounts[r.estimated_age_range] = (ageCounts[r.estimated_age_range] || 0) + (r.count || 0);
    totalCount += r.count || 0;
  });

  const group_breakdown = Object.entries(groupCounts)
    .map(([type, count]) => ({
      type,
      count,
      pct: totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const age_breakdown = Object.entries(ageCounts)
    .map(([range, count]) => ({
      range,
      count,
      pct: totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Time patterns
  const hourData: Record<number, { families: number; young_adults: number; seniors: number }> = {};

  data.forEach((r: { group_type: string; estimated_age_range: string; count: number; timestamp: string }) => {
    const hour = new Date(r.timestamp).getHours();
    if (!hourData[hour]) hourData[hour] = { families: 0, young_adults: 0, seniors: 0 };

    if (r.group_type === "family") hourData[hour].families += r.count || 0;
    if (r.estimated_age_range === "young_adult") hourData[hour].young_adults += r.count || 0;
    if (r.estimated_age_range === "senior") hourData[hour].seniors += r.count || 0;
  });

  const time_patterns = Object.entries(hourData)
    .map(([h, d]) => ({ hour: parseInt(h), ...d }))
    .sort((a, b) => a.hour - b.hour);

  return { group_breakdown, age_breakdown, time_patterns };
}

export async function getParkingStatus(
  supabase: SupabaseClient,
  propertyId: string
): Promise<ParkingData> {
  // Latest reading
  const { data: latest } = await supabase
    .from("parking_readings")
    .select("*")
    .eq("property_id", propertyId)
    .order("timestamp", { ascending: false })
    .limit(1);

  const current = latest?.[0];

  // Today's hourly trend
  const today = todayStr();
  const dayStart = today + "T00:00:00";
  const dayEnd = today + "T23:59:59";

  const { data: todayData } = await supabase
    .from("parking_readings")
    .select("timestamp, occupied_spaces, occupancy_pct")
    .eq("property_id", propertyId)
    .gte("timestamp", dayStart)
    .lte("timestamp", dayEnd)
    .order("timestamp", { ascending: true });

  const hourly: { hour: number; occupied: number; pct: number }[] = [];
  const hourMap: Record<number, { occ: number; pct: number }> = {};

  (todayData || []).forEach((r: { timestamp: string; occupied_spaces: number; occupancy_pct: number }) => {
    const hour = new Date(r.timestamp).getHours();
    hourMap[hour] = { occ: r.occupied_spaces, pct: r.occupancy_pct };
  });

  for (let h = 0; h < 24; h++) {
    hourly.push({
      hour: h,
      occupied: hourMap[h]?.occ || 0,
      pct: hourMap[h]?.pct || 0,
    });
  }

  // Find peak
  let peakHour = 0;
  let peakOcc = 0;
  hourly.forEach((h) => {
    if (h.occupied > peakOcc) {
      peakHour = h.hour;
      peakOcc = h.occupied;
    }
  });

  return {
    current_occupied: current?.occupied_spaces || 0,
    total_spaces: current?.total_spaces || 500,
    occupancy_pct: current?.occupancy_pct || 0,
    cars_entered_hour: current?.cars_entered_hour || 0,
    cars_exited_hour: current?.cars_exited_hour || 0,
    avg_duration_minutes: current?.avg_duration_minutes || 0,
    hourly_trend: hourly,
    peak_hour: peakHour,
    peak_occupancy: peakOcc,
  };
}

export async function getSecurityAlerts(
  supabase: SupabaseClient,
  propertyId: string,
  status?: string
): Promise<SecurityData> {
  let query = supabase
    .from("security_alerts")
    .select("id, zone_id, camera_id, alert_type, severity, description, status, created_at, resolved_at, zones(name), camera_feeds(name)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data } = await query.limit(100);

  if (!data || data.length === 0) {
    return {
      active_alerts: [], total_active: 0, total_this_week: 0,
      false_alarm_rate: 0, avg_response_minutes: 0, by_severity: [],
    };
  }

  const alerts: SecurityAlert[] = data.map((r: any) => ({
    id: r.id,
    zone_name: r.zones?.name || "Unknown",
    camera_name: r.camera_feeds?.name || "Unknown",
    alert_type: r.alert_type,
    severity: r.severity,
    description: r.description,
    status: r.status,
    created_at: r.created_at,
    resolved_at: r.resolved_at,
  }));

  const active = alerts.filter((a) => a.status === "active" || a.status === "acknowledged");
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeek = alerts.filter((a) => a.created_at >= weekAgo);
  const falseAlarms = alerts.filter((a) => a.status === "false_alarm");
  const resolved = alerts.filter((a) => a.resolved_at);

  let avgResponseMin = 0;
  if (resolved.length > 0) {
    const totalMin = resolved.reduce((s, a) => {
      const created = new Date(a.created_at).getTime();
      const resolvedAt = new Date(a.resolved_at!).getTime();
      return s + (resolvedAt - created) / 60000;
    }, 0);
    avgResponseMin = Math.round(totalMin / resolved.length);
  }

  const severityMap: Record<string, number> = {};
  alerts.forEach((a) => {
    severityMap[a.severity] = (severityMap[a.severity] || 0) + 1;
  });

  return {
    active_alerts: active,
    total_active: active.length,
    total_this_week: thisWeek.length,
    false_alarm_rate: alerts.length > 0
      ? Math.round((falseAlarms.length / alerts.length) * 1000) / 10
      : 0,
    avg_response_minutes: avgResponseMin,
    by_severity: Object.entries(severityMap)
      .map(([severity, count]) => ({ severity, count }))
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      }),
  };
}

export async function getStoreConversion(
  supabase: SupabaseClient,
  propertyId: string,
  date?: string
): Promise<StoreConversionData> {
  const today = todayStr(date);

  const { data } = await supabase
    .from("store_conversion")
    .select("unit_id, passersby, entered, conversion_rate, avg_time_in_store_seconds")
    .eq("property_id", propertyId)
    .eq("date", today);

  if (!data || data.length === 0) {
    return { stores: [], avg_conversion_rate: 0, top_converters: [], bottom_converters: [] };
  }

  const unitIds = data.map((r: { unit_id: string }) => r.unit_id);

  const { data: units } = await supabase
    .from("units")
    .select("id, name")
    .in("id", unitIds);

  const { data: leases } = await supabase
    .from("leases")
    .select("unit_id, tenant:tenants(brand_name)")
    .eq("status", "active")
    .in("unit_id", unitIds);

  const unitMap: Record<string, string> = {};
  (units || []).forEach((u: { id: string; name: string }) => { unitMap[u.id] = u.name; });

  const tenantMap: Record<string, string> = {};
  (leases || []).forEach((l: any) => {
    if (l.unit_id && l.tenant?.brand_name) tenantMap[l.unit_id] = l.tenant.brand_name;
  });

  const stores: StoreConversionItem[] = data.map((r: any) => ({
    unit_id: r.unit_id,
    unit_name: unitMap[r.unit_id] || "Unknown",
    tenant_name: tenantMap[r.unit_id] || "Vacant",
    passersby: r.passersby,
    entered: r.entered,
    conversion_rate: r.conversion_rate,
    avg_time_in_store_seconds: r.avg_time_in_store_seconds,
  }));

  const sorted = [...stores].sort((a, b) => b.conversion_rate - a.conversion_rate);
  const avgRate = stores.length > 0
    ? Math.round(stores.reduce((s, st) => s + st.conversion_rate, 0) / stores.length * 10) / 10
    : 0;

  return {
    stores: sorted,
    avg_conversion_rate: avgRate,
    top_converters: sorted.slice(0, 10),
    bottom_converters: sorted.slice(-10).reverse(),
  };
}

// ── Master Overview ──────────────────────────────────────────

export async function getCCTVDashboardData(
  supabase: SupabaseClient,
  propertyId: string
): Promise<CCTVOverview> {
  // Total visitors now (sum of latest occupancy)
  const occupancy = await getOccupancyStatus(supabase, propertyId);
  const parking = await getParkingStatus(supabase, propertyId);
  const queues = await getQueueStatus(supabase, propertyId);
  const security = await getSecurityAlerts(supabase, propertyId, "active");
  const dwell = await getDwellAnalysis(supabase, propertyId);

  // Camera status
  const { data: cameras } = await supabase
    .from("camera_feeds")
    .select("id, status")
    .eq("property_id", propertyId);

  const camerasOnline = (cameras || []).filter((c: { status: string }) => c.status === "active").length;
  const camerasTotal = (cameras || []).length;

  return {
    total_visitors_now: occupancy.total_current,
    parking_occupancy_pct: parking.occupancy_pct,
    active_queues: queues.active_queues.length,
    security_alerts: security.total_active,
    avg_dwell_seconds: dwell.avg_dwell_all,
    cameras_online: camerasOnline,
    cameras_total: camerasTotal,
    zones_monitored: occupancy.zones.length,
    data_freshness: new Date().toISOString(),
  };
}
