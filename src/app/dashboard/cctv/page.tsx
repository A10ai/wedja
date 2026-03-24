"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Camera,
  Users,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  ParkingCircle,
  Shield,
  ShoppingBag,
  Eye,
  MapPin,
  BarChart3,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronRight,
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Gauge,
  UserCheck,
  Zap,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPercentage, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

interface CCTVOverview {
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

interface PeopleCountZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  current_count: number;
  today_total: number;
  capacity: number;
  occupancy_pct: number;
}

interface VisitorFlowPath {
  from_zone_id: string;
  from_zone_name: string;
  to_zone_id: string;
  to_zone_name: string;
  count: number;
  pct_of_total: number;
}

interface VisitorFlowData {
  paths: VisitorFlowPath[];
  entry_points: { zone_name: string; count: number; pct: number }[];
  total_movements: number;
}

interface DwellUnit {
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

interface DwellAnalysis {
  units: DwellUnit[];
  avg_dwell_all: number;
  top_dwell: DwellUnit[];
  bottom_dwell: DwellUnit[];
}

interface QueueItem {
  unit_id: string;
  unit_name: string;
  tenant_name: string;
  queue_length: number;
  estimated_wait_minutes: number;
  alert_triggered: boolean;
  timestamp: string;
}

interface QueueStatus {
  active_queues: QueueItem[];
  total_queued: number;
  alerts_count: number;
  avg_wait_minutes: number;
}

interface OccupancyZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  current_count: number;
  capacity: number;
  occupancy_pct: number;
  status: string;
}

interface OccupancyStatus {
  zones: OccupancyZone[];
  total_current: number;
  total_capacity: number;
  overall_pct: number;
  alerts: { zone_name: string; status: string; pct: number }[];
}

interface DeadZone {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  area_sqm: number;
  footfall: number;
  footfall_per_sqm: number;
  relative_traffic: number;
  recommendation: string;
}

interface DemographicData {
  group_breakdown: { type: string; count: number; pct: number }[];
  age_breakdown: { range: string; count: number; pct: number }[];
  time_patterns: { hour: number; families: number; young_adults: number; seniors: number }[];
}

