"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign,
  Building2,
  Store,
  Users,
  Wrench,
  AlertTriangle,
  Loader2,
  ArrowRight,
  FileText,
  Settings,
  Percent,
  ShieldAlert,
  Sparkles,
  Megaphone,
  Radio,
} from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DashboardStats {
  total_revenue_egp: number;
  occupancy_rate: number;
  active_tenants: number;
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  maintenance_units: number;
  overdue_rent_count: number;
  open_maintenance: number;
  recent_transactions: Array<{
    id: string;
    period_month: number;
    period_year: number;
    amount_due: number;
    amount_paid: number;
    payment_date: string | null;
    status: string;
    lease: {
      id: string;
      tenant: { brand_name: string } | null;
      unit: { unit_number: string; name: string } | null;
    } | null;
  }>;
  discrepancies_found: number;
  footfall_today: number;
}

interface AnomalyData {
  id: string;
  title: string;
  severity: string;
  type: string;
  zone_name?: string;
  created_at: string;
}

interface AIInsight {
  title: string;
  message: string;
  severity: string;
  confidence: number;
}

interface PercentageRentData {
  summary?: {
    total_percentage_rent_premium_egp?: number;
  };
  total_percentage_rent_premium_egp?: number;
}

interface SocialData {
  total_followers?: number;
  active_campaigns?: number;
}

interface FootfallTrend {
  date: string;
  total_in: number;
  total_out: number;
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  paid: "success",
  partial: "warning",
  overdue: "error",
  waived: "default",
};

const severityColor: Record<string, string> = {
  critical: "text-status-error",
  high: "text-status-error",
  warning: "text-status-warning",
  medium: "text-status-warning",
  low: "text-status-info",
  info: "text-text-muted",
};

const severityBadge: Record<string, "error" | "warning" | "info" | "default"> = {
  critical: "error",
  high: "error",
  warning: "warning",
  medium: "warning",
  low: "info",
  info: "default",
};

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#111827',
    border: '1px solid #1F2937',
    borderRadius: '8px',
  },
  labelStyle: { color: '#9CA3AF' },
  itemStyle: { color: '#F9FAFB' },
};

