"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Eye,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Users,
  Wrench,
  ArrowRight,
  ChevronRight,
  Shield,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface AIInsight {
  id: string;
  type: string;
  severity: "info" | "opportunity" | "warning" | "critical";
  title: string;
  message: string;
  impact_estimate: string;
  confidence: number;
}

interface HealthScore {
  total: number;
  occupancy: { score: number; max: number; detail: string };
  revenue: { score: number; max: number; detail: string };
  maintenance: { score: number; max: number; detail: string };
  tenant: { score: number; max: number; detail: string };
}

interface BriefingSection {
  title: string;
  items: string[];
}

interface DailyBriefing {
  greeting: string;
  date: string;
  sections: {
    footfall: BriefingSection;
    revenue: BriefingSection;
    maintenance: BriefingSection;
    alerts: BriefingSection;
  };
  summary: string;
}

interface TenantCard {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  revenue_per_sqm: number;
  footfall_attraction: number;
  payment_reliability: number;
  discrepancy_risk: number;
  overall_score: number;
}

interface AIData {
  insights: AIInsight[];
  health_score: HealthScore;
  briefing: DailyBriefing;
  tenant_performance: TenantCard[];
}

// Health ring SVG component
function HealthRing({
  score,
  size = 180,
}: {
  score: number;
  size?: number;
}) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "#10B981"
      : score >= 60
      ? "#F59E0B"
      : score >= 40
      ? "#F97316"
      : "#EF4444";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-custis-border"
        />
        {/* Score ring */}
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
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold font-mono"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
    </div>
  );
}

// Small bar for score breakdown
function ScoreBar({
  score,
  max,
  label,
  detail,
}: {
  score: number;
  max: number;
  label: string;
  detail: string;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 60
      ? "bg-amber-500"
      : pct >= 40
      ? "bg-orange-500"
      : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary font-medium">{label}</span>
        <span className="text-text-muted font-mono">
          {score}/{max}
        </span>
      </div>
      <div className="h-2 bg-custis-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-text-muted">{detail}</p>
    </div>
  );
}

const severityConfig: Record<
  string,
  { badge: "error" | "warning" | "success" | "info"; border: string }
> = {
  critical: { badge: "error", border: "border-l-red-500" },
  warning: { badge: "warning", border: "border-l-amber-500" },
  opportunity: { badge: "success", border: "border-l-emerald-500" },
  info: { badge: "info", border: "border-l-blue-500" },
};

