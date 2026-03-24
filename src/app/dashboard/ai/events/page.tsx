"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Loader2,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronRight,
  Send,
  Radio,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  Server,
} from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface HandlerResult {
  handler: string;
  success: boolean;
  message: string;
  timestamp: string;
}

interface SystemEvent {
  id: string;
  type: string;
  source_system: string;
  payload: Record<string, unknown>;
  processed: boolean;
  results: HandlerResult[];
  created_at: string;
}

interface RegisteredType {
  type: string;
  handlerCount: number;
  handlers: string[];
}

interface EventsData {
  events: SystemEvent[];
  stats: {
    events_today: number;
    actions_today: number;
    systems_connected: number;
    registered_types: number;
  };
  registered_types: RegisteredType[];
  source_systems: string[];
}

// ── Event Type Badge Colors ─────────────────────────────────

const EVENT_CATEGORY_COLORS: Record<string, string> = {
  lease: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  rent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  tenant: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  footfall: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  energy: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  maintenance: "bg-red-500/15 text-red-400 border-red-500/30",
  anomaly: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  campaign: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  occupancy: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
};

function getEventCategoryColor(eventType: string): string {
  const category = eventType.split(".")[0];
  return EVENT_CATEGORY_COLORS[category] || "bg-gray-500/15 text-gray-400 border-gray-500/30";
}

const SOURCE_COLORS: Record<string, string> = {
  "revenue-engine": "bg-emerald-500/10 text-emerald-400",
  "footfall-engine": "bg-cyan-500/10 text-cyan-400",
  "energy-engine": "bg-amber-500/10 text-amber-400",
  "contract-engine": "bg-blue-500/10 text-blue-400",
  "tenant-analytics": "bg-purple-500/10 text-purple-400",
  "anomaly-engine": "bg-rose-500/10 text-rose-400",
  notifications: "bg-indigo-500/10 text-indigo-400",
  maintenance: "bg-red-500/10 text-red-400",
  marketing: "bg-violet-500/10 text-violet-400",
  "event-bus": "bg-indigo-500/10 text-indigo-400",
  manual: "bg-gray-500/10 text-gray-400",
};

// ── Test Event Options ──────────────────────────────────────

const TEST_EVENTS = [
  {
    type: "lease.expiring",
    source_system: "contract-engine",
    payload: {
      tenant_name: "LC Waikiki",
      tenant_id: "test-tenant-001",
      days_until_expiry: 30,
      lease_id: "test-lease-001",
    },
  },
  {
    type: "rent.overdue",
    source_system: "revenue-engine",
    payload: {
      tenant_name: "Aldo",
      tenant_id: "test-tenant-002",
      lease_id: "test-lease-002",
      days_overdue: 15,
      amount_due: 45000,
    },
  },
  {
    type: "maintenance.created",
    source_system: "maintenance",
    payload: {
      title: "HVAC Unit Failure — Food Court",
      priority: "urgent",
      zone_id: "test-zone-001",
      zone_name: "Food Court",
      category: "hvac",
    },
  },
  {
    type: "footfall.drop",
    source_system: "footfall-engine",
    payload: {
      zone_id: "test-zone-002",
      zone_name: "Ground Floor East",
      drop_pct: 35,
    },
  },
  {
    type: "tenant.underreporting",
    source_system: "revenue-engine",
    payload: {
      tenant_name: "DeFacto",
      tenant_id: "test-tenant-003",
      variance_egp: 82000,
      discrepancy_id: "test-disc-001",
    },
  },
  {
    type: "anomaly.critical",
    source_system: "anomaly-engine",
    payload: {
      description: "Multiple systems reporting anomalies in Zone B — possible infrastructure failure",
    },
  },
  {
    type: "campaign.started",
    source_system: "marketing",
    payload: {
      campaign_name: "Summer Sale 2026",
    },
  },
];

// ── Event Row Component ─────────────────────────────────────

