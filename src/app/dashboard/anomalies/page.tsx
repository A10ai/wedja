"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  AlertOctagon,
  Loader2,
  RefreshCw,
  Shield,
  Target,
  Activity,
  Zap,
  Users,
  DollarSign,
  Wrench,
  Car,
  ShoppingCart,
  Link2,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronDown,
  Radar,
  Ban,
  ArrowRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatNumber,
  formatPercentage,
  timeAgo,
} from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface Anomaly {
  id: string;
  anomaly_type: string;
  severity: string;
  zone_id: string | null;
  unit_id: string | null;
  tenant_id: string | null;
  title: string;
  description: string;
  expected_value: number | null;
  actual_value: number | null;
  deviation_pct: number | null;
  impact_egp: number | null;
  data_source: string | null;
  related_anomalies: string[] | null;
  status: string;
  auto_detected: boolean;
  detection_confidence: number;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  zone_name?: string;
  zone_type?: string;
  tenant_name?: string;
  unit_number?: string;
}

interface AnomalyStats {
  active_count: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
  avg_detection_confidence: number;
  false_alarm_rate: number;
  total_resolved: number;
  total_false_alarms: number;
  most_anomalous_zone: { zone_name: string; count: number } | null;
  most_common_type: { type: string; count: number } | null;
  total_impact_egp: number;
  correlation_patterns: Array<{ types: string[]; count: number }>;
}

// ── Config ──────────────────────────────────────────────────

const severityConfig: Record<
  string,
  {
    badge: "error" | "warning" | "gold" | "default";
    bg: string;
    border: string;
    pulse: boolean;
    label: string;
  }
> = {
  critical: {
    badge: "error",
    bg: "bg-red-500/8",
    border: "border-l-red-500",
    pulse: true,
    label: "CRITICAL",
  },
  high: {
    badge: "error",
    bg: "bg-orange-500/5",
    border: "border-l-orange-500",
    pulse: false,
    label: "HIGH",
  },
  medium: {
    badge: "warning",
    bg: "bg-amber-500/5",
    border: "border-l-amber-500",
    pulse: false,
    label: "MEDIUM",
  },
  low: {
    badge: "default",
    bg: "bg-gray-500/5",
    border: "border-l-gray-500",
    pulse: false,
    label: "LOW",
  },
};

const typeConfig: Record<
  string,
  { icon: any; color: string; label: string }
> = {
  footfall_spike: { icon: TrendingUp, color: "bg-blue-500/15 text-blue-400", label: "Footfall Spike" },
  footfall_drop: { icon: TrendingDown, color: "bg-blue-500/15 text-blue-400", label: "Footfall Drop" },
  energy_spike: { icon: Zap, color: "bg-yellow-500/15 text-yellow-400", label: "Energy Spike" },
  energy_drop: { icon: Zap, color: "bg-yellow-500/15 text-yellow-400", label: "Energy Drop" },
  revenue_anomaly: { icon: DollarSign, color: "bg-emerald-500/15 text-emerald-400", label: "Revenue" },
  rent_delay_pattern: { icon: DollarSign, color: "bg-red-500/15 text-red-400", label: "Rent Delay" },
  queue_anomaly: { icon: ShoppingCart, color: "bg-purple-500/15 text-purple-400", label: "Queue" },
  parking_anomaly: { icon: Car, color: "bg-cyan-500/15 text-cyan-400", label: "Parking" },
  security_pattern: { icon: Shield, color: "bg-violet-500/15 text-violet-400", label: "Security" },
  maintenance_pattern: { icon: Wrench, color: "bg-orange-500/15 text-orange-400", label: "Maintenance" },
  conversion_anomaly: { icon: Target, color: "bg-pink-500/15 text-pink-400", label: "Conversion" },
  occupancy_anomaly: { icon: Users, color: "bg-indigo-500/15 text-indigo-400", label: "Occupancy" },
  correlation_break: { icon: Link2, color: "bg-red-500/15 text-red-400", label: "Correlation" },
};

// ── Severity sort order ─────────────────────────────────────
const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ── Components ──────────────────────────────────────────────

