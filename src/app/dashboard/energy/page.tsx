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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-custis-gold" />
      </div>
    );
  }

  const hourlyMax = Math.max(...hourly.map((h) => h.consumption_kwh), 1);
  const trendMax = Math.max(...trend.map((t) => t.consumption_kwh), 1);
  const zoneMax = Math.max(...zones.map((z) => z.consumption_kwh), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Zap size={28} className="text-custis-gold" />
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
              <p className="text-xl font-bold font-mono text-custis-gold">
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
                <Clock size={16} className="text-custis-gold" />
                Hourly Consumption (Today)
              </h2>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-[2px] sm:gap-1 h-48">
                {hourly.map((h) => {
                  const pct =
                    hourlyMax > 0
                      ? (h.consumption_kwh / hourlyMax) * 100
                      : 0;

                  let barColor = "bg-custis-border/50"; // off-hours default
                  if (h.is_peak) {
                    barColor = "bg-red-500";
                  } else if (h.is_operating) {
                    barColor = "bg-amber-500/80";
                  } else if (h.consumption_kwh > 0) {
                    barColor = "bg-amber-500/30";
                  }

                  return (
                    <div
                      key={h.hour}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                    >
                      <div
                        className={`w-full rounded-t-sm transition-all duration-300 min-h-[1px] ${barColor}`}
                        style={{ height: `${pct}%` }}
                        title={`${h.hour}:00 — ${h.consumption_kwh.toLocaleString()} kWh (${formatCurrency(h.cost_egp)})`}
                      />
                      {h.hour % 3 === 0 && (
                        <span className="text-[9px] text-text-muted mt-1">
                          {h.hour}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" />
                  <span className="text-[10px] text-text-muted">Operating</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/30" />
                  <span className="text-[10px] text-text-muted">Off-hours</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
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
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-xs font-mono text-custis-gold">
                        {formatCurrency(zone.cost_egp)}
                      </span>
                      <span className="block text-[10px] text-text-muted">
                        {zone.share_pct}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-custis-border/50 rounded-full overflow-hidden">
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
                  <tr className="border-b border-custis-border">
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
                      className={`border-b border-custis-border/50 ${
                        z.status === "inefficient"
                          ? "bg-red-500/5"
                          : "hover:bg-custis-border/10"
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
                      <td className="px-4 py-2.5 text-right font-mono text-custis-gold">
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
                <BarChart3 size={16} className="text-custis-gold" />
                30-Day Consumption Trend
              </h2>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-[1px] h-40">
                {trend.map((d, i) => {
                  const pct =
                    trendMax > 0
                      ? (d.consumption_kwh / trendMax) * 100
                      : 0;
                  const dateObj = new Date(d.date);
                  const isWeekend = [5, 6].includes(dateObj.getDay());

                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                    >
                      <div
                        className={`w-full rounded-t-[1px] transition-all duration-300 min-h-[1px] ${
                          isWeekend ? "bg-amber-500" : "bg-amber-500/60"
                        }`}
                        style={{ height: `${pct}%` }}
                        title={`${d.date}: ${formatNumber(d.consumption_kwh)} kWh (${formatCurrency(d.cost_egp)})`}
                      />
                      {(i === 0 ||
                        i === Math.floor(trend.length / 2) ||
                        i === trend.length - 1) && (
                        <span className="text-[8px] text-text-muted mt-1 whitespace-nowrap">
                          {dateObj.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
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
                <Lightbulb size={16} className="text-custis-gold" />
                AI Recommendations
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-lg border border-custis-border/50 hover:border-custis-border transition-colors"
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