const OCCUPANCY_COLORS = ['#10B981', '#F59E0B', '#EF4444'];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cross-data state
  const [percentRentPremium, setPercentRentPremium] = useState<number>(0);
  const [anomalies, setAnomalies] = useState<AnomalyData[]>([]);
  const [anomalyCount, setAnomalyCount] = useState<number>(0);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [socialData, setSocialData] = useState<SocialData | null>(null);
  const [footfallTrend, setFootfallTrend] = useState<FootfallTrend[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime: re-fetch when key tables change
  const REALTIME_TABLES = useMemo(() => [
    "rent_transactions", "maintenance_tickets", "anomalies",
    "notifications", "footfall_readings", "discrepancies",
  ], []);

  const { connected: realtimeConnected, lastUpdate: realtimeLastUpdate } =
    useRealtimeSubscription(REALTIME_TABLES, fetchAll, 3000);

  // Auto-refresh every 30s to pick up live CV footfall data
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Fetch cross-data: percentage rent, anomalies, AI insights, social, footfall trend
  useEffect(() => {
    async function fetchCrossData() {
      try {
        const [pctRes, anomalyRes, insightsRes, socialRes, footfallRes] = await Promise.all([
          fetch("/api/v1/percentage-rent?type=overview").catch(() => null),
          fetch("/api/v1/anomalies?type=active").catch(() => null),
          fetch("/api/v1/ai/insights").catch(() => null),
          fetch("/api/v1/social?type=overview").catch(() => null),
          fetch("/api/v1/footfall?type=trend&days=7").catch(() => null),
        ]);

        if (pctRes?.ok) {
          const pctData: PercentageRentData = await pctRes.json();
          setPercentRentPremium(
            pctData?.summary?.total_percentage_rent_premium_egp ??
            pctData?.total_percentage_rent_premium_egp ?? 0
          );
        }

        if (anomalyRes?.ok) {
          const anomalyData = await anomalyRes.json();
          const list = Array.isArray(anomalyData) ? anomalyData : anomalyData?.anomalies || [];
          setAnomalies(list.slice(0, 3));
          setAnomalyCount(list.length);
        }

        if (insightsRes?.ok) {
          const insightsData = await insightsRes.json();
          const insights = insightsData?.insights || [];
          setAiInsights(Array.isArray(insights) ? insights.slice(0, 3) : []);
        }

        if (socialRes?.ok) {
          const sData = await socialRes.json();
          setSocialData(sData);
        }

        if (footfallRes?.ok) {
          const ffData = await footfallRes.json();
          const trend = Array.isArray(ffData) ? ffData : ffData?.trend || ffData?.data || [];
          setFootfallTrend(trend);
        }
      } catch {
        // Cross-data is optional — fail silently
      }
    }
    fetchCrossData();
  }, []);

  // Compute monthly revenue trend from recent_transactions (last 6 months)
  const monthlyRevenueData = useMemo(() => {
    if (!stats?.recent_transactions?.length) return [];

    const grouped: Record<string, { month: string; collected: number; due: number; sortKey: number }> = {};

    for (const tx of stats.recent_transactions) {
      const key = `${tx.period_year}-${String(tx.period_month).padStart(2, '0')}`;
      if (!grouped[key]) {
        grouped[key] = {
          month: `${MONTH_NAMES[tx.period_month]} ${tx.period_year}`,
          collected: 0,
          due: 0,
          sortKey: tx.period_year * 100 + tx.period_month,
        };
      }
      grouped[key].collected += tx.amount_paid || 0;
      grouped[key].due += tx.amount_due || 0;
    }

    return Object.values(grouped)
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-6);
  }, [stats?.recent_transactions]);

  // Compute occupancy donut data
  const occupancyData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Occupied', value: stats.occupied_units },
      { name: 'Vacant', value: stats.vacant_units },
      { name: 'Maintenance', value: stats.maintenance_units },
    ].filter((d) => d.value > 0);
  }, [stats]);

  // Format footfall trend data for the bar chart
  const footfallChartData = useMemo(() => {
    return footfallTrend.map((d) => {
      const dateObj = new Date(d.date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        day: dayName,
        visitors: d.total_in,
      };
    });
  }, [footfallTrend]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error text-sm">{error || "Failed to load"}</p>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Revenue",
      value: formatCurrency(stats.total_revenue_egp),
      icon: DollarSign,
      color: "text-wedja-accent",
    },
    {
      label: "Occupancy Rate",
      value: formatPercentage(stats.occupancy_rate),
      icon: Building2,
      color: "text-status-success",
    },
    {
      label: "Active Tenants",
      value: stats.active_tenants.toString(),
      icon: Store,
      color: "text-status-info",
    },
    {
      label: "Footfall Today",
      value: stats.footfall_today > 0 ? formatNumber(stats.footfall_today) : "No data",
      icon: Users,
      color: "text-text-secondary",
    },
    {
      label: "Open Maintenance",
      value: stats.open_maintenance.toString(),
      icon: Wrench,
      color: stats.open_maintenance > 0 ? "text-status-warning" : "text-status-success",
    },
    {
      label: "Discrepancies",
      value: stats.discrepancies_found.toString(),
      icon: AlertTriangle,
      color: stats.discrepancies_found > 0 ? "text-status-error" : "text-status-success",
    },
    {
      label: "% Rent Premium",
      value: percentRentPremium > 0 ? formatCurrency(percentRentPremium) : "N/A",
      icon: Percent,
      color: "text-status-success",
    },
    {
      label: "Active Anomalies",
      value: anomalyCount.toString(),
      icon: ShieldAlert,
      color: anomalyCount > 5 ? "text-status-error" : anomalyCount > 0 ? "text-status-warning" : "text-status-success",
    },
    {
      label: socialData?.active_campaigns !== undefined ? "Campaigns Active" : "Social Followers",
      value: socialData?.active_campaigns !== undefined
        ? (socialData.active_campaigns || 0).toString()
        : socialData?.total_followers
          ? formatNumber(socialData.total_followers)
          : "N/A",
      icon: Megaphone,
      color: "text-status-info",
    },
  ];

  const quickLinks = [
    { label: "Tenants", href: "/dashboard/tenants", icon: Store },
    { label: "Leases", href: "/dashboard/leases", icon: FileText },
    { label: "Revenue", href: "/dashboard/revenue", icon: DollarSign },
    { label: "Property", href: "/dashboard/property", icon: Building2 },
    { label: "Maintenance", href: "/dashboard/maintenance", icon: Wrench },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  const totalUnitsForDonut = stats.occupied_units + stats.vacant_units + stats.maintenance_units;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">
            Senzo Mall, Hurghada &mdash; Property overview and key metrics
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${realtimeConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-[10px] text-text-muted flex items-center gap-1">
            <Radio size={10} />
            {realtimeConnected ? "Live" : "Connecting..."}
          </span>
          {realtimeLastUpdate && (
            <span className="text-[10px] text-text-muted">
              &middot; Updated {realtimeLastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-start justify-between py-5">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold text-text-primary font-mono">
                    {stat.value}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-wedja-accent-muted">
                  <Icon size={20} className={stat.color} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row: Monthly Revenue Trend + Footfall Weekly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Revenue Trend (AreaChart) */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <DollarSign size={14} className="text-wedja-accent" />
              Monthly Revenue Trend
            </h2>
            <Link
              href="/dashboard/revenue"
              className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
            >
              Details <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent>
            {monthlyRevenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyRevenueData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6B7280" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6B7280" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#1F2937' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#1F2937' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
                    labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
                    itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
                    formatter={(value: any) => formatCurrency(Number(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="due"
                    name="Due"
                    stroke="#6B7280"
                    fillOpacity={1}
                    fill="url(#colorDue)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    name="Collected"
                    stroke="#4F46E5"
                    fillOpacity={1}
                    fill="url(#colorCollected)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-text-muted">No revenue data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footfall Weekly Chart (BarChart) */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Users size={14} className="text-wedja-accent" />
              Weekly Footfall
            </h2>
            <Link
              href="/dashboard/footfall"
              className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
            >
              Details <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent>
            {footfallChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={footfallChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#1F2937' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#1F2937' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
                    labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
                    itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
                    formatter={(value: any) => formatNumber(Number(value))}
                  />
                  <Bar
                    dataKey="visitors"
                    name="Visitors"
                    fill="#4F46E5"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-text-muted">No footfall data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Occupancy Donut (replaces Unit status summary) */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Building2 size={14} className="text-status-success" />
            Unit Occupancy
          </h2>
          <Link
            href="/dashboard/property"
            className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
          >
            View units <ArrowRight size={12} />
          </Link>
        </CardHeader>
        <CardContent>
          {totalUnitsForDonut > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ResponsiveContainer width="100%" height={220} className="max-w-[280px]">
                <PieChart>
                  <Pie
                    data={occupancyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {occupancyData.map((_, index) => {
                      const colorIndex = ['Occupied', 'Vacant', 'Maintenance'].indexOf(occupancyData[index].name);
                      return (
                        <Cell key={`cell-${index}`} fill={OCCUPANCY_COLORS[colorIndex >= 0 ? colorIndex : 0]} />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
                    labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
                    itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
                    formatter={(value: any, name: any) => [`${value} units`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex sm:flex-col gap-4 sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#10B981]" />
                  <span className="text-sm text-text-secondary">
                    Occupied: <span className="font-mono font-bold text-text-primary">{stats.occupied_units}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
                  <span className="text-sm text-text-secondary">
                    Vacant: <span className="font-mono font-bold text-text-primary">{stats.vacant_units}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
                  <span className="text-sm text-text-secondary">
                    Maintenance: <span className="font-mono font-bold text-text-primary">{stats.maintenance_units}</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">No unit data available</p>
          )}
        </CardContent>
      </Card>

      {/* AI Alerts + Quick Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Alerts: top 3 anomalies by severity */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <ShieldAlert size={14} className="text-status-warning" />
              AI Alerts
            </h2>
            {anomalyCount > 3 && (
              <Link
                href="/dashboard/anomalies"
                className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
              >
                View all ({anomalyCount}) <ArrowRight size={12} />
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {anomalies.length > 0 ? (
              anomalies.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-wedja-border/50 hover:border-wedja-border transition-colors"
                >
                  <div className={`mt-0.5 ${severityColor[a.severity] || "text-text-muted"}`}>
                    <AlertTriangle size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {a.title}
                    </p>
                    <p className="text-xs text-text-muted">
                      {a.zone_name || a.type}
                    </p>
                  </div>
                  <Badge variant={severityBadge[a.severity] || "default"}>
                    {a.severity}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-muted text-center py-4">
                No active alerts
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Insights: top 3 cross-data insights */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Sparkles size={14} className="text-wedja-accent" />
              Quick Insights
            </h2>
            <Link
              href="/dashboard/ai"
              className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
            >
              AI Centre <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiInsights.length > 0 ? (
              aiInsights.map((insight, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg border border-wedja-border/50 hover:border-wedja-border transition-colors"
                >
                  <div className={`mt-0.5 ${severityColor[insight.severity] || "text-wedja-accent"}`}>
                    <Sparkles size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {insight.title}
                    </p>
                    <p className="text-xs text-text-muted line-clamp-2">
                      {insight.message}
                    </p>
                  </div>
                  {insight.confidence > 0 && (
                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                      {Math.round(insight.confidence * 100)}%
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-text-muted text-center py-4">
                No insights available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Transactions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary">
                Recent Rent Transactions
              </h2>
              <Link
                href="/dashboard/revenue"
                className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Tenant
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Period
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_transactions.map((tx, i) => (
                      <tr
                        key={tx.id}
                        className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${
                          i % 2 === 1 ? "bg-wedja-border/10" : ""
                        }`}
                      >
                        <td className="px-5 py-3 text-text-primary font-medium">
                          {tx.lease?.tenant?.brand_name || "Unknown"}
                          <span className="block text-xs text-text-muted">
                            {tx.lease?.unit?.unit_number}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-text-secondary">
                          {MONTH_NAMES[tx.period_month]} {tx.period_year}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-text-primary">
                          {formatCurrency(tx.amount_paid)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={statusVariant[tx.status] || "default"}>
                            {tx.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {stats.recent_transactions.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-text-muted text-sm"
                        >
                          No recent transactions
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Quick Links
            </h2>
          </CardHeader>
          <CardContent className="space-y-1">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-wedja-accent hover:bg-wedja-accent-muted transition-colors"
                >
                  <Icon size={16} />
                  {link.label}
                  <ArrowRight size={14} className="ml-auto opacity-50" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