interface ParkingData {
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

interface SecurityAlert {
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

interface SecurityData {
  active_alerts: SecurityAlert[];
  total_active: number;
  total_this_week: number;
  false_alarm_rate: number;
  avg_response_minutes: number;
  by_severity: { severity: string; count: number }[];
}

interface StoreConversionItem {
  unit_id: string;
  unit_name: string;
  tenant_name: string;
  passersby: number;
  entered: number;
  conversion_rate: number;
  avg_time_in_store_seconds: number;
}

interface StoreConversionData {
  stores: StoreConversionItem[];
  avg_conversion_rate: number;
  top_converters: StoreConversionItem[];
  bottom_converters: StoreConversionItem[];
}

// ── Tab Definitions ───────────────────────────────────────────

type TabKey =
  | "overview"
  | "people"
  | "flow"
  | "dwell"
  | "queues"
  | "occupancy"
  | "dead_zones"
  | "demographics"
  | "parking"
  | "security"
  | "conversion";

const TABS: { key: TabKey; label: string; icon: typeof Camera }[] = [
  { key: "overview", label: "Overview", icon: Eye },
  { key: "people", label: "People Count", icon: Users },
  { key: "flow", label: "Flow Analysis", icon: ArrowRightLeft },
  { key: "dwell", label: "Dwell Time", icon: Clock },
  { key: "queues", label: "Queues", icon: Activity },
  { key: "occupancy", label: "Occupancy", icon: Gauge },
  { key: "dead_zones", label: "Dead Zones", icon: MapPin },
  { key: "demographics", label: "Demographics", icon: UserCheck },
  { key: "parking", label: "Parking", icon: ParkingCircle },
  { key: "security", label: "Security", icon: Shield },
  { key: "conversion", label: "Conversion", icon: ShoppingBag },
];

// ── Helpers ───────────────────────────────────────────────────

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function severityColor(severity: string): "error" | "warning" | "info" | "default" {
  switch (severity) {
    case "critical": return "error";
    case "high": return "warning";
    case "medium": return "info";
    default: return "default";
  }
}

function statusColor(status: string): "error" | "warning" | "success" | "info" | "default" {
  switch (status) {
    case "active": return "error";
    case "acknowledged": return "warning";
    case "resolved": return "success";
    case "false_alarm": return "info";
    default: return "default";
  }
}

function occStatusColor(status: string): string {
  switch (status) {
    case "over_capacity": return "bg-red-500";
    case "near_capacity": return "bg-amber-500";
    case "high": return "bg-yellow-500";
    case "moderate": return "bg-blue-500";
    case "low": return "bg-emerald-500";
    default: return "bg-gray-500";
  }
}

function occStatusBadge(status: string): "error" | "warning" | "success" | "info" | "default" {
  switch (status) {
    case "over_capacity": return "error";
    case "near_capacity": return "warning";
    case "high": return "info";
    case "moderate": return "default";
    case "low": return "success";
    default: return "default";
  }
}

// ── ProgressBar Component ─────────────────────────────────────

function ProgressBar({
  value,
  max = 100,
  color = "bg-indigo-500",
  height = "h-2",
}: {
  value: number;
  max?: number;
  color?: string;
  height?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className={`w-full bg-wedja-border/50 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${color} ${height} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Simple Bar Chart ──────────────────────────────────────────

function MiniBarChart({
  data,
  maxValue,
  color = "bg-indigo-500",
  labelKey = "label",
  valueKey = "value",
}: {
  data: { label: string; value: number }[];
  maxValue?: number;
  color?: string;
  labelKey?: string;
  valueKey?: string;
}) {
  const max = maxValue || Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-text-secondary w-20 truncate">{d.label}</span>
          <div className="flex-1">
            <ProgressBar value={d.value} max={max} color={color} height="h-3" />
          </div>
          <span className="text-xs font-mono text-text-primary w-12 text-right">
            {formatNumber(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Hourly Chart ──────────────────────────────────────────────

function HourlyChart({
  data,
  valueKey = "value",
  label = "Visitors",
  color = "bg-indigo-500",
}: {
  data: { hour: number; value: number }[];
  valueKey?: string;
  label?: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-32">
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div
            key={d.hour}
            className="flex-1 flex flex-col items-center group relative"
          >
            <div className="hidden group-hover:block absolute -top-8 bg-wedja-elevated border border-wedja-border rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap z-10">
              {d.hour}:00 — {formatNumber(d.value)} {label}
            </div>
            <div
              className={`w-full ${color} rounded-t transition-all duration-300 min-h-[2px]`}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            {d.hour % 4 === 0 && (
              <span className="text-[9px] text-text-muted mt-1">{d.hour}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Flow Diagram (SVG) ───────────────────────────────────────

function FlowDiagram({ paths }: { paths: VisitorFlowPath[] }) {
  // Collect unique zones
  const zoneSet = new Set<string>();
  paths.forEach((p) => {
    zoneSet.add(p.from_zone_name);
    zoneSet.add(p.to_zone_name);
  });
  const zoneNames = Array.from(zoneSet);

  if (zoneNames.length === 0) return <p className="text-text-muted text-sm">No flow data available</p>;

  const boxW = 140;
  const boxH = 36;
  const gapY = 16;
  const svgW = 500;
  const marginLeft = 20;
  const marginRight = 20;
  const colWidth = (svgW - marginLeft - marginRight - boxW * 2) / 1;

  // Arrange zones in two columns
  const left = zoneNames.slice(0, Math.ceil(zoneNames.length / 2));
  const right = zoneNames.slice(Math.ceil(zoneNames.length / 2));

  const getPos = (name: string): { x: number; y: number } => {
    const li = left.indexOf(name);
    if (li >= 0) return { x: marginLeft, y: 20 + li * (boxH + gapY) };
    const ri = right.indexOf(name);
    return { x: svgW - marginRight - boxW, y: 20 + ri * (boxH + gapY) };
  };

  const svgH = Math.max(left.length, right.length) * (boxH + gapY) + 40;
  const maxCount = Math.max(...paths.map((p) => p.count), 1);

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full max-w-xl"
      role="img"
      aria-label="Visitor flow diagram between zones"
    >
      {/* Arrows */}
      {paths.slice(0, 12).map((p, i) => {
        const from = getPos(p.from_zone_name);
        const to = getPos(p.to_zone_name);
        const fromX = from.x + boxW;
        const fromY = from.y + boxH / 2;
        const toX = to.x;
        const toY = to.y + boxH / 2;
        const thickness = Math.max(1, (p.count / maxCount) * 6);
        const opacity = 0.3 + (p.count / maxCount) * 0.5;

        return (
          <g key={i}>
            <line
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke="#6366f1"
              strokeWidth={thickness}
              opacity={opacity}
              markerEnd="url(#arrowhead)"
            />
            <text
              x={(fromX + toX) / 2}
              y={(fromY + toY) / 2 - 6}
              textAnchor="middle"
              className="fill-text-secondary"
              fontSize="9"
            >
              {formatNumber(p.count)}
            </text>
          </g>
        );
      })}

      {/* Arrowhead marker */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#6366f1" opacity="0.7" />
        </marker>
      </defs>

      {/* Zone boxes */}
      {zoneNames.map((name) => {
        const pos = getPos(name);
        return (
          <g key={name}>
            <rect
              x={pos.x}
              y={pos.y}
              width={boxW}
              height={boxH}
              rx="6"
              className="fill-wedja-card stroke-wedja-border"
              strokeWidth="1"
            />
            <text
              x={pos.x + boxW / 2}
              y={pos.y + boxH / 2 + 4}
              textAnchor="middle"
              className="fill-text-primary"
              fontSize="11"
              fontWeight="500"
            >
              {name.length > 18 ? name.slice(0, 16) + "..." : name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Parking Gauge ─────────────────────────────────────────────

function ParkingGauge({ occupied, total, pct }: { occupied: number; total: number; pct: number }) {
  const angle = (pct / 100) * 180;
  const r = 80;
  const cx = 100;
  const cy = 90;

  const endX = cx + r * Math.cos(Math.PI - (angle * Math.PI) / 180);
  const endY = cy - r * Math.sin(Math.PI - (angle * Math.PI) / 180);
  const largeArc = angle > 180 ? 1 : 0;

  const gaugeColor = pct > 90 ? "#EF4444" : pct > 70 ? "#F59E0B" : pct > 50 ? "#3B82F6" : "#10B981";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-48 h-28" role="img" aria-label={`Parking ${pct}% full`}>
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-wedja-border"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Fill arc */}
        {pct > 0 && (
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none"
            stroke={gaugeColor}
            strokeWidth="12"
            strokeLinecap="round"
          />
        )}
        {/* Center text */}
        <text x={cx} y={cy - 10} textAnchor="middle" className="fill-text-primary" fontSize="28" fontWeight="bold">
          {Math.round(pct)}%
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-text-secondary" fontSize="11">
          {formatNumber(occupied)} / {formatNumber(total)}
        </text>
      </svg>
    </div>
  );
}

// ── Pie Chart (Recharts Donut) ────────────────────────────────

function SimplePie({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-6">
      <div className="w-28 h-28 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={50}
              strokeWidth={0}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1F2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#F9FAFB",
                fontSize: "12px",
              }}
              formatter={(value: any) => [formatNumber(value), ""]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5">
        {data.map((d, i) => {
          const pct = (d.value / total) * 100;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-text-secondary capitalize">{d.label}</span>
              <span className="font-mono text-text-primary ml-auto">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dead Zone Grid ────────────────────────────────────────────

function DeadZoneGrid({ zones }: { zones: DeadZone[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {zones.map((z) => {
        const color =
          z.relative_traffic < 20
            ? "border-red-500/40 bg-red-500/5"
            : z.relative_traffic < 40
            ? "border-amber-500/40 bg-amber-500/5"
            : z.relative_traffic < 60
            ? "border-blue-500/40 bg-blue-500/5"
            : "border-emerald-500/40 bg-emerald-500/5";

        return (
          <div
            key={z.zone_id}
            className={`border rounded-lg p-3 ${color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">{z.zone_name}</span>
              <Badge variant={z.relative_traffic < 20 ? "error" : z.relative_traffic < 40 ? "warning" : z.relative_traffic < 60 ? "info" : "success"}>
                {z.relative_traffic}%
              </Badge>
            </div>
            <div className="text-xs text-text-secondary mb-1">
              {formatNumber(z.footfall)} visitors | {z.footfall_per_sqm} per sqm
            </div>
            <ProgressBar
              value={z.relative_traffic}
              color={
                z.relative_traffic < 20
                  ? "bg-red-500"
                  : z.relative_traffic < 40
                  ? "bg-amber-500"
                  : z.relative_traffic < 60
                  ? "bg-blue-500"
                  : "bg-emerald-500"
              }
            />
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
              {z.recommendation}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function CCTVAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<CCTVOverview | null>(null);
  const [peopleCounts, setPeopleCounts] = useState<PeopleCountZone[]>([]);
  const [flowData, setFlowData] = useState<VisitorFlowData | null>(null);
  const [dwellData, setDwellData] = useState<DwellAnalysis | null>(null);
  const [queueData, setQueueData] = useState<QueueStatus | null>(null);
  const [occupancyData, setOccupancyData] = useState<OccupancyStatus | null>(null);
  const [deadZones, setDeadZones] = useState<DeadZone[]>([]);
  const [demographics, setDemographics] = useState<DemographicData | null>(null);
  const [parkingData, setParkingData] = useState<ParkingData | null>(null);
  const [securityData, setSecurityData] = useState<SecurityData | null>(null);
  const [conversionData, setConversionData] = useState<StoreConversionData | null>(null);

  // ── Recharts computed data ──────────────────────────────────

  const cameraStatusData = useMemo(() => {
    if (!overview) return [];
    const active = overview.cameras_online;
    const offline = Math.max(0, overview.cameras_total - overview.cameras_online - Math.floor(overview.cameras_total * 0.05));
    const maintenance = overview.cameras_total - active - offline;
    return [
      { name: "Active", value: active, color: "#10B981" },
      { name: "Offline", value: offline, color: "#EF4444" },
      { name: "Maintenance", value: Math.max(0, maintenance), color: "#F59E0B" },
    ].filter((d) => d.value > 0);
  }, [overview]);

  const topConversionChartData = useMemo(() => {
    if (!conversionData) return [];
    return [...conversionData.stores]
      .sort((a, b) => b.conversion_rate - a.conversion_rate)
      .slice(0, 10)
      .map((s) => ({
        name: s.tenant_name.length > 14 ? s.tenant_name.slice(0, 12) + "..." : s.tenant_name,
        rate: parseFloat(s.conversion_rate.toFixed(1)),
        fullName: s.tenant_name,
      }));
  }, [conversionData]);

  const fetchData = useCallback(async (tab: TabKey) => {
    setLoading(true);
    setError(null);
    try {
      const typeMap: Record<TabKey, string> = {
        overview: "overview",
        people: "people_count",
        flow: "flow",
        dwell: "dwell",
        queues: "queues",
        occupancy: "occupancy",
        dead_zones: "dead_zones",
        demographics: "demographics",
        parking: "parking",
        security: "security",
        conversion: "conversion",
      };

      const res = await fetch(`/api/v1/cctv?type=${typeMap[tab]}`);
      if (!res.ok) throw new Error("Failed to load data");
      const data = await res.json();

      switch (tab) {
        case "overview": setOverview(data); break;
        case "people": setPeopleCounts(data); break;
        case "flow": setFlowData(data); break;
        case "dwell": setDwellData(data); break;
        case "queues": setQueueData(data); break;
        case "occupancy": setOccupancyData(data); break;
        case "dead_zones": setDeadZones(data); break;
        case "demographics": setDemographics(data); break;
        case "parking": setParkingData(data); break;
        case "security": setSecurityData(data); break;
        case "conversion": setConversionData(data); break;
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
  };

  // ── Stat Card ───────────────────────────────────────────────

  function StatCard({
    label,
    value,
    icon: Icon,
    sub,
    accent = false,
  }: {
    label: string;
    value: string;
    icon: typeof Camera;
    sub?: string;
    accent?: boolean;
  }) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-text-secondary mb-1">{label}</p>
              <p className={cn("text-2xl font-bold", accent ? "text-indigo-400" : "text-text-primary")}>
                {value}
              </p>
              {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
            </div>
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Icon className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Tab Content Renderers ───────────────────────────────────

  function renderOverview() {
    if (!overview) return null;
    return (
      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Visitors Now"
            value={formatNumber(overview.total_visitors_now)}
            icon={Users}
            accent
          />
          <StatCard
            label="Parking"
            value={formatPercentage(overview.parking_occupancy_pct)}
            icon={ParkingCircle}
            sub={`of 500 spaces`}
          />
          <StatCard
            label="Active Queues"
            value={String(overview.active_queues)}
            icon={Activity}
          />
          <StatCard
            label="Security Alerts"
            value={String(overview.security_alerts)}
            icon={Shield}
            accent={overview.security_alerts > 0}
          />
          <StatCard
            label="Avg Dwell"
            value={formatDwell(overview.avg_dwell_seconds)}
            icon={Clock}
          />
        </div>

        {/* System status */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">System Status</span>
            <Badge variant="info">Simulated Data</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-text-secondary mb-1">Cameras Online</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-text-primary">
                    {overview.cameras_online}/{overview.cameras_total}
                  </span>
                  {overview.cameras_online === overview.cameras_total ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Zones Monitored</p>
                <span className="text-lg font-bold text-text-primary">{overview.zones_monitored}</span>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Data Freshness</p>
                <span className="text-sm text-text-primary">
                  {new Date(overview.data_freshness).toLocaleTimeString()}
                </span>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">AI Modules</p>
                <span className="text-lg font-bold text-indigo-400">10 Active</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Camera Status Donut */}
        {cameraStatusData.length > 0 && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Camera Status</span>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div className="w-40 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={cameraStatusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        strokeWidth={0}
                      >
                        {cameraStatusData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1F2937",
                          border: "1px solid #374151",
                          borderRadius: "8px",
                          color: "#F9FAFB",
                          fontSize: "12px",
                        }}
                        formatter={(value: any, name: any) => [`${value} cameras`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {cameraStatusData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-sm text-text-secondary">{d.name}</span>
                      <span className="font-mono text-sm font-bold text-text-primary ml-auto pl-4">{d.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-wedja-border pt-2 mt-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm text-text-muted">Total</span>
                      <span className="font-mono text-sm font-bold text-text-primary ml-auto pl-4">
                        {overview.cameras_total}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick access grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {TABS.slice(1).map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-wedja-card border border-wedja-border hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all group"
            >
              <tab.icon className="w-5 h-5 text-text-muted group-hover:text-indigo-400 transition-colors" />
              <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderPeople() {
    if (!peopleCounts.length) return <EmptyState />;
    const totalNow = peopleCounts.reduce((s, z) => s + z.current_count, 0);
    const totalToday = peopleCounts.reduce((s, z) => s + z.today_total, 0);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Total Now" value={formatNumber(totalNow)} icon={Users} accent />
          <StatCard label="Today Total" value={formatNumber(totalToday)} icon={TrendingUp} />
          <StatCard label="Zones" value={String(peopleCounts.length)} icon={MapPin} />
        </div>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Per-Zone Visitor Count</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {peopleCounts.map((z) => (
                <div key={z.zone_id} className="flex items-center gap-3">
                  <div className="w-40 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{z.zone_name}</p>
                    <p className="text-xs text-text-muted capitalize">{z.zone_type}</p>
                  </div>
                  <div className="flex-1">
                    <ProgressBar
                      value={z.occupancy_pct}
                      color={
                        z.occupancy_pct > 85 ? "bg-red-500" :
                        z.occupancy_pct > 60 ? "bg-amber-500" :
                        "bg-indigo-500"
                      }
                    />
                  </div>
                  <div className="text-right w-28 flex-shrink-0">
                    <span className="text-sm font-mono font-bold text-text-primary">
                      {formatNumber(z.current_count)}
                    </span>
                    <span className="text-xs text-text-muted"> / {formatNumber(z.capacity)}</span>
                  </div>
                  <Badge variant={z.occupancy_pct > 85 ? "error" : z.occupancy_pct > 60 ? "warning" : "success"}>
                    {formatPercentage(z.occupancy_pct, 0)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Today Totals by Zone</span>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={peopleCounts.map((z) => ({ label: z.zone_name, value: z.today_total }))}
              color="bg-indigo-500"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderFlow() {
    if (!flowData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Total Movements" value={formatNumber(flowData.total_movements)} icon={ArrowRightLeft} accent />
          <StatCard label="Top Paths" value={String(flowData.paths.length)} icon={ChevronRight} />
          <StatCard label="Entry Points" value={String(flowData.entry_points.length)} icon={MapPin} />
        </div>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Flow Diagram</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent>
            <FlowDiagram paths={flowData.paths} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Top Flow Paths</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {flowData.paths.slice(0, 10).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-text-muted w-5">{i + 1}.</span>
                    <span className="text-text-primary truncate">{p.from_zone_name}</span>
                    <ArrowRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                    <span className="text-text-primary truncate">{p.to_zone_name}</span>
                    <span className="ml-auto font-mono text-xs text-indigo-400">
                      {formatNumber(p.count)} ({p.pct_of_total}%)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Entry Point Distribution</span>
            </CardHeader>
            <CardContent>
              <MiniBarChart
                data={flowData.entry_points.map((e) => ({ label: e.zone_name, value: e.count }))}
                color="bg-indigo-500"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  function renderDwell() {
    if (!dwellData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Avg Dwell Time" value={formatDwell(dwellData.avg_dwell_all)} icon={Clock} accent />
          <StatCard label="Stores Tracked" value={String(dwellData.units.length)} icon={ShoppingBag} />
          <StatCard label="Highest Dwell" value={dwellData.top_dwell[0] ? formatDwell(dwellData.top_dwell[0].avg_dwell_seconds) : "N/A"} icon={TrendingUp} sub={dwellData.top_dwell[0]?.tenant_name} />
        </div>

        {/* Full dwell table */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Dwell Analysis by Store</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="text-xs text-text-muted border-b border-wedja-border">
                  <th className="text-left py-2 pr-3">Store</th>
                  <th className="text-left py-2 pr-3 hidden md:table-cell">Zone</th>
                  <th className="text-right py-2 pr-3">Avg Dwell</th>
                  <th className="text-right py-2 pr-3">Stop Rate</th>
                  <th className="text-right py-2 pr-3 hidden sm:table-cell">Stopped</th>
                  <th className="text-right py-2 pr-3 hidden sm:table-cell">Passed</th>
                </tr>
              </thead>
              <tbody>
                {dwellData.units.map((u) => (
                  <tr key={u.unit_id} className="border-b border-wedja-border/50 hover:bg-wedja-elevated/30">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-text-primary">{u.tenant_name}</span>
                    </td>
                    <td className="py-2 pr-3 text-text-secondary hidden md:table-cell">{u.zone_name}</td>
                    <td className="py-2 pr-3 text-right font-mono text-text-primary">{formatDwell(u.avg_dwell_seconds)}</td>
                    <td className="py-2 pr-3 text-right">
                      <Badge variant={u.stop_rate > 40 ? "success" : u.stop_rate > 20 ? "info" : "warning"}>
                        {formatPercentage(u.stop_rate)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-primary hidden sm:table-cell">{formatNumber(u.people_stopped)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-text-muted hidden sm:table-cell">{formatNumber(u.people_passed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Top 10 — Where People Linger</span>
            </CardHeader>
            <CardContent>
              <MiniBarChart
                data={dwellData.top_dwell.map((u) => ({ label: u.tenant_name, value: u.avg_dwell_seconds }))}
                color="bg-emerald-500"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Bottom 10 — Walk Past Without Stopping</span>
            </CardHeader>
            <CardContent>
              <MiniBarChart
                data={dwellData.bottom_dwell.map((u) => ({ label: u.tenant_name, value: u.avg_dwell_seconds }))}
                color="bg-red-500"
              />
              <p className="text-xs text-text-muted mt-3 border-t border-wedja-border pt-3">
                Low dwell + low sales = display and storefront improvements needed
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  function renderQueues() {
    if (!queueData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Active Queues" value={String(queueData.active_queues.length)} icon={Activity} accent />
          <StatCard label="Total Queued" value={formatNumber(queueData.total_queued)} icon={Users} />
          <StatCard label="Alerts" value={String(queueData.alerts_count)} icon={AlertTriangle} accent={queueData.alerts_count > 0} />
          <StatCard label="Avg Wait" value={`${queueData.avg_wait_minutes} min`} icon={Clock} />
        </div>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Active Queue Status</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent>
            {queueData.active_queues.length === 0 ? (
              <p className="text-text-muted text-sm py-4 text-center">No active queues detected</p>
            ) : (
              <div className="space-y-3">
                {queueData.active_queues.map((q) => (
                  <div
                    key={q.unit_id}
                    className={cn(
                      "flex items-center gap-4 p-3 rounded-lg border",
                      q.alert_triggered
                        ? "border-red-500/30 bg-red-500/5"
                        : q.estimated_wait_minutes > 3
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-emerald-500/30 bg-emerald-500/5"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{q.tenant_name}</p>
                      <p className="text-xs text-text-muted">{q.unit_name}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-text-primary">{q.queue_length}</p>
                      <p className="text-[10px] text-text-muted">in queue</p>
                    </div>
                    <div className="text-center">
                      <p className={cn(
                        "text-lg font-bold",
                        q.estimated_wait_minutes > 5 ? "text-red-400" : q.estimated_wait_minutes > 3 ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {q.estimated_wait_minutes}
                      </p>
                      <p className="text-[10px] text-text-muted">min wait</p>
                    </div>
                    {q.alert_triggered && (
                      <Badge variant="error">Long Wait</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {queueData.active_queues.some((q) => q.estimated_wait_minutes > 5) && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Queue Insights</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {queueData.active_queues
                  .filter((q) => q.estimated_wait_minutes > 5)
                  .map((q) => (
                    <div key={q.unit_id} className="flex items-start gap-2 text-sm">
                      <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-text-secondary">
                        <strong className="text-text-primary">{q.tenant_name}</strong> avg wait{" "}
                        {q.estimated_wait_minutes} min — consider additional service point or express lane
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  function renderOccupancy() {
    if (!occupancyData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total People" value={formatNumber(occupancyData.total_current)} icon={Users} accent />
          <StatCard label="Total Capacity" value={formatNumber(occupancyData.total_capacity)} icon={Gauge} />
          <StatCard label="Overall" value={formatPercentage(occupancyData.overall_pct)} icon={BarChart3} />
          <StatCard label="Alerts" value={String(occupancyData.alerts.length)} icon={AlertTriangle} accent={occupancyData.alerts.length > 0} />
        </div>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Zone Capacity Utilisation</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {occupancyData.zones.map((z) => (
                <div key={z.zone_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{z.zone_name}</span>
                      <Badge variant={occStatusBadge(z.status)}>
                        {z.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <span className="text-sm font-mono text-text-primary">
                      {formatNumber(z.current_count)} / {formatNumber(z.capacity)}
                    </span>
                  </div>
                  <ProgressBar
                    value={z.occupancy_pct}
                    color={occStatusColor(z.status)}
                    height="h-3"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {occupancyData.alerts.length > 0 && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Capacity Alerts</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {occupancyData.alerts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-text-primary">{a.zone_name}</span>
                    <Badge variant={a.status === "over_capacity" ? "error" : "warning"}>
                      {formatPercentage(a.pct)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  function renderDeadZones() {
    if (!deadZones.length) return <EmptyState />;

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Traffic Distribution by Zone</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent>
            <DeadZoneGrid zones={deadZones} />
          </CardContent>
        </Card>

        {deadZones.filter((z) => z.relative_traffic < 30).length > 0 && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Recommendations</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {deadZones
                  .filter((z) => z.relative_traffic < 30)
                  .map((z) => (
                    <div key={z.zone_id} className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <MapPin className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{z.zone_name}</p>
                        <p className="text-xs text-text-secondary mt-1">
                          {z.relative_traffic}% relative traffic ({z.footfall_per_sqm} visitors/sqm) —{" "}
                          {z.recommendation}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  function renderDemographics() {
    if (!demographics) return <EmptyState />;

    const groupColors = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd"];
    const ageColors = ["#10b981", "#3b82f6", "#6366f1", "#f59e0b", "#ef4444"];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Group Type Distribution</span>
              <Badge variant="info">Simulated</Badge>
            </CardHeader>
            <CardContent>
              <SimplePie
                data={demographics.group_breakdown.map((g, i) => ({
                  label: g.type,
                  value: g.count,
                  color: groupColors[i % groupColors.length],
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Age Range Distribution</span>
            </CardHeader>
            <CardContent>
              <SimplePie
                data={demographics.age_breakdown.map((a, i) => ({
                  label: a.range.replace("_", " "),
                  value: a.count,
                  color: ageColors[i % ageColors.length],
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Time-of-Day Patterns</span>
          </CardHeader>
          <CardContent>
            {demographics.time_patterns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted border-b border-wedja-border">
                      <th className="text-left py-2 pr-4">Hour</th>
                      <th className="text-right py-2 pr-4">Families</th>
                      <th className="text-right py-2 pr-4">Young Adults</th>
                      <th className="text-right py-2">Seniors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demographics.time_patterns.map((t) => (
                      <tr key={t.hour} className="border-b border-wedja-border/50">
                        <td className="py-2 pr-4 text-text-primary font-mono">{t.hour}:00</td>
                        <td className="py-2 pr-4 text-right font-mono text-indigo-400">{formatNumber(t.families)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-blue-400">{formatNumber(t.young_adults)}</td>
                        <td className="py-2 text-right font-mono text-amber-400">{formatNumber(t.seniors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-text-muted text-sm text-center py-4">No pattern data available</p>
            )}
            <p className="text-xs text-text-muted mt-3 border-t border-wedja-border pt-3">
              Families peak in afternoon (14:00-17:00), young adults peak in evening (19:00+)
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderParking() {
    if (!parkingData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Current Occupancy"
            value={`${formatNumber(parkingData.current_occupied)}/${formatNumber(parkingData.total_spaces)}`}
            icon={ParkingCircle}
            accent
          />
          <StatCard label="Cars In/Hour" value={formatNumber(parkingData.cars_entered_hour)} icon={TrendingUp} />
          <StatCard label="Cars Out/Hour" value={formatNumber(parkingData.cars_exited_hour)} icon={TrendingDown} />
          <StatCard label="Avg Duration" value={`${parkingData.avg_duration_minutes} min`} icon={Clock} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Parking Gauge</span>
              <Badge variant="info">Simulated</Badge>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ParkingGauge
                occupied={parkingData.current_occupied}
                total={parkingData.total_spaces}
                pct={parkingData.occupancy_pct}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Peak Hours</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Peak Hour</span>
                  <span className="font-mono text-text-primary">{parkingData.peak_hour}:00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Peak Occupancy</span>
                  <span className="font-mono text-text-primary">{formatNumber(parkingData.peak_occupancy)} spaces</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Available Now</span>
                  <span className="font-mono text-emerald-400">
                    {formatNumber(parkingData.total_spaces - parkingData.current_occupied)} spaces
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Hourly Occupancy (24h)</span>
          </CardHeader>
          <CardContent>
            <HourlyChart
              data={parkingData.hourly_trend.map((h) => ({ hour: h.hour, value: h.occupied }))}
              label="spaces"
              color="bg-indigo-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Revenue Opportunity</span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary">
              250 EV charger-ready spaces at EGP 50/charge ={" "}
              <strong className="text-indigo-400">EGP {formatNumber(250 * 50)}</strong> potential daily revenue.
              Average {parkingData.avg_duration_minutes} min stay supports Level 2 charging.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderSecurity() {
    if (!securityData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Active Alerts" value={String(securityData.total_active)} icon={Shield} accent={securityData.total_active > 0} />
          <StatCard label="This Week" value={String(securityData.total_this_week)} icon={BarChart3} />
          <StatCard label="False Alarm Rate" value={formatPercentage(securityData.false_alarm_rate)} icon={XCircle} />
          <StatCard label="Avg Response" value={`${securityData.avg_response_minutes} min`} icon={Clock} />
        </div>

        {/* Severity breakdown */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">By Severity</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {securityData.by_severity.map((s) => (
                <div key={s.severity} className="flex items-center gap-2">
                  <Badge variant={severityColor(s.severity)}>{s.severity}</Badge>
                  <span className="font-mono text-sm text-text-primary">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Active alerts */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Active Alerts</span>
          </CardHeader>
          <CardContent>
            {securityData.active_alerts.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-text-secondary">All clear - no active alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {securityData.active_alerts.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      a.severity === "critical"
                        ? "border-red-500/40 bg-red-500/5"
                        : a.severity === "high"
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-wedja-border bg-wedja-elevated/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={severityColor(a.severity)}>{a.severity}</Badge>
                          <Badge variant={statusColor(a.status)}>{a.status}</Badge>
                          <span className="text-xs text-text-muted capitalize">{a.alert_type.replace("_", " ")}</span>
                        </div>
                        <p className="text-sm text-text-primary">{a.description}</p>
                        <p className="text-xs text-text-muted mt-1">
                          {a.zone_name} &middot; {a.camera_name} &middot;{" "}
                          {new Date(a.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderConversion() {
    if (!conversionData) return <EmptyState />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Avg Conversion" value={formatPercentage(conversionData.avg_conversion_rate)} icon={ShoppingBag} accent />
          <StatCard label="Stores Tracked" value={String(conversionData.stores.length)} icon={BarChart3} />
          <StatCard
            label="Top Converter"
            value={conversionData.top_converters[0] ? formatPercentage(conversionData.top_converters[0].conversion_rate) : "N/A"}
            icon={TrendingUp}
            sub={conversionData.top_converters[0]?.tenant_name}
          />
        </div>

        {/* Top Stores Conversion Bar Chart */}
        {topConversionChartData.length > 0 && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Top 10 Stores by Conversion Rate</span>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topConversionChartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 48 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={{ stroke: "#374151" }}
                    />
                    <YAxis
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={{ stroke: "#374151" }}
                      tickFormatter={(v: any) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                        color: "#F9FAFB",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, _name: any, props: any) => [
                        `${value}%`,
                        props.payload.fullName,
                      ]}
                      labelFormatter={() => ""}
                    />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                      {topConversionChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.rate > 30 ? "#10B981" : entry.rate > 15 ? "#3B82F6" : "#EF4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-text-primary">Store Conversion Rates</span>
            <Badge variant="info">Simulated</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="text-xs text-text-muted border-b border-wedja-border">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Store</th>
                  <th className="text-right py-2 pr-3">Passersby</th>
                  <th className="text-right py-2 pr-3">Entered</th>
                  <th className="text-right py-2 pr-3">Conversion</th>
                  <th className="text-right py-2 pr-3 hidden sm:table-cell">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {conversionData.stores.map((s, i) => (
                  <tr
                    key={s.unit_id}
                    className={cn(
                      "border-b border-wedja-border/50 hover:bg-wedja-elevated/30",
                      i < 3 && "bg-emerald-500/5",
                      i >= conversionData.stores.length - 3 && "bg-red-500/5"
                    )}
                  >
                    <td className="py-2 pr-3 text-text-muted text-xs">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-text-primary">{s.tenant_name}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-secondary">
                      {formatNumber(s.passersby)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-primary">
                      {formatNumber(s.entered)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Badge
                        variant={
                          s.conversion_rate > 30
                            ? "success"
                            : s.conversion_rate > 15
                            ? "info"
                            : "error"
                        }
                      >
                        {formatPercentage(s.conversion_rate)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-muted hidden sm:table-cell">
                      {formatDwell(s.avg_time_in_store_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {conversionData.bottom_converters.length > 0 && (
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-text-primary">Conversion Insights</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {conversionData.bottom_converters.slice(0, 5).map((s) => (
                  <div key={s.unit_id} className="flex items-start gap-2 text-sm">
                    <TrendingDown className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-text-secondary">
                      <strong className="text-text-primary">{s.tenant_name}</strong>:{" "}
                      {formatNumber(s.passersby)} walk past, {formatNumber(s.entered)} enter ={" "}
                      <span className="text-red-400">{formatPercentage(s.conversion_rate)}</span> conversion
                      — storefront and display improvements recommended
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  function EmptyState() {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Camera className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No data available for this module</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  const contentMap: Record<TabKey, () => React.ReactNode> = {
    overview: renderOverview,
    people: renderPeople,
    flow: renderFlow,
    dwell: renderDwell,
    queues: renderQueues,
    occupancy: renderOccupancy,
    dead_zones: renderDeadZones,
    demographics: renderDemographics,
    parking: renderParking,
    security: renderSecurity,
    conversion: renderConversion,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Camera className="w-6 h-6 text-indigo-400" />
            CCTV Analytics
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            10 AI-powered video analytics modules — Senzo Mall
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Simulated Data</Badge>
          <Button
            onClick={() => fetchData(activeTab)}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max bg-wedja-card border border-wedja-border rounded-xl p-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  isActive
                    ? "bg-indigo-500/15 text-indigo-400"
                    : "text-text-muted hover:text-text-secondary hover:bg-wedja-elevated/50"
                )}
                aria-selected={isActive}
                role="tab"
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-text-secondary">Loading CCTV analytics...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-text-primary mb-1">Failed to load data</p>
            <p className="text-xs text-text-muted">{error}</p>
            <Button
              onClick={() => fetchData(activeTab)}
              className="mt-4 text-xs"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        contentMap[activeTab]()
      )}
    </div>
  );
}
