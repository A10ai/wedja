import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Wedja Live Heatmap Engine
//
// Real-time mall visualization combining footfall, revenue,
// energy, maintenance, and marketing data per zone.
//
// Powers the "Live Mall View" — the mission control page.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface ZoneHeatmapData {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  current_visitors: number;
  visitors_trend: "up" | "down" | "stable";
  heat_intensity: number; // 0-100
  energy_consumption_kwh: number;
  energy_per_visitor: number;
  active_tenants_count: number;
  total_revenue_this_month_egp: number;
  revenue_per_sqm: number;
  open_maintenance_count: number;
  discrepancies_count: number;
  top_tenant: { name: string; visitors: number } | null;
  worst_tenant: { name: string; revenue_per_sqm: number } | null;
}

export interface LiveHeatmapResult {
  zones: ZoneHeatmapData[];
  total_visitors_now: number;
  busiest_zone: string;
  timestamp: string;
}

export interface ZoneTenant {
  tenant_id: string;
  name: string;
  brand_name: string;
  area_sqm: number;
  visitors_today: number;
  reported_sales_egp: number | null;
  estimated_sales_egp: number | null;
  rent_per_sqm: number;
  performance_score: number;
}

export interface ZoneDeepDive {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  area_sqm: number;
  current_visitors: number;
  visitors_trend: "up" | "down" | "stable";
  heat_intensity: number;
  tenants: ZoneTenant[];
  energy: {
    consumption_kwh: number;
    cost_egp: number;
    efficiency_score: number;
  };
  discrepancies: {
    count: number;
    total_variance_egp: number;
  };
  maintenance: {
    open_tickets: number;
    urgent_count: number;
  };
  active_promotions: number;
  ai_insight: string;
}

export interface EntranceFlow {
  entrance_name: string;
  count: number;
  primary_destinations: string[];
}

export interface VisitorFlowResult {
  entrances: EntranceFlow[];
  busiest_corridor: string;
  avg_time_spent_minutes: number;
  total_in_mall: number;
}

export interface LiveFeedEvent {
  id: string;
  timestamp: string;
  zone: string;
  type: "footfall" | "revenue" | "energy" | "maintenance" | "marketing";
  description: string;
}

// ── Zone capacity estimates (visitors) ──────────────────────

const ZONE_CAPACITY: Record<string, number> = {
  retail: 800,
  food: 500,
  entertainment: 400,
  service: 300,
  grocery: 1200,
  anchor: 1200,
  parking: 2000,
  common: 600,
};

// ── Helpers ─────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function currentHour(): number {
  return new Date().getHours();
}

function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── getLiveHeatmapData ──────────────────────────────────────