export default function AIPage() {
  const [data, setData] = useState<AIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
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
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-custis-gold" />
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

  const { insights, health_score, briefing, tenant_performance } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Eye size={28} className="text-custis-gold" />
          AI Centre
        </h1>
        <p className="text-sm text-text-muted mt-1">
          AI-powered insights, property health, and daily briefing
        </p>
      </div>

      {/* Top row: Health Score + Daily Briefing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health Score */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Shield size={16} className="text-custis-gold" />
              Property Health
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex justify-center">
              <HealthRing score={health_score.total} />
            </div>
            <div className="space-y-3">
              <ScoreBar
                label="Occupancy"
                score={health_score.occupancy.score}
                max={health_score.occupancy.max}
                detail={health_score.occupancy.detail}
              />
              <ScoreBar
                label="Revenue"
                score={health_score.revenue.score}
                max={health_score.revenue.max}
                detail={health_score.revenue.detail}
              />
              <ScoreBar
                label="Maintenance"
                score={health_score.maintenance.score}
                max={health_score.maintenance.max}
                detail={health_score.maintenance.detail}
              />
              <ScoreBar
                label="Tenant"
                score={health_score.tenant.score}
                max={health_score.tenant.max}
                detail={health_score.tenant.detail}
              />
            </div>
          </CardContent>
        </Card>

        {/* Daily Briefing */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Activity size={16} className="text-custis-gold" />
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
            </CardHeader>
            <CardContent>
              <p className="text-base font-medium text-text-primary mb-4">
                {briefing.greeting}, here is your property update.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.values(briefing.sections).map((section) => {
                  const icons: Record<string, any> = {
                    Footfall: Users,
                    "Revenue & Collections": TrendingUp,
                    Maintenance: Wrench,
                    "Key Alerts": AlertTriangle,
                  };
                  const Icon = icons[section.title] || Eye;

                  return (
                    <div
                      key={section.title}
                      className="p-3 rounded-lg bg-custis-border/20 border border-custis-border/50"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={14} className="text-custis-gold" />
                        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                          {section.title}
                        </h3>
                      </div>
                      <ul className="space-y-1">
                        {section.items.map((item, i) => (
                          <li
                            key={i}
                            className="text-xs text-text-secondary flex items-start gap-1.5"
                          >
                            <ChevronRight
                              size={10}
                              className="text-custis-gold mt-0.5 shrink-0"
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-text-muted mt-4 italic">
                {briefing.summary}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Insights Feed */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Eye size={16} className="text-custis-gold" />
            AI Insights
          </h2>
          <span className="text-xs text-text-muted">
            {insights.length} active
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {insights.length === 0 && (
            <div className="py-8 text-center text-text-muted text-sm">
              No active insights. Property is running smoothly.
            </div>
          )}
          <div className="divide-y divide-custis-border/50">
            {insights.map((insight) => {
              const config = severityConfig[insight.severity] || severityConfig.info;
              return (
                <div
                  key={insight.id}
                  className={`px-5 py-4 border-l-4 ${config.border} hover:bg-custis-border/10 transition-colors`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={config.badge}>
                          {insight.severity}
                        </Badge>
                        <Badge variant="default">{insight.type}</Badge>
                      </div>
                      <h3 className="text-sm font-medium text-text-primary">
                        {insight.title}
                      </h3>
                      <p className="text-xs text-text-muted mt-1">
                        {insight.message}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-custis-gold">
                        {insight.impact_estimate}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {(insight.confidence * 100).toFixed(0)}% confidence
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tenant Performance Rankings */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <TrendingUp size={16} className="text-custis-gold" />
            Tenant Performance Rankings
          </h2>
          <span className="text-xs text-text-muted">
            {tenant_performance.length} tenants
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-custis-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    #
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Score
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Revenue/sqm
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                    Footfall
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                    Payment
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                    Risk
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenant_performance.map((t, i) => {
                  const isTop5 = i < 5;
                  const isBottom5 =
                    i >= tenant_performance.length - 5 &&
                    tenant_performance.length > 10;
                  const rowBg = isTop5
                    ? "bg-emerald-500/5"
                    : isBottom5
                    ? "bg-red-500/5"
                    : i % 2 === 1
                    ? "bg-custis-border/10"
                    : "";

                  const scoreColor =
                    t.overall_score >= 70
                      ? "text-emerald-500"
                      : t.overall_score >= 40
                      ? "text-amber-500"
                      : "text-red-500";

                  const barWidth = Math.min(t.overall_score, 100);
                  const barColor =
                    t.overall_score >= 70
                      ? "bg-emerald-500"
                      : t.overall_score >= 40
                      ? "bg-amber-500"
                      : "bg-red-500";

                  return (
                    <tr
                      key={t.tenant_id}
                      className={`border-b border-custis-border/50 hover:bg-custis-border/20 ${rowBg}`}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-text-muted">
                        {i + 1}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-text-primary font-medium">
                          {t.brand_name}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {t.unit_number} &middot; {t.category}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 justify-center">
                          <span
                            className={`font-mono font-bold text-sm ${scoreColor}`}
                          >
                            {t.overall_score.toFixed(0)}
                          </span>
                          <div className="w-16 h-2 bg-custis-border rounded-full overflow-hidden hidden sm:block">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-primary">
                        {formatCurrency(t.revenue_per_sqm)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-secondary hidden md:table-cell">
                        {t.footfall_attraction.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-secondary hidden md:table-cell">
                        {t.payment_reliability.toFixed(0)}%
                      </td>
                      <td className="px-5 py-3 text-right hidden lg:table-cell">
                        <Badge
                          variant={
                            t.discrepancy_risk >= 50
                              ? "error"
                              : t.discrepancy_risk >= 20
                              ? "warning"
                              : "success"
                          }
                        >
                          {t.discrepancy_risk}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/dashboard/discrepancies">
          <Card className="hover:border-custis-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Revenue Verification
                  </p>
                  <p className="text-xs text-text-muted">
                    Review discrepancies
                  </p>
                </div>
              </div>
              <ArrowRight size={16} className="text-text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/footfall">
          <Card className="hover:border-custis-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    View Footfall
                  </p>
                  <p className="text-xs text-text-muted">
                    Traffic analysis
                  </p>
                </div>
              </div>
              <ArrowRight size={16} className="text-text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/maintenance">
          <Card className="hover:border-custis-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Wrench size={18} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Check Maintenance
                  </p>
                  <p className="text-xs text-text-muted">
                    Open tickets
                  </p>
                </div>
              </div>
              <ArrowRight size={16} className="text-text-muted" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
