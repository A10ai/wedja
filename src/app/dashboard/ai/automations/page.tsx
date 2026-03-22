"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Workflow,
  Play,
  Loader2,
  CheckCircle,
  FileText,
  DollarSign,
  Search,
  Zap,
  Wrench,
  Users,
  BarChart3,
  Clock,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface AutomationMeta {
  id: string;
  name: string;
  type: string;
  description: string;
  enabled: boolean;
  last_run: string | null;
  actions_taken: number;
  results: AutomationResult[];
}

interface AutomationResult {
  action: string;
  description: string;
  impact: string;
  timestamp: string;
}

// ── Config per automation type ──────────────────────────────

const TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  lease_monitor: {
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  rent_collector: {
    icon: DollarSign,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  revenue_verifier: {
    icon: Search,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  energy_optimizer: {
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  maintenance_detector: {
    icon: Wrench,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  footfall_analyzer: {
    icon: Users,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  tenant_scorer: {
    icon: BarChart3,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
};

function getTypeConfig(type: string) {
  return (
    TYPE_CONFIG[type] || {
      icon: Workflow,
      color: "text-text-secondary",
      bg: "bg-text-muted/10",
      border: "border-text-muted/20",
    }
  );
}

// ── Automation Card ─────────────────────────────────────────

function AutomationCard({
  automation,
  onRun,
  onToggle,
  runningId,
}: {
  automation: AutomationMeta;
  onRun: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  runningId: string | null;
}) {
  const cfg = getTypeConfig(automation.type);
  const Icon = cfg.icon;
  const isRunning = runningId === automation.id;
  const recentlyRan =
    automation.last_run &&
    Date.now() - new Date(automation.last_run).getTime() < 60000;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        recentlyRan && "border-indigo-500/40"
      )}
    >
      {/* Pulse indicator for recently ran */}
      {recentlyRan && (
        <div className="absolute top-3 right-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
          </span>
        </div>
      )}

      <CardContent className="pt-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className={cn(
              "p-2.5 rounded-xl border",
              cfg.bg,
              cfg.border
            )}
          >
            <Icon className={cn("w-5 h-5", cfg.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">
              {automation.name}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
              {automation.description}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-text-muted" />
            <span className="text-text-secondary">
              {automation.last_run
                ? new Date(automation.last_run).toLocaleTimeString()
                : "Never"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-text-muted" />
            <span className="text-text-secondary">
              {automation.actions_taken} actions
            </span>
          </div>
        </div>

        {/* Latest results preview */}
        {automation.results.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {automation.results.slice(0, 2).map((r, i) => (
              <div
                key={i}
                className="p-2 rounded-lg bg-wedja-bg border border-wedja-border"
              >
                <p className="text-xs text-text-primary line-clamp-1">
                  {r.description}
                </p>
                {r.impact && r.impact !== "No action needed" && r.impact !== "No action" && (
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="w-2.5 h-2.5 text-indigo-400" />
                    <span className="text-[10px] text-indigo-400 font-medium">
                      {r.impact}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {automation.results.length > 2 && (
              <p className="text-[10px] text-text-muted pl-2">
                +{automation.results.length - 2} more results
              </p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-wedja-border">
          {/* Enable toggle */}
          <button
            onClick={() => onToggle(automation.id, !automation.enabled)}
            className="flex items-center gap-2 group"
          >
            <div
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors duration-200",
                automation.enabled ? "bg-indigo-600" : "bg-wedja-border"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                  automation.enabled ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                automation.enabled ? "text-indigo-400" : "text-text-muted"
              )}
            >
              {automation.enabled ? "Enabled" : "Disabled"}
            </span>
          </button>

          {/* Run button */}
          <Button
            size="sm"
            onClick={() => onRun(automation.id)}
            disabled={isRunning || !automation.enabled}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3"
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Play className="w-3 h-3 mr-1" />
            )}
            {isRunning ? "Running..." : "Run Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Log Timeline ────────────────────────────────────────────

function LogTimeline({ log }: { log: AutomationResult[] }) {
  if (log.length === 0) {
    return (
      <div className="text-center py-8">
        <Workflow className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">No automation log entries yet</p>
        <p className="text-xs text-text-muted mt-1">
          Run automations to see results here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
      {log.map((entry, i) => {
        const cfg = getTypeConfig(entry.action);
        const Icon = cfg.icon;
        const isAlert =
          entry.description.includes("ALERT") ||
          entry.description.includes("ESCALATION") ||
          entry.description.includes("CHRONIC");
        const isPositive =
          entry.description.includes("TOP:") ||
          entry.description.includes("SPIKE:");

        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              isAlert
                ? "bg-red-500/5 border-red-500/15"
                : isPositive
                  ? "bg-green-500/5 border-green-500/15"
                  : "bg-wedja-bg border-wedja-border"
            )}
          >
            <div className={cn("p-1.5 rounded-lg", cfg.bg)}>
              <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary leading-relaxed">
                {entry.description}
              </p>
              {entry.impact && entry.impact !== "No action needed" && entry.impact !== "No action" && entry.impact !== "No alerts" && (
                <p className="text-[10px] text-indigo-400 font-medium mt-1">
                  {entry.impact}
                </p>
              )}
              <p className="text-[10px] text-text-muted mt-1">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </p>
            </div>
            {isAlert && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<AutomationMeta[]>([]);
  const [log, setLog] = useState<AutomationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [totalActions, setTotalActions] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/automations");
      const json = await res.json();
      if (json.data) {
        setAutomations(json.data.automations || []);
        setLog(json.data.log || []);
        setTotalActions(json.data.total_actions || 0);
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

  const runAll = async () => {
    setRunningAll(true);
    try {
      const res = await fetch("/api/v1/ai/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_all" }),
      });
      await res.json();
      await fetchData();
    } catch {
      /* network error */
    } finally {
      setRunningAll(false);
    }
  };

  const runOne = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch("/api/v1/ai/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_one", automation_id: id }),
      });
      await res.json();
      await fetchData();
    } catch {
      /* network error */
    } finally {
      setRunningId(null);
    }
  };

  const toggleOne = async (id: string, enabled: boolean) => {
    try {
      await fetch("/api/v1/ai/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", automation_id: id, enabled }),
      });
      await fetchData();
    } catch {
      /* network error */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const enabledCount = automations.filter((a) => a.enabled).length;
  const lastRanTime = automations
    .filter((a) => a.last_run)
    .sort((a, b) =>
      new Date(b.last_run!).getTime() - new Date(a.last_run!).getTime()
    )[0]?.last_run;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="w-6 h-6 text-indigo-500" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              Smart Automations
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            7 rule-based automations that monitor and optimize Senzo Mall
            operations
          </p>
        </div>

        <Button
          onClick={runAll}
          disabled={runningAll}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6"
        >
          {runningAll ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {runningAll ? "Running All..." : "Run All Automations"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Active Automations</p>
            <p className="text-lg font-bold text-indigo-400 mt-1">
              {enabledCount}/{automations.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Total Actions</p>
            <p className="text-lg font-bold font-mono text-text-primary mt-1">
              {totalActions}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Last Run</p>
            <p className="text-sm font-medium text-text-primary mt-1">
              {lastRanTime
                ? new Date(lastRanTime).toLocaleTimeString()
                : "Never"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Log Entries</p>
            <p className="text-lg font-bold font-mono text-text-primary mt-1">
              {log.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Automation Cards Grid */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          Automations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              onRun={runOne}
              onToggle={toggleOne}
              runningId={runningId}
            />
          ))}
        </div>
      </div>

      {/* Automation Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-text-primary">
              Automation Log
            </h3>
          </div>
          <span className="text-xs text-text-muted">
            {log.length} entries
          </span>
        </CardHeader>
        <CardContent>
          <LogTimeline log={log} />
        </CardContent>
      </Card>
    </div>
  );
}
