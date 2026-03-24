"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timer, Play, Pause, Loader2, Activity, Zap, AlertTriangle, Users, DollarSign, CheckCircle } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

interface SchedulerStatus {
  enabled: boolean;
  interval_minutes: number;
  last_run: string | null;
  total_cycles: number;
  is_running: boolean;
}

interface CycleResult {
  timestamp: string;
  expiring_leases?: number;
  overdue_rent?: number;
  active_anomalies?: number;
  critical_anomalies?: number;
  footfall_today?: number;
  footfall_alert?: boolean;
  energy_kwh_today?: number;
  energy_cost_today?: number;
  duration_ms?: number;
  error?: string;
}

export default function SchedulerPage() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CycleResult | null>(null);
  const [cycleHistory, setCycleHistory] = useState<CycleResult[]>([]);
  const [interval, setIntervalVal] = useState(15);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/scheduler");
      const json = await res.json();
      setStatus(json.data);
      setCycleHistory(json.data?.cycle_history || []);
      setIntervalVal(json.data?.interval_minutes || 15);
    } catch { /* — */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    setRunning(true);
    try {
      const res = await fetch("/api/v1/ai/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (action === "run_now") setLastResult(json.data);
      await fetchStatus();
    } catch { /* — */ }
    finally { setRunning(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-wedja-accent" /></div>;
  }

  const isActive = status?.enabled && status?.is_running;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Timer className="w-6 h-6 text-wedja-accent" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">AI Scheduler</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">Autonomous monitoring — lease checks, rent tracking, anomaly detection</p>
        </div>
        <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border", isActive ? "bg-green-500/10 border-green-500/20" : "bg-text-muted/10 border-text-muted/20")}>
          <span className={cn("w-2 h-2 rounded-full", isActive ? "bg-green-500 animate-pulse" : "bg-text-muted")} />
          <span className={cn("text-xs font-medium", isActive ? "text-green-500" : "text-text-muted")}>
            {isActive ? `Running every ${status?.interval_minutes}m` : "Stopped"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent><p className="text-xs text-text-muted">Status</p><p className={cn("text-lg font-bold mt-1", isActive ? "text-green-500" : "text-text-muted")}>{isActive ? "Active" : "Stopped"}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-text-muted">Interval</p><p className="text-lg font-bold text-text-primary mt-1">{status?.interval_minutes || 15} min</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-text-muted">Total Cycles</p><p className="text-lg font-bold font-mono text-text-primary mt-1">{status?.total_cycles || 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-text-muted">Last Run</p><p className="text-sm font-medium text-text-primary mt-1">{status?.last_run ? new Date(status.last_run).toLocaleTimeString() : "Never"}</p></CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cycle History Trend */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-text-primary">
              Cycle History
            </h3>
          </CardHeader>
          <CardContent>
            {cycleHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={cycleHistory.slice(-20).map((c) => ({
                    time: new Date(c.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    duration: c.duration_ms || 0,
                    anomalies: c.active_anomalies || 0,
                  }))}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <defs>
                    <linearGradient id="schedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
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
                    formatter={(value: any, name: any) => [
                      name === "duration" ? `${value}ms` : value,
                      name === "duration" ? "Duration" : "Anomalies",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="duration"
                    stroke="#4F46E5"
                    strokeWidth={2}
                    fill="url(#schedGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-sm text-text-muted">
                No cycle history yet. Run a cycle to start tracking.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Execution Status Donut */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-text-primary">
              Execution Status
            </h3>
          </CardHeader>
          <CardContent>
            {(() => {
              const successCount = cycleHistory.filter((c) => !c.error).length;
              const errorCount = cycleHistory.filter((c) => c.error).length;
              const total = successCount + errorCount;
              if (total === 0) {
                return (
                  <div className="flex items-center justify-center h-[260px] text-sm text-text-muted">
                    No execution data yet.
                  </div>
                );
              }
              const donutData = [
                { name: "Success", value: successCount },
                { name: "Error", value: errorCount },
              ].filter((d) => d.value > 0);
              const COLORS = ["#4F46E5", "#EF4444"];
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
                  <div className="flex items-center justify-center gap-6 -mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#4F46E5" }} />
                      <span className="text-xs text-text-secondary">Success ({successCount})</span>
                    </div>
                    {errorCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#EF4444" }} />
                        <span className="text-xs text-text-secondary">Error ({errorCount})</span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><h3 className="text-lg font-semibold text-text-primary">Controls</h3></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {isActive ? (
              <Button variant="danger" onClick={() => doAction("stop")} disabled={running}><Pause className="w-4 h-4 mr-2" />Stop</Button>
            ) : (
              <Button onClick={() => doAction("start")} disabled={running}><Play className="w-4 h-4 mr-2" />Start</Button>
            )}
            <Button variant="secondary" onClick={() => doAction("run_now")} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {running ? "Running..." : "Run Now"}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Cycle every:</label>
            <select value={interval} onChange={(e) => { const m = parseInt(e.target.value); setIntervalVal(m); doAction("set_interval", { interval_minutes: m }); }}
              className="bg-wedja-bg border border-wedja-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-wedja-accent/40">
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          <div className="pt-4 border-t border-wedja-border">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Each cycle checks:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <DollarSign className="w-4 h-4 text-wedja-accent" />
                <div><p className="text-sm font-medium text-text-primary">Lease & Rent</p><p className="text-xs text-text-muted">Expiring leases, overdue rent</p></div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <Users className="w-4 h-4 text-wedja-accent" />
                <div><p className="text-sm font-medium text-text-primary">Footfall & Energy</p><p className="text-xs text-text-muted">Traffic drops, energy waste</p></div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <AlertTriangle className="w-4 h-4 text-wedja-accent" />
                <div><p className="text-sm font-medium text-text-primary">Anomalies</p><p className="text-xs text-text-muted">Critical alerts, patterns</p></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">Last Cycle Result</h3>
            <span className="text-xs font-mono text-text-muted">{lastResult.duration_ms}ms</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <p className="text-xs text-text-muted">Expiring Leases</p>
                <p className="text-xl font-bold text-text-primary">{lastResult.expiring_leases ?? "—"}</p>
              </div>
              <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <p className="text-xs text-text-muted">Overdue Rent</p>
                <p className={cn("text-xl font-bold", (lastResult.overdue_rent || 0) > 0 ? "text-status-error" : "text-text-primary")}>{lastResult.overdue_rent ?? "—"}</p>
              </div>
              <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <p className="text-xs text-text-muted">Active Anomalies</p>
                <p className={cn("text-xl font-bold", (lastResult.critical_anomalies || 0) > 0 ? "text-status-error" : "text-text-primary")}>{lastResult.active_anomalies ?? "—"}</p>
              </div>
              <div className="p-3 rounded-lg bg-wedja-bg border border-wedja-border">
                <p className="text-xs text-text-muted">Energy Today</p>
                <p className="text-xl font-bold text-text-primary">{lastResult.energy_kwh_today ? `${lastResult.energy_kwh_today.toLocaleString()} kWh` : "—"}</p>
              </div>
            </div>
            {lastResult.footfall_alert && (
              <div className="mt-3 p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-status-warning" />
                <p className="text-sm text-status-warning">Footfall drop detected — {lastResult.footfall_today?.toLocaleString()} vs yesterday</p>
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <p className="text-xs text-green-500">Cycle completed at {new Date(lastResult.timestamp).toLocaleTimeString()}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
