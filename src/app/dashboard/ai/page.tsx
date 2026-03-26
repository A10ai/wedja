"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Eye,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Wrench,
  ArrowRight,
  ChevronRight,
  Shield,
  Activity,
  GraduationCap,
  Brain,
  Zap,
  FileText,
  Megaphone,
  DollarSign,
  Target,
  Building2,
  BarChart3,
  Wifi,
  Calendar,
  Heart,
  Search,
  RefreshCw,
  Camera,
  Car,
  ShoppingCart,
  MapPin,
  AlertCircle,
  Sparkles,
  Video,
  AlertOctagon,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// ── Types ───────────────────────────────────────────────────

interface CrossDataInsight {
  id: string;
  type: string;
  severity: "info" | "opportunity" | "warning" | "critical";
  title: string;
  message: string;
  impact_egp: number;
  confidence: number;
  source_modules: string[];
  recommended_action: string;
  link?: string;
}

interface HealthScoreDimension {
  score: number;
  max: number;
  detail: string;
  link: string;
}

interface HealthScore {
  total: number;
  revenue: HealthScoreDimension;
  occupancy: HealthScoreDimension;
  tenant_quality: HealthScoreDimension;
  contracts: HealthScoreDimension;
  energy: HealthScoreDimension;
  maintenance: HealthScoreDimension;
  marketing: HealthScoreDimension;
  financial: HealthScoreDimension;
  cctv_security: HealthScoreDimension;
  social_media: HealthScoreDimension;
}

interface BriefingItem {
  text: string;
  trend?: "up" | "down" | "neutral";
  alert?: boolean;
}

interface BriefingSection {
  title: string;
  icon: string;
  items: BriefingItem[];
}

interface DailyBriefing {
  greeting: string;
  date: string;
  sections: Record<string, BriefingSection>;
  top_actions: Array<{ text: string; link: string; priority: "high" | "medium" | "low" }>;
}

interface PropertySnapshot {
  tenants: { total: number; by_category: Record<string, number> };
  occupancy_rate: number;
  revenue_this_month: number;
  footfall_today: number;
  footfall_trend: number;
  energy_cost_today: number;
  open_maintenance: number;
  urgent_maintenance: number;
  discrepancies_count: number;
  discrepancies_variance: number;
  expiring_leases_90d: number;
  active_campaigns: number;
  active_events: number;
  social_followers: number;
  social_growth: number;
  opportunity_cost_monthly: number;
  wale_years: number;
  health_score: number;
  total_monthly_rent_egp: number;
  top_tenant_by_rent: string;
  kiosk_revenue_total: number;
  cctv_alerts_active: number;
  parking_occupancy_pct: number;
  social_followers_total: number;
  store_avg_conversion_rate: number;
  dead_zones_count: number;
  queue_alerts_active: number;
  anomalies_active: number;
  anomalies_critical: number;
}

interface AIData {
  insights: CrossDataInsight[];
  health_score: HealthScore;
  briefing: DailyBriefing;
  snapshot: PropertySnapshot;
}

// ── Health Ring ─────────────────────────────────────────────

