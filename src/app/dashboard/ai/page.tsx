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
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";

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
}

interface AIData {
  insights: CrossDataInsight[];
  health_score: HealthScore;
  briefing: DailyBriefing;
  snapshot: PropertySnapshot;
}

// ── Health Ring ─────────────────────────────────────────────

function HealthRing({ score, size = 200 }: { score: number; size?: number }) {
  const strokeWidth = 14;
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
        <p className="text-xs text-text-muted">Cross-referencing all modules...</p>
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

  const dimensionEntries: Array<{ key: string; label: string; dim: HealthScoreDimension }> = [
    { key: "revenue", label: "Revenue", dim: health_score.revenue },
    { key: "occupancy", label: "Occupancy", dim: health_score.occupancy },
    { key: "tenant_quality", label: "Tenant Quality", dim: health_score.tenant_quality },
    { key: "contracts", label: "Contracts", dim: health_score.contracts },
    { key: "energy", label: "Energy", dim: health_score.energy },
    { key: "maintenance", label: "Maintenance", dim: health_score.maintenance },
    { key: "marketing", label: "Marketing", dim: health_score.marketing },
    { key: "financial", label: "Financial", dim: health_score.financial },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-wedja-accent-muted">
              <Eye size={24} className="text-wedja-accent" />
            </div>
            AI Centre
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Cross-data intelligence hub — all modules, one view
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

      {/* ── A. Health Score + B. Daily Briefing ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Health Score — prominent center */}
        <div className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Shield size={16} className="text-wedja-accent" />
                Property Health
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <HealthRing score={health_score.total} />
              </div>
              <div className="space-y-2">
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
                  Daily Briefing
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

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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

              {/* Top 3 Actions */}
              {briefing.top_actions.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-wedja-accent-muted border border-wedja-accent/20">
                  <h4 className="text-[10px] font-semibold text-wedja-accent uppercase tracking-wider mb-2">
                    Top Actions for Today
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

      {/* ── C. Cross-Data Insights Feed ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Eye size={16} className="text-wedja-accent" />
              Cross-Data Insights
            </h2>
            <span className="text-xs text-text-muted">
              {insights.length} active — sorted by EGP impact
            </span>
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
                      {/* Badges row */}
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
                      {/* Title + message */}
                      <h3 className="text-sm font-medium text-text-primary">{insight.title}</h3>
                      <p className="text-xs text-text-muted mt-1">{insight.message}</p>
                      {/* Recommended action */}
                      <div className="mt-2 flex items-start gap-1.5">
                        <Target size={10} className="text-wedja-accent mt-0.5 shrink-0" />
                        <p className="text-[11px] text-text-secondary">{insight.recommended_action}</p>
                      </div>
                    </div>
                    {/* Right side: impact + confidence + link */}
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

      {/* ── D. Property Snapshot Grid ── */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-wedja-accent" />
          Property Snapshot
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
            label="Revenue MTD"
            value={formatCurrency(snapshot.revenue_this_month)}
            link="/dashboard/finance"
            icon={TrendingUp}
          />
          <MetricCard
            label="Footfall Today"
            value={formatNumber(snapshot.footfall_today)}
            subtext={snapshot.footfall_trend !== 0 ? `${snapshot.footfall_trend > 0 ? "+" : ""}${snapshot.footfall_trend}% vs last week` : undefined}
            link="/dashboard/footfall"
            icon={Users}
          />
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
          <MetricCard
            label="Campaigns"
            value={`${snapshot.active_campaigns} active`}
            subtext={snapshot.active_events > 0 ? `${snapshot.active_events} events` : undefined}
            link="/dashboard/marketing"
            icon={Megaphone}
          />
          <MetricCard
            label="Social Followers"
            value={formatNumber(snapshot.social_followers)}
            subtext={snapshot.social_growth > 0 ? `+${formatNumber(snapshot.social_growth)} in 30d` : undefined}
            link="/dashboard/social"
            icon={Wifi}
          />
          <MetricCard
            label="Opportunity Cost"
            value={formatCurrency(snapshot.opportunity_cost_monthly)}
            subtext="Monthly potential gain"
            link="/dashboard/tenant-analytics"
            icon={DollarSign}
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

      {/* ── E. Quick Actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Run Revenue Verification", sub: "Review discrepancies", href: "/dashboard/discrepancies", icon: AlertTriangle, color: "bg-red-500/10 text-red-500" },
          { label: "View Expiring Leases", sub: "Contract renewals", href: "/dashboard/contracts", icon: FileText, color: "bg-purple-500/10 text-purple-500" },
          { label: "Check Underperformers", sub: "Tenant analytics", href: "/dashboard/tenant-analytics", icon: BarChart3, color: "bg-amber-500/10 text-amber-500" },
          { label: "Social Media Ideas", sub: "Content calendar", href: "/dashboard/social", icon: Megaphone, color: "bg-pink-500/10 text-pink-500" },
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

      {/* ── F. Learning Status ── */}
      <Link href="/dashboard/ai/learning">
        <Card className="hover:border-wedja-accent/50 transition-colors cursor-pointer overflow-hidden">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative p-3 rounded-xl bg-wedja-accent-muted">
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