export async function getLiveHeatmapData(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<LiveHeatmapResult> {
  const today = todayStr();
  const yesterday = yesterdayStr();
  const hour = currentHour();
  const monthStart = monthStartStr();

  // 1. Get all zones
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm")
    .eq("property_id", propertyId);

  if (!zones || zones.length === 0) {
    return { zones: [], total_visitors_now: 0, busiest_zone: "N/A", timestamp: new Date().toISOString() };
  }

  const zoneIds = zones.map((z) => z.id);

  // 2. Fetch all data in parallel
  const [
    todayFootfall,
    yesterdayFootfall,
    energyToday,
    occupiedUnits,
    monthRevenue,
    maintenanceTickets,
    discrepancies,
    unitFootfall,
  ] = await Promise.all([
    // Today's footfall by zone
    supabase
      .from("footfall_daily")
      .select("zone_id, total_in")
      .eq("property_id", propertyId)
      .eq("date", today)
      .not("zone_id", "is", null),

    // Yesterday's footfall by zone (same hour comparison)
    supabase
      .from("footfall_daily")
      .select("zone_id, total_in")
      .eq("property_id", propertyId)
      .eq("date", yesterday)
      .not("zone_id", "is", null),

    // Energy today by zone
    supabase
      .from("energy_readings")
      .select("zone_id, consumption_kwh, cost_egp")
      .in("zone_id", zoneIds)
      .gte("timestamp", today + "T00:00:00")
      .lte("timestamp", today + "T23:59:59"),

    // Units per zone (occupied)
    supabase
      .from("units")
      .select("id, zone_id, area_sqm")
      .eq("property_id", propertyId)
      .eq("status", "occupied"),

    // Month revenue by tenant (via tenant_sales_reported)
    supabase
      .from("tenant_sales_reported")
      .select("tenant_id, reported_revenue_egp")
      .eq("period_month", new Date().getMonth() + 1)
      .eq("period_year", new Date().getFullYear()),

    // Open maintenance tickets
    supabase
      .from("maintenance_tickets")
      .select("zone_id")
      .eq("property_id", propertyId)
      .in("status", ["open", "assigned", "in_progress"]),

    // Discrepancies this month
    supabase
      .from("discrepancies")
      .select("unit_id, variance_egp")
      .eq("period_month", new Date().getMonth() + 1)
      .eq("period_year", new Date().getFullYear())
      .eq("status", "flagged"),

    // Footfall by unit today (for top/worst tenant)
    supabase
      .from("footfall_daily")
      .select("unit_id, total_in")
      .eq("property_id", propertyId)
      .eq("date", today)
      .not("unit_id", "is", null),
  ]);

  // 3. Build lookup maps
  const footfallByZone: Record<string, number> = {};
  (todayFootfall.data || []).forEach((r: any) => {
    footfallByZone[r.zone_id] = (footfallByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  const yesterdayByZone: Record<string, number> = {};
  (yesterdayFootfall.data || []).forEach((r: any) => {
    yesterdayByZone[r.zone_id] = (yesterdayByZone[r.zone_id] || 0) + (r.total_in || 0);
  });

  const energyByZone: Record<string, number> = {};
  (energyToday.data || []).forEach((r: any) => {
    energyByZone[r.zone_id] = (energyByZone[r.zone_id] || 0) + Number(r.consumption_kwh || 0);
  });

  const unitsByZone: Record<string, Array<{ id: string; area_sqm: number }>> = {};
  (occupiedUnits.data || []).forEach((u: any) => {
    if (!unitsByZone[u.zone_id]) unitsByZone[u.zone_id] = [];
    unitsByZone[u.zone_id].push({ id: u.id, area_sqm: Number(u.area_sqm) || 0 });
  });

  // Get tenant-to-unit mapping via leases
  const { data: leases } = await supabase
    .from("leases")
    .select("unit_id, tenant_id, tenants!inner(brand_name), min_rent_monthly_egp")
    .eq("property_id", propertyId)
    .eq("status", "active");

  const tenantByUnit: Record<string, { tenant_id: string; brand_name: string; min_rent: number }> = {};
  (leases || []).forEach((l: any) => {
    tenantByUnit[l.unit_id] = {
      tenant_id: l.tenant_id,
      brand_name: l.tenants?.brand_name || "Unknown",
      min_rent: l.min_rent_monthly_egp || 0,
    };
  });

  // Revenue map by tenant
  const revenueByTenant: Record<string, number> = {};
  (monthRevenue.data || []).forEach((r: any) => {
    revenueByTenant[r.tenant_id] = r.reported_revenue_egp || 0;
  });

  // Maintenance by zone
  const maintenanceByZone: Record<string, number> = {};
  (maintenanceTickets.data || []).forEach((t: any) => {
    if (t.zone_id) {
      maintenanceByZone[t.zone_id] = (maintenanceByZone[t.zone_id] || 0) + 1;
    }
  });

  // Discrepancies by zone (via unit -> zone mapping)
  const unitToZone: Record<string, string> = {};
  (occupiedUnits.data || []).forEach((u: any) => {
    unitToZone[u.id] = u.zone_id;
  });

  const discrepanciesByZone: Record<string, number> = {};
  (discrepancies.data || []).forEach((d: any) => {
    const zoneId = unitToZone[d.unit_id];
    if (zoneId) {
      discrepanciesByZone[zoneId] = (discrepanciesByZone[zoneId] || 0) + 1;
    }
  });

  // Unit footfall map
  const footfallByUnit: Record<string, number> = {};
  (unitFootfall.data || []).forEach((r: any) => {
    footfallByUnit[r.unit_id] = (footfallByUnit[r.unit_id] || 0) + (r.total_in || 0);
  });

  // 4. Build per-zone results
  // Simulate "current visitors" as a fraction of daily total based on hour
  // Mall operates 10AM-11PM. Scale daily total by time-of-day factor.
  const hourFactor = getHourFactor(hour);

  const zoneResults: ZoneHeatmapData[] = zones.map((zone) => {
    const dailyVisitors = footfallByZone[zone.id] || 0;
    const currentVisitors = Math.round(dailyVisitors * hourFactor);
    const yesterdayVisitors = yesterdayByZone[zone.id] || 0;
    const capacity = ZONE_CAPACITY[zone.type] || 500;
    const heatIntensity = Math.min(100, Math.round((currentVisitors / capacity) * 100));

    // Trend
    let trend: "up" | "down" | "stable" = "stable";
    if (yesterdayVisitors > 0) {
      const change = ((dailyVisitors - yesterdayVisitors) / yesterdayVisitors) * 100;
      if (change > 5) trend = "up";
      else if (change < -5) trend = "down";
    }

    // Energy
    const energyKwh = energyByZone[zone.id] || 0;
    const energyPerVisitor = currentVisitors > 0 ? Math.round((energyKwh / currentVisitors) * 100) / 100 : 0;

    // Tenants in zone
    const zoneUnits = unitsByZone[zone.id] || [];
    const activeTenants = zoneUnits.filter((u) => tenantByUnit[u.id]).length;

    // Revenue this month for zone
    let zoneRevenue = 0;
    let zoneArea = 0;
    zoneUnits.forEach((u) => {
      const t = tenantByUnit[u.id];
      if (t) {
        zoneRevenue += revenueByTenant[t.tenant_id] || 0;
        zoneArea += u.area_sqm;
      }
    });
    const revenuePerSqm = zoneArea > 0 ? Math.round(zoneRevenue / zoneArea) : 0;

    // Top tenant by footfall
    let topTenant: { name: string; visitors: number } | null = null;
    let worstTenant: { name: string; revenue_per_sqm: number } | null = null;
    let maxVisitors = 0;
    let minRevenuePerSqm = Infinity;

    zoneUnits.forEach((u) => {
      const t = tenantByUnit[u.id];
      if (!t) return;
      const visitors = footfallByUnit[u.id] || 0;
      const rev = revenueByTenant[t.tenant_id] || 0;
      const rps = u.area_sqm > 0 ? rev / u.area_sqm : 0;

      if (visitors > maxVisitors) {
        maxVisitors = visitors;
        topTenant = { name: t.brand_name, visitors };
      }
      if (rps < minRevenuePerSqm && rps >= 0) {
        minRevenuePerSqm = rps;
        worstTenant = { name: t.brand_name, revenue_per_sqm: Math.round(rps) };
      }
    });

    if (minRevenuePerSqm === Infinity) worstTenant = null;

    return {
      zone_id: zone.id,
      zone_name: zone.name,
      zone_type: zone.type,
      current_visitors: currentVisitors,
      visitors_trend: trend,
      heat_intensity: heatIntensity,
      energy_consumption_kwh: Math.round(energyKwh),
      energy_per_visitor: energyPerVisitor,
      active_tenants_count: activeTenants,
      total_revenue_this_month_egp: Math.round(zoneRevenue),
      revenue_per_sqm: revenuePerSqm,
      open_maintenance_count: maintenanceByZone[zone.id] || 0,
      discrepancies_count: discrepanciesByZone[zone.id] || 0,
      top_tenant: topTenant,
      worst_tenant: worstTenant,
    };
  });

  // Sort by heat intensity descending
  zoneResults.sort((a, b) => b.heat_intensity - a.heat_intensity);

  const totalVisitors = zoneResults.reduce((s, z) => s + z.current_visitors, 0);
  const busiestZone = zoneResults.length > 0 ? zoneResults[0].zone_name : "N/A";

  return {
    zones: zoneResults,
    total_visitors_now: totalVisitors,
    busiest_zone: busiestZone,
    timestamp: new Date().toISOString(),
  };
}

// ── getZoneDeepDive ─────────────────────────────────────────

export async function getZoneDeepDive(
  supabase: SupabaseClient,
  zoneId: string
): Promise<ZoneDeepDive> {
  const today = todayStr();
  const yesterday = yesterdayStr();
  const hour = currentHour();
  const hourFactor = getHourFactor(hour);

  // 1. Zone info
  const { data: zone } = await supabase
    .from("zones")
    .select("id, name, type, area_sqm, property_id")
    .eq("id", zoneId)
    .single();

  if (!zone) throw new Error(`Zone ${zoneId} not found`);

  const propertyId = zone.property_id;

  // 2. Get units in zone
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, area_sqm, status")
    .eq("zone_id", zoneId);

  const unitIds = (units || []).map((u) => u.id);

  // 3. Parallel fetches
  const [
    footfallRes,
    yesterdayFootfallRes,
    leasesRes,
    energyRes,
    discrepancyRes,
    maintenanceRes,
    eventsRes,
  ] = await Promise.all([
    // Footfall today by unit
    supabase
      .from("footfall_daily")
      .select("unit_id, total_in, zone_id")
      .eq("date", today)
      .eq("property_id", propertyId)
      .or(`zone_id.eq.${zoneId},unit_id.in.(${unitIds.join(",")})`),

    // Yesterday footfall
    supabase
      .from("footfall_daily")
      .select("zone_id, total_in")
      .eq("date", yesterday)
      .eq("property_id", propertyId)
      .eq("zone_id", zoneId),

    // Active leases for units in zone
    unitIds.length > 0
      ? supabase
          .from("leases")
          .select(
            "unit_id, tenant_id, min_rent_monthly_egp, percentage_rate, tenants!inner(id, name, brand_name, category)"
          )
          .in("unit_id", unitIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),

    // Energy for zone today
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .eq("zone_id", zoneId)
      .gte("timestamp", today + "T00:00:00")
      .lte("timestamp", today + "T23:59:59"),

    // Discrepancies in zone
    unitIds.length > 0
      ? supabase
          .from("discrepancies")
          .select("variance_egp")
          .in("unit_id", unitIds)
          .eq("status", "flagged")
      : Promise.resolve({ data: [] }),

    // Maintenance tickets
    supabase
      .from("maintenance_tickets")
      .select("priority")
      .eq("zone_id", zoneId)
      .in("status", ["open", "assigned", "in_progress"]),

    // Active events/promotions
    supabase
      .from("events")
      .select("id")
      .eq("property_id", propertyId)
      .eq("status", "active"),
  ]);

  // Build footfall map for units
  const footfallByUnit: Record<string, number> = {};
  let zoneTotalToday = 0;
  (footfallRes.data || []).forEach((r: any) => {
    if (r.unit_id) {
      footfallByUnit[r.unit_id] = (footfallByUnit[r.unit_id] || 0) + (r.total_in || 0);
    }
    if (r.zone_id === zoneId) {
      zoneTotalToday += r.total_in || 0;
    }
  });

  const yesterdayTotal = (yesterdayFootfallRes.data || []).reduce(
    (s: number, r: any) => s + (r.total_in || 0),
    0
  );

  const currentVisitors = Math.round(zoneTotalToday * hourFactor);
  const capacity = ZONE_CAPACITY[zone.type] || 500;
  const heatIntensity = Math.min(100, Math.round((currentVisitors / capacity) * 100));

  let trend: "up" | "down" | "stable" = "stable";
  if (yesterdayTotal > 0) {
    const change = ((zoneTotalToday - yesterdayTotal) / yesterdayTotal) * 100;
    if (change > 5) trend = "up";
    else if (change < -5) trend = "down";
  }

  // Get reported sales for tenants
  const tenantIds = (leasesRes.data || []).map((l: any) => l.tenant_id);
  const { data: salesData } = tenantIds.length > 0
    ? await supabase
        .from("tenant_sales_reported")
        .select("tenant_id, reported_revenue_egp")
        .in("tenant_id", tenantIds)
        .eq("period_month", new Date().getMonth() + 1)
        .eq("period_year", new Date().getFullYear())
    : { data: [] };

  const salesByTenant: Record<string, number> = {};
  (salesData || []).forEach((s: any) => {
    salesByTenant[s.tenant_id] = s.reported_revenue_egp;
  });

  // Get estimates
  const { data: estimateData } = tenantIds.length > 0
    ? await supabase
        .from("revenue_estimates")
        .select("tenant_id, estimated_revenue_egp")
        .in("tenant_id", tenantIds)
        .eq("period_month", new Date().getMonth() + 1)
        .eq("period_year", new Date().getFullYear())
    : { data: [] };

  const estimatesByTenant: Record<string, number> = {};
  (estimateData || []).forEach((e: any) => {
    estimatesByTenant[e.tenant_id] = e.estimated_revenue_egp;
  });

  // Build tenant list
  const unitMap: Record<string, { area_sqm: number }> = {};
  (units || []).forEach((u) => {
    unitMap[u.id] = { area_sqm: Number(u.area_sqm) || 0 };
  });

  const tenants: ZoneTenant[] = (leasesRes.data || []).map((l: any) => {
    const t = l.tenants;
    const unitArea = unitMap[l.unit_id]?.area_sqm || 0;
    const visitors = footfallByUnit[l.unit_id] || 0;
    const reported = salesByTenant[l.tenant_id] ?? null;
    const estimated = estimatesByTenant[l.tenant_id] ?? null;
    const rentPerSqm = unitArea > 0 ? Math.round((l.min_rent_monthly_egp || 0) / unitArea) : 0;

    // Simple performance score: 0-100 based on visitors and revenue
    let score = 50;
    if (visitors > 500) score += 20;
    else if (visitors > 200) score += 10;
    if (reported && reported > 0) {
      if (rentPerSqm > 0 && reported / unitArea > rentPerSqm * 5) score += 20;
      else if (rentPerSqm > 0 && reported / unitArea > rentPerSqm * 3) score += 10;
    }
    if (estimated && reported && reported >= estimated * 0.9) score += 10;
    score = Math.min(100, score);

    return {
      tenant_id: l.tenant_id,
      name: t?.name || "Unknown",
      brand_name: t?.brand_name || "Unknown",
      area_sqm: unitArea,
      visitors_today: visitors,
      reported_sales_egp: reported,
      estimated_sales_egp: estimated,
      rent_per_sqm: rentPerSqm,
      performance_score: score,
    };
  });

  // Sort tenants by visitors descending
  tenants.sort((a, b) => b.visitors_today - a.visitors_today);

  // Energy
  const energyKwh = (energyRes.data || []).reduce(
    (s: number, r: any) => s + Number(r.consumption_kwh || 0),
    0
  );
  const energyCost = (energyRes.data || []).reduce(
    (s: number, r: any) => s + Number(r.cost_egp || 0),
    0
  );
  const efficiencyScore =
    currentVisitors > 0
      ? Math.max(0, Math.min(100, 100 - ((energyKwh / currentVisitors) - 0.5) * 20))
      : 30;

  // Discrepancies
  const discrepancyCount = (discrepancyRes.data || []).length;
  const totalVariance = (discrepancyRes.data || []).reduce(
    (s: number, d: any) => s + (d.variance_egp || 0),
    0
  );

  // Maintenance
  const openTickets = (maintenanceRes.data || []).length;
  const urgentCount = (maintenanceRes.data || []).filter(
    (t: any) => t.priority === "urgent" || t.priority === "emergency"
  ).length;

  // Events
  const activePromotions = (eventsRes.data || []).length;

  // AI Insight generation
  const aiInsight = generateZoneInsight(zone.name, zone.type, currentVisitors, heatIntensity, tenants, energyKwh, discrepancyCount);

  return {
    zone_id: zone.id,
    zone_name: zone.name,
    zone_type: zone.type,
    area_sqm: Number(zone.area_sqm) || 0,
    current_visitors: currentVisitors,
    visitors_trend: trend,
    heat_intensity: heatIntensity,
    tenants,
    energy: {
      consumption_kwh: Math.round(energyKwh),
      cost_egp: Math.round(energyCost),
      efficiency_score: Math.round(efficiencyScore),
    },
    discrepancies: {
      count: discrepancyCount,
      total_variance_egp: Math.round(totalVariance),
    },
    maintenance: {
      open_tickets: openTickets,
      urgent_count: urgentCount,
    },
    active_promotions: activePromotions,
    ai_insight: aiInsight,
  };
}

// ── getVisitorFlowData ──────────────────────────────────────

export async function getVisitorFlowData(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<VisitorFlowResult> {
  const today = todayStr();
  const hour = currentHour();
  const hourFactor = getHourFactor(hour);

  // Get zones for names
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, type")
    .eq("property_id", propertyId);

  // Get today's footfall by zone
  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in")
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("zone_id", "is", null);

  const footfallByZone: Record<string, number> = {};
  let totalDaily = 0;
  (footfallData || []).forEach((r: any) => {
    footfallByZone[r.zone_id] = (footfallByZone[r.zone_id] || 0) + (r.total_in || 0);
    totalDaily += r.total_in || 0;
  });

  const totalInMall = Math.round(totalDaily * hourFactor);
  const zoneNameMap: Record<string, string> = {};
  (zones || []).forEach((z) => { zoneNameMap[z.id] = z.name; });

  // Sort zones by footfall for destination ranking
  const sortedZones = Object.entries(footfallByZone)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => zoneNameMap[id] || id);

  // Simulate entrance distribution (based on typical mall patterns)
  // Main entrance gets ~45%, parking ~35%, side entrances ~20%
  const mainCount = Math.round(totalInMall * 0.45);
  const parkingCount = Math.round(totalInMall * 0.35);
  const sideCount = Math.round(totalInMall * 0.20);

  const entrances: EntranceFlow[] = [
    {
      entrance_name: "Main Entrance",
      count: mainCount,
      primary_destinations: sortedZones.slice(0, 3),
    },
    {
      entrance_name: "Parking Entrance",
      count: parkingCount,
      primary_destinations: [
        sortedZones.find((z) => z.toLowerCase().includes("spinneys") || z.toLowerCase().includes("hypermarket")) || sortedZones[0],
        ...sortedZones.slice(0, 2),
      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
    },
    {
      entrance_name: "Side Entrance (East)",
      count: Math.round(sideCount * 0.6),
      primary_destinations: sortedZones.slice(1, 4),
    },
    {
      entrance_name: "Side Entrance (West)",
      count: Math.round(sideCount * 0.4),
      primary_destinations: sortedZones.slice(2, 5),
    },
  ];

  // Busiest corridor is between the two busiest zones
  const busiestCorridor =
    sortedZones.length >= 2
      ? `${sortedZones[0]} - ${sortedZones[1]} corridor`
      : "Main corridor";

  // Average time spent (simulated: 45-90 min typical for mall)
  const avgTime = 45 + Math.round(Math.random() * 30);

  return {
    entrances,
    busiest_corridor: busiestCorridor,
    avg_time_spent_minutes: avgTime,
    total_in_mall: totalInMall,
  };
}

// ── getLiveFeed ──────────────────────────────────────────────

export async function getLiveFeed(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<LiveFeedEvent[]> {
  const events: LiveFeedEvent[] = [];
  const now = new Date();
  const today = todayStr();

  // Get zone names
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name")
    .eq("property_id", propertyId);

  const zoneNameMap: Record<string, string> = {};
  (zones || []).forEach((z) => { zoneNameMap[z.id] = z.name; });

  // 1. Recent footfall readings (simulate "live" entries from daily data)
  const { data: footfallData } = await supabase
    .from("footfall_daily")
    .select("zone_id, total_in, date")
    .eq("property_id", propertyId)
    .eq("date", today)
    .not("zone_id", "is", null)
    .order("total_in", { ascending: false })
    .limit(5);

  (footfallData || []).forEach((r: any, i: number) => {
    const time = new Date(now.getTime() - i * 180000); // stagger by 3 min
    const zoneName = zoneNameMap[r.zone_id] || "Unknown Zone";
    const visitors = Math.round((r.total_in || 0) * getHourFactor(now.getHours()) * 0.1);
    if (visitors > 0) {
      events.push({
        id: `footfall-${i}`,
        timestamp: time.toISOString(),
        zone: zoneName,
        type: "footfall",
        description: `${visitors} visitors entered ${zoneName}`,
      });
    }
  });

  // 2. Recent maintenance tickets
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select("id, zone_id, title, created_at, priority")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(4);

  (tickets || []).forEach((t: any) => {
    const zoneName = zoneNameMap[t.zone_id] || "General";
    events.push({
      id: `maint-${t.id}`,
      timestamp: t.created_at,
      zone: zoneName,
      type: "maintenance",
      description: `Maintenance ticket: ${t.title}${t.priority === "urgent" || t.priority === "emergency" ? " [URGENT]" : ""}`,
    });
  });

  // 3. Recent discrepancies
  const { data: discrepancyData } = await supabase
    .from("discrepancies")
    .select("id, unit_id, variance_egp, flagged_at, tenants!inner(brand_name)")
    .eq("status", "flagged")
    .order("flagged_at", { ascending: false })
    .limit(4);

  (discrepancyData || []).forEach((d: any) => {
    const brandName = d.tenants?.brand_name || "Unknown";
    events.push({
      id: `disc-${d.id}`,
      timestamp: d.flagged_at || now.toISOString(),
      zone: "Revenue",
      type: "revenue",
      description: `Discrepancy flagged: ${brandName} (EGP ${Math.round(d.variance_egp || 0).toLocaleString()} variance)`,
    });
  });

  // 4. Energy spikes (simulate from today's data)
  const { data: energyData } = await supabase
    .from("energy_readings")
    .select("zone_id, consumption_kwh, timestamp")
    .in("zone_id", Object.keys(zoneNameMap))
    .gte("timestamp", today + "T00:00:00")
    .order("consumption_kwh", { ascending: false })
    .limit(3);

  (energyData || []).forEach((e: any) => {
    const zoneName = zoneNameMap[e.zone_id] || "Unknown";
    events.push({
      id: `energy-${e.zone_id}-${e.timestamp}`,
      timestamp: e.timestamp,
      zone: zoneName,
      type: "energy",
      description: `Energy spike: ${zoneName} (${Math.round(Number(e.consumption_kwh))} kWh)`,
    });
  });

  // 5. Marketing events
  const { data: marketingEvents } = await supabase
    .from("events")
    .select("id, title, start_date, status")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .limit(3);

  (marketingEvents || []).forEach((e: any) => {
    events.push({
      id: `marketing-${e.id}`,
      timestamp: e.start_date || now.toISOString(),
      zone: "Mall-wide",
      type: "marketing",
      description: `Active event: ${e.title}`,
    });
  });

  // Sort by timestamp descending and return latest 20
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, 20);
}

// ── Helper: Hour-based visitor factor ───────────────────────
// Estimates what fraction of daily visitors are "currently" in the mall.
// Mall opens 10AM, closes 11PM. Peak around 6-9PM.

function getHourFactor(hour: number): number {
  const factors: Record<number, number> = {
    0: 0.01, 1: 0.01, 2: 0.01, 3: 0.01, 4: 0.01, 5: 0.01,
    6: 0.01, 7: 0.01, 8: 0.01, 9: 0.02,
    10: 0.04, 11: 0.06, 12: 0.08, 13: 0.09,
    14: 0.08, 15: 0.07, 16: 0.08, 17: 0.10,
    18: 0.12, 19: 0.13, 20: 0.11, 21: 0.08,
    22: 0.05, 23: 0.02,
  };
  return factors[hour] ?? 0.05;
}

// ── Helper: Zone AI Insight generator ───────────────────────

function generateZoneInsight(
  zoneName: string,
  zoneType: string,
  visitors: number,
  heatIntensity: number,
  tenants: ZoneTenant[],
  energyKwh: number,
  discrepancyCount: number
): string {
  const insights: string[] = [];

  if (heatIntensity > 80) {
    insights.push(
      `${zoneName} is experiencing very high traffic. Consider deploying additional staff or activating crowd management measures.`
    );
  } else if (heatIntensity > 60) {
    insights.push(
      `${zoneName} is busy with healthy traffic levels. Good time for tenant engagement and promotions.`
    );
  } else if (heatIntensity < 20 && visitors > 0) {
    insights.push(
      `${zoneName} has low traffic. Consider running targeted promotions or events to drive visitors to this area.`
    );
  }

  if (discrepancyCount > 0) {
    insights.push(
      `${discrepancyCount} revenue discrepanc${discrepancyCount === 1 ? "y" : "ies"} flagged in this zone. Review tenant sales reports for accuracy.`
    );
  }

  const underperformers = tenants.filter((t) => t.performance_score < 40);
  if (underperformers.length > 0) {
    insights.push(
      `${underperformers.length} tenant${underperformers.length > 1 ? "s are" : " is"} underperforming. Consider lease review or support programs.`
    );
  }

  if (energyKwh > 0 && visitors > 0) {
    const eff = energyKwh / visitors;
    if (eff > 3) {
      insights.push(
        `Energy efficiency is below target at ${eff.toFixed(1)} kWh/visitor. Check HVAC schedules and lighting timers.`
      );
    }
  }

  if (insights.length === 0) {
    insights.push(
      `${zoneName} is operating within normal parameters. All systems are performing as expected.`
    );
  }

  return insights.join(" ");
}
