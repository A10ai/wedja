"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  ShieldAlert,
  TrendingUp,
  DollarSign,
  Building2,
  Wrench,
  Megaphone,
  Users,
  BoltIcon,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface BrainConfig {
  mode: "supervised" | "autonomous";
  enabled: boolean;
  interval_minutes: number;
  last_cycle: string | null;
  total_cycles: number;
  total_decisions: number;
  total_executed: number;
}

interface BrainDecision {
  id: string;
  cycle_id: string;
  category: string;
  action: string;
  reasoning: string;
  confidence: number;
  impact_estimate: string | null;
  auto_executable: boolean;
  executed: boolean;
  approved: boolean | null;
  mode: string;
  event_type: string | null;
  summary: string | null;
  created_at: string;
}

interface BrainCycle {
  cycle_id: string;
  timestamp: string | null;
  summary: string | null;
  decision_count: number;
  decisions: BrainDecision[];
}

interface CycleResult {
  cycle_id: string;
  timestamp: string;
  decisions: BrainDecision[];
  summary: string;
  source: "claude" | "rules";
  duration_ms: number;
}

// ── Category config ─────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ElementType }
> = {
  revenue: {
    label: "Revenue",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    icon: DollarSign,
  },
  leasing: {
    label: "Leasing",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    icon: Building2,
  },
  operations: {
    label: "Operations",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    icon: BarChart3,
  },
  energy: {
    label: "Energy",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    icon: BoltIcon,
  },
  tenant: {
    label: "Tenant",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    icon: Users,
  },
  marketing: {
    label: "Marketing",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    icon: Megaphone,
  },
  maintenance: {
    label: "Maintenance",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    icon: Wrench,
  },
};

function getCategoryConfig(category: string) {
  return (
    CATEGORY_CONFIG[category] || {
      label: category,
      color: "text-text-secondary",
      bg: "bg-text-muted/10",
      border: "border-text-muted/20",
      icon: BarChart3,
    }
  );
}

// ── Confidence bar ──────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 75
      ? "bg-green-500"
      : value >= 50
        ? "bg-amber-500"
        : "bg-red-500";
  const textColor =
    value >= 75
      ? "text-green-400"
      : value >= 50
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-wedja-border rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className={cn("text-xs font-mono font-medium", textColor)}>
        {value}%
      </span>
    </div>
  );
}

// ── Decision Card ───────────────────────────────────────────

