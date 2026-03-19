"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Map as MapIcon,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Zap,
  AlertTriangle,
  Wrench,
  DollarSign,
  Megaphone,
  Activity,
  Radio,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface ZoneHeatmapData {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  current_visitors: number;
  visitors_trend: "up" | "down" | "stable";
  heat_intensity: number;
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

interface LiveHeatmapResult {
  zones: ZoneHeatmapData[];
  total_visitors_now: number;
  busiest_zone: string;
  timestamp: string;
}

interface ZoneTenant {
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

interface ZoneDeepDive {
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

interface EntranceFlow {
  entrance_name: string;
  count: number;
  primary_destinations: string[];
}

interface VisitorFlowResult {
  entrances: EntranceFlow[];
  busiest_corridor: string;
  avg_time_spent_minutes: number;
  total_in_mall: number;
}

interface LiveFeedEvent {
  id: string;
  timestamp: string;
  zone: string;
  type: "footfall" | "revenue" | "energy" | "maintenance" | "marketing";
  description: string;
}

// ── Heat Color Helpers ──────────────────────────────────────

function getHeatColor(intensity: number): string {
  if (intensity >= 80) return "#EF4444"; // red — packed
  if (intensity >= 60) return "#F97316"; // coral — busy
  if (intensity >= 30) return "#F59E0B"; // amber — active
  return "#3B82F6"; // blue — calm
}

function getHeatColorFill(intensity: number, alpha: number = 0.35): string {
  if (intensity >= 80) return `rgba(239, 68, 68, ${alpha})`;
  if (intensity >= 60) return `rgba(249, 115, 22, ${alpha})`;
  if (intensity >= 30) return `rgba(245, 158, 11, ${alpha})`;
  return `rgba(59, 130, 246, ${alpha})`;
}

function getHeatGlow(intensity: number): string {
  if (intensity >= 80) return "0 0 20px rgba(239, 68, 68, 0.5)";
  if (intensity >= 60) return "0 0 15px rgba(249, 115, 22, 0.4)";
  if (intensity >= 30) return "0 0 10px rgba(245, 158, 11, 0.3)";
  return "0 0 8px rgba(59, 130, 246, 0.2)";
}

function getHeatLabel(intensity: number): string {
  if (intensity >= 80) return "Packed";
  if (intensity >= 60) return "Busy";
  if (intensity >= 30) return "Active";
  return "Calm";
}

// ── Feed Event Config ───────────────────────────────────────

const FEED_TYPE_CONFIG: Record<string, { color: string; badge: "info" | "success" | "warning" | "error" | "gold" }> = {
  footfall: { color: "#3B82F6", badge: "info" },
  revenue: { color: "#10B981", badge: "success" },
  energy: { color: "#F59E0B", badge: "warning" },
  maintenance: { color: "#EF4444", badge: "error" },
  marketing: { color: "#8B5CF6", badge: "gold" },
};

const FEED_ICONS: Record<string, typeof Users> = {
  footfall: Users,
  revenue: DollarSign,
  energy: Zap,
  maintenance: Wrench,
  marketing: Megaphone,
};

// ── Zone SVG Layout (U-Shape) ───────────────────────────────
// U-shaped mall wrapping around Spinneys in the centre.
// Left wing (top-left), Right wing (top-right), Bottom strip connecting.

interface ZoneSVGLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  matchType?: string;
  matchName?: string;
}

const ZONE_LAYOUTS: ZoneSVGLayout[] = [
  // Food Court & Left Wing — top-left block
  { x: 30,  y: 30,  width: 200, height: 180, label: "Food Court\n& Left Wing",  matchName: "food court", matchType: "food" },
  // Fashion Core — bottom-left
  { x: 30,  y: 225, width: 200, height: 160, label: "Fashion\nCore",            matchName: "fashion core" },
  // Spinneys Anchor — large centre block
  { x: 250, y: 60,  width: 220, height: 290, label: "SPINNEYS\nHYPERMARKET",    matchName: "spinneys" },
  // Kids Park — top-right
  { x: 490, y: 30,  width: 160, height: 120, label: "Kids\nPark",              matchName: "kids", matchType: "entertainment" },
  // Right Wing — right side
  { x: 490, y: 165, width: 160, height: 120, label: "Right\nWing",             matchName: "right wing" },
  // Services & Electronics — right lower
  { x: 490, y: 300, width: 160, height: 100, label: "Services &\nElectronics", matchName: "services", matchType: "service" },
  // Bottom Strip — connecting corridor
  { x: 100, y: 415, width: 480, height: 70,  label: "Bottom Strip (Adidas, Puma, MINISO, Levi's...)", matchName: "common", matchType: "common" },
  // Parking Area
  { x: 100, y: 510, width: 480, height: 55,  label: "PARKING AREA",            matchType: "parking" },
];

// ── Data Sources ────────────────────────────────────────────

const DATA_SOURCES = [
  { name: "Revenue Verification", connected: true },
  { name: "Footfall Cameras", connected: true, note: "simulated" },
  { name: "Energy Meters", connected: true },
  { name: "Maintenance System", connected: true },
  { name: "Marketing Engine", connected: true },
  { name: "Learning Engine", connected: true },
];

// ── Main Component ──────────────────────────────────────────

export default function HeatmapPage() {
  const [heatmapData, setHeatmapData] = useState<LiveHeatmapResult | null>(null);
  const [flowData, setFlowData] = useState<VisitorFlowResult | null>(null);
  const [feedEvents, setFeedEvents] = useState<LiveFeedEvent[]>([]);
  const [deepDive, setDeepDive] = useState<ZoneDeepDive | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [showDataSources, setShowDataSources] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const feedRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch live data
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [heatRes, flowRes, feedRes] = await Promise.all([
        fetch("/api/v1/heatmap?type=live"),
        fetch("/api/v1/heatmap?type=flow"),
        fetch("/api/v1/heatmap?type=feed"),
      ]);
      const [heatJson, flowJson, feedJson] = await Promise.all([
        heatRes.json(),
        flowRes.json(),
        feedRes.json(),
      ]);
      setHeatmapData(heatJson);
      setFlowData(flowJson);
      setFeedEvents(feedJson);
    } catch (err) {
      console.error("Failed to fetch heatmap data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + auto-refresh every 15 seconds
  useEffect(() => {
    fetchData();
    refreshTimerRef.current = setInterval(() => fetchData(true), 15000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchData]);

  // Clock ticker
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [feedEvents]);

  // Zone click handler
  const handleZoneClick = async (zoneId: string) => {
    setDeepDiveLoading(true);
    try {
      const res = await fetch(`/api/v1/heatmap?type=zone_deep_dive&zone_id=${zoneId}`);
      const data = await res.json();
      setDeepDive(data);
    } catch (err) {
      console.error("Failed to fetch zone deep dive:", err);
    } finally {
      setDeepDiveLoading(false);
    }
  };

  // Close deep dive
  const closeDeepDive = () => setDeepDive(null);

  // Trend icon
  const TrendIcon = ({ trend }: { trend: "up" | "down" | "stable" }) => {
    if (trend === "up") return <TrendingUp size={14} className="text-emerald-400" />;
    if (trend === "down") return <TrendingDown size={14} className="text-red-400" />;
    return <Minus size={14} className="text-text-muted" />;
  };

  // ── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="animate-spin text-wedja-accent mx-auto" />
          <p className="text-text-secondary text-sm">Initializing Live Mall View...</p>
        </div>
      </div>
    );
  }

  const zones = heatmapData?.zones || [];
  // Create a stable mapping: assign each zone to a layout position.
  const usedLayouts = new Set<number>();
  const zoneLayoutMap: Map<string, ZoneSVGLayout> = new Map();

  zones.forEach((zone) => {
    let bestIdx = -1;
    // Name match priority
    for (let i = 0; i < ZONE_LAYOUTS.length; i++) {
      if (usedLayouts.has(i)) continue;
      if (ZONE_LAYOUTS[i].matchName && zone.zone_name.toLowerCase().includes(ZONE_LAYOUTS[i].matchName!)) {
        bestIdx = i;
        break;
      }
    }
    // Type match fallback
    if (bestIdx === -1) {
      for (let i = 0; i < ZONE_LAYOUTS.length; i++) {
        if (usedLayouts.has(i)) continue;
        if (ZONE_LAYOUTS[i].matchType === zone.zone_type) {
          bestIdx = i;
          break;
        }
      }
    }
    // Any available
    if (bestIdx === -1) {
      for (let i = 0; i < ZONE_LAYOUTS.length; i++) {
        if (!usedLayouts.has(i)) { bestIdx = i; break; }
      }
    }
    if (bestIdx >= 0) {
      usedLayouts.add(bestIdx);
      zoneLayoutMap.set(zone.zone_id, ZONE_LAYOUTS[bestIdx]);
    }
  });

  // Quick stats
  const totalVisitors = heatmapData?.total_visitors_now || 0;
  const busiestZone = heatmapData?.busiest_zone || "N/A";
  const totalEnergyCost = zones.reduce((s, z) => s + z.energy_consumption_kwh, 0);
  const openAlerts = zones.reduce((s, z) => s + z.open_maintenance_count + z.discrepancies_count, 0);
  const activeEvents = feedEvents.filter((e) => e.type === "marketing").length;

  return (
    <div className="space-y-4 relative">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MapIcon size={24} className="text-wedja-accent" />
          <h1 className="text-xl font-bold text-text-primary font-display">
            Live Mall View
          </h1>
          <span className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            LIVE
          </span>
          {refreshing && (
            <RefreshCw size={14} className="animate-spin text-text-muted" />
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-text-secondary">
          <span className="font-mono">
            {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <Badge variant="gold">
            {formatNumber(totalVisitors)} visitors now
          </Badge>
        </div>
      </div>

      {/* ── Quick Stats Bar ───────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <QuickStat
          label="Total Visitors Now"
          value={formatNumber(totalVisitors)}
          icon={<Users size={16} />}
          color="text-blue-400"
        />
        <QuickStat
          label="Busiest Zone"
          value={busiestZone}
          icon={<Activity size={16} />}
          color="text-red-400"
        />
        <QuickStat
          label="Energy Today"
          value={`${formatNumber(totalEnergyCost)} kWh`}
          icon={<Zap size={16} />}
          color="text-amber-400"
        />
        <QuickStat
          label="Open Alerts"
          value={String(openAlerts)}
          icon={<AlertTriangle size={16} />}
          color={openAlerts > 0 ? "text-red-400" : "text-emerald-400"}
        />
        <QuickStat
          label="Active Events"
          value={String(activeEvents)}
          icon={<Megaphone size={16} />}
          color="text-purple-400"
        />
      </div>

      {/* ── Main Content: Map + Deep Dive ─────────────── */}
      <div className="relative flex gap-0">
        {/* SVG Floor Plan */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              <Eye size={16} className="text-wedja-accent" />
              <span className="text-sm font-semibold text-text-primary">Senzo Mall Floor Plan</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#3B82F6" }} /> Calm</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#F59E0B" }} /> Active</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#F97316" }} /> Busy</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "#EF4444" }} /> Packed</span>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-4">
            <div className="relative w-full overflow-auto" style={{ minHeight: 420 }}>
              <svg
                viewBox="0 0 680 600"
                className="w-full h-auto"
                style={{ maxHeight: "68vh" }}
                role="img"
                aria-label="Senzo Mall interactive U-shaped floor plan heatmap"
              >
                {/* Dark background */}
                <rect x="0" y="0" width="680" height="600" rx="14" fill="#0A0A0F" />

                {/* U-Shape mall outline */}
                <path
                  d="M20 20 L240 20 L240 400 L460 400 L460 20 L660 20 L660 415 L580 415 L580 490 L100 490 L100 415 L20 415 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1.5"
                  strokeDasharray="8 4"
                />

                {/* Spinneys centre fill — dark block */}
                <rect
                  x="250"
                  y="60"
                  width="220"
                  height="290"
                  rx="10"
                  fill="rgba(15, 18, 28, 0.95)"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <text x="360" y="190" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="14" fontWeight="700" letterSpacing="2">SPINNEYS</text>
                <text x="360" y="210" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="10" fontWeight="500" letterSpacing="1">HYPERMARKET</text>
                <text x="360" y="235" textAnchor="middle" fill="rgba(255,255,255,0.10)" fontSize="9">(Anchor Tenant)</text>

                {/* Zone rectangles */}
                {zones.map((zone) => {
                  const layout = zoneLayoutMap.get(zone.zone_id);
                  if (!layout) return null;
                  // Skip rendering Spinneys as a zone rect — it's drawn as the centre block
                  if (layout.matchName === "spinneys") {
                    // Render clickable overlay on the centre block
                    return (
                      <g
                        key={zone.zone_id}
                        className="cursor-pointer"
                        onClick={() => handleZoneClick(zone.zone_id)}
                        onMouseEnter={() => setHoveredZone(zone.zone_id)}
                        onMouseLeave={() => setHoveredZone(null)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${zone.zone_name}: ${zone.current_visitors} visitors, heat intensity ${zone.heat_intensity}%`}
                        onKeyDown={(e) => { if (e.key === "Enter") handleZoneClick(zone.zone_id); }}
                      >
                        <rect
                          x={250} y={60} width={220} height={290}
                          rx="10"
                          fill={hoveredZone === zone.zone_id ? "rgba(245, 158, 11, 0.08)" : "transparent"}
                          stroke={hoveredZone === zone.zone_id ? "rgba(245, 158, 11, 0.3)" : "transparent"}
                          strokeWidth="2"
                          style={{ transition: "all 0.3s ease" }}
                        />
                        <text x="360" y="270" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="monospace" style={{ pointerEvents: "none" }}>
                          {formatNumber(zone.current_visitors)} visitors
                        </text>
                        {/* Hover tooltip */}
                        {hoveredZone === zone.zone_id && (
                          <g style={{ pointerEvents: "none" }}>
                            <rect x="255" y="300" width="210" height="42" rx="6" fill="rgba(17,24,39,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                            <text x="265" y="316" fill="#9CA3AF" fontSize="9">Revenue: {formatCurrency(zone.total_revenue_this_month_egp)}</text>
                            <text x="265" y="332" fill="#9CA3AF" fontSize="9">Tenants: {zone.active_tenants_count} | Energy: {formatNumber(zone.energy_consumption_kwh)} kWh</text>
                          </g>
                        )}
                      </g>
                    );
                  }

                  const isHovered = hoveredZone === zone.zone_id;
                  const isHighTraffic = zone.heat_intensity >= 70;

                  return (
                    <g
                      key={zone.zone_id}
                      className="cursor-pointer transition-all duration-300"
                      onClick={() => handleZoneClick(zone.zone_id)}
                      onMouseEnter={() => setHoveredZone(zone.zone_id)}
                      onMouseLeave={() => setHoveredZone(null)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${zone.zone_name}: ${zone.current_visitors} visitors, heat intensity ${zone.heat_intensity}%`}
                      onKeyDown={(e) => { if (e.key === "Enter") handleZoneClick(zone.zone_id); }}
                    >
                      {/* Glow effect for high-traffic zones */}
                      {isHighTraffic && (
                        <rect
                          x={layout.x - 3}
                          y={layout.y - 3}
                          width={layout.width + 6}
                          height={layout.height + 6}
                          rx="12"
                          fill="none"
                          stroke={getHeatColor(zone.heat_intensity)}
                          strokeWidth="2"
                          opacity={0.4}
                          className="animate-pulse"
                        />
                      )}

                      {/* Zone fill */}
                      <rect
                        x={layout.x}
                        y={layout.y}
                        width={layout.width}
                        height={layout.height}
                        rx="10"
                        fill={getHeatColorFill(zone.heat_intensity, isHovered ? 0.55 : 0.30)}
                        stroke={getHeatColor(zone.heat_intensity)}
                        strokeWidth={isHovered ? 2.5 : 1.2}
                        style={{
                          filter: isHovered ? getHeatGlow(zone.heat_intensity) : "none",
                          transition: "all 0.3s ease",
                        }}
                      />

                      {/* Zone name */}
                      <text
                        x={layout.x + layout.width / 2}
                        y={layout.y + layout.height / 2 - (layout.height > 100 ? 16 : 10)}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.9)"
                        fontSize={layout.width > 300 ? 12 : layout.width > 160 ? 12 : 10}
                        fontWeight="600"
                        style={{ pointerEvents: "none" }}
                      >
                        {zone.zone_name.length > 22
                          ? zone.zone_name.substring(0, 20) + "..."
                          : zone.zone_name}
                      </text>

                      {/* Visitor count */}
                      <text
                        x={layout.x + layout.width / 2}
                        y={layout.y + layout.height / 2 + (layout.height > 100 ? 4 : 4)}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.65)"
                        fontSize="10"
                        fontFamily="monospace"
                        style={{ pointerEvents: "none" }}
                      >
                        {formatNumber(zone.current_visitors)} visitors
                      </text>

                      {/* Heat badge — only for zones tall enough */}
                      {layout.height >= 80 && (
                        <>
                          <rect
                            x={layout.x + layout.width / 2 - 22}
                            y={layout.y + layout.height / 2 + (layout.height > 100 ? 14 : 12)}
                            width="44"
                            height="18"
                            rx="9"
                            fill={getHeatColor(zone.heat_intensity)}
                            opacity="0.20"
                            style={{ pointerEvents: "none" }}
                          />
                          <text
                            x={layout.x + layout.width / 2}
                            y={layout.y + layout.height / 2 + (layout.height > 100 ? 27 : 25)}
                            textAnchor="middle"
                            fill={getHeatColor(zone.heat_intensity)}
                            fontSize="9"
                            fontWeight="700"
                            style={{ pointerEvents: "none" }}
                          >
                            {getHeatLabel(zone.heat_intensity)}
                          </text>
                        </>
                      )}

                      {/* Hover tooltip */}
                      {isHovered && (
                        <g style={{ pointerEvents: "none" }}>
                          <rect
                            x={Math.min(layout.x + layout.width + 8, 490)}
                            y={Math.max(layout.y, 20)}
                            width="175"
                            height="92"
                            rx="8"
                            fill="rgba(10,10,15,0.96)"
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth="1"
                          />
                          <text x={Math.min(layout.x + layout.width + 18, 500)} y={Math.max(layout.y, 20) + 18} fill="#F9FAFB" fontSize="11" fontWeight="600">
                            {zone.zone_name}
                          </text>
                          <text x={Math.min(layout.x + layout.width + 18, 500)} y={Math.max(layout.y, 20) + 35} fill="#9CA3AF" fontSize="10">
                            Visitors: {formatNumber(zone.current_visitors)}
                          </text>
                          <text x={Math.min(layout.x + layout.width + 18, 500)} y={Math.max(layout.y, 20) + 50} fill="#9CA3AF" fontSize="10">
                            Revenue: {formatCurrency(zone.total_revenue_this_month_egp)}
                          </text>
                          <text x={Math.min(layout.x + layout.width + 18, 500)} y={Math.max(layout.y, 20) + 65} fill="#9CA3AF" fontSize="10">
                            Energy: {formatNumber(zone.energy_consumption_kwh)} kWh
                          </text>
                          <text x={Math.min(layout.x + layout.width + 18, 500)} y={Math.max(layout.y, 20) + 80} fill="#9CA3AF" fontSize="10">
                            Tenants: {zone.active_tenants_count} | Alerts: {zone.open_maintenance_count + zone.discrepancies_count}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* ── Gate Indicators ──────────────────────── */}
                {flowData && (
                  <>
                    {/* Gate 1 — Top-left */}
                    <g>
                      <polygon points="130,12 138,0 122,0" fill="#10B981" opacity="0.85" />
                      <text x="130" y="-6" textAnchor="middle" fill="#10B981" fontSize="8" fontWeight="600" opacity="0">Gate 1</text>
                      <rect x="108" y="2" width="44" height="14" rx="3" fill="rgba(16,185,129,0.12)" />
                      <text x="130" y="12" textAnchor="middle" fill="#10B981" fontSize="8" fontWeight="600">Gate 1</text>
                    </g>

                    {/* Gate 2 — Bottom-left */}
                    <g>
                      <polygon points="70,415 78,430 62,430" fill="#10B981" opacity="0.85" />
                      <rect x="48" y="432" width="44" height="14" rx="3" fill="rgba(16,185,129,0.12)" />
                      <text x="70" y="442" textAnchor="middle" fill="#10B981" fontSize="8" fontWeight="600">Gate 2</text>
                    </g>

                    {/* Gate 3 — Bottom-right */}
                    <g>
                      <polygon points="610,415 618,430 602,430" fill="#10B981" opacity="0.85" />
                      <rect x="588" y="432" width="44" height="14" rx="3" fill="rgba(16,185,129,0.12)" />
                      <text x="610" y="442" textAnchor="middle" fill="#10B981" fontSize="8" fontWeight="600">Gate 3</text>
                    </g>

                    {/* Gate 4 — Top-right */}
                    <g>
                      <polygon points="570,12 578,0 562,0" fill="#10B981" opacity="0.85" />
                      <rect x="548" y="2" width="44" height="14" rx="3" fill="rgba(16,185,129,0.12)" />
                      <text x="570" y="12" textAnchor="middle" fill="#10B981" fontSize="8" fontWeight="600">Gate 4</text>
                    </g>

                    {/* Visitor flow counts near gates */}
                    <text x="130" y="22" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">
                      {formatNumber(flowData.entrances[0]?.count || 0)}
                    </text>
                    <text x="70" y="456" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">
                      {formatNumber(flowData.entrances[1]?.count || 0)}
                    </text>
                    <text x="610" y="456" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">
                      {formatNumber(flowData.entrances[2]?.count || 0)}
                    </text>
                    <text x="570" y="22" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">
                      {formatNumber(flowData.entrances[3]?.count || 0)}
                    </text>

                    {/* Flow info */}
                    <text x="340" y="575" textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize="9">
                      Busiest: {flowData.busiest_corridor} | Avg visit: {flowData.avg_time_spent_minutes} min
                    </text>
                  </>
                )}

                {/* Click hint */}
                <text x="340" y="592" textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="9">
                  Click any zone to deep dive
                </text>
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* ── Zone Deep-Dive Panel (slides in from right) ── */}
        {(deepDive || deepDiveLoading) && (
          <>
            {/* Backdrop for mobile */}
            <div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={closeDeepDive}
            />
            <div
              className={
                "fixed right-0 top-0 h-full w-full sm:w-[420px] z-50 bg-wedja-card border-l border-wedja-border overflow-y-auto " +
                "transform transition-transform duration-300 ease-out " +
                "lg:relative lg:w-[400px] lg:min-w-[400px] lg:ml-4 lg:rounded-xl lg:h-auto lg:max-h-[calc(100vh-200px)] lg:border lg:z-auto"
              }
            >
              {deepDiveLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 size={28} className="animate-spin text-wedja-accent" />
                </div>
              ) : deepDive ? (
                <div className="space-y-0">
                  {/* Header */}
                  <div className="sticky top-0 z-10 bg-wedja-card px-5 py-4 border-b border-wedja-border flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-text-primary">{deepDive.zone_name}</h2>
                      <span className="text-xs text-text-muted capitalize">{deepDive.zone_type} zone | {deepDive.area_sqm.toLocaleString()} sqm</span>
                    </div>
                    <button
                      onClick={closeDeepDive}
                      className="p-1.5 rounded-lg hover:bg-wedja-border/50 text-text-secondary"
                      aria-label="Close deep dive"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Visitors + Heat */}
                  <div className="px-5 py-4 border-b border-wedja-border">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-2xl font-bold text-text-primary font-mono">
                          {formatNumber(deepDive.current_visitors)}
                        </p>
                        <p className="text-xs text-text-muted flex items-center gap-1">
                          visitors now <TrendIcon trend={deepDive.visitors_trend} />
                        </p>
                      </div>
                      <div className="text-right">
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{
                            background: getHeatColorFill(deepDive.heat_intensity, 0.2),
                            color: getHeatColor(deepDive.heat_intensity),
                            boxShadow: getHeatGlow(deepDive.heat_intensity),
                          }}
                        >
                          {deepDive.heat_intensity}%
                        </div>
                        <p className="text-xs text-text-muted mt-1">{getHeatLabel(deepDive.heat_intensity)}</p>
                      </div>
                    </div>
                    {/* Heat bar */}
                    <div className="h-2 bg-wedja-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${deepDive.heat_intensity}%`,
                          background: getHeatColor(deepDive.heat_intensity),
                        }}
                      />
                    </div>
                  </div>

                  {/* Tenants */}
                  <div className="px-5 py-4 border-b border-wedja-border">
                    <h3 className="text-sm font-semibold text-text-primary mb-3">
                      Tenants ({deepDive.tenants.length})
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {deepDive.tenants.map((t) => (
                        <div
                          key={t.tenant_id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-wedja-border/20 hover:bg-wedja-border/30 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-text-primary truncate">{t.brand_name}</p>
                            <p className="text-xs text-text-muted">
                              {t.area_sqm} sqm | {formatNumber(t.visitors_today)} visitors
                            </p>
                          </div>
                          <div className="flex items-center gap-3 ml-3">
                            <div className="text-right">
                              <p className="text-xs text-text-muted">
                                {t.reported_sales_egp != null
                                  ? formatCurrency(t.reported_sales_egp) + "/mo"
                                  : "No sales data"}
                              </p>
                              <p className="text-xs text-text-muted">{formatCurrency(t.rent_per_sqm)}/sqm</p>
                            </div>
                            {/* Performance bar */}
                            <div className="w-10">
                              <div className="h-1.5 bg-wedja-border rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${t.performance_score}%`,
                                    background:
                                      t.performance_score >= 70 ? "#10B981" :
                                      t.performance_score >= 40 ? "#F59E0B" : "#EF4444",
                                  }}
                                />
                              </div>
                              <p className="text-[9px] text-text-muted text-center mt-0.5">{t.performance_score}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {deepDive.tenants.length === 0 && (
                        <p className="text-xs text-text-muted py-2">No active tenants in this zone.</p>
                      )}
                    </div>
                  </div>

                  {/* Energy / Discrepancies / Maintenance / Promotions */}
                  <div className="px-5 py-4 border-b border-wedja-border grid grid-cols-2 gap-3">
                    <MiniStat
                      icon={<Zap size={14} className="text-amber-400" />}
                      label="Energy"
                      value={`${formatNumber(deepDive.energy.consumption_kwh)} kWh`}
                      sub={`${formatCurrency(deepDive.energy.cost_egp)} | Score: ${deepDive.energy.efficiency_score}`}
                    />
                    <MiniStat
                      icon={<AlertTriangle size={14} className="text-red-400" />}
                      label="Discrepancies"
                      value={`${deepDive.discrepancies.count} flagged`}
                      sub={deepDive.discrepancies.total_variance_egp > 0
                        ? `${formatCurrency(deepDive.discrepancies.total_variance_egp)} variance`
                        : "No variance"
                      }
                    />
                    <MiniStat
                      icon={<Wrench size={14} className="text-blue-400" />}
                      label="Maintenance"
                      value={`${deepDive.maintenance.open_tickets} tickets`}
                      sub={deepDive.maintenance.urgent_count > 0
                        ? `${deepDive.maintenance.urgent_count} urgent`
                        : "No urgent issues"
                      }
                    />
                    <MiniStat
                      icon={<Megaphone size={14} className="text-purple-400" />}
                      label="Promotions"
                      value={`${deepDive.active_promotions} active`}
                      sub="Events & campaigns"
                    />
                  </div>

                  {/* AI Insight */}
                  <div className="px-5 py-4">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-wedja-accent-muted/30 border border-wedja-accent/20">
                      <Eye size={14} className="text-wedja-accent mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-wedja-accent mb-1">AI Insight</p>
                        <p className="text-xs text-text-secondary leading-relaxed">{deepDive.ai_insight}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* ── Live Activity Feed ────────────────────────── */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-emerald-400" />
            <span className="text-sm font-semibold text-text-primary">Live Activity Feed</span>
          </div>
          <span className="text-xs text-text-muted">{feedEvents.length} recent events</span>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={feedRef}
            className="max-h-64 overflow-y-auto divide-y divide-wedja-border/50"
          >
            {feedEvents.map((event) => {
              const config = FEED_TYPE_CONFIG[event.type] || FEED_TYPE_CONFIG.footfall;
              const Icon = FEED_ICONS[event.type] || Activity;
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-wedja-border/10 transition-colors"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: config.color + "20", color: config.color }}
                  >
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{event.description}</p>
                    <p className="text-xs text-text-muted">
                      {new Date(event.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge variant={config.badge}>{event.zone}</Badge>
                </div>
              );
            })}
            {feedEvents.length === 0 && (
              <div className="px-5 py-8 text-center text-text-muted text-sm">
                No recent activity
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Data Connections Panel ────────────────────── */}
      <Card>
        <button
          onClick={() => setShowDataSources(!showDataSources)}
          className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-wedja-border/10 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-wedja-accent" />
            <span className="text-sm font-semibold text-text-primary">Data Connections</span>
            <Badge variant="success">{DATA_SOURCES.filter((d) => d.connected).length}/{DATA_SOURCES.length} connected</Badge>
          </div>
          {showDataSources ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>
        {showDataSources && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DATA_SOURCES.map((source) => (
                <div
                  key={source.name}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-wedja-border/15"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      source.connected ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{source.name}</p>
                    {source.note && (
                      <p className="text-[10px] text-text-muted">{source.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-3 text-center">
              All systems feeding into heatmap
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function QuickStat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-text-primary font-mono truncate">{value}</p>
    </Card>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-wedja-border/15">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
      <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>
    </div>
  );
}
