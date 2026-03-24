"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GraduationCap,
  Loader2,
  Play,
  Brain,
  Target,
  BarChart3,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  Clock,
  TrendingUp,
  Zap,
  Wrench,
  Users,
  Eye,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, timeAgo } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface LearningStats {
  total_feedback_received: number;
  params_calibrated: number;
  patterns_discovered: number;
  avg_confidence: number;
  days_of_learning: number;
  top_improvements: Array<{
    entity_name: string;
    param_key: string;
    initial_value: number;
    learned_value: number;
    confidence: number;
  }>;
}

interface LearnedParam {
  id: string;
  param_type: string;
  entity_id: string | null;
  entity_name: string | null;
  param_key: string;
  initial_value: number;
  learned_value: number;
  confidence: number;
  sample_count: number;
  last_updated: string;
}

interface AIPattern {
  id: string;
  pattern_type: string;
  title: string;
  description: string;
  confidence: number;
  impact_estimate: string | null;
  data_points: number;
  first_detected: string;
  last_confirmed: string;
  status: string;
}

interface LearningCycle {
  id: string;
  cycle_date: string;
  params_updated: number;
  patterns_found: number;
  patterns_confirmed: number;
  confidence_improvements: Array<{
    param: string;
    entity: string;
    old_confidence: number;
    new_confidence: number;
  }>;
  summary: string;
  duration_ms: number;
  created_at: string;
}

interface FeedbackEntry {
  id: string;
  decision_id: string;
  feedback_type: string;
  reason: string | null;
  created_at: string;
  ai_decisions: {
    type: string;
    category: string;
    recommendation: string;
  } | null;
}

interface LearningData {
  stats: LearningStats;
  history: LearningCycle[];
  patterns: AIPattern[];
  params: LearnedParam[];
  feedback: FeedbackEntry[];
}

// ── Confidence Bar Component ────────────────────────────────

