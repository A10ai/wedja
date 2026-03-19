"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  Camera,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  MapPin,
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, formatPercentage, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

interface Overview {
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

interface ZoneData {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  total_in: number;
  total_out: number;
  avg_dwell_seconds: number;
  share_of_total_pct: number;
}

interface UnitData {
  unit_id: string;
  unit_number: string;
  tenant_name: string;
  count_in: number;
  count_out: number;
  dwell_seconds: number;
}

interface HourlyData {
  hour: number;
  count: number;
}

interface DailyData {
  date: string;
  total_in: number;
  total_out: number;
  day_of_week: number;
}

interface HeatmapData {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  unit_count: number;
  total_footfall: number;
  intensity: number;
}

interface PeakData {
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

interface CameraData {
  id: string;
  name: string;
  status: string;
  location_description: string;
  zone: { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

function getIntensityColor(intensity: number): string {
  if (intensity >= 80) return "bg-amber-500";
  if (intensity >= 60) return "bg-amber-400";
  if (intensity >= 40) return "bg-amber-300 dark:bg-amber-500/60";
  if (intensity >= 20) return "bg-amber-200 dark:bg-amber-500/30";
  return "bg-amber-100 dark:bg-amber-500/15";
}

function getIntensityText(intensity: number): string {
  if (intensity >= 80) return "text-white";
  if (intensity >= 60) return "text-amber-950 dark:text-white";
  return "text-amber-900 dark:text-amber-200";
}

function zoneTypeLabel(type: string): string {
  const map: Record<string, string> = {
    retail: "Retail",
    food: "F&B",
    entertainment: "Entertainment",
    service: "Services",
  };
  return map[type] || type;
}

// ── Page Component ────────────────────────────────────────────

export default function FootfallPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [units, setUnits] = useState<UnitData[]>([]);
  const [hourly, setHourly] = useState<HourlyData[]>([]);
  const [trend, setTrend] = useState<DailyData[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapData[]>([]);
  const [peaks, setPeaks] = useState<PeakData | null>(null);
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [zoneSortKey, setZoneSortKey] = useState<string>("total_in");
  const [zoneSortAsc, setZoneSortAsc] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        ovRes,
        zoneRes,
        unitRes,
        hourlyRes,
        trendRes,
        heatmapRes,
        peakRes,
        camRes,
      ] = await Promise.all([
        fetch(`/api/v1/footfall?type=overview&date=${selectedDate}`),
        fetch(`/api/v1/footfall?type=by_zone&date=${selectedDate}`),
        fetch(`/api/v1/footfall?type=by_unit&date=${selectedDate}`),
        fetch(`/api/v1/footfall?type=hourly&date=${selectedDate}`),
        fetch(`/api/v1/footfall?type=trend&days=30`),
        fetch(`/api/v1/footfall?type=heatmap&date=${selectedDate}`),
        fetch(`/api/v1/footfall?type=peaks`),
        fetch(`/api/v1/cameras`),
      ]);

      const [ovData, zoneData, unitData, hourlyData, trendData, heatmapData, peakData, camData] =
        await Promise.all([
          ovRes.json(),
          zoneRes.json(),
          unitRes.json(),
          hourlyRes.json(),
          trendRes.json(),
          heatmapRes.json(),
          peakRes.json(),
          camRes.json(),
        ]);

      setOverview(ovData);
      setZones(Array.isArray(zoneData) ? zoneData : []);
      setUnits(Array.isArray(unitData) ? unitData : []);
      setHourly(Array.isArray(hourlyData) ? hourlyData : []);
      setTrend(Array.isArray(trendData) ? trendData : []);
      setHeatmap(Array.isArray(heatmapData) ? heatmapData : []);
      setPeaks(peakData);
      setCameras(Array.isArray(camData) ? camData : []);
    } catch (err) {
      console.error("Failed to fetch footfall data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Sorted zones ─────────────────────────────────────────

  const sortedZones = [...zones].sort((a, b) => {
    const aVal = (a as any)[zoneSortKey] ?? 0;
    const bVal = (b as any)[zoneSortKey] ?? 0;
    return zoneSortAsc ? aVal - bVal : bVal - aVal;
  });

  function toggleZoneSort(key: string) {
    if (zoneSortKey === key) {
      setZoneSortAsc(!zoneSortAsc);
    } else {
      setZoneSortKey(key);
      setZoneSortAsc(false);
    }
  }

  const SortIcon = ({ col }: { col: string }) =>
    zoneSortKey === col ? (
      zoneSortAsc ? (
        <ChevronUp size={12} />
      ) : (
        <ChevronDown size={12} />
      )
    ) : null;

  // ── Chart helpers ─────────────────────────────────────────

  const hourlyMax = Math.max(...hourly.map((h) => h.count), 1);
  const trendMax = Math.max(...trend.map((d) => d.total_in), 1);
  const trendAvg =
    trend.length > 0
      ? Math.round(
          trend.reduce((s, d) => s + d.total_in, 0) / trend.length
        )
      : 0;
  const currentHour = new Date().getHours();

  // Top 10 stores
  const topStores = [...units].sort((a, b) => b.count_in - a.count_in).slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Users size={28} className="text-wedja-accent" />
            Footfall Intelligence
          </h1>
          <p className="text-sm text-text-muted mt-1">Loading analytics...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="py-8">
                <div className="h-4 w-24 bg-wedja-border/50 rounded animate-pulse mb-2" />
                <div className="h-8 w-32 bg-wedja-border/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Users size={28} className="text-wedja-accent" />
            Footfall Intelligence
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Visitor counting, traffic patterns, and heatmaps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowManualEntry(true)}
          >
            <Plus size={14} />
            Manual Entry
          </Button>
          <Link href="/dashboard/footfall/cameras">
            <Button variant="secondary" size="sm">
              <Camera size={14} />
              Cameras
            </Button>
          </Link>
        </div>
      </div>

      {/* A. Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Visitors Today"
          value={formatNumber(overview?.total_visitors_today || 0)}
          change={overview?.change_vs_yesterday_pct || 0}
          subLabel="vs yesterday"
          icon={<Users size={18} />}
        />
        <StatCard
          label="This Week"
          value={formatNumber(overview?.total_visitors_this_week || 0)}
          change={overview?.change_vs_last_week_pct || 0}
          subLabel="vs last week"
          icon={<Calendar size={18} />}
        />
        <StatCard
          label="Daily Average"
          value={formatNumber(overview?.avg_daily_visitors || 0)}
          subLabel="last 30 days"
          icon={<BarChart3 size={18} />}
        />
        <StatCard
          label="Peak Hour"
          value={formatHour(overview?.peak_hour || 0)}
          subLabel={`${formatNumber(overview?.peak_count || 0)} visitors`}
          icon={<Clock size={18} />}
          highlight
        />
      </div>

      {/* B. Hourly Trend Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Hourly Footfall
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500/30" />
              Off-hours
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Mall hours
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-wedja-accent" />
              Peak
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[3px] h-48">
            {hourly.map((h) => {
              const pct = hourlyMax > 0 ? (h.count / hourlyMax) * 100 : 0;
              const isMallHour = h.hour >= 10 && h.hour <= 23;
              const isPeak =
                h.count > 0 && h.count >= hourlyMax * 0.85;
              const isCurrent = h.hour === currentHour;

              return (
                <div
                  key={h.hour}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                >
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-wedja-card border border-wedja-border rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap z-10 shadow-lg">
                    {formatHour(h.hour)}: {formatNumber(h.count)}
                  </div>
                  <div
                    className={cn(
                      "w-full rounded-t transition-all duration-300",
                      isPeak
                        ? "bg-wedja-accent"
                        : isMallHour
                        ? "bg-amber-500/70"
                        : "bg-amber-500/20",
                      isCurrent && "ring-2 ring-wedja-accent ring-offset-1 ring-offset-wedja-card"
                    )}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  <span
                    className={cn(
                      "text-[9px] tabular-nums",
                      isCurrent
                        ? "text-wedja-accent font-bold"
                        : "text-text-muted"
                    )}
                  >
                    {h.hour}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* C. Zone Heatmap + D. Zone Table side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Heatmap */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                Zone Heatmap
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {heatmap.map((z) => (
                <div
                  key={z.zone_id}
                  className={cn(
                    "rounded-lg p-3 transition-colors",
                    getIntensityColor(z.intensity),
                    getIntensityText(z.intensity)
                  )}
                >
                  <p className="text-xs font-semibold truncate">{z.zone_name}</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatNumber(z.total_footfall)}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] opacity-80">
                      {z.unit_count} units
                    </span>
                    <span className="text-[10px] opacity-80">
                      {zoneTypeLabel(z.zone_type)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-1 mt-4">
              <span className="text-[10px] text-text-muted mr-1">Low</span>
              {[15, 30, 50, 70, 90].map((i) => (
                <div
                  key={i}
                  className={cn("w-5 h-3 rounded-sm", getIntensityColor(i))}
                />
              ))}
              <span className="text-[10px] text-text-muted ml-1">High</span>
            </div>
          </CardContent>
        </Card>

        {/* Zone Breakdown Table */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                Zone Breakdown
              </h2>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border text-text-muted text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">Zone</th>
                    <th className="text-left px-2 py-2.5 font-medium">Type</th>
                    <th
                      className="text-right px-2 py-2.5 font-medium cursor-pointer hover:text-text-primary"
                      onClick={() => toggleZoneSort("total_in")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        In <SortIcon col="total_in" />
                      </span>
                    </th>
                    <th className="text-right px-2 py-2.5 font-medium">Out</th>
                    <th
                      className="text-right px-2 py-2.5 font-medium cursor-pointer hover:text-text-primary"
                      onClick={() => toggleZoneSort("avg_dwell_seconds")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Dwell <SortIcon col="avg_dwell_seconds" />
                      </span>
                    </th>
                    <th
                      className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-text-primary"
                      onClick={() => toggleZoneSort("share_of_total_pct")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Share <SortIcon col="share_of_total_pct" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedZones.map((z) => {
                    const maxZoneIn = Math.max(
                      ...zones.map((zz) => zz.total_in),
                      1
                    );
                    return (
                      <tr
                        key={z.zone_id}
                        className="border-b border-wedja-border/50 hover:bg-wedja-border/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-medium text-text-primary">
                          {z.zone_name}
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge
                            variant={
                              z.zone_type === "food"
                                ? "warning"
                                : z.zone_type === "entertainment"
                                ? "info"
                                : z.zone_type === "service"
                                ? "success"
                                : "default"
                            }
                          >
                            {zoneTypeLabel(z.zone_type)}
                          </Badge>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-text-primary">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-wedja-border/30 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-wedja-accent rounded-full"
                                style={{
                                  width: `${(z.total_in / maxZoneIn) * 100}%`,
                                }}
                              />
                            </div>
                            {formatNumber(z.total_in)}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-text-secondary">
                          {formatNumber(z.total_out)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-text-secondary">
                          {formatDwell(z.avg_dwell_seconds)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-primary font-medium">
                          {formatPercentage(z.share_of_total_pct)}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedZones.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-text-muted text-sm"
                      >
                        No zone data for this date
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* E. Top Stores by Footfall */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Top 10 Stores by Footfall
            </h2>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border text-text-muted text-xs">
                  <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                  <th className="text-left px-2 py-2.5 font-medium">Store</th>
                  <th className="text-left px-2 py-2.5 font-medium">Unit</th>
                  <th className="text-right px-2 py-2.5 font-medium">
                    Visitors
                  </th>
                  <th className="text-right px-2 py-2.5 font-medium">
                    Exits
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium">
                    Dwell Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {topStores.map((u, i) => (
                  <tr
                    key={u.unit_id}
                    className="border-b border-wedja-border/50 hover:bg-wedja-border/20 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-text-muted font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="px-2 py-2.5 font-medium text-text-primary">
                      {u.tenant_name}
                    </td>
                    <td className="px-2 py-2.5 text-text-secondary font-mono text-xs">
                      {u.unit_number}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-text-primary font-medium">
                      {formatNumber(u.count_in)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-text-secondary">
                      {formatNumber(u.count_out)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {formatDwell(u.dwell_seconds)}
                    </td>
                  </tr>
                ))}
                {topStores.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-text-muted text-sm"
                    >
                      No unit data for this date
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* F. Daily Trend (30 days) + G. Peak Patterns side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                30-Day Trend
              </h2>
            </div>
            <span className="text-xs text-text-muted">
              Avg: {formatNumber(trendAvg)}/day
            </span>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-40 relative">
              {/* Average line */}
              {trend.length > 0 && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-amber-500/40 z-10"
                  style={{
                    bottom: `${(trendAvg / trendMax) * 100}%`,
                  }}
                />
              )}
              {trend.map((d) => {
                const pct =
                  trendMax > 0 ? (d.total_in / trendMax) * 100 : 0;
                const isWeekend = d.day_of_week === 5 || d.day_of_week === 6;
                const dateLabel = d.date.slice(5); // MM-DD

                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-wedja-card border border-wedja-border rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap z-20 shadow-lg">
                      {d.date}: {formatNumber(d.total_in)}
                      {isWeekend ? " (Weekend)" : ""}
                    </div>
                    <div
                      className={cn(
                        "w-full rounded-t transition-all duration-300",
                        isWeekend ? "bg-wedja-accent" : "bg-amber-500/60"
                      )}
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    {trend.length <= 15 && (
                      <span className="text-[8px] text-text-muted -rotate-45 origin-top-left whitespace-nowrap">
                        {dateLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500/60" />
                Weekday
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-wedja-accent" />
                Weekend
              </span>
              <span className="flex items-center gap-1">
                <span className="w-6 border-t border-dashed border-amber-500/40" />
                Average
              </span>
            </div>
          </CardContent>
        </Card>

        {/* G. Peak Patterns */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                Peak Patterns
              </h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {peaks ? (
              <>
                <PatternItem
                  label="Busiest Day"
                  value={peaks.busiest_day}
                  sub={`${formatNumber(peaks.busiest_day_avg)} avg visitors`}
                  icon={<TrendingUp size={14} className="text-wedja-accent" />}
                />
                <PatternItem
                  label="Quietest Day"
                  value={peaks.quietest_day}
                  sub={`${formatNumber(peaks.quietest_day_avg)} avg visitors`}
                  icon={
                    <TrendingDown size={14} className="text-text-muted" />
                  }
                />
                <div className="border-t border-wedja-border pt-3">
                  <p className="text-xs text-text-muted mb-2">
                    Weekend vs Weekday
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-secondary">Weekday</span>
                        <span className="text-text-primary tabular-nums">
                          {formatNumber(peaks.weekday_avg)}
                        </span>
                      </div>
                      <div className="h-2 bg-wedja-border/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500/60 rounded-full"
                          style={{
                            width: `${
                              Math.max(peaks.weekday_avg, peaks.weekend_avg) > 0
                                ? (peaks.weekday_avg /
                                    Math.max(
                                      peaks.weekday_avg,
                                      peaks.weekend_avg
                                    )) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-secondary">Weekend</span>
                        <span className="text-text-primary tabular-nums">
                          {formatNumber(peaks.weekend_avg)}
                        </span>
                      </div>
                      <div className="h-2 bg-wedja-border/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-wedja-accent rounded-full"
                          style={{
                            width: `${
                              Math.max(peaks.weekday_avg, peaks.weekend_avg) > 0
                                ? (peaks.weekend_avg /
                                    Math.max(
                                      peaks.weekday_avg,
                                      peaks.weekend_avg
                                    )) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mt-2">
                    Ratio:{" "}
                    <span className="text-wedja-accent font-medium">
                      {peaks.weekend_vs_weekday_ratio}x
                    </span>
                  </p>
                </div>
                <div className="border-t border-wedja-border pt-3">
                  <PatternItem
                    label="Most Common Peak Hour"
                    value={formatHour(peaks.peak_hour)}
                    sub={`${formatNumber(peaks.peak_hour_avg)} avg peak count`}
                    icon={
                      <Clock size={14} className="text-wedja-accent" />
                    }
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">
                No pattern data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* H. Camera Status Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Camera Status
            </h2>
            <Badge variant="default">{cameras.length} registered</Badge>
          </div>
          <Link href="/dashboard/footfall/cameras">
            <Button variant="ghost" size="sm">
              Manage <ArrowUpRight size={12} />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cameras.slice(0, 8).map((cam) => (
              <div
                key={cam.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-wedja-bg border border-wedja-border/50"
              >
                <div
                  className={cn(
                    "w-2.5 h-2.5 rounded-full flex-shrink-0",
                    cam.status === "active"
                      ? "bg-emerald-500"
                      : cam.status === "offline"
                      ? "bg-red-500"
                      : "bg-amber-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-primary truncate">
                    {cam.name}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">
                    {cam.zone?.name || "Unassigned"}
                  </p>
                </div>
                <Badge
                  variant={
                    cam.status === "active"
                      ? "success"
                      : cam.status === "offline"
                      ? "error"
                      : "warning"
                  }
                >
                  {cam.status}
                </Badge>
              </div>
            ))}
            {cameras.length > 8 && (
              <Link
                href="/dashboard/footfall/cameras"
                className="flex items-center justify-center p-3 rounded-lg border border-dashed border-wedja-border text-text-muted text-xs hover:text-wedja-accent hover:border-wedja-accent transition-colors"
              >
                +{cameras.length - 8} more cameras
              </Link>
            )}
            {cameras.length === 0 && (
              <div className="col-span-full text-center py-6">
                <Camera
                  size={32}
                  className="mx-auto text-text-muted mb-2"
                />
                <p className="text-sm text-text-muted">
                  No cameras registered
                </p>
                <Link href="/dashboard/footfall/cameras">
                  <Button variant="secondary" size="sm" className="mt-2">
                    <Plus size={14} />
                    Add Camera
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual Entry Modal */}
      {showManualEntry && (
        <ManualEntryModal
          onClose={() => setShowManualEntry(false)}
          onSaved={() => {
            setShowManualEntry(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatCard({
  label,
  value,
  change,
  subLabel,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  change?: number;
  subLabel?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "ring-1 ring-wedja-accent/30" : ""}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted font-medium">{label}</span>
          <span className="text-text-muted">{icon}</span>
        </div>
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            highlight ? "text-wedja-accent" : "text-text-primary"
          )}
        >
          {value}
        </p>
        {(change !== undefined || subLabel) && (
          <div className="flex items-center gap-1.5 mt-1">
            {change !== undefined && change !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center text-xs font-medium",
                  change > 0 ? "text-emerald-500" : "text-red-500"
                )}
              >
                {change > 0 ? (
                  <ArrowUpRight size={12} />
                ) : (
                  <ArrowDownRight size={12} />
                )}
                {Math.abs(change)}%
              </span>
            )}
            {subLabel && (
              <span className="text-xs text-text-muted">{subLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PatternItem({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-text-primary">{value}</p>
        <p className="text-xs text-text-secondary">{sub}</p>
      </div>
    </div>
  );
}

// ── Manual Entry Modal ────────────────────────────────────────

function ManualEntryModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [units, setUnits] = useState<
    { id: string; unit_number: string; name: string }[]
  >([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [countIn, setCountIn] = useState("");
  const [countOut, setCountOut] = useState("");
  const [timestamp, setTimestamp] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/units")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUnits(
            data
              .filter((u: any) => u.status === "occupied")
              .map((u: any) => ({
                id: u.id,
                unit_number: u.unit_number,
                name: u.name,
              }))
          );
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/footfall/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: selectedUnit || undefined,
          count_in: parseInt(countIn) || 0,
          count_out: parseInt(countOut) || 0,
          timestamp: new Date(timestamp).toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-wedja-card border border-wedja-border rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Manual Footfall Entry
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-wedja-border/50 text-text-muted"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Unit
            </label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent focus:border-transparent"
              required
            >
              <option value="">Select unit...</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_number} - {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Count In"
              type="number"
              min="0"
              value={countIn}
              onChange={(e) => setCountIn(e.target.value)}
              placeholder="0"
              required
            />
            <Input
              label="Count Out"
              type="number"
              min="0"
              value={countOut}
              onChange={(e) => setCountOut(e.target.value)}
              placeholder="0"
            />
          </div>

          <Input
            label="Date & Time"
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            required
          />

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Entry"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
