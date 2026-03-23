"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Zap,
  Loader2,
  TrendingDown,
  TrendingUp,
  Clock,
  Lightbulb,
  BarChart3,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  Cell,
} from "recharts";

// ── Types ───────────────────────────────────────────────────

interface EnergyOverview {
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

interface HourlyReading {
  hour: number;
  consumption_kwh: number;
  cost_egp: number;
  is_operating: boolean;
  is_peak: boolean;
}

interface ZoneEnergy {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  area_sqm: number;
  consumption_kwh: number;
  cost_egp: number;
  share_pct: number;
  kwh_per_sqm: number;
}

interface EnergyEfficiency {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  energy_kwh: number;
  energy_cost_egp: number;
  footfall: number;
  kwh_per_visitor: number;
  efficiency_score: number;
  status: "efficient" | "moderate" | "inefficient";
}

interface DailyTrend {
  date: string;
  consumption_kwh: number;
  cost_egp: number;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  zone_name: string | null;
  severity: "info" | "warning" | "critical";
  estimated_savings_egp: number;
  category: string;
}

// ── Main Component ──────────────────────────────────────────

export default function EnergyPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<EnergyOverview | null>(null);
  const [hourly, setHourly] = useState<HourlyReading[]>([]);
  const [zones, setZones] = useState<ZoneEnergy[]>([]);
  const [efficiency, setEfficiency] = useState<EnergyEfficiency[]>([]);
  const [trend, setTrend] = useState<DailyTrend[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // Cross-data
  const [zoneOccupancy, setZoneOccupancy] = useState<Record<string, number>>({});
  const [zoneAnomalyCount, setZoneAnomalyCount] = useState<Record<string, number>>({});
  const [hvacTicketCount, setHvacTicketCount] = useState<number>(0);

  const fetchAll = useCallback(async () => {
    try {
      const [ovRes, hrRes, znRes, effRes, trRes, recRes] = await Promise.all([
        fetch("/api/v1/energy?type=overview"),
        fetch("/api/v1/energy?type=hourly"),
        fetch("/api/v1/energy?type=by_zone"),
        fetch("/api/v1/energy?type=vs_footfall"),
        fetch("/api/v1/energy?type=trend"),
        fetch("/api/v1/energy?type=recommendations"),
      ]);

      const [ov, hr, zn, eff, tr, rec] = await Promise.all([
        ovRes.json(),
        hrRes.json(),
        znRes.json(),
        effRes.json(),
        trRes.json(),
        recRes.json(),
      ]);

      setOverview(ov);
      setHourly(hr);
      setZones(zn);
      setEfficiency(eff);
      setTrend(tr);
      setRecommendations(rec);
    } catch {
      // Handled by empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Fetch cross-data: footfall for occupancy, anomalies, maintenance HVAC
  useEffect(() => {
    async function fetchCrossData() {
      try {
        const [ffRes, anomalyRes, maintRes] = await Promise.all([
          fetch("/api/v1/footfall?type=by_zone").catch(() => null),
          fetch("/api/v1/anomalies?type=active").catch(() => null),
          fetch("/api/v1/maintenance?category=hvac").catch(() => null),
        ]);

        if (ffRes?.ok) {
          const ffData = await ffRes.json();
          const map: Record<string, number> = {};
          if (Array.isArray(ffData)) {
            ffData.forEach((z: any) => { map[z.zone_id] = z.total_in || 0; });
          }
          setZoneOccupancy(map);
        }

        if (anomalyRes?.ok) {
          const anomalyData = await anomalyRes.json();
          const list = Array.isArray(anomalyData) ? anomalyData : anomalyData?.anomalies || [];
          const map: Record<string, number> = {};
          list.forEach((a: any) => {
            if (a.type === "energy" || a.type === "energy_anomaly") {
              const zid = a.zone_id;
              if (zid) map[zid] = (map[zid] || 0) + 1;
            }
          });
          setZoneAnomalyCount(map);
        }

        if (maintRes?.ok) {
          const maintData = await maintRes.json();
          const tickets = maintData?.tickets || [];
          const openHvac = Array.isArray(tickets)
            ? tickets.filter((t: any) => ["open", "assigned", "in_progress"].includes(t.status)).length
            : 0;
          setHvacTicketCount(openHvac);
        }
      } catch {
        // Cross-data optional
      }
    }
    fetchCrossData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  const zoneMax = Math.max(...zones.map((z) => z.consumption_kwh), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Zap size={28} className="text-wedja-accent" />
          Energy
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Consumption monitoring, zone analysis, and efficiency optimization
        </p>
      </div>

      {/* ── 4 Stat Cards ─────────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Today&apos;s Consumption
                </span>
                <Zap size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-text-primary">
                {formatNumber(overview.total_consumption_kwh_today)}{" "}
                <span className="text-xs text-text-muted font-normal">kWh</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                Avg: {formatNumber(overview.avg_daily_kwh)} kWh/day
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Today&apos;s Cost
                </span>
                <Activity size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-wedja-accent">
                {formatCurrency(overview.total_cost_egp_today)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Avg: {formatCurrency(overview.avg_daily_cost_egp)}/day
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Monthly Total
                </span>
                <BarChart3 size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-text-primary">
                {formatCurrency(overview.cost_this_month_egp)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {formatNumber(overview.total_this_month_kwh)} kWh
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  vs Yesterday
                </span>
                {overview.change_vs_yesterday_pct <= 0 ? (
                  <TrendingDown size={16} className="text-emerald-500" />
                ) : (
                  <TrendingUp size={16} className="text-red-500" />
                )}
              </div>
              <p
                className={`text-xl font-bold font-mono ${
                  overview.change_vs_yesterday_pct <= 0
                    ? "text-status-success"
                    : "text-status-error"
                }`}
              >
                {overview.change_vs_yesterday_pct > 0 ? "+" : ""}
                {formatPercentage(overview.change_vs_yesterday_pct)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Peak: {overview.peak_hour}:00 ({formatNumber(overview.peak_consumption_kwh)} kWh)
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Hourly Chart + Zone Breakdown Row ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Chart (2/3 width) */}
        {hourly.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Clock size={16} className="text-wedja-accent" />
                Hourly Consumption (Today)
              </h2>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={hourly} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    tickFormatter={(h: number) => `${h}`}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' }}
                    labelStyle={{ color: '#F9FAFB' }}
                    itemStyle={{ color: '#F59E0B' }}
                    labelFormatter={(h: any) => `${h}:00`}
                    formatter={(value: any, _name: any, props: any) => {
                      const item = props.payload;
                      return [`${Number(value).toLocaleString()} kWh (${formatCurrency(item.cost_egp)})`, 'Consumption'];
                    }}
                  />
                  <Bar dataKey="consumption_kwh" radius={[2, 2, 0, 0]}>
                    {hourly.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.is_peak ? '#EF4444' : entry.is_operating ? '#F59E0B' : '#374151'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#F59E0B' }} />
                  <span className="text-[10px] text-text-muted">Operating</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#374151' }} />
                  <span className="text-[10px] text-text-muted">Off-hours</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#EF4444' }} />
                  <span className="text-[10px] text-text-muted">Peak</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zone Breakdown (1/3 width) */}
        {zones.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary">
                By Zone (Today)
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {zones.map((zone) => (
                <div key={zone.zone_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-text-primary truncate block">
                        {zone.zone_name}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {formatNumber(zone.consumption_kwh)} kWh &middot;{" "}
                        {zone.kwh_per_sqm} kWh/sqm
                        {zoneOccupancy[zone.zone_id] > 0 && (
                          <> &middot; {formatNumber(zoneOccupancy[zone.zone_id])} visitors</>
                        )}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                      {zoneAnomalyCount[zone.zone_id] > 0 && (
                        <span className="text-[10px] text-status-error font-medium">
                          {zoneAnomalyCount[zone.zone_id]} anomal{zoneAnomalyCount[zone.zone_id] === 1 ? "y" : "ies"}
                        </span>
                      )}
                      <div>
                        <span className="text-xs font-mono text-wedja-accent">
                          {formatCurrency(zone.cost_egp)}
                        </span>
                        <span className="block text-[10px] text-text-muted">
                          {zone.share_pct}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-wedja-border/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        zone.share_pct > 25
                          ? "bg-red-500"
                          : zone.share_pct > 15
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${
                          zoneMax > 0
                            ? (zone.consumption_kwh / zoneMax) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* HVAC Maintenance Connection */}
      {hvacTicketCount > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-text-secondary">
              <span className="font-mono font-semibold text-status-warning">{hvacTicketCount}</span> open HVAC maintenance ticket{hvacTicketCount !== 1 ? "s" : ""} in high-energy zones
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Energy vs Footfall Efficiency ─────────────────────── */}
      {efficiency.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Energy vs Footfall Efficiency (7 days)
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Zone
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Type
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Energy (kWh)
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Cost (EGP)
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Footfall
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      kWh/Visitor
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Score
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {efficiency.map((z) => (
                    <tr
                      key={z.zone_id}
                      className={`border-b border-wedja-border/50 ${
                        z.status === "inefficient"
                          ? "bg-red-500/5"
                          : "hover:bg-wedja-border/10"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-text-primary font-medium">
                        {z.zone_name}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary capitalize text-xs">
                        {z.zone_type}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                        {formatNumber(z.energy_kwh)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-wedja-accent">
                        {formatCurrency(z.energy_cost_egp)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {z.footfall > 0 ? formatNumber(z.footfall) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                        {z.kwh_per_visitor.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`font-mono font-bold text-sm ${
                            z.efficiency_score >= 65
                              ? "text-emerald-500"
                              : z.efficiency_score >= 40
                              ? "text-amber-500"
                              : "text-red-500"
                          }`}
                        >
                          {z.efficiency_score}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          variant={
                            z.status === "efficient"
                              ? "success"
                              : z.status === "inefficient"
                              ? "error"
                              : "warning"
                          }
                        >
                          {z.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 30-Day Trend + AI Recommendations Row ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 30-Day Trend */}
        {trend.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <BarChart3 size={16} className="text-wedja-accent" />
                30-Day Consumption Trend
              </h2>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="energyAmberGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: '#6B7280' }}
                    tickFormatter={(d: string) => {
                      const dateObj = new Date(d);
                      return dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                    }}
                    interval={Math.max(Math.floor(trend.length / 6), 0)}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' }}
                    labelStyle={{ color: '#F9FAFB' }}
                    itemStyle={{ color: '#F59E0B' }}
                    labelFormatter={(d: any) => {
                      const dateObj = new Date(d);
                      return dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    }}
                    formatter={(value: any, _name: any, props: any) => {
                      const item = props.payload;
                      return [`${Number(value).toLocaleString()} kWh (${formatCurrency(item.cost_egp)})`, 'Consumption'];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="consumption_kwh"
                    stroke="#F59E0B"
                    fill="url(#energyAmberGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-[10px] text-text-muted">Weekend</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/60" />
                  <span className="text-[10px] text-text-muted">Weekday</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Recommendations */}
        {recommendations.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Lightbulb size={16} className="text-wedja-accent" />
                AI Recommendations
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-lg border border-wedja-border/50 hover:border-wedja-border transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-medium text-text-primary">
                      {rec.title}
                    </h3>
                    <Badge
                      variant={
                        rec.severity === "critical"
                          ? "error"
                          : rec.severity === "warning"
                          ? "warning"
                          : "info"
                      }
                    >
                      {rec.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary mb-2">
                    {rec.description}
                  </p>
                  <div className="flex items-center justify-between">
                    {rec.zone_name && (
                      <span className="text-[10px] text-text-muted">
                        {rec.zone_name}
                      </span>
                    )}
                    <span className="text-xs font-mono font-semibold text-emerald-500">
                      Est. savings: {formatCurrency(rec.estimated_savings_egp)}/mo
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Zone Heatmap ─────────────────────────────────────── */}
      {zones.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Zone Energy Heatmap
            </h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {zones.map((zone) => {
                const intensity = zoneMax > 0 ? zone.consumption_kwh / zoneMax : 0;
                let bgClass = "bg-emerald-500/15 border-emerald-500/30";
                let textClass = "text-emerald-600 dark:text-emerald-400";
                if (intensity > 0.7) {
                  bgClass = "bg-red-500/15 border-red-500/30";
                  textClass = "text-red-600 dark:text-red-400";
                } else if (intensity > 0.4) {
                  bgClass = "bg-orange-500/15 border-orange-500/30";
                  textClass = "text-orange-600 dark:text-orange-400";
                } else if (intensity > 0.2) {
                  bgClass = "bg-amber-500/15 border-amber-500/30";
                  textClass = "text-amber-600 dark:text-amber-400";
                }

                return (
                  <div
                    key={zone.zone_id}
                    className={`p-3 rounded-lg border transition-colors ${bgClass}`}
                  >
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {zone.zone_name}
                    </p>
                    <p className={`text-lg font-mono font-bold ${textClass}`}>
                      {formatNumber(zone.consumption_kwh)}
                      <span className="text-[10px] font-normal ml-0.5">kWh</span>
                    </p>
                    <p className="text-[10px] text-text-muted capitalize">
                      {zone.zone_type} &middot; {zone.share_pct}%
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Heatmap legend */}
            <div className="flex items-center justify-center gap-1.5 mt-4">
              <span className="text-[10px] text-text-muted">Low</span>
              <div className="flex gap-0.5">
                <div className="w-6 h-2 rounded-sm bg-emerald-500/40" />
                <div className="w-6 h-2 rounded-sm bg-amber-500/40" />
                <div className="w-6 h-2 rounded-sm bg-orange-500/50" />
                <div className="w-6 h-2 rounded-sm bg-red-500/50" />
              </div>
              <span className="text-[10px] text-text-muted">High</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