function ConfidenceBar({
  value,
  size = "md",
}: {
  value: number;
  size?: "sm" | "md";
}) {
  const color =
    value >= 70
      ? "bg-emerald-500"
      : value >= 30
        ? "bg-amber-500"
        : "bg-red-500";
  const height = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={`w-full ${height} bg-wedja-border rounded-full overflow-hidden`}>
      <div
        className={`${height} rounded-full ${color} transition-all duration-700`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

// ── Pattern Type Config ─────────────────────────────────────

const patternTypeConfig: Record<
  string,
  { label: string; badge: "info" | "warning" | "success" | "gold" | "error"; icon: typeof Eye }
> = {
  weekly: { label: "Weekly", badge: "info", icon: BarChart3 },
  seasonal: { label: "Seasonal", badge: "gold", icon: TrendingUp },
  footfall_trend: { label: "Footfall", badge: "info", icon: Users },
  energy_waste: { label: "Energy", badge: "warning", icon: Zap },
  maintenance_cycle: { label: "Maintenance", badge: "error", icon: Wrench },
  tenant_behavior: { label: "Tenant", badge: "success", icon: Eye },
};

// ── Pulsing Indicator ───────────────────────────────────────

function PulsingDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wedja-accent opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-wedja-accent" />
    </span>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function LearningPage() {
  const [data, setData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [expandedCycles, setExpandedCycles] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/learning");
      if (!res.ok) throw new Error("Failed to fetch learning data");
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRunCycle() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/v1/ai/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_cycle" }),
      });
      const d = await res.json();
      if (d.success) {
        setRunResult(d.result.summary);
        await fetchData();
      } else {
        setRunResult("Cycle failed: " + (d.error || "Unknown error"));
      }
    } catch (err) {
      setRunResult("Error running cycle");
    } finally {
      setRunning(false);
    }
  }

  async function handleDismissPattern(patternId: string) {
    try {
      await fetch("/api/v1/ai/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_pattern", pattern_id: patternId }),
      });
      await fetchData();
    } catch {
      // Silently fail
    }
  }

  function toggleCycle(id: string) {
    setExpandedCycles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error text-sm">{error || "Failed to load"}</p>
      </div>
    );
  }

  const { stats, history, patterns, params, feedback } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── A. Learning Status Header ──────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <GraduationCap size={28} className="text-wedja-accent" />
            Learning Engine
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <PulsingDot />
            <p className="text-sm text-text-muted">
              Wedja is learning
              {stats.days_of_learning > 0 && (
                <span className="text-text-secondary">
                  {" "}
                  — {stats.days_of_learning} day
                  {stats.days_of_learning !== 1 ? "s" : ""} of intelligence
                </span>
              )}
            </p>
          </div>
        </div>

        <Button
          onClick={handleRunCycle}
          disabled={running}
          variant="primary"
          size="md"
        >
          {running ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          {running ? "Learning..." : "Run Learning Cycle"}
        </Button>
      </div>

      {/* Run result toast */}
      {runResult && (
        <div className="p-4 rounded-lg bg-wedja-accent-muted border border-wedja-accent/30 text-sm text-text-primary flex items-start gap-3">
          <Brain size={18} className="text-wedja-accent mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-wedja-accent mb-1">Learning cycle complete</p>
            <p className="text-text-secondary">{runResult}</p>
          </div>
          <button
            onClick={() => setRunResult(null)}
            className="text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── B. Learning Stats (4 cards) ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Parameters Calibrated"
          value={stats.params_calibrated}
          icon={<Target size={18} className="text-wedja-accent" />}
          detail="Conversion rates, baselines"
        />
        <StatCard
          label="Patterns Discovered"
          value={stats.patterns_discovered}
          icon={<Brain size={18} className="text-emerald-500" />}
          detail="Active and confirmed"
        />
        <StatCard
          label="Average Confidence"
          value={`${stats.avg_confidence}%`}
          icon={<BarChart3 size={18} className="text-amber-500" />}
          detail="Across all parameters"
          bar={stats.avg_confidence}
        />
        <StatCard
          label="Feedback Received"
          value={stats.total_feedback_received}
          icon={<MessageSquare size={18} className="text-blue-500" />}
          detail="Human corrections"
        />
      </div>

      {/* ── Charts ─────────────────────────────────────────── */}
      {(history.length > 0 || patterns.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Learning Progress Area Chart */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Learning Progress
              </h3>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={[...history].reverse().map((c) => ({
                      date: formatDate(c.cycle_date),
                      params: c.params_updated,
                      patterns: c.patterns_found,
                    }))}
                    margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="learnGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="patternGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6B7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #1F2937",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#F9FAFB" }}
                      formatter={(value: any, name: any) => [
                        value,
                        name === "params" ? "Params Updated" : "Patterns Found",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="params"
                      stroke="#4F46E5"
                      strokeWidth={2}
                      fill="url(#learnGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="patterns"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#patternGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[260px] text-sm text-text-muted">
                  No learning cycles yet.
                </div>
              )}
              {history.length > 0 && (
                <div className="flex items-center justify-center gap-6 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#4F46E5" }} />
                    <span className="text-xs text-text-secondary">Params Updated</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#10B981" }} />
                    <span className="text-xs text-text-secondary">Patterns Found</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Patterns Discovered by Type */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Patterns by Type
              </h3>
            </CardHeader>
            <CardContent>
              {patterns.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={(() => {
                      const typeCounts: Record<string, number> = {};
                      patterns.forEach((p) => {
                        const cfg = patternTypeConfig[p.pattern_type];
                        const label = cfg ? cfg.label : p.pattern_type;
                        typeCounts[label] = (typeCounts[label] || 0) + 1;
                      });
                      return Object.entries(typeCounts).map(([type, count]) => ({
                        name: type,
                        count,
                      }));
                    })()}
                    margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6B7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #1F2937",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#F9FAFB" }}
                      itemStyle={{ color: "#A5B4FC" }}
                      formatter={(value: any) => [value, "Patterns"]}
                    />
                    <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[260px] text-sm text-text-muted">
                  No patterns discovered yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── C. Calibrated Parameters ───────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Target size={16} className="text-wedja-accent" />
            Calibrated Parameters
          </h2>
          <span className="text-xs text-text-muted">
            {params.length} parameter{params.length !== 1 ? "s" : ""}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {params.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No parameters calibrated yet. Run a learning cycle to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Parameter
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Initial
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Learned
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider w-36">
                      Confidence
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                      Samples
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((p) => {
                    const change = p.initial_value !== 0
                      ? ((p.learned_value - p.initial_value) / p.initial_value) * 100
                      : 0;
                    const isSignificant = Math.abs(change) > 10;
                    const isConversion = p.param_key === "conversion_rate";

                    return (
                      <tr
                        key={p.id}
                        className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                      >
                        <td className="px-5 py-3">
                          <span className="text-text-primary font-medium">
                            {p.entity_name || "General"}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {p.param_type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-text-secondary">
                          {formatParamKey(p.param_key)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-text-muted">
                          {isConversion
                            ? `${(p.initial_value * 100).toFixed(1)}%`
                            : p.initial_value.toFixed(1)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`font-mono font-medium ${
                              isSignificant ? "text-wedja-accent" : "text-text-primary"
                            }`}
                          >
                            {isConversion
                              ? `${(p.learned_value * 100).toFixed(1)}%`
                              : p.learned_value.toFixed(1)}
                          </span>
                          {isSignificant && (
                            <span
                              className={`block text-xs ${
                                change > 0 ? "text-emerald-500" : "text-red-500"
                              }`}
                            >
                              {change > 0 ? "+" : ""}
                              {change.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <ConfidenceBar value={p.confidence} size="sm" />
                            <span className="text-xs font-mono text-text-muted w-10 text-right">
                              {p.confidence}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-text-muted hidden md:table-cell">
                          {p.sample_count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Insight callout for interesting findings */}
          {params.some(
            (p) =>
              p.param_key === "conversion_rate" &&
              Math.abs(
                ((p.learned_value - p.initial_value) / p.initial_value) * 100
              ) > 10
          ) && (
            <div className="mx-5 mb-4 mt-2 p-3 rounded-lg bg-wedja-accent-muted border border-wedja-accent/20">
              <p className="text-xs text-text-secondary">
                <span className="text-wedja-accent font-medium">AI Insight:</span>{" "}
                {(() => {
                  const notable = params.find(
                    (p) =>
                      p.param_key === "conversion_rate" &&
                      Math.abs(
                        ((p.learned_value - p.initial_value) / p.initial_value) *
                          100
                      ) > 10
                  );
                  if (!notable) return "";
                  return `The AI is learning that ${notable.entity_name} converts at ${(notable.learned_value * 100).toFixed(0)}%, not the default ${(notable.initial_value * 100).toFixed(0)}%. Revenue estimates are now more accurate for this tenant.`;
                })()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── D. Discovered Patterns ─────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Brain size={16} className="text-emerald-500" />
            Discovered Patterns
          </h2>
          <span className="text-xs text-text-muted">
            {patterns.length} active
          </span>
        </CardHeader>
        <CardContent>
          {patterns.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No patterns discovered yet. The AI needs more data to find patterns.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {patterns.map((pattern) => {
                const config = patternTypeConfig[pattern.pattern_type] || {
                  label: pattern.pattern_type,
                  badge: "default" as const,
                  icon: Eye,
                };
                const PatternIcon = config.icon;

                return (
                  <div
                    key={pattern.id}
                    className="p-4 rounded-lg border border-wedja-border/50 bg-wedja-border/5 hover:border-wedja-border transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <PatternIcon
                          size={14}
                          className={
                            pattern.status === "confirmed"
                              ? "text-emerald-500"
                              : "text-text-muted"
                          }
                        />
                        <Badge variant={config.badge}>{config.label}</Badge>
                        {pattern.status === "confirmed" && (
                          <Badge variant="success">Confirmed</Badge>
                        )}
                      </div>
                      <button
                        onClick={() => handleDismissPattern(pattern.id)}
                        className="text-text-muted hover:text-red-500 transition-colors p-1"
                        title="Dismiss pattern (teaches the AI it was wrong)"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <h3 className="text-sm font-medium text-text-primary mb-1">
                      {pattern.title}
                    </h3>
                    <p className="text-xs text-text-muted mb-3 leading-relaxed">
                      {pattern.description}
                    </p>

                    {/* Confidence bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                        <span>Confidence</span>
                        <span className="font-mono">{pattern.confidence}%</span>
                      </div>
                      <ConfidenceBar value={pattern.confidence} />
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>{pattern.data_points} data points</span>
                      <span>
                        Detected {timeAgo(pattern.first_detected)}
                      </span>
                    </div>
                    {pattern.impact_estimate && (
                      <p className="text-[11px] text-wedja-accent mt-1 font-medium">
                        {pattern.impact_estimate}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── E. Learning Timeline ───────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Clock size={16} className="text-wedja-accent" />
            Learning Timeline
          </h2>
          <span className="text-xs text-text-muted">
            Last {history.length} cycle{history.length !== 1 ? "s" : ""}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No learning cycles yet. Click &ldquo;Run Learning Cycle&rdquo; to
              start.
            </div>
          ) : (
            <div className="divide-y divide-wedja-border/50">
              {history.map((cycle) => {
                const isExpanded = expandedCycles.has(cycle.id);
                const hasImprovements =
                  cycle.confidence_improvements &&
                  cycle.confidence_improvements.length > 0;

                return (
                  <div key={cycle.id} className="px-5 py-3">
                    <button
                      onClick={() => toggleCycle(cycle.id)}
                      className="w-full flex items-center justify-between text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-lg bg-wedja-accent-muted shrink-0">
                          <Brain size={14} className="text-wedja-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary font-medium truncate">
                            {formatDate(cycle.cycle_date)}
                          </p>
                          <p className="text-xs text-text-muted truncate">
                            {cycle.summary}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <div className="hidden sm:flex items-center gap-3 text-xs text-text-muted">
                          {cycle.params_updated > 0 && (
                            <span>
                              <span className="font-mono text-wedja-accent">
                                {cycle.params_updated}
                              </span>{" "}
                              params
                            </span>
                          )}
                          {cycle.patterns_found > 0 && (
                            <span>
                              <span className="font-mono text-emerald-500">
                                {cycle.patterns_found}
                              </span>{" "}
                              patterns
                            </span>
                          )}
                          <span className="font-mono">
                            {cycle.duration_ms}ms
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown
                            size={16}
                            className="text-text-muted group-hover:text-text-primary"
                          />
                        ) : (
                          <ChevronRight
                            size={16}
                            className="text-text-muted group-hover:text-text-primary"
                          />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 ml-10 space-y-2">
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div className="p-2 rounded bg-wedja-border/20">
                            <span className="text-text-muted block">
                              Params Updated
                            </span>
                            <span className="font-mono text-text-primary">
                              {cycle.params_updated}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-wedja-border/20">
                            <span className="text-text-muted block">
                              Patterns Found
                            </span>
                            <span className="font-mono text-text-primary">
                              {cycle.patterns_found}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-wedja-border/20">
                            <span className="text-text-muted block">
                              Confirmed
                            </span>
                            <span className="font-mono text-text-primary">
                              {cycle.patterns_confirmed}
                            </span>
                          </div>
                        </div>

                        {hasImprovements && (
                          <div className="space-y-1">
                            <p className="text-xs text-text-muted font-medium">
                              Confidence Improvements:
                            </p>
                            {cycle.confidence_improvements.map((imp, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-xs"
                              >
                                <TrendingUp
                                  size={12}
                                  className="text-emerald-500"
                                />
                                <span className="text-text-secondary">
                                  {imp.entity}
                                </span>
                                <span className="text-text-muted">
                                  {imp.old_confidence}%
                                </span>
                                <span className="text-text-muted">&rarr;</span>
                                <span className="text-wedja-accent font-mono">
                                  {imp.new_confidence}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── F. Feedback History ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-500" />
            Feedback History
          </h2>
          <span className="text-xs text-text-muted">
            This is how humans teach the AI
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {feedback.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No feedback recorded yet. Approve, modify, or reject AI decisions
              to teach Wedja.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Decision
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Action
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((f) => {
                    const badgeVariant =
                      f.feedback_type === "approve"
                        ? "success"
                        : f.feedback_type === "reject"
                          ? "error"
                          : "warning";

                    return (
                      <tr
                        key={f.id}
                        className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                      >
                        <td className="px-5 py-3 text-text-muted text-xs whitespace-nowrap">
                          {timeAgo(f.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-text-primary text-xs">
                            {f.ai_decisions?.recommendation ||
                              f.ai_decisions?.type ||
                              "AI Decision"}
                          </span>
                          {f.ai_decisions?.category && (
                            <span className="block text-[11px] text-text-muted">
                              {f.ai_decisions.category}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={badgeVariant as any}>
                            {f.feedback_type}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-text-muted text-xs hidden md:table-cell max-w-xs truncate">
                          {f.reason || "--"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat Card Component ─────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  detail,
  bar,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  detail: string;
  bar?: number;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          {icon}
          <span className="text-2xl font-bold font-mono text-text-primary">
            {value}
          </span>
        </div>
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <p className="text-[11px] text-text-muted mt-0.5">{detail}</p>
        {bar !== undefined && (
          <div className="mt-2">
            <ConfidenceBar value={bar} size="sm" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function formatParamKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
