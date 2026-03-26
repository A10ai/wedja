"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ArrowRight,
  Users,
  FileText,
  Zap,
  Wrench,
  Megaphone,
  DollarSign,
  Shield,
  Wifi,
  Brain,
  RefreshCw,
  Sun,
  Sunset,
  Moon,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

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

interface TopAction {
  text: string;
  link: string;
  priority: "high" | "medium" | "low";
}

interface DailyBriefing {
  greeting: string;
  date: string;
  sections: Record<string, BriefingSection>;
  top_actions: TopAction[];
}

interface HealthScore {
  overall?: number;
  total?: number;
  dimensions?: Record<string, number>;
  [key: string]: any;
}

interface BriefingData {
  briefing: DailyBriefing;
  health_score: HealthScore;
}

// ── Icon Map ──────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  TrendingUp,
  Users,
  FileText,
  Zap,
  Wrench,
  Megaphone,
  DollarSign,
  Shield,
  Wifi,
  Brain,
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; badge: "error" | "warning" | "default" }> = {
  high: { bg: "border-red-500/30 bg-red-500/5", text: "text-red-500", badge: "error" },
  medium: { bg: "border-amber-500/30 bg-amber-500/5", text: "text-amber-500", badge: "warning" },
  low: { bg: "border-wedja-border", text: "text-text-muted", badge: "default" },
};

// ── Helpers ───────────────────────────────────────────────────