function SeverityMiniBar({ bySeverity }: { bySeverity: Record<string, number> }) {
  const total = Object.values(bySeverity).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const segments = [
    { key: "critical", color: "bg-red-500", count: bySeverity.critical || 0 },
    { key: "high", color: "bg-orange-500", count: bySeverity.high || 0 },
    { key: "medium", color: "bg-amber-500", count: bySeverity.medium || 0 },
    { key: "low", color: "bg-gray-500", count: bySeverity.low || 0 },
  ];

  return (
    <div className="flex items-center gap-0.5 h-2 w-full rounded-full overflow-hidden bg-wedja-border/30">
      {segments.map(
        (seg) =>
          seg.count > 0 && (
            <div
              key={seg.key}
              className={`h-full ${seg.color} transition-all duration-500`}
              style={{ width: `${(seg.count / total) * 100}%` }}
              title={`${seg.count} ${seg.key}`}
            />
          )
      )}
    </div>
  );
}

function DeviationBar({ deviation }: { deviation: number | null }) {
  if (deviation === null) return null;
  const abs = Math.min(Math.abs(deviation), 100);
  const isNegative = deviation < 0;

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[10px] text-text-muted w-14 text-right font-mono">
        {deviation > 0 ? "+" : ""}
        {deviation.toFixed(1)}%
      </span>
      <div className="flex-1 h-1.5 bg-wedja-border/30 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-wedja-border/50" />
        {isNegative ? (
          <div
            className="absolute inset-y-0 bg-red-500/70 rounded-full"
            style={{
              right: "50%",
              width: `${abs / 2}%`,
            }}
          />
        ) : (
          <div
            className="absolute inset-y-0 bg-emerald-500/70 rounded-full"
            style={{
              left: "50%",
              width: `${abs / 2}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 85 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-wedja-border/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-text-muted font-mono">{pct}%</span>
    </div>
  );
}

function AnomalyCard({
  anomaly,
  allAnomalies,
  onAcknowledge,
  onResolve,
  onFalseAlarm,
}: {
  anomaly: Anomaly;
  allAnomalies: Anomaly[];
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onFalseAlarm: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = severityConfig[anomaly.severity] || severityConfig.low;
  const typ = typeConfig[anomaly.anomaly_type] || typeConfig.correlation_break;
  const TypeIcon = typ.icon;

  const relatedAnomalies = (anomaly.related_anomalies || [])
    .map((rid) => allAnomalies.find((a) => a.id === rid))
    .filter(Boolean) as Anomaly[];

  return (
    <div
      className={`border-l-4 ${sev.border} ${sev.bg} hover:bg-wedja-border/10 transition-colors`}
    >
      <div
        className="px-5 py-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => e.key === "Enter" && setExpanded(!expanded)}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {sev.pulse ? (
                <span className="relative inline-flex">
                  <Badge variant={sev.badge}>{sev.label}</Badge>
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                </span>
              ) : (
                <Badge variant={sev.badge}>{sev.label}</Badge>
              )}
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${typ.color}`}
              >
                <TypeIcon size={9} />
                {typ.label}
              </span>
              {anomaly.zone_name && (
                <span className="text-[9px] text-text-muted bg-wedja-border/30 px-1.5 py-0.5 rounded">
                  {anomaly.zone_name}
                </span>
              )}
              {anomaly.tenant_name && (
                <span className="text-[9px] text-wedja-accent bg-wedja-accent-muted px-1.5 py-0.5 rounded">
                  {anomaly.tenant_name}
                </span>
              )}
              {anomaly.status === "acknowledged" && (
                <span className="text-[9px] text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">
                  Acknowledged
                </span>
              )}
              {relatedAnomalies.length > 0 && (
                <span className="text-[9px] text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Link2 size={8} />
                  {relatedAnomalies.length} linked
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-text-primary leading-snug">
              {anomaly.title}
            </h3>

            {/* Time */}
            <p className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
              <Clock size={9} />
              {timeAgo(anomaly.created_at)}
              {anomaly.data_source && (
                <>
                  <span className="mx-1">|</span>
                  <span>Source: {anomaly.data_source}</span>
                </>
              )}
            </p>
          </div>

          {/* Right side: impact + confidence */}
          <div className="text-right shrink-0 space-y-1.5 min-w-[110px]">
            {anomaly.impact_egp != null && anomaly.impact_egp > 0 && (
              <p className="text-sm font-bold font-mono text-wedja-accent">
                {formatCurrency(anomaly.impact_egp)}
              </p>
            )}
            <div className="flex items-center justify-end gap-1">
              <span className="text-[9px] text-text-muted">AI confidence</span>
            </div>
            <ConfidenceBar confidence={anomaly.detection_confidence} />
            <div className="pt-0.5">
              {expanded ? (
                <ChevronDown size={12} className="text-text-muted ml-auto" />
              ) : (
                <ChevronRight size={12} className="text-text-muted ml-auto" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-wedja-border/30 pt-3">
          {/* Description */}
          <p className="text-xs text-text-secondary leading-relaxed">
            {anomaly.description}
          </p>

          {/* Expected vs Actual */}
          {anomaly.expected_value != null && anomaly.actual_value != null && (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Expected:</span>
                <span className="font-mono font-medium text-text-primary">
                  {formatNumber(anomaly.expected_value)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Actual:</span>
                <span
                  className={`font-mono font-medium ${
                    anomaly.deviation_pct && anomaly.deviation_pct < 0
                      ? "text-red-400"
                      : anomaly.deviation_pct && anomaly.deviation_pct > 0
                      ? "text-emerald-400"
                      : "text-text-primary"
                  }`}
                >
                  {formatNumber(anomaly.actual_value)}
                </span>
              </div>
            </div>
          )}

          {/* Deviation bar */}
          <DeviationBar deviation={anomaly.deviation_pct} />

          {/* Related anomalies */}
          {relatedAnomalies.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1">
                <Link2 size={10} className="text-purple-400" />
                Correlated Anomalies
              </p>
              {relatedAnomalies.map((related) => {
                const relType = typeConfig[related.anomaly_type] || typeConfig.correlation_break;
                const RelIcon = relType.icon;
                return (
                  <div
                    key={related.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-purple-500/5 border border-purple-500/10"
                  >
                    <RelIcon size={11} className="text-purple-400 shrink-0" />
                    <span className="text-[11px] text-text-secondary truncate">
                      {related.title}
                    </span>
                    <ArrowRight size={9} className="text-purple-400 shrink-0 ml-auto" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {anomaly.status === "active" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge(anomaly.id);
                }}
              >
                <Eye size={12} />
                Acknowledge
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onResolve(anomaly.id);
              }}
            >
              <CheckCircle2 size={12} />
              Resolve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onFalseAlarm(anomaly.id);
              }}
            >
              <Ban size={12} />
              False Alarm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryCard({ anomaly }: { anomaly: Anomaly }) {
  const sev = severityConfig[anomaly.severity] || severityConfig.low;
  const typ = typeConfig[anomaly.anomaly_type] || typeConfig.correlation_break;
  const TypeIcon = typ.icon;
  const isFalseAlarm = anomaly.status === "false_alarm";

  return (
    <div className="px-5 py-3 flex items-center gap-4 hover:bg-wedja-border/5 transition-colors">
      <div className={`p-1.5 rounded-lg ${isFalseAlarm ? "bg-gray-500/10" : "bg-emerald-500/10"}`}>
        {isFalseAlarm ? (
          <XCircle size={14} className="text-gray-400" />
        ) : (
          <CheckCircle2 size={14} className="text-emerald-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${typ.color}`}
          >
            <TypeIcon size={8} />
            {typ.label}
          </span>
          <Badge variant={isFalseAlarm ? "default" : "success"}>
            {isFalseAlarm ? "False Alarm" : "Resolved"}
          </Badge>
        </div>
        <p className="text-xs text-text-primary truncate">{anomaly.title}</p>
        {anomaly.resolution_notes && (
          <p className="text-[10px] text-text-muted mt-0.5 truncate">
            {anomaly.resolution_notes}
          </p>
        )}
      </div>
      <div className="text-right shrink-0 text-[10px] text-text-muted">
        <p>{timeAgo(anomaly.created_at)}</p>
        {anomaly.resolved_at && (
          <p className="text-emerald-400">
            Resolved {timeAgo(anomaly.resolved_at)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Anomaly Zone Map (mini SVG) ─────────────────────────────

function AnomalyZoneMap({
  anomalies,
  onZoneClick,
  activeZoneFilter,
}: {
  anomalies: Anomaly[];
  onZoneClick: (zoneName: string | null) => void;
  activeZoneFilter: string | null;
}) {
  // Group anomalies by zone
  const zoneAnomalies: Record<string, { count: number; maxSeverity: string }> = {};
  anomalies.forEach((a) => {
    const name = a.zone_name || "Unknown";
    if (!zoneAnomalies[name]) zoneAnomalies[name] = { count: 0, maxSeverity: "low" };
    zoneAnomalies[name].count += 1;
    if (severityOrder[a.severity] < severityOrder[zoneAnomalies[name].maxSeverity]) {
      zoneAnomalies[name].maxSeverity = a.severity;
    }
  });

  const zoneNames = Object.keys(zoneAnomalies);
  if (zoneNames.length === 0) return null;

  const zoneColors: Record<string, string> = {
    critical: "#EF4444",
    high: "#F97316",
    medium: "#F59E0B",
    low: "#6B7280",
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Radar size={16} className="text-wedja-accent" />
          Anomaly Map
        </h2>
        {activeZoneFilter && (
          <button
            onClick={() => onZoneClick(null)}
            className="text-[10px] text-wedja-accent hover:underline"
          >
            Clear filter
          </button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {zoneNames.map((name) => {
            const zone = zoneAnomalies[name];
            const color = zoneColors[zone.maxSeverity] || zoneColors.low;
            const isActive = activeZoneFilter === name;
            const isCritical = zone.maxSeverity === "critical";

            return (
              <button
                key={name}
                onClick={() => onZoneClick(isActive ? null : name)}
                className={`relative p-2.5 rounded-lg border text-left transition-all ${
                  isActive
                    ? "border-wedja-accent bg-wedja-accent-muted"
                    : "border-wedja-border/50 hover:border-wedja-border bg-wedja-border/10"
                }`}
              >
                {isCritical && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-2 w-2"
                      style={{ backgroundColor: color }}
                    />
                  </span>
                )}
                <p className="text-[10px] text-text-muted truncate">{name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-bold font-mono text-text-primary">
                    {zone.count}
                  </span>
                  <span className="text-[9px] text-text-muted">
                    anomal{zone.count === 1 ? "y" : "ies"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Correlation Graph ───────────────────────────────────────

function CorrelationGraph({ anomalies }: { anomalies: Anomaly[] }) {
  // Find anomalies with related ones
  const linked = anomalies.filter(
    (a) => a.related_anomalies && a.related_anomalies.length > 0
  );
  if (linked.length === 0) return null;

  // Build chains
  const chains: Anomaly[][] = [];
  const visited = new Set<string>();

  linked.forEach((a) => {
    if (visited.has(a.id)) return;
    const chain: Anomaly[] = [a];
    visited.add(a.id);

    (a.related_anomalies || []).forEach((rid) => {
      if (!visited.has(rid)) {
        const related = anomalies.find((x) => x.id === rid);
        if (related) {
          chain.push(related);
          visited.add(rid);
        }
      }
    });

    if (chain.length > 1) chains.push(chain);
  });

  if (chains.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Link2 size={16} className="text-purple-400" />
          Correlation Graph
        </h2>
        <span className="text-[10px] text-text-muted">
          {chains.length} correlated chain{chains.length > 1 ? "s" : ""}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {chains.map((chain, ci) => (
          <div
            key={ci}
            className="flex items-center gap-2 overflow-x-auto pb-1"
          >
            {chain.map((a, ai) => {
              const typ = typeConfig[a.anomaly_type] || typeConfig.correlation_break;
              const TypeIcon = typ.icon;
              const sev = severityConfig[a.severity] || severityConfig.low;
              return (
                <div key={a.id} className="flex items-center gap-2 shrink-0">
                  {ai > 0 && (
                    <div className="flex items-center gap-0.5">
                      <div className="w-4 h-px bg-purple-500/40" />
                      <ArrowRight size={10} className="text-purple-400" />
                      <div className="w-4 h-px bg-purple-500/40" />
                    </div>
                  )}
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border ${sev.bg} border-wedja-border/50`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <TypeIcon size={10} className="text-text-muted" />
                      <span className="text-[9px] font-medium text-text-muted uppercase">
                        {typ.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-primary max-w-[160px] truncate">
                      {a.title.split(" — ")[0]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Severity Donut Chart ─────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high: "#F97316",
  warning: "#F59E0B",
  medium: "#3B82F6",
  low: "#6B7280",
};

function SeverityDonutChart({ anomalies }: { anomalies: Anomaly[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    anomalies.forEach((a) => {
      counts[a.severity] = (counts[a.severity] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, key: name }))
      .sort((a, b) => (severityOrder[a.key] ?? 99) - (severityOrder[b.key] ?? 99));
  }, [anomalies]);

  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-400" />
          Anomalies by Severity
        </h2>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={SEVERITY_COLORS[entry.key] || "#6B7280"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1F2937",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#F9FAFB",
                }}
                formatter={(value: any) => [`${value} anomalies`, ""]}
              />
              <text
                x="50%"
                y="48%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-text-primary text-2xl font-bold font-mono"
                style={{ fontSize: "24px", fontWeight: 700 }}
              >
                {total}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-text-muted"
                style={{ fontSize: "10px" }}
              >
                total
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {data.map((entry) => (
            <div key={entry.key} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SEVERITY_COLORS[entry.key] || "#6B7280" }}
              />
              {entry.name}: {entry.value}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Anomalies by Type Bar Chart ──────────────────────────────

function AnomalyByTypeChart({ anomalies }: { anomalies: Anomaly[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    anomalies.forEach((a) => {
      counts[a.anomaly_type] = (counts[a.anomaly_type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({
        type,
        label: typeConfig[type]?.label || type,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [anomalies]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Activity size={16} className="text-wedja-accent" />
          Anomalies by Type
        </h2>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "#6B7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={90}
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1F2937",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#F9FAFB",
                }}
                formatter={(value: any) => [`${value}`, "Count"]}
                cursor={{ fill: "rgba(245, 158, 11, 0.08)" }}
              />
              <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function AnomaliesPage() {
  const [activeAnomalies, setActiveAnomalies] = useState<Anomaly[]>([]);
  const [historyAnomalies, setHistoryAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "history">("active");
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeRes, historyRes, statsRes] = await Promise.all([
        fetch("/api/v1/anomalies?type=active"),
        fetch("/api/v1/anomalies?type=history"),
        fetch("/api/v1/anomalies?type=stats"),
      ]);

      if (!activeRes.ok || !historyRes.ok || !statsRes.ok) {
        throw new Error("Failed to fetch anomaly data");
      }

      const [active, history, statsData] = await Promise.all([
        activeRes.json(),
        historyRes.json(),
        statsRes.json(),
      ]);

      setActiveAnomalies(active);
      setHistoryAnomalies(history);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function runDetection() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/v1/anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_detection" }),
      });
      const data = await res.json();
      setScanResult(
        `Scanned ${data.types_checked?.length || 0} systems. Found ${data.new_anomalies || 0} new anomalies.`
      );
      // Refresh data
      await fetchData();
    } catch {
      setScanResult("Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  async function handleAcknowledge(id: string) {
    await fetch("/api/v1/anomalies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", id }),
    });
    await fetchData();
  }

  async function handleResolve(id: string) {
    await fetch("/api/v1/anomalies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", id, notes: "Resolved via dashboard" }),
    });
    await fetchData();
  }

  async function handleFalseAlarm(id: string) {
    await fetch("/api/v1/anomalies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resolve",
        id,
        notes: "Marked as false alarm",
        false_alarm: true,
      }),
    });
    await fetchData();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
        <p className="text-xs text-text-muted">
          Loading anomaly detection systems...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-xs text-wedja-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const criticalCount = stats?.by_severity.critical || 0;

  // Filter active anomalies by zone if filter is set
  const filteredAnomalies = zoneFilter
    ? activeAnomalies.filter((a) => a.zone_name === zoneFilter)
    : activeAnomalies;

  // Sort by severity then recency
  const sortedAnomalies = [...filteredAnomalies].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── A. Critical Alert Banner ── */}
      {criticalCount > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-red-500/30">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-red-500/5 to-red-500/10 animate-pulse" />
          <div className="relative px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <AlertOctagon size={24} className="text-red-500" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-red-400">
                  {criticalCount} critical anomal{criticalCount === 1 ? "y" : "ies"} detected
                </p>
                <p className="text-xs text-red-400/70">
                  Immediate attention required
                </p>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setTab("active");
                setZoneFilter(null);
              }}
            >
              View Critical
            </Button>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-500/20 to-wedja-accent-muted">
              <AlertOctagon size={24} className="text-red-400" />
            </div>
            Anomaly Detection
          </h1>
          <p className="text-xs text-text-muted mt-1">
            AI-powered watchdog monitoring 7 data sources 24/7. Real-time
            anomaly detection with correlation analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-wedja-accent transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── B. Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={13} className="text-wedja-accent" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Active Anomalies
              </span>
            </div>
            <p className="text-2xl font-bold font-mono text-text-primary">
              {stats?.active_count || 0}
            </p>
            <div className="mt-1.5">
              <SeverityMiniBar bySeverity={stats?.by_severity || {}} />
            </div>
            <div className="flex items-center gap-2 mt-1 text-[9px] text-text-muted">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {stats?.by_severity.critical || 0}
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                {stats?.by_severity.high || 0}
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {stats?.by_severity.medium || 0}
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                {stats?.by_severity.low || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={13} className="text-red-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Critical
              </span>
            </div>
            <p
              className={`text-2xl font-bold font-mono ${criticalCount > 0 ? "text-red-400" : "text-text-primary"}`}
            >
              {criticalCount}
            </p>
            {stats?.total_impact_egp ? (
              <p className="text-[10px] text-text-muted mt-1">
                Total impact:{" "}
                <span className="text-wedja-accent font-mono font-medium">
                  {formatCurrency(stats.total_impact_egp)}
                </span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Target size={13} className="text-emerald-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Detection Confidence
              </span>
            </div>
            <p className="text-2xl font-bold font-mono text-text-primary">
              {stats?.avg_detection_confidence
                ? formatPercentage(stats.avg_detection_confidence * 100, 0)
                : "N/A"}
            </p>
            <p className="text-[10px] text-text-muted mt-1">
              Average AI certainty
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={13} className="text-blue-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                False Alarm Rate
              </span>
            </div>
            <p className="text-2xl font-bold font-mono text-text-primary">
              {stats?.false_alarm_rate != null
                ? formatPercentage(stats.false_alarm_rate, 1)
                : "N/A"}
            </p>
            <p className="text-[10px] text-text-muted mt-1">
              {stats?.total_resolved || 0} resolved, {stats?.total_false_alarms || 0}{" "}
              false alarms
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── C. Run Detection Button ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-wedja-accent-muted to-indigo-500/10">
                <Radar size={20} className="text-wedja-accent" />
                {scanning && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wedja-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-wedja-accent" />
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Anomaly Scanner
                </h3>
                <p className="text-xs text-text-muted">
                  {scanning
                    ? "Scanning all 7 detection systems..."
                    : scanResult
                    ? scanResult
                    : "Run a full anomaly scan across footfall, energy, revenue, queues, parking, maintenance, and correlations."}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={runDetection}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Radar size={14} />
                  Run Detection
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── D + E + F: Anomaly Feed + Map + Correlation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main feed */}
        <div className="lg:col-span-8 space-y-4">
          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-wedja-border/20 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab("active")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === "active"
                  ? "bg-wedja-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Active ({activeAnomalies.length})
            </button>
            <button
              onClick={() => setTab("history")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === "history"
                  ? "bg-wedja-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              History ({historyAnomalies.length})
            </button>
          </div>

          {/* Active feed */}
          {tab === "active" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Activity size={16} className="text-red-400" />
                    Active Anomalies
                  </h2>
                  {zoneFilter && (
                    <Badge variant="gold">{zoneFilter}</Badge>
                  )}
                </div>
                <span className="text-xs text-text-muted">
                  {sortedAnomalies.length} anomal
                  {sortedAnomalies.length === 1 ? "y" : "ies"} — sorted by
                  severity
                </span>
              </CardHeader>
              <CardContent className="p-0">
                {sortedAnomalies.length === 0 ? (
                  <div className="py-12 text-center">
                    <Shield size={32} className="mx-auto text-emerald-400 mb-3" />
                    <p className="text-sm text-text-primary font-medium">
                      All clear
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      No active anomalies detected. The property is running
                      normally.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-wedja-border/30">
                    {sortedAnomalies.map((anomaly) => (
                      <AnomalyCard
                        key={anomaly.id}
                        anomaly={anomaly}
                        allAnomalies={activeAnomalies}
                        onAcknowledge={handleAcknowledge}
                        onResolve={handleResolve}
                        onFalseAlarm={handleFalseAlarm}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* History feed */}
          {tab === "history" && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Clock size={16} className="text-text-muted" />
                  Resolved Anomalies
                </h2>
                <span className="text-xs text-text-muted">
                  Last 30 days
                </span>
              </CardHeader>
              <CardContent className="p-0">
                {historyAnomalies.length === 0 ? (
                  <div className="py-8 text-center text-text-muted text-sm">
                    No resolved anomalies in the last 30 days.
                  </div>
                ) : (
                  <div className="divide-y divide-wedja-border/30">
                    {historyAnomalies.map((anomaly) => (
                      <HistoryCard key={anomaly.id} anomaly={anomaly} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: Map + Correlation + Stats */}
        <div className="lg:col-span-4 space-y-4">
          {/* Zone Map */}
          <AnomalyZoneMap
            anomalies={activeAnomalies}
            onZoneClick={setZoneFilter}
            activeZoneFilter={zoneFilter}
          />

          {/* Correlation Graph */}
          <CorrelationGraph anomalies={activeAnomalies} />

          {/* Severity Donut Chart */}
          <SeverityDonutChart anomalies={activeAnomalies} />

          {/* Anomalies by Type Bar Chart */}
          <AnomalyByTypeChart anomalies={activeAnomalies} />

          {/* Most anomalous zone */}
          {stats?.most_anomalous_zone && (
            <Card>
              <CardContent className="py-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1">
                  Most Anomalous Zone
                </p>
                <p className="text-sm font-semibold text-text-primary">
                  {stats.most_anomalous_zone.zone_name}
                </p>
                <p className="text-xs text-text-muted">
                  {stats.most_anomalous_zone.count} active anomalies
                </p>
              </CardContent>
            </Card>
          )}

          {/* Most common type */}
          {stats?.most_common_type && (
            <Card>
              <CardContent className="py-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1">
                  Most Common Type
                </p>
                <div className="flex items-center gap-2">
                  {(() => {
                    const t = typeConfig[stats.most_common_type!.type] || typeConfig.correlation_break;
                    const TIcon = t.icon;
                    return (
                      <>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${t.color}`}>
                          <TIcon size={9} />
                          {t.label}
                        </span>
                        <span className="text-xs text-text-muted">
                          {stats.most_common_type!.count} occurrences
                        </span>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Correlation patterns */}
          {stats?.correlation_patterns && stats.correlation_patterns.length > 0 && (
            <Card>
              <CardContent className="py-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-2">
                  Co-occurring Patterns
                </p>
                <div className="space-y-1.5">
                  {stats.correlation_patterns.slice(0, 5).map((pattern, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[10px] text-text-secondary"
                    >
                      <Link2 size={9} className="text-purple-400 shrink-0" />
                      <span>
                        {pattern.types.map((t) => {
                          const cfg = typeConfig[t];
                          return cfg ? cfg.label : t;
                        }).join(" + ")}
                      </span>
                      <span className="text-text-muted ml-auto">
                        {pattern.count}x
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
