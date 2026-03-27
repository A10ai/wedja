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

interface FootfallOverview {
  total_today?: number;
  total_visitors_today?: number;
  gates?: Array<{ name: string; count: number }>;
}

// ── Heat Color Helpers ──────────────────────────────────────

function getHeatColor(intensity: number): string {
  if (intensity >= 80) return "#EF4444";
  if (intensity >= 60) return "#F97316";
  if (intensity >= 30) return "#F59E0B";
  return "#3B82F6";
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

// ── Gate positions on the floor plan (percentage-based) ─────

interface GatePosition {
  id: string;
  label: string;
  x: number; // percentage from left
  y: number; // percentage from top
}

const GATE_POSITIONS: GatePosition[] = [
  { id: "G1", label: "Gate 1", x: 2, y: 45 },    // Far left, between Jacobs & Bianco
  { id: "G2", label: "Gate 2", x: 15, y: 75 },   // Bottom left, below Chilis
  { id: "G3", label: "Gate 3", x: 55, y: 85 },   // Bottom right, near Hard Rock / Ma Cherie
  { id: "G4", label: "Gate 4", x: 68, y: 55 },   // Right side, at Kidzo
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

// ── Pulsing gate marker keyframes (injected via style tag) ──

const pulseKeyframes = `
@keyframes gate-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
}
`;

// ── Main Component ──────────────────────────────────────────

export default function HeatmapPage() {
  const [heatmapData, setHeatmapData] = useState<LiveHeatmapResult | null>(null);
  const [flowData, setFlowData] = useState<VisitorFlowResult | null>(null);
  const [feedEvents, setFeedEvents] = useState<LiveFeedEvent[]>([]);
  const [footfallOverview, setFootfallOverview] = useState<FootfallOverview | null>(null);
  const [deepDive, setDeepDive] = useState<ZoneDeepDive | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const feedRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch live data
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [heatRes, flowRes, feedRes, footfallRes] = await Promise.all([
        fetch("/api/v1/heatmap?type=live"),
        fetch("/api/v1/heatmap?type=flow"),
        fetch("/api/v1/heatmap?type=feed"),
        fetch("/api/v1/footfall?type=overview").catch(() => null),
      ]);
      const [heatJson, flowJson, feedJson] = await Promise.all([
        heatRes.json(),
        flowRes.json(),
        feedRes.json(),
      ]);
      setHeatmapData(heatJson);
      setFlowData(flowJson);
      setFeedEvents(feedJson);

      if (footfallRes && footfallRes.ok) {
        const footfallJson = await footfallRes.json();
        setFootfallOverview(footfallJson);
      }
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

  // Get entrance count for a gate from flow data
  const getGateCount = (gateIndex: number): number | null => {
    if (!flowData?.entrances || !flowData.entrances[gateIndex]) return null;
    return flowData.entrances[gateIndex].count;
  };

  // ── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="animate-spin text-wedja-accent mx-auto" />
          <p className="text-text-secondary text-sm">Initializing Live Map...</p>
        </div>
      </div>
    );
  }

  const zones = heatmapData?.zones || [];
  const totalVisitors = footfallOverview?.total_today ?? footfallOverview?.total_visitors_today ?? heatmapData?.total_visitors_now ?? 0;

  return (
    <div className="space-y-4 relative">
      {/* Inject pulse animation */}
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />

      {/* ── Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <MapIcon size={24} className="text-indigo-500" />
            <h1 className="text-xl font-bold text-text-primary font-display">
              Live Map
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
          <p className="text-sm text-text-secondary mt-1">
            Real-time mall layout with footfall and tenant data
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-text-secondary">
          <span className="font-mono">
            {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <Badge variant="gold">
            {formatNumber(totalVisitors)} visitors today
          </Badge>
        </div>
      </div>

      {/* ── Main Content: Floor Plan + Sidebar ─────────── */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── Floor Plan Card ──────────────────────────── */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-indigo-500" />
                <span className="text-sm font-semibold text-text-primary">Senzo Mall Floor Plan</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-green-500 border-2 border-green-500/30" />
                  Gate
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: "#3B82F6" }} /> Calm
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: "#F59E0B" }} /> Active
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: "#EF4444" }} /> Packed
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-4">
            {/* Scrollable container for the floor plan */}
            <div
              className="relative w-full overflow-auto rounded-lg"
              style={{
                maxHeight: "75vh",
                background: "#0A0A0F",
              }}
            >
              <div className="relative" style={{ minWidth: 600 }}>
                {/* Floor plan image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/senzo-layout.jpg"
                  alt="Senzo Mall Floor Plan"
                  className="w-full h-auto block"
                  style={{ opacity: 0.9 }}
                  draggable={false}
                />

                {/* Gate markers overlay */}
                {GATE_POSITIONS.map((gate, idx) => {
                  const count = getGateCount(idx);
                  return (
                    <div
                      key={gate.id}
                      className="absolute flex flex-col items-center"
                      style={{
                        left: `${gate.x}%`,
                        top: `${gate.y}%`,
                        transform: "translate(-50%, -50%)",
                        zIndex: 10,
                      }}
                    >
                      {/* Pulsing circle */}
                      <div
                        className="flex items-center justify-center rounded-full text-white font-bold text-xs cursor-default"
                        style={{
                          width: 36,
                          height: 36,
                          backgroundColor: "#22C55E",
                          animation: "gate-pulse 2s ease-in-out infinite",
                          boxShadow: "0 0 0 0 rgba(34, 197, 94, 0.5)",
                          border: "2px solid rgba(255, 255, 255, 0.8)",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.5px",
                        }}
                        title={`${gate.label}${count != null ? ` — ${formatNumber(count)} entries` : ""}`}
                      >
                        {gate.label}
                      </div>
                      {/* Count badge below */}
                      {count != null && (
                        <div
                          className="mt-1 px-2 py-0.5 rounded-full text-white font-mono text-[10px] font-semibold whitespace-nowrap"
                          style={{
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            backdropFilter: "blur(4px)",
                            border: "1px solid rgba(34, 197, 94, 0.4)",
                          }}
                        >
                          {formatNumber(count)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Flow summary under map */}
            {flowData && (
              <div className="mt-3 flex items-center justify-center gap-6 text-xs text-text-muted">
                <span>Busiest corridor: <span className="text-text-secondary font-medium">{flowData.busiest_corridor}</span></span>
                <span>Avg visit: <span className="text-text-secondary font-medium">{flowData.avg_time_spent_minutes} min</span></span>
                <span>In mall: <span className="text-text-secondary font-medium">{formatNumber(flowData.total_in_mall)}</span></span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Stats Sidebar ────────────────────────────── */}
        <div className="w-full lg:w-80 lg:min-w-[320px] space-y-4">

          {/* Total Visitors Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                  <Users size={20} className="text-indigo-500" />
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Total Visitors Today</p>
                  <p className="text-2xl font-bold text-text-primary font-mono">{formatNumber(totalVisitors)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gate-by-Gate Breakdown */}
          <Card>
            <CardHeader className="py-3">
              <span className="text-sm font-semibold text-text-primary">Gate Breakdown</span>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2">
                {GATE_POSITIONS.map((gate, idx) => {
                  const count = getGateCount(idx);
                  return (
                    <div key={gate.id} className="flex items-center justify-between p-2 rounded-lg bg-wedja-border/15">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: "#22C55E" }}
                        >
                          {gate.id.replace("G", "")}
                        </div>
                        <span className="text-sm text-text-primary">{gate.label}</span>
                      </div>
                      <span className="text-sm font-mono font-semibold text-text-primary">
                        {count != null ? formatNumber(count) : "--"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Zone Heat Indicators */}
          {zones.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <span className="text-sm font-semibold text-text-primary">Zone Activity</span>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {zones.map((zone) => (
                    <button
                      key={zone.zone_id}
                      onClick={() => handleZoneClick(zone.zone_id)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-wedja-border/15 hover:bg-wedja-border/30 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">{zone.zone_name}</p>
                        <p className="text-xs text-text-muted">
                          {formatNumber(zone.current_visitors)} visitors
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getHeatColor(zone.heat_intensity) }}
                        />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: getHeatColor(zone.heat_intensity) }}
                        >
                          {getHeatLabel(zone.heat_intensity)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <QuickStat
              label="Busiest Zone"
              value={heatmapData?.busiest_zone || "N/A"}
              icon={<Activity size={16} />}
              color="text-red-400"
            />
            <QuickStat
              label="Energy Today"
              value={`${formatNumber(zones.reduce((s, z) => s + z.energy_consumption_kwh, 0))} kWh`}
              icon={<Zap size={16} />}
              color="text-amber-400"
            />
            <QuickStat
              label="Open Alerts"
              value={String(zones.reduce((s, z) => s + z.open_maintenance_count + z.discrepancies_count, 0))}
              icon={<AlertTriangle size={16} />}
              color="text-red-400"
            />
            <QuickStat
              label="Active Events"
              value={String(feedEvents.filter((e) => e.type === "marketing").length)}
              icon={<Megaphone size={16} />}
              color="text-purple-400"
            />
          </div>
        </div>
      </div>

      {/* ── Zone Deep-Dive Panel (slides in from right) ── */}
      {(deepDive || deepDiveLoading) && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={closeDeepDive}
          />
          <div
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] z-50 bg-wedja-card border-l border-wedja-border overflow-y-auto transform transition-transform duration-300 ease-out"
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
                      <p className="text-lg font-bold text-text-primary font-mono">
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
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <Eye size={14} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-indigo-400 mb-1">AI Insight</p>
                      <p className="text-xs text-text-secondary leading-relaxed">{deepDive.ai_insight}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}

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
            <Activity size={16} className="text-indigo-500" />
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
              All systems feeding into live map
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