function HealthRing({ score, size = 220 }: { score: number; size?: number }) {
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";

  const label = score >= 75 ? "Healthy" : score >= 50 ? "Attention" : "Critical";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-wedja-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold font-mono" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-text-muted mt-0.5">/ 100</span>
        <span className="text-[10px] font-medium mt-1 px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}20`, color }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ── Dimension Bar ──────────────────────────────────────────

function DimensionBar({
  label,
  score,
  max,
  detail,
  link,
}: {
  label: string;
  score: number;
  max: number;
  detail: string;
  link: string;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color =
    pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <Link href={link} className="group block space-y-1 hover:bg-wedja-border/10 rounded-lg p-1.5 -mx-1.5 transition-colors">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary font-medium group-hover:text-wedja-accent transition-colors">{label}</span>
        <span className="text-text-muted font-mono">{score}/{max}</span>
      </div>
      <div className="h-1.5 bg-wedja-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-text-muted truncate">{detail}</p>
    </Link>
  );
}

// ── Severity Config ────────────────────────────────────────

const severityConfig: Record<
  string,
  { badge: "error" | "warning" | "success" | "info"; border: string; bg: string }
> = {
  critical: { badge: "error", border: "border-l-red-500", bg: "bg-red-500/5" },
  warning: { badge: "warning", border: "border-l-amber-500", bg: "bg-amber-500/5" },
  opportunity: { badge: "success", border: "border-l-emerald-500", bg: "bg-emerald-500/5" },
  info: { badge: "info", border: "border-l-blue-500", bg: "bg-blue-500/5" },
};

const moduleColors: Record<string, string> = {
  revenue: "bg-red-500/15 text-red-400",
  footfall: "bg-blue-500/15 text-blue-400",
  contracts: "bg-purple-500/15 text-purple-400",
  energy: "bg-yellow-500/15 text-yellow-400",
  finance: "bg-emerald-500/15 text-emerald-400",
  marketing: "bg-pink-500/15 text-pink-400",
  social: "bg-cyan-500/15 text-cyan-400",
  maintenance: "bg-orange-500/15 text-orange-400",
  "tenant-analytics": "bg-indigo-500/15 text-indigo-400",
  cctv: "bg-violet-500/15 text-violet-400",
  learning: "bg-teal-500/15 text-teal-400",
};

// ── Briefing Icon Map ──────────────────────────────────────

const briefingIcons: Record<string, any> = {
  Revenue: TrendingUp,
  Footfall: Users,
  Contracts: FileText,
  Energy: Zap,
  Maintenance: Wrench,
  Marketing: Megaphone,
  Finance: DollarSign,
  "CCTV/Security": Camera,
  "Social Media": Wifi,
  "AI Learning": Brain,
};

// ── Snapshot Metric Card ───────────────────────────────────

function MetricCard({
  label,
  value,
  subtext,
  link,
  icon: Icon,
  alert,
}: {
  label: string;
  value: string;
  subtext?: string;
  link: string;
  icon: any;
  alert?: boolean;
}) {
  return (
    <Link href={link}>
      <div className={`p-3 rounded-lg border transition-all hover:border-wedja-accent/50 hover:bg-wedja-border/10 cursor-pointer ${alert ? "border-red-500/30 bg-red-500/5" : "border-wedja-border/50 bg-wedja-border/20"}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={13} className={alert ? "text-red-400" : "text-text-muted"} />
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">{label}</span>
        </div>
        <p className={`text-base font-bold font-mono ${alert ? "text-red-400" : "text-text-primary"}`}>{value}</p>
        {subtext && <p className="text-[10px] text-text-muted mt-0.5">{subtext}</p>}
      </div>
    </Link>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function AICentrePage() {
  const [data, setData] = useState<AIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/ai/insights");
      if (!res.ok) throw new Error("Failed to fetch AI insights");
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
        <p className="text-xs text-text-muted">Cross-referencing all 11 modules...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error text-sm">{error || "Failed to load"}</p>
        <button onClick={fetchData} className="mt-3 text-xs text-wedja-accent hover:underline">Retry</button>
      </div>
    );
  }

  const { insights, health_score, briefing, snapshot } = data;

  // Group insights by severity
  const criticalInsights = insights.filter((i) => i.severity === "critical");
  const warningInsights = insights.filter((i) => i.severity === "warning");
  const opportunityInsights = insights.filter((i) => i.severity === "opportunity");
  const infoInsights = insights.filter((i) => i.severity === "info");
  const totalOpportunity = insights.reduce((s, i) => s + i.impact_egp, 0);

  const dimensionEntries: Array<{ key: string; label: string; dim: HealthScoreDimension }> = [
    { key: "revenue", label: "Revenue", dim: health_score.revenue },
    { key: "occupancy", label: "Occupancy", dim: health_score.occupancy },
    { key: "tenant_quality", label: "Tenant Quality", dim: health_score.tenant_quality },
    { key: "contracts", label: "Contracts", dim: health_score.contracts },
    { key: "energy", label: "Energy", dim: health_score.energy },
    { key: "maintenance", label: "Maintenance", dim: health_score.maintenance },
    { key: "marketing", label: "Marketing", dim: health_score.marketing },
    { key: "financial", label: "Financial", dim: health_score.financial },
    { key: "cctv_security", label: "CCTV/Security", dim: health_score.cctv_security },
    { key: "social_media", label: "Social Media", dim: health_score.social_media },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500/20 to-wedja-accent-muted">
              <Eye size={24} className="text-wedja-accent" />
            </div>
            AI Centre
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Cross-data intelligence hub — 11 modules, one view. Powered by real JDE data.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-wedja-accent transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* ── Total Opportunity Banner ── */}
      {totalOpportunity > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 via-wedja-accent-muted to-indigo-500/10 border border-indigo-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles size={20} className="text-indigo-400" />
              <div>
                <p className="text-xs text-indigo-300 font-medium uppercase tracking-wider">Total Financial Opportunity Identified</p>
                <p className="text-lg font-bold font-mono text-text-primary">{formatCurrency(totalOpportunity)}<span className="text-sm text-text-muted font-normal">/year</span></p>
              </div>
            </div>
            <div className="text-right text-xs text-text-muted">
              <p>{criticalInsights.length} critical</p>
              <p>{warningInsights.length} warning</p>
              <p>{opportunityInsights.length} opportunity</p>
            </div>
          </div>
        </div>
      )}

      {/* ── D. Real Revenue Summary Card ── */}
      {snapshot.revenue_this_month > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-emerald-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Q1 2026 Revenue</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">Real JDE Data</span>
                </div>
                <p className="text-lg font-bold font-mono text-text-primary">
                  {formatCurrency(snapshot.revenue_this_month)}
                  <span className="text-sm text-text-muted font-normal ml-2">collected this month from {snapshot.tenants.total} tenants</span>
                </p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-xs text-text-secondary">Top tenant: <span className="font-semibold text-text-primary">{snapshot.top_tenant_by_rent}</span></p>
                <p className="text-xs text-text-secondary">Monthly contracted: <span className="font-mono font-semibold">{formatCurrency(snapshot.total_monthly_rent_egp)}</span></p>
                {snapshot.kiosk_revenue_total > 0 && (
                  <p className="text-xs text-text-secondary">Kiosks: <span className="font-mono font-semibold">{formatCurrency(snapshot.kiosk_revenue_total)}</span>/mo</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── A. Health Score + B. Daily Briefing ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Health Score */}
        <div className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Shield size={16} className="text-wedja-accent" />
                Property Health — 10 Dimensions
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <HealthRing score={health_score.total} size={220} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {dimensionEntries.map(({ key, label, dim }) => (
                  <DimensionBar
                    key={key}
                    label={label}
                    score={dim.score}
                    max={dim.max}
                    detail={dim.detail}
                    link={dim.link}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Briefing */}
        <div className="lg:col-span-8">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Activity size={16} className="text-wedja-accent" />
                  Daily Briefing — 10 Sections
                </h2>
                <span className="text-xs text-text-muted">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-text-primary mb-4">
                {briefing.greeting}, here is your property update.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                {Object.values(briefing.sections).map((section) => {
                  const Icon = briefingIcons[section.title] || Eye;
                  return (
                    <div
                      key={section.title}
                      className="p-2.5 rounded-lg bg-wedja-border/20 border border-wedja-border/50"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon size={12} className="text-wedja-accent" />
                        <h3 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider">
                          {section.title}
                        </h3>
                      </div>
                      <ul className="space-y-1">
                        {section.items.map((item: BriefingItem, i: number) => (
                          <li key={i} className="text-[11px] text-text-secondary flex items-start gap-1">
                            {item.alert ? (
                              <AlertTriangle size={9} className="text-red-400 mt-0.5 shrink-0" />
                            ) : item.trend === "up" ? (
                              <TrendingUp size={9} className="text-emerald-400 mt-0.5 shrink-0" />
                            ) : item.trend === "down" ? (
                              <TrendingDown size={9} className="text-red-400 mt-0.5 shrink-0" />
                            ) : (
                              <ChevronRight size={9} className="text-wedja-accent mt-0.5 shrink-0" />
                            )}
                            <span className={item.alert ? "text-red-400" : ""}>{item.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Top 5 Actions */}
              {briefing.top_actions.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-wedja-accent-muted to-indigo-500/10 border border-wedja-accent/20">
                  <h4 className="text-[10px] font-semibold text-wedja-accent uppercase tracking-wider mb-2">
                    Top 5 Actions for Today
                  </h4>
                  <div className="space-y-1.5">
                    {briefing.top_actions.map((action, i) => (
                      <Link
                        key={i}
                        href={action.link}
                        className="flex items-center gap-2 text-xs text-text-primary hover:text-wedja-accent transition-colors group"
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          action.priority === "high"
                            ? "bg-red-500/20 text-red-400"
                            : action.priority === "medium"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {i + 1}
                        </span>
                        <span className="group-hover:underline">{action.text}</span>
                        <ArrowRight size={10} className="text-text-muted group-hover:text-wedja-accent ml-auto shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Charts Row: Radar + Severity Donut + Impact by Module ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radar Chart — Health Dimensions */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Shield size={16} className="text-wedja-accent" />
              Health Radar
            </h2>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart
                data={dimensionEntries.map(({ label, dim }) => ({
                  dimension: label,
                  score: dim.max > 0 ? Math.round((dim.score / dim.max) * 100) : 0,
                  fullMark: 100,
                }))}
              >
                <PolarGrid stroke="#1F2937" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "#6B7280", fontSize: 10 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#6B7280", fontSize: 9 }}
                  axisLine={false}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#4F46E5"
                  fill="#4F46E5"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "1px solid #1F2937",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#F9FAFB", fontSize: 12 }}
                  itemStyle={{ color: "#4F46E5", fontSize: 11 }}
                  formatter={(value: any) => [`${value}%`, "Score"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart — Insight Severity Breakdown */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Eye size={16} className="text-wedja-accent" />
              Insights by Severity
            </h2>
          </CardHeader>
          <CardContent>
            {(() => {
              const severityData = [
                { name: "Critical", value: criticalInsights.length, color: "#EF4444" },
                { name: "Warning", value: warningInsights.length, color: "#F59E0B" },
                { name: "Opportunity", value: opportunityInsights.length, color: "#10B981" },
                { name: "Info", value: infoInsights.length, color: "#3B82F6" },
              ].filter((d) => d.value > 0);

              if (severityData.length === 0) {
                return (
                  <div className="flex items-center justify-center h-[280px] text-text-muted text-sm">
                    No active insights
                  </div>
                );
              }

              return (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {severityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #1F2937",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#F9FAFB", fontSize: 12 }}
                      itemStyle={{ color: "#9CA3AF", fontSize: 11 }}
                      formatter={(value: any, name: any) => [`${value} insights`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {[
                { label: "Critical", count: criticalInsights.length, color: "#EF4444" },
                { label: "Warning", count: warningInsights.length, color: "#F59E0B" },
                { label: "Opportunity", count: opportunityInsights.length, color: "#10B981" },
                { label: "Info", count: infoInsights.length, color: "#3B82F6" },
              ]
                .filter((d) => d.count > 0)
                .map((d) => (
                  <div key={d.label} className="flex items-center gap-1.5 text-[10px] text-text-muted">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.label} ({d.count})
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart — Impact by Module */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Target size={16} className="text-wedja-accent" />
              Impact by Module (EGP)
            </h2>
          </CardHeader>
          <CardContent>
            {(() => {
              const moduleImpact: Record<string, number> = {};
              insights.forEach((insight) => {
                insight.source_modules.forEach((mod) => {
                  moduleImpact[mod] = (moduleImpact[mod] || 0) + insight.impact_egp;
                });
              });
              const barData = Object.entries(moduleImpact)
                .map(([module, impact]) => ({ module, impact }))
                .sort((a, b) => b.impact - a.impact)
                .slice(0, 8);

              if (barData.length === 0) {
                return (
                  <div className="flex items-center justify-center h-[280px] text-text-muted text-sm">
                    No impact data
                  </div>
                );
              }

              const barColors = [
                "#4F46E5", "#EF4444", "#10B981", "#3B82F6",
                "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
              ];

              return (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#6B7280", fontSize: 10 }}
                      tickFormatter={(value: any) =>
                        value >= 1000000
                          ? `${(value / 1000000).toFixed(1)}M`
                          : value >= 1000
                          ? `${(value / 1000).toFixed(0)}K`
                          : `${value}`
                      }
                      axisLine={{ stroke: "#1F2937" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="module"
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      width={80}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #1F2937",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#F9FAFB", fontSize: 12 }}
                      itemStyle={{ color: "#4F46E5", fontSize: 11 }}
                      formatter={(value: any) => [formatCurrency(value), "Impact"]}
                    />
                    <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                      {barData.map((_entry, index) => (
                        <Cell key={`bar-${index}`} fill={barColors[index % barColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ── C. Cross-Data Insights Feed ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Eye size={16} className="text-wedja-accent" />
              Cross-Data Insights
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                {criticalInsights.length > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">{criticalInsights.length} critical</span>}
                {warningInsights.length > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">{warningInsights.length} warning</span>}
                {opportunityInsights.length > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">{opportunityInsights.length} opportunity</span>}
              </div>
              <span className="text-xs text-text-muted">
                {insights.length} active — sorted by EGP impact
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {insights.length === 0 && (
            <div className="py-8 text-center text-text-muted text-sm">
              No active insights. Property is running smoothly.
            </div>
          )}
          <div className="divide-y divide-wedja-border/50">
            {insights.map((insight) => {
              const config = severityConfig[insight.severity] || severityConfig.info;
              return (
                <div
                  key={insight.id}
                  className={`px-5 py-4 border-l-4 ${config.border} ${config.bg} hover:bg-wedja-border/10 transition-colors`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <Badge variant={config.badge}>{insight.severity}</Badge>
                        {insight.source_modules.map((mod) => (
                          <span
                            key={mod}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${moduleColors[mod] || "bg-gray-500/15 text-gray-400"}`}
                          >
                            {mod}
                          </span>
                        ))}
                      </div>
                      <h3 className="text-sm font-medium text-text-primary">{insight.title}</h3>
                      <p className="text-xs text-text-muted mt-1">{insight.message}</p>
                      <div className="mt-2 flex items-start gap-1.5">
                        <Target size={10} className="text-wedja-accent mt-0.5 shrink-0" />
                        <p className="text-[11px] text-text-secondary">{insight.recommended_action}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1.5 min-w-[120px]">
                      {insight.impact_egp > 0 && (
                        <p className="text-sm font-bold font-mono text-wedja-accent">
                          {formatCurrency(insight.impact_egp)}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-12 h-1.5 bg-wedja-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-wedja-accent transition-all"
                            style={{ width: `${insight.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted font-mono">
                          {(insight.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      {insight.link && (
                        <Link
                          href={insight.link}
                          className="inline-flex items-center gap-1 text-[10px] text-wedja-accent hover:underline"
                        >
                          View <ArrowRight size={9} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── E. Property Snapshot Grid — 4x4 ── */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-wedja-accent" />
          Property Snapshot — 16 Metrics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Row 1 */}
          <MetricCard
            label="Tenants"
            value={formatNumber(snapshot.tenants.total)}
            subtext="Active tenants"
            link="/dashboard/tenants"
            icon={Building2}
          />
          <MetricCard
            label="Occupancy"
            value={formatPercentage(snapshot.occupancy_rate, 0)}
            link="/dashboard/contracts"
            icon={Heart}
          />
          <MetricCard
            label="Monthly Rent"
            value={formatCurrency(snapshot.total_monthly_rent_egp)}
            subtext="Contracted"
            link="/dashboard/finance"
            icon={DollarSign}
          />
          <MetricCard
            label="Footfall Today"
            value={formatNumber(snapshot.footfall_today)}
            subtext={snapshot.footfall_trend !== 0 ? `${snapshot.footfall_trend > 0 ? "+" : ""}${snapshot.footfall_trend}% vs last week` : undefined}
            link="/dashboard/footfall"
            icon={Users}
          />

          {/* Row 2 */}
          <MetricCard
            label="Energy Cost"
            value={formatCurrency(snapshot.energy_cost_today)}
            subtext="Today"
            link="/dashboard/energy"
            icon={Zap}
          />
          <MetricCard
            label="Maintenance"
            value={`${snapshot.open_maintenance} open`}
            subtext={snapshot.urgent_maintenance > 0 ? `${snapshot.urgent_maintenance} urgent` : undefined}
            link="/dashboard/maintenance"
            icon={Wrench}
            alert={snapshot.urgent_maintenance > 0}
          />
          <MetricCard
            label="Discrepancies"
            value={formatNumber(snapshot.discrepancies_count)}
            subtext={snapshot.discrepancies_count > 0 ? `EGP ${formatNumber(Math.round(snapshot.discrepancies_variance))} variance` : undefined}
            link="/dashboard/discrepancies"
            icon={Search}
            alert={snapshot.discrepancies_count > 3}
          />
          <MetricCard
            label="Expiring Leases"
            value={formatNumber(snapshot.expiring_leases_90d)}
            subtext="Within 90 days"
            link="/dashboard/contracts"
            icon={FileText}
            alert={snapshot.expiring_leases_90d > 3}
          />

          {/* Row 3 */}
          <MetricCard
            label="Campaigns"
            value={`${snapshot.active_campaigns} active`}
            subtext={snapshot.active_events > 0 ? `${snapshot.active_events} events` : undefined}
            link="/dashboard/marketing"
            icon={Megaphone}
          />
          <MetricCard
            label="Social Followers"
            value={formatNumber(snapshot.social_followers_total)}
            subtext={snapshot.social_growth > 0 ? `+${formatNumber(snapshot.social_growth)} in 30d` : undefined}
            link="/dashboard/social"
            icon={Wifi}
          />
          <MetricCard
            label="Parking"
            value={`${snapshot.parking_occupancy_pct}%`}
            subtext="Occupancy"
            link="/dashboard/cctv"
            icon={Car}
          />
          <MetricCard
            label="CCTV Alerts"
            value={formatNumber(snapshot.cctv_alerts_active)}
            subtext="Active"
            link="/dashboard/cctv"
            icon={Camera}
            alert={snapshot.cctv_alerts_active > 0}
          />

          {/* Row 4 */}
          <MetricCard
            label="Store Conversion"
            value={`${snapshot.store_avg_conversion_rate}%`}
            subtext="Mall average"
            link="/dashboard/cctv"
            icon={ShoppingCart}
          />
          <MetricCard
            label="Dead Zones"
            value={formatNumber(snapshot.dead_zones_count)}
            subtext="Low traffic areas"
            link="/dashboard/cctv"
            icon={MapPin}
            alert={snapshot.dead_zones_count > 2}
          />
          <MetricCard
            label="Queue Alerts"
            value={formatNumber(snapshot.queue_alerts_active)}
            subtext="Active"
            link="/dashboard/cctv"
            icon={AlertCircle}
            alert={snapshot.queue_alerts_active > 0}
          />
          <MetricCard
            label="Anomalies"
            value={formatNumber(snapshot.anomalies_active)}
            subtext={snapshot.anomalies_critical > 0 ? `${snapshot.anomalies_critical} critical` : "Active"}
            link="/dashboard/anomalies"
            icon={AlertOctagon}
            alert={snapshot.anomalies_critical > 0}
          />
          <MetricCard
            label="WALE"
            value={`${snapshot.wale_years.toFixed(1)} yrs`}
            subtext="Weighted avg lease expiry"
            link="/dashboard/contracts"
            icon={Calendar}
          />
        </div>
      </div>

      {/* ── F. Quick Actions — 6 now ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "Anomaly Detection", sub: "AI watchdog alerts", href: "/dashboard/anomalies", icon: AlertOctagon, color: "bg-red-500/10 text-red-500" },
          { label: "Revenue Verification", sub: "Review discrepancies", href: "/dashboard/discrepancies", icon: AlertTriangle, color: "bg-orange-500/10 text-orange-500" },
          { label: "Expiring Leases", sub: "Contract renewals", href: "/dashboard/contracts", icon: FileText, color: "bg-purple-500/10 text-purple-500" },
          { label: "Underperformers", sub: "Tenant analytics", href: "/dashboard/tenant-analytics", icon: BarChart3, color: "bg-indigo-500/10 text-indigo-500" },
          { label: "Social Ideas", sub: "Content calendar", href: "/dashboard/social", icon: Megaphone, color: "bg-pink-500/10 text-pink-500" },
          { label: "CCTV Overview", sub: "Cameras & security", href: "/dashboard/cctv", icon: Video, color: "bg-violet-500/10 text-violet-500" },
          { label: "Energy Savings", sub: "Optimization ideas", href: "/dashboard/energy", icon: Zap, color: "bg-yellow-500/10 text-yellow-500" },
        ].map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="hover:border-wedja-accent/50 transition-colors cursor-pointer">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${action.color}`}>
                    <action.icon size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-primary">{action.label}</p>
                    <p className="text-[10px] text-text-muted">{action.sub}</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-text-muted" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── G. Learning Status ── */}
      <Link href="/dashboard/ai/learning">
        <Card className="hover:border-wedja-accent/50 transition-colors cursor-pointer overflow-hidden">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative p-3 rounded-xl bg-gradient-to-br from-wedja-accent-muted to-indigo-500/10">
                  <GraduationCap size={20} className="text-wedja-accent" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wedja-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-wedja-accent" />
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Brain size={14} className="text-wedja-accent" />
                    Learning Engine
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Wedja is getting smarter every day. View calibrated parameters, discovered patterns, and learning history.
                  </p>
                </div>
              </div>
              <ArrowRight size={16} className="text-text-muted shrink-0 ml-4" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