function DecisionCard({
  decision,
  onApprove,
  onReject,
  actioning,
}: {
  decision: BrainDecision;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  actioning: string | null;
}) {
  const cat = getCategoryConfig(decision.category);
  const CatIcon = cat.icon;
  const isActioning = actioning === decision.id;

  return (
    <div className="p-4 rounded-xl bg-wedja-card border border-wedja-border hover:border-indigo-500/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              cat.bg,
              cat.border,
              cat.color,
              "border"
            )}
          >
            <CatIcon className="w-3 h-3" />
            {cat.label}
          </span>
          {decision.auto_executable && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Zap className="w-3 h-3" />
              Auto
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {decision.approved === true && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              Approved
            </span>
          )}
          {decision.approved === false && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <XCircle className="w-3.5 h-3.5" />
              Rejected
            </span>
          )}
          {decision.executed && (
            <span className="flex items-center gap-1 text-xs text-indigo-400">
              <Zap className="w-3.5 h-3.5" />
              Executed
            </span>
          )}
        </div>
      </div>

      <p className="text-sm font-medium text-text-primary mb-2">
        {decision.action}
      </p>
      <p className="text-xs text-text-secondary mb-3">{decision.reasoning}</p>

      <div className="space-y-2">
        <ConfidenceBar value={decision.confidence} />
        {decision.impact_estimate && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400 font-medium">
              {decision.impact_estimate}
            </span>
          </div>
        )}
      </div>

      {decision.approved === null && decision.mode === "supervised" && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-wedja-border">
          <Button
            size="sm"
            onClick={() => onApprove(decision.id)}
            disabled={isActioning}
            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5"
          >
            {isActioning ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-3 h-3 mr-1" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onReject(decision.id)}
            disabled={isActioning}
            className="text-xs px-3 py-1.5"
          >
            {isActioning ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <XCircle className="w-3 h-3 mr-1" />
            )}
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function BrainPage() {
  const [config, setConfig] = useState<BrainConfig | null>(null);
  const [decisions, setDecisions] = useState<BrainDecision[]>([]);
  const [cycles, setCycles] = useState<BrainCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CycleResult | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/brain");
      const json = await res.json();
      if (json.data) {
        setConfig(json.data.config);
        setDecisions(json.data.recent_decisions || []);
        setCycles(json.data.cycles || []);
      }
    } catch {
      /* network error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runCycle = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_cycle" }),
      });
      const json = await res.json();
      if (json.data) {
        setLastResult(json.data);
      }
      await fetchData();
    } catch {
      /* network error */
    } finally {
      setRunning(false);
    }
  };

  const toggleMode = async () => {
    if (!config) return;
    const newMode =
      config.mode === "supervised" ? "autonomous" : "supervised";
    try {
      const res = await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", mode: newMode }),
      });
      const json = await res.json();
      if (json.data?.config) setConfig(json.data.config);
    } catch {
      /* network error */
    }
  };

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", decision_id: id }),
      });
      await fetchData();
    } catch {
      /* network error */
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    try {
      await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", decision_id: id }),
      });
      await fetchData();
    } catch {
      /* network error */
    } finally {
      setActioning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const isSupervised = config?.mode === "supervised";
  const latestCycle = cycles[0];
  const pendingDecisions = decisions.filter(
    (d) => d.approved === null && d.mode === "supervised"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-indigo-500" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              AI Brain
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Autonomous decision engine for Senzo Mall
          </p>
        </div>

        {/* Mode toggle */}
        <button
          onClick={toggleMode}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full border transition-colors",
            isSupervised
              ? "bg-green-500/10 border-green-500/20 hover:bg-green-500/20"
              : "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
          )}
        >
          {isSupervised ? (
            <Shield className="w-4 h-4 text-green-400" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          )}
          <span
            className={cn(
              "text-sm font-medium",
              isSupervised ? "text-green-400" : "text-amber-400"
            )}
          >
            {isSupervised ? "Supervised Mode" : "Autonomous Mode"}
          </span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Last Cycle</p>
            <p className="text-sm font-medium text-text-primary mt-1">
              {config?.last_cycle
                ? new Date(config.last_cycle).toLocaleTimeString()
                : "Never"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Total Cycles</p>
            <p className="text-lg font-bold font-mono text-text-primary mt-1">
              {config?.total_cycles || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Decisions Made</p>
            <p className="text-lg font-bold font-mono text-indigo-400 mt-1">
              {config?.total_decisions || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Executed</p>
            <p className="text-lg font-bold font-mono text-green-400 mt-1">
              {config?.total_executed || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {decisions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Decisions by Category */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Decisions by Category
              </h3>
            </CardHeader>
            <CardContent>
              {(() => {
                const catCounts: Record<string, number> = {};
                decisions.forEach((d) => {
                  catCounts[d.category] = (catCounts[d.category] || 0) + 1;
                });
                const chartData = Object.entries(catCounts).map(([cat, count]) => ({
                  name: getCategoryConfig(cat).label,
                  count,
                }));
                return (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
                        formatter={(value: any) => [value, "Decisions"]}
                      />
                      <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>

          {/* Confidence Distribution Donut */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Confidence Distribution
              </h3>
            </CardHeader>
            <CardContent>
              {(() => {
                let high = 0, medium = 0, low = 0;
                decisions.forEach((d) => {
                  if (d.confidence >= 75) high++;
                  else if (d.confidence >= 50) medium++;
                  else low++;
                });
                const donutData = [
                  { name: "High (75%+)", value: high },
                  { name: "Medium (50-74%)", value: medium },
                  { name: "Low (<50%)", value: low },
                ].filter((d) => d.value > 0);
                const COLORS = ["#4F46E5", "#F59E0B", "#EF4444"];
                return (
                  <>
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {donutData.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#111827",
                            border: "1px solid #1F2937",
                            borderRadius: "8px",
                          }}
                          itemStyle={{ color: "#A5B4FC" }}
                          formatter={(value: any, name: any) => [value, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-center gap-4 -mt-2">
                      {high > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#4F46E5" }} />
                          <span className="text-xs text-text-secondary">High ({high})</span>
                        </div>
                      )}
                      {medium > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                          <span className="text-xs text-text-secondary">Medium ({medium})</span>
                        </div>
                      )}
                      {low > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#EF4444" }} />
                          <span className="text-xs text-text-secondary">Low ({low})</span>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Run Brain Cycle */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Run Brain Cycle
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Gather data from all engines, analyze, and produce decisions
              </p>
            </div>
            <Button
              onClick={runCycle}
              disabled={running}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Brain className="w-4 h-4 mr-2" />
              )}
              {running ? "Thinking..." : "Run Brain Cycle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last cycle result */}
      {lastResult && (
        <Card className="border-indigo-500/30">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <h3 className="text-sm font-semibold text-text-primary">
                Cycle Complete
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-text-muted">
                {lastResult.duration_ms}ms
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  lastResult.source === "claude"
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                )}
              >
                {lastResult.source === "claude" ? "Claude AI" : "Rule Engine"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
              <div className="flex items-start gap-3">
                <Brain className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-text-primary font-medium mb-1">
                    Brain says:
                  </p>
                  <p className="text-sm text-text-secondary">
                    {lastResult.summary}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs text-text-muted mt-3">
              {lastResult.decisions.length} decision(s) generated in cycle{" "}
              <span className="font-mono">{lastResult.cycle_id}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Brain Summary (from latest cycle) */}
      {!lastResult && latestCycle?.summary && (
        <Card className="border-indigo-500/20">
          <CardContent>
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-text-primary font-medium mb-1">
                  Latest brain summary
                </p>
                <p className="text-sm text-text-secondary">
                  {latestCycle.summary}
                </p>
                <p className="text-xs text-text-muted mt-2">
                  {latestCycle.timestamp &&
                    new Date(latestCycle.timestamp).toLocaleString()}{" "}
                  — {latestCycle.decision_count} decision(s)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Decisions (Supervised Mode) */}
      {isSupervised && pendingDecisions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Pending Approval ({pendingDecisions.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingDecisions.map((d) => (
              <DecisionCard
                key={d.id}
                decision={d}
                onApprove={handleApprove}
                onReject={handleReject}
                actioning={actioning}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Recent Decisions */}
      {decisions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Recent Decisions ({decisions.length})
            </h2>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {showHistory ? "Hide History" : "Show History"}
            </button>
          </div>
          {showHistory && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {decisions.map((d) => (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  actioning={actioning}
                />
              ))}
            </div>
          )}
          {!showHistory && (
            <p className="text-xs text-text-muted">
              Click &quot;Show History&quot; to view all {decisions.length}{" "}
              recent decisions
            </p>
          )}
        </div>
      )}

      {/* Brain History (Past Cycles) */}
      {cycles.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-text-primary">
              Brain History
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cycles.slice(0, 10).map((cycle) => (
                <div
                  key={cycle.cycle_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-wedja-bg border border-wedja-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {cycle.summary || "Brain cycle completed"}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {cycle.timestamp &&
                        new Date(cycle.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-indigo-400 ml-3 shrink-0">
                    {cycle.decision_count} decisions
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-text-primary">
            Configuration
          </h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
              <p className="text-xs text-text-muted mb-1">Mode</p>
              <p
                className={cn(
                  "text-sm font-medium",
                  isSupervised ? "text-green-400" : "text-amber-400"
                )}
              >
                {isSupervised ? "Supervised" : "Autonomous"}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {isSupervised
                  ? "Decisions require human approval"
                  : "Safe actions auto-execute"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
              <p className="text-xs text-text-muted mb-1">Status</p>
              <p
                className={cn(
                  "text-sm font-medium",
                  config?.enabled ? "text-green-400" : "text-text-muted"
                )}
              >
                {config?.enabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
              <p className="text-xs text-text-muted mb-1">AI Engine</p>
              <p className="text-sm font-medium text-text-primary">
                {process.env.NEXT_PUBLIC_HAS_ANTHROPIC_KEY === "true"
                  ? "Claude API"
                  : "Rule Engine (Fallback)"}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Set ANTHROPIC_API_KEY for Claude
              </p>
            </div>
          </div>

          {!isSupervised && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <p className="text-sm text-amber-400 font-medium">
                  Autonomous Mode Active
                </p>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Auto-executable decisions (payment reminders, routine alerts)
                will fire without approval. High-impact decisions still require
                review.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