function EventRow({ event }: { event: SystemEvent }) {
  const [expanded, setExpanded] = useState(false);
  const categoryColor = getEventCategoryColor(event.type);
  const sourceColor = SOURCE_COLORS[event.source_system] || "bg-gray-500/10 text-gray-400";
  const successCount = event.results?.filter((r) => r.success).length || 0;
  const failCount = event.results?.filter((r) => !r.success).length || 0;

  return (
    <div className="border-b border-wedja-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-wedja-border/10 transition-colors text-left"
        aria-expanded={expanded}
        aria-label={`Event ${event.type} details`}
      >
        {/* Expand icon */}
        <div className="shrink-0 text-text-muted">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {/* Event type badge */}
        <span
          className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${categoryColor}`}
        >
          {event.type}
        </span>

        {/* Source system */}
        <span
          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${sourceColor}`}
        >
          {event.source_system}
        </span>

        {/* Payload preview */}
        <span className="flex-1 text-xs text-text-muted truncate min-w-0">
          {summarizePayload(event.payload)}
        </span>

        {/* Results indicator */}
        <div className="shrink-0 flex items-center gap-2">
          {event.processed ? (
            <div className="flex items-center gap-1.5">
              {successCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 font-medium">
                  <CheckCircle2 size={11} /> {successCount}
                </span>
              )}
              {failCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
                  <XCircle size={11} /> {failCount}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-amber-400 font-medium">pending</span>
          )}
        </div>

        {/* Timestamp */}
        <span className="shrink-0 text-[10px] text-text-muted font-mono w-24 text-right">
          {timeAgo(event.created_at)}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-4 ml-8 space-y-3 animate-fade-in">
          {/* Payload */}
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1">
              Payload
            </p>
            <pre className="text-xs text-text-secondary bg-wedja-border/20 rounded-lg p-3 overflow-x-auto font-mono">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>

          {/* Handler Results */}
          {event.results && event.results.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1">
                Handler Results ({event.results.length})
              </p>
              <div className="space-y-1.5">
                {event.results.map((result, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                      result.success
                        ? "bg-emerald-500/5 border border-emerald-500/20"
                        : "bg-red-500/5 border border-red-500/20"
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-text-primary">
                        {result.handler}
                      </span>
                      <p className="text-text-muted mt-0.5">{result.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 text-[10px] text-text-muted">
            <span>ID: {event.id.slice(0, 8)}...</span>
            <span>
              {new Date(event.created_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function summarizePayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (payload.tenant_name) parts.push(String(payload.tenant_name));
  if (payload.zone_name) parts.push(String(payload.zone_name));
  if (payload.campaign_name) parts.push(String(payload.campaign_name));
  if (payload.title) parts.push(String(payload.title));
  if (payload.description) parts.push(String(payload.description).slice(0, 80));
  if (payload.amount_due) parts.push(`EGP ${Number(payload.amount_due).toLocaleString()}`);
  if (payload.variance_egp) parts.push(`EGP ${Number(payload.variance_egp).toLocaleString()} variance`);
  if (payload.drop_pct) parts.push(`${payload.drop_pct}% drop`);
  if (payload.days_until_expiry) parts.push(`${payload.days_until_expiry}d until expiry`);
  if (payload.days_overdue) parts.push(`${payload.days_overdue}d overdue`);
  return parts.join(" — ") || JSON.stringify(payload).slice(0, 60);
}

// ── Main Page ───────────────────────────────────────────────

export default function EventBusPage() {
  const [data, setData] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [emitting, setEmitting] = useState(false);
  const [showTestMenu, setShowTestMenu] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      params.set("limit", "50");

      const res = await fetch(`/api/v1/ai/events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const d: EventsData = await res.json();
      setData(d);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sourceFilter]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  async function emitTestEvent(testEvent: (typeof TEST_EVENTS)[number]) {
    setEmitting(true);
    setShowTestMenu(false);
    try {
      const res = await fetch("/api/v1/ai/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testEvent),
      });
      if (!res.ok) throw new Error("Failed to emit event");
      // Refresh immediately
      await fetchData();
    } catch (err) {
      console.error("Emit error:", err);
    } finally {
      setEmitting(false);
    }
  }

  // Gather all unique event types from data for filter dropdown
  const allEventTypes = data
    ? Array.from(new Set(data.events.map((e) => e.type))).sort()
    : [];
  const allSources = data?.source_systems || [];

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
        <p className="text-xs text-text-muted">Loading event bus...</p>
      </div>
    );
  }

  if (error && !data) {
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

  const stats = data?.stats || {
    events_today: 0,
    actions_today: 0,
    systems_connected: 0,
    registered_types: 0,
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
              <Activity size={24} className="text-indigo-400" />
            </div>
            Event Bus
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Cross-system event processing — real-time reactions across all Senzo Mall engines
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* LIVE indicator */}
          {autoRefresh && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                Live
              </span>
            </div>
          )}

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              autoRefresh
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-text-muted bg-wedja-border/30"
            }`}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>

          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-wedja-accent transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Radio size={13} className="text-indigo-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Events Today
              </span>
            </div>
            <p className="text-xl font-bold font-mono text-text-primary">
              {stats.events_today}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={13} className="text-amber-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Actions Triggered
              </span>
            </div>
            <p className="text-xl font-bold font-mono text-text-primary">
              {stats.actions_today}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Server size={13} className="text-cyan-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Systems Connected
              </span>
            </div>
            <p className="text-xl font-bold font-mono text-text-primary">
              {stats.systems_connected}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={13} className="text-violet-400" />
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                Registered Types
              </span>
            </div>
            <p className="text-xl font-bold font-mono text-text-primary">
              {stats.registered_types}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {data && data.events.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Events by Type */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Events by Type
              </h3>
            </CardHeader>
            <CardContent>
              {(() => {
                const typeCounts: Record<string, number> = {};
                data.events.forEach((e) => {
                  const cat = e.type.split(".")[0];
                  typeCounts[cat] = (typeCounts[cat] || 0) + 1;
                });
                const chartData = Object.entries(typeCounts)
                  .map(([type, count]) => ({
                    name: type.charAt(0).toUpperCase() + type.slice(1),
                    count,
                  }))
                  .sort((a, b) => b.count - a.count);
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
                        formatter={(value: any) => [value, "Events"]}
                      />
                      <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>

          {/* Event Timeline Area Chart */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Event Timeline
              </h3>
            </CardHeader>
            <CardContent>
              {(() => {
                const hourBuckets: Record<string, number> = {};
                data.events.forEach((e) => {
                  const d = new Date(e.created_at);
                  const key = `${d.getHours().toString().padStart(2, "0")}:00`;
                  hourBuckets[key] = (hourBuckets[key] || 0) + 1;
                });
                const chartData = Object.entries(hourBuckets)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([hour, count]) => ({ hour, events: count }));
                return (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                      <defs>
                        <linearGradient id="eventsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="hour"
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
                        formatter={(value: any) => [value, "Events"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="events"
                        stroke="#4F46E5"
                        strokeWidth={2}
                        fill="url(#eventsGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Test Emit */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Type filter */}
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-text-muted" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs bg-wedja-card border border-wedja-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-indigo-500/50"
            aria-label="Filter by event type"
          >
            <option value="all">All Types</option>
            {allEventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-xs bg-wedja-card border border-wedja-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-indigo-500/50"
            aria-label="Filter by source system"
          >
            <option value="all">All Sources</option>
            {allSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Emit Test Event */}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowTestMenu(!showTestMenu)}
            disabled={emitting}
          >
            {emitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Emit Test Event
          </Button>

          {showTestMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-wedja-card border border-wedja-border rounded-xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-wedja-border">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                  Select test event
                </p>
              </div>
              {TEST_EVENTS.map((te, i) => (
                <button
                  key={i}
                  onClick={() => emitTestEvent(te)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-wedja-border/20 transition-colors text-left border-b border-wedja-border/30 last:border-0"
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${getEventCategoryColor(te.type)}`}
                  >
                    {te.type}
                  </span>
                  <span className="text-[10px] text-text-muted truncate">
                    {summarizePayload(te.payload)}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setShowTestMenu(false)}
                className="w-full px-3 py-2 text-[10px] text-text-muted hover:text-text-primary bg-wedja-border/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Registered Event Types */}
      {data?.registered_types && data.registered_types.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Activity size={14} className="text-indigo-400" />
              Registered Handlers
            </h2>
            <span className="text-[10px] text-text-muted">
              {data.registered_types.reduce((s, t) => s + t.handlerCount, 0)} handlers across{" "}
              {data.registered_types.length} event types
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap gap-2 px-5 py-3">
              {data.registered_types.map((rt) => (
                <div
                  key={rt.type}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${getEventCategoryColor(rt.type)}`}
                >
                  <span className="font-mono font-medium">{rt.type}</span>
                  <span className="opacity-60">&times;{rt.handlerCount}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              Event Feed
            </h2>
          </div>
          <span className="text-[10px] text-text-muted">
            {data?.events.length || 0} events
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {!data?.events.length ? (
            <div className="py-12 text-center">
              <Activity
                size={32}
                className="mx-auto mb-3 text-wedja-border"
              />
              <p className="text-sm text-text-muted">
                No events yet. Emit a test event to get started.
              </p>
            </div>
          ) : (
            <div className="divide-y-0">
              {data.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