function getGreetingIcon(): LucideIcon {
  const hour = new Date().getHours();
  if (hour < 12) return Sun;
  if (hour < 17) return Sunset;
  return Moon;
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function getHealthBg(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function getHealthLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Attention Needed";
  return "Critical";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Section Order ─────────────────────────────────────────────

const SECTION_ORDER = [
  "revenue",
  "footfall",
  "finance",
  "maintenance",
  "energy",
  "contracts",
  "cctv",
  "marketing",
  "social",
  "learning",
];

// ── Page Component ────────────────────────────────────────────

export default function BriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchBriefing() {
    try {
      const res = await fetch("/api/v1/ai/insights");
      if (!res.ok) throw new Error("Failed to fetch briefing");
      const json = await res.json();
      setData({
        briefing: json.briefing,
        health_score: json.health_score,
      });
    } catch (err) {
      console.error("Briefing error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchBriefing();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchBriefing();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
        <p className="text-sm text-text-muted">Preparing your daily briefing...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error text-sm">Failed to load briefing</p>
        <Button size="sm" className="mt-4" onClick={handleRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  const { briefing, health_score } = data;
  const GreetingIcon = getGreetingIcon();

  // Normalize health score — API returns {total, revenue: {score}, ...}
  const healthOverall = health_score?.overall ?? health_score?.total ?? 0;
  const healthDimensions: Record<string, number> = health_score?.dimensions ?? {};
  // If dimensions is empty, extract from health_score object
  if (Object.keys(healthDimensions).length === 0 && health_score) {
    for (const [key, val] of Object.entries(health_score)) {
      if (key !== "total" && key !== "overall" && key !== "dimensions" && key !== "details" && typeof val === "object" && val?.score !== undefined) {
        healthDimensions[key] = val.score;
      }
    }
  }

  // Count alerts across all sections
  const alertCount = Object.values(briefing.sections).reduce(
    (count, section) => count + section.items.filter((i) => i.alert).length,
    0
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* ── Greeting Header ────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <GreetingIcon size={28} className="text-wedja-accent" />
            <h1 className="text-2xl font-bold text-text-primary">
              {briefing.greeting}
            </h1>
          </div>
          <p className="text-sm text-text-muted pl-[40px]">
            {formatDate(briefing.date)} &mdash; Senzo Mall, Hurghada
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            size={14}
            className={cn(refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* ── Health Score + Alert Summary ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Health Score */}
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Property Health
              </span>
              <Badge
                variant={
                  healthOverall >= 80
                    ? "success"
                    : healthOverall >= 60
                    ? "warning"
                    : "error"
                }
              >
                {getHealthLabel(healthOverall)}
              </Badge>
            </div>
            <div className="flex items-end gap-3">
              <span
                className={`text-4xl font-bold font-mono ${getHealthColor(
                  healthOverall
                )}`}
              >
                {healthOverall}
              </span>
              <span className="text-sm text-text-muted mb-1">/ 100</span>
            </div>
            {/* Mini dimension bars */}
            <div className="mt-4 space-y-2">
              {Object.entries(healthDimensions || {})
                .slice(0, 5)
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted w-20 capitalize truncate">
                      {key.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 h-1.5 bg-wedja-border/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getHealthBg(
                          value
                        )}`}
                        style={{ width: `${Math.min(value, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-text-muted w-7 text-right">
                      {value}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Alert Summary */}
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Today&apos;s Summary
              </span>
              {alertCount > 0 && (
                <Badge variant="error">{alertCount} alert{alertCount !== 1 ? "s" : ""}</Badge>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-wedja-accent-muted">
                  <CheckCircle2 size={16} className="text-wedja-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {briefing.top_actions.length} actions pending
                  </p>
                  <p className="text-xs text-text-muted">
                    {briefing.top_actions.filter((a) => a.priority === "high").length} high priority
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-wedja-accent-muted">
                  <Clock size={16} className="text-wedja-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {Object.keys(briefing.sections).length} modules reporting
                  </p>
                  <p className="text-xs text-text-muted">
                    All systems operational
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Actions ────────────────────────────────────── */}
      {briefing.top_actions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <AlertTriangle size={14} className="text-wedja-accent" />
              Priority Actions
            </h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {briefing.top_actions.map((action, i) => {
              const style = PRIORITY_STYLES[action.priority];
              return (
                <Link
                  key={i}
                  href={action.link}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors hover:border-wedja-accent/50 group ${style.bg}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-sm font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        action.priority === "high"
                          ? "bg-red-500/20 text-red-500"
                          : action.priority === "medium"
                          ? "bg-amber-500/20 text-amber-500"
                          : "bg-wedja-border text-text-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm text-text-primary truncate">
                      {action.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={style.badge}>{action.priority}</Badge>
                    <ArrowRight
                      size={14}
                      className="text-text-muted group-hover:text-wedja-accent transition-colors"
                    />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Briefing Sections Grid ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTION_ORDER.map((key) => {
          const section = briefing.sections[key];
          if (!section) return null;
          const Icon = ICON_MAP[section.icon] || TrendingUp;
          const hasAlerts = section.items.some((i) => i.alert);

          return (
            <Card
              key={key}
              className={cn(hasAlerts && "border-status-warning/30")}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={cn(
                      "p-1.5 rounded-md",
                      hasAlerts
                        ? "bg-status-warning/10"
                        : "bg-wedja-accent-muted"
                    )}
                  >
                    <Icon
                      size={14}
                      className={
                        hasAlerts
                          ? "text-status-warning"
                          : "text-wedja-accent"
                      }
                    />
                  </div>
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                    {section.title}
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2"
                    >
                      {item.alert ? (
                        <AlertTriangle
                          size={12}
                          className="text-status-warning mt-0.5 shrink-0"
                        />
                      ) : item.trend === "up" ? (
                        <TrendingUp
                          size={12}
                          className="text-status-success mt-0.5 shrink-0"
                        />
                      ) : item.trend === "down" ? (
                        <TrendingDown
                          size={12}
                          className="text-status-error mt-0.5 shrink-0"
                        />
                      ) : (
                        <Minus
                          size={12}
                          className="text-text-muted mt-0.5 shrink-0"
                        />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          item.alert
                            ? "text-status-warning font-medium"
                            : "text-text-secondary"
                        )}
                      >
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="text-center py-4">
        <p className="text-xs text-text-muted">
          Briefing generated by wedja.ai &mdash; powered by cross-data intelligence across{" "}
          {Object.keys(briefing.sections).length} modules
        </p>
      </div>
    </div>
  );
}
