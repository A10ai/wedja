"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Megaphone,
  Loader2,
  Calendar,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Sparkles,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Tag,
  Users,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface EventSummary {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  status: string;
  expected_footfall_boost_pct: number;
  actual_footfall_boost_pct: number | null;
  budget_egp: number | null;
  location: string | null;
  target_audience: string | null;
}

interface CampaignSummary {
  id: string;
  name: string;
  campaign_type: string;
  start_date: string;
  end_date: string;
  budget_egp: number | null;
  spend_egp: number;
  status: string;
  roi_pct: number | null;
  channels: string[];
}

interface SeasonalItem {
  id: string;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  footfall_impact: string;
  revenue_impact: string;
  tourist_ratio_change: string | null;
  planning_notes: string | null;
  is_recurring: boolean;
  days_away: number | null;
  planning_status: string;
  ai_recommendation: string;
}

interface MarketingOverview {
  active_events: { count: number; list: EventSummary[] };
  upcoming_events: { count: number; list: EventSummary[] };
  active_campaigns: { count: number; list: CampaignSummary[] };
  active_promotions: number;
  total_marketing_spend_this_month: number;
  next_major_season: SeasonalItem | null;
  days_until_next_season: number;
}

interface EventPerformance {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  expected_boost: number;
  actual_boost: number | null;
  budget_egp: number | null;
  actual_cost_egp: number | null;
  revenue_impact_egp: number | null;
  roi_pct: number | null;
  budget_variance_pct: number | null;
  performance_rating: "overperformer" | "on_target" | "underperformer";
}

interface SeasonalAlert {
  id: string;
  name: string;
  type: string;
  days_away: number;
  urgency: "critical" | "warning" | "info";
  message: string;
  action_items: string[];
}

interface CampaignROISummary {
  campaigns: CampaignROI[];
  total_spend: number;
  avg_roi: number;
  best_campaign_type: string;
  recommendation: string;
}

interface CampaignROI {
  id: string;
  name: string;
  campaign_type: string;
  budget_egp: number | null;
  spend_egp: number;
  roi_pct: number | null;
  status: string;
  start_date: string;
  end_date: string;
  kpi_target: string | null;
  kpi_actual: string | null;
}

interface TenantPromotion {
  id: string;
  tenant_id: string;
  tenant_name: string;
  title: string;
  promotion_type: string;
  start_date: string;
  end_date: string;
  discount_pct: number | null;
  footfall_impact_pct: number | null;
  revenue_impact_pct: number | null;
  status: string;
}

// ── Helpers ──────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function impactColor(impact: string): string {
  switch (impact) {
    case "very_high":
      return "bg-amber-500";
    case "high":
      return "bg-orange-500";
    case "moderate":
      return "bg-yellow-500";
    case "low":
      return "bg-gray-400";
    case "negative":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
}

function impactBadgeVariant(impact: string): "gold" | "warning" | "default" | "error" {
  switch (impact) {
    case "very_high":
      return "gold";
    case "high":
      return "warning";
    case "negative":
      return "error";
    default:
      return "default";
  }
}

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "info" | "default" | "gold" {
  switch (status) {
    case "active":
      return "success";
    case "planned":
    case "draft":
      return "info";
    case "completed":
      return "default";
    case "cancelled":
    case "paused":
      return "error";
    default:
      return "default";
  }
}

function typeLabel(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Form Modal Component ─────────────────────────────────────

function FormModal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 bg-wedja-card border border-wedja-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-wedja-border/50 text-text-secondary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function MarketingPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [calendar, setCalendar] = useState<SeasonalItem[]>([]);
  const [alerts, setAlerts] = useState<SeasonalAlert[]>([]);
  const [performance, setPerformance] = useState<{
    events: EventPerformance[];
    ai_insight: string;
  }>({ events: [], ai_insight: "" });
  const [campaignData, setCampaignData] = useState<CampaignROISummary | null>(
    null
  );
  const [promotions, setPromotions] = useState<TenantPromotion[]>([]);

  // Form states
  const [showEventForm, setShowEventForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [ovRes, calRes, alertRes, perfRes, campRes, promoRes] =
        await Promise.all([
          fetch("/api/v1/marketing?type=overview"),
          fetch("/api/v1/marketing?type=calendar"),
          fetch("/api/v1/marketing?type=alerts"),
          fetch("/api/v1/marketing?type=performance"),
          fetch("/api/v1/marketing?type=campaigns"),
          fetch("/api/v1/marketing?type=promotions"),
        ]);

      const [ov, cal, alt, perf, camp, promo] = await Promise.all([
        ovRes.json(),
        calRes.json(),
        alertRes.json(),
        perfRes.json(),
        campRes.json(),
        promoRes.json(),
      ]);

      setOverview(ov);
      setCalendar(cal);
      setAlerts(alt);
      setPerformance(perf);
      setCampaignData(camp);
      setPromotions(promo);
    } catch {
      // Handled by empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Form handlers
  async function handleCreateEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await fetch("/api/v1/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "event",
          title: form.get("title"),
          event_type: form.get("event_type"),
          start_date: form.get("start_date"),
          end_date: form.get("end_date"),
          start_time: form.get("start_time") || null,
          end_time: form.get("end_time") || null,
          location: form.get("location") || null,
          target_audience: form.get("target_audience") || "all",
          expected_footfall_boost_pct:
            parseInt(form.get("expected_footfall_boost_pct") as string) || 0,
          budget_egp: parseFloat(form.get("budget_egp") as string) || null,
          organizer: form.get("organizer") || null,
          description: form.get("description") || null,
        }),
      });
      setShowEventForm(false);
      fetchAll();
    } catch {
      // Silent
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateCampaign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      const channelsStr = (form.get("channels") as string) || "";
      const channels = channelsStr
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      await fetch("/api/v1/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "campaign",
          name: form.get("name"),
          campaign_type: form.get("campaign_type"),
          start_date: form.get("start_date"),
          end_date: form.get("end_date"),
          budget_egp: parseFloat(form.get("budget_egp") as string) || null,
          target_audience: form.get("target_audience") || null,
          channels,
          kpi_target: form.get("kpi_target") || null,
          notes: form.get("notes") || null,
        }),
      });
      setShowCampaignForm(false);
      fetchAll();
    } catch {
      // Silent
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Megaphone size={28} className="text-wedja-accent" />
            Marketing & Events
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Event planning, campaign management, and seasonal calendar for Senzo
            Mall
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowEventForm(true)}
            className="bg-wedja-accent hover:bg-wedja-accent-hover text-black font-medium text-sm px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            <Plus size={16} /> New Event
          </Button>
          <Button
            onClick={() => setShowCampaignForm(true)}
            className="bg-wedja-border/50 hover:bg-wedja-border text-text-primary font-medium text-sm px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            <Plus size={16} /> New Campaign
          </Button>
        </div>
      </div>

      {/* ── A. Overview Stat Cards ─────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Active Events
                </span>
                <Calendar size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-text-primary">
                {overview.active_events.count}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {overview.upcoming_events.count} upcoming (30d)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Active Campaigns
                </span>
                <Target size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-text-primary">
                {overview.active_campaigns.count}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {overview.active_promotions} tenant promos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Marketing Spend
                </span>
                <DollarSign size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-wedja-accent">
                {formatCurrency(overview.total_marketing_spend_this_month)}
              </p>
              <p className="text-xs text-text-muted mt-1">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Avg Campaign ROI
                </span>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              <p className="text-xl font-bold font-mono text-emerald-500">
                {campaignData ? `${campaignData.avg_roi}%` : "N/A"}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {campaignData
                  ? `Best: ${typeLabel(campaignData.best_campaign_type)}`
                  : ""}
              </p>
            </CardContent>
          </Card>

          <Card className="col-span-2 lg:col-span-1">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted font-medium">
                  Upcoming Events
                </span>
                <Clock size={16} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold font-mono text-text-primary">
                {overview.upcoming_events.count}
              </p>
              <p className="text-xs text-text-muted mt-1">Next 30 days</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Next Major Season Alert ────────────────────────────── */}
      {overview?.next_major_season && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/15 shrink-0">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-bold text-text-primary">
                    {overview.next_major_season.name}
                  </h3>
                  <Badge variant="gold">
                    {overview.next_major_season.days_away} days away
                  </Badge>
                  <Badge
                    variant={
                      overview.next_major_season.planning_status === "Not Started"
                        ? "error"
                        : overview.next_major_season.planning_status ===
                          "Should Start"
                        ? "warning"
                        : "success"
                    }
                  >
                    {overview.next_major_season.planning_status}
                  </Badge>
                </div>
                <p className="text-xs text-text-secondary">
                  {overview.next_major_season.ai_recommendation}
                </p>
                {overview.next_major_season.tourist_ratio_change && (
                  <p className="text-xs text-amber-500 mt-1 font-medium">
                    Tourist impact: {overview.next_major_season.tourist_ratio_change}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── B. Seasonal Calendar Timeline ──────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Calendar size={16} className="text-wedja-accent" />
            Seasonal Calendar — {new Date().getFullYear()}
          </h2>
        </CardHeader>
        <CardContent>
          {/* Timeline visualization */}
          <div className="relative">
            {/* Month labels */}
            <div className="flex mb-2">
              {[
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ].map((m, i) => (
                <div
                  key={m}
                  className="flex-1 text-center text-[10px] text-text-muted font-medium"
                >
                  {m}
                </div>
              ))}
            </div>

            {/* Timeline background with month dividers */}
            <div className="relative h-2 bg-wedja-border/30 rounded-full mb-1">
              {/* Current date marker */}
              {(() => {
                const now = new Date();
                const yearStart = new Date(now.getFullYear(), 0, 1);
                const yearEnd = new Date(now.getFullYear(), 11, 31);
                const pct =
                  ((now.getTime() - yearStart.getTime()) /
                    (yearEnd.getTime() - yearStart.getTime())) *
                  100;
                return (
                  <div
                    className="absolute top-0 w-0.5 h-full bg-red-500 z-10"
                    style={{ left: `${pct}%` }}
                    title={`Today: ${now.toLocaleDateString()}`}
                  />
                );
              })()}

              {/* Month dividers */}
              {Array.from({ length: 11 }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 w-px h-full bg-wedja-border/50"
                  style={{ left: `${((i + 1) / 12) * 100}%` }}
                />
              ))}
            </div>

            {/* Season blocks */}
            <div className="space-y-1.5 mt-3">
              {calendar.map((season) => {
                if (!season.start_date || !season.end_date) return null;

                const year = new Date().getFullYear();
                const yearStart = new Date(year, 0, 1).getTime();
                const yearEnd = new Date(year, 11, 31).getTime();
                const yearDuration = yearEnd - yearStart;

                const start = new Date(
                  season.start_date + "T00:00:00"
                ).getTime();
                const end = new Date(season.end_date + "T00:00:00").getTime();

                let leftPct = ((start - yearStart) / yearDuration) * 100;
                let widthPct =
                  ((end - start) / yearDuration) * 100;

                // Clamp to visible range
                if (leftPct < 0) {
                  widthPct += leftPct;
                  leftPct = 0;
                }
                if (leftPct + widthPct > 100) {
                  widthPct = 100 - leftPct;
                }
                if (widthPct < 1) widthPct = 1;

                const isExpanded = expandedSeason === season.id;

                return (
                  <div key={season.id}>
                    <div
                      className="relative h-7 cursor-pointer group"
                      onClick={() =>
                        setExpandedSeason(isExpanded ? null : season.id)
                      }
                    >
                      <div
                        className={`absolute top-0 h-full rounded-md flex items-center px-2 transition-all ${impactColor(season.footfall_impact)} bg-opacity-80 hover:bg-opacity-100`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          minWidth: "60px",
                        }}
                        title={`${season.name}: ${season.start_date} to ${season.end_date}`}
                      >
                        <span className="text-[10px] font-semibold text-white truncate">
                          {season.name}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="ml-4 mt-1 mb-2 p-3 rounded-lg bg-wedja-border/10 border border-wedja-border/30">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant={impactBadgeVariant(season.footfall_impact)}>
                            Footfall: {typeLabel(season.footfall_impact)}
                          </Badge>
                          <Badge variant={impactBadgeVariant(season.revenue_impact)}>
                            Revenue: {typeLabel(season.revenue_impact)}
                          </Badge>
                          <Badge variant="default">
                            {typeLabel(season.type)}
                          </Badge>
                          {season.days_away !== null && (
                            <Badge
                              variant={
                                season.days_away <= 14
                                  ? "error"
                                  : season.days_away <= 45
                                  ? "warning"
                                  : "info"
                              }
                            >
                              {season.days_away < 0
                                ? "Active now"
                                : `${season.days_away}d away`}
                            </Badge>
                          )}
                        </div>
                        {season.tourist_ratio_change && (
                          <p className="text-xs text-amber-500 font-medium mb-1">
                            Tourist impact: {season.tourist_ratio_change}
                          </p>
                        )}
                        <p className="text-xs text-text-secondary mb-1">
                          {season.planning_notes}
                        </p>
                        <div className="mt-2 p-2 rounded bg-wedja-accent-muted/50">
                          <p className="text-xs text-wedja-accent flex items-start gap-1.5">
                            <Sparkles
                              size={13}
                              className="shrink-0 mt-0.5"
                            />
                            {season.ai_recommendation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 justify-center flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-amber-500" />
                <span className="text-[10px] text-text-muted">Very High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-orange-500" />
                <span className="text-[10px] text-text-muted">High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-yellow-500" />
                <span className="text-[10px] text-text-muted">Moderate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-gray-400" />
                <span className="text-[10px] text-text-muted">Low</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 bg-red-500" />
                <span className="text-[10px] text-text-muted">Today</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── C. Alerts + Upcoming Events Row ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Seasonal Alerts */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <AlertTriangle size={16} className="text-wedja-accent" />
              Seasonal Alerts & AI Planning
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 && (
              <p className="text-xs text-text-muted">
                No upcoming seasonal alerts.
              </p>
            )}
            {alerts.slice(0, 6).map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border transition-colors ${
                  alert.urgency === "critical"
                    ? "border-red-500/30 bg-red-500/5"
                    : alert.urgency === "warning"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-wedja-border/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-text-primary">
                      {alert.name}
                    </h3>
                    <Badge
                      variant={
                        alert.urgency === "critical"
                          ? "error"
                          : alert.urgency === "warning"
                          ? "warning"
                          : "info"
                      }
                    >
                      {alert.days_away < 0
                        ? "Active"
                        : `${alert.days_away}d`}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-text-muted capitalize">
                    {alert.type.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-2">
                  {alert.message}
                </p>
                {alert.action_items.length > 0 && (
                  <div className="space-y-1">
                    {alert.action_items.slice(0, 3).map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-1.5 text-[11px] text-text-muted"
                      >
                        <span className="text-wedja-accent mt-px">&#9679;</span>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Calendar size={16} className="text-wedja-accent" />
              Upcoming & Active Events
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview &&
              [
                ...overview.active_events.list,
                ...overview.upcoming_events.list,
              ].map((event) => {
                const da = daysUntil(event.start_date);
                return (
                  <div
                    key={event.id}
                    className="p-3 rounded-lg border border-wedja-border/50 hover:border-wedja-border transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-text-primary">
                        {event.title}
                      </h3>
                      <Badge variant={statusBadgeVariant(event.status)}>
                        {event.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-secondary mb-1">
                      <span>
                        {formatDate(event.start_date)} — {formatDate(event.end_date)}
                      </span>
                      {event.status === "planned" && da > 0 && (
                        <Badge
                          variant={
                            da <= 7 ? "error" : da <= 30 ? "warning" : "default"
                          }
                          className="text-[10px]"
                        >
                          {da}d countdown
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="capitalize">
                        {typeLabel(event.event_type)}
                      </span>
                      {event.location && (
                        <span>
                          {event.location}
                        </span>
                      )}
                      {event.expected_footfall_boost_pct > 0 && (
                        <span className="text-emerald-500 font-medium">
                          +{event.expected_footfall_boost_pct}% footfall expected
                        </span>
                      )}
                      {event.budget_egp && (
                        <span className="font-mono">
                          {formatCurrency(event.budget_egp)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            {overview &&
              overview.active_events.count === 0 &&
              overview.upcoming_events.count === 0 && (
                <p className="text-xs text-text-muted">
                  No active or upcoming events.
                </p>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── D. Active Campaigns ────────────────────────────────── */}
      {campaignData && campaignData.campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Target size={16} className="text-wedja-accent" />
                Campaigns
              </h2>
              {campaignData.recommendation && (
                <div className="flex items-center gap-1.5 text-[11px] text-wedja-accent bg-wedja-accent-muted/50 px-2.5 py-1 rounded-full">
                  <Sparkles size={12} />
                  <span className="hidden sm:inline">
                    {campaignData.recommendation.slice(0, 80)}
                    {campaignData.recommendation.length > 80 ? "..." : ""}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaignData.campaigns
                .filter((c) => c.status === "active" || c.status === "draft")
                .map((camp) => {
                  const budgetUsed =
                    camp.budget_egp && camp.budget_egp > 0
                      ? (camp.spend_egp / camp.budget_egp) * 100
                      : 0;

                  return (
                    <div
                      key={camp.id}
                      className="p-4 rounded-lg border border-wedja-border/50 hover:border-wedja-border transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-text-primary truncate">
                          {camp.name}
                        </h3>
                        <Badge variant={statusBadgeVariant(camp.status)}>
                          {camp.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Badge variant="default">
                          {typeLabel(camp.campaign_type)}
                        </Badge>
                        <span className="text-[10px] text-text-muted">
                          {formatDate(camp.start_date)} — {formatDate(camp.end_date)}
                        </span>
                      </div>

                      {/* Budget progress bar */}
                      {camp.budget_egp && (
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-text-muted">
                              Budget
                            </span>
                            <span className="text-[10px] font-mono text-text-secondary">
                              {formatCurrency(camp.spend_egp)} /{" "}
                              {formatCurrency(camp.budget_egp)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-wedja-border/50 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                budgetUsed > 90
                                  ? "bg-red-500"
                                  : budgetUsed > 70
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {camp.roi_pct !== null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-text-muted">
                            ROI:
                          </span>
                          <span
                            className={`text-sm font-mono font-bold ${
                              camp.roi_pct > 100
                                ? "text-emerald-500"
                                : camp.roi_pct > 0
                                ? "text-amber-500"
                                : "text-red-500"
                            }`}
                          >
                            {camp.roi_pct}%
                          </span>
                        </div>
                      )}

                      {camp.kpi_target && (
                        <p className="text-[10px] text-text-muted mt-1 truncate">
                          Target: {camp.kpi_target}
                        </p>
                      )}
                      {camp.kpi_actual && (
                        <p className="text-[10px] text-emerald-500 mt-0.5 truncate">
                          Result: {camp.kpi_actual}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── E. Event Performance (Completed) ───────────────────── */}
      {performance.events.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <BarChart3 size={16} className="text-wedja-accent" />
                Event Performance
              </h2>
              {performance.ai_insight && (
                <div className="flex items-center gap-1.5 text-[11px] text-wedja-accent bg-wedja-accent-muted/50 px-2.5 py-1 rounded-full max-w-md">
                  <Sparkles size={12} className="shrink-0" />
                  <span className="truncate">{performance.ai_insight}</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Event
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Type
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Dates
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Expected
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Actual
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Budget
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Cost
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Revenue
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      ROI
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {performance.events.map((e) => (
                    <tr
                      key={e.id}
                      className={`border-b border-wedja-border/50 ${
                        e.performance_rating === "overperformer"
                          ? "bg-emerald-500/5"
                          : e.performance_rating === "underperformer"
                          ? "bg-red-500/5"
                          : "hover:bg-wedja-border/10"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-text-primary font-medium max-w-[180px] truncate">
                        {e.title}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs capitalize">
                        {typeLabel(e.event_type)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs whitespace-nowrap">
                        {formatDate(e.start_date)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        +{e.expected_boost}%
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-semibold ${
                          e.actual_boost !== null &&
                          e.actual_boost >= e.expected_boost
                            ? "text-emerald-500"
                            : "text-red-500"
                        }`}
                      >
                        {e.actual_boost !== null ? `+${e.actual_boost}%` : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {e.budget_egp ? formatCurrency(e.budget_egp) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                        {e.actual_cost_egp
                          ? formatCurrency(e.actual_cost_egp)
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-wedja-accent">
                        {e.revenue_impact_egp
                          ? formatCurrency(e.revenue_impact_egp)
                          : "-"}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-bold ${
                          (e.roi_pct || 0) > 200
                            ? "text-emerald-500"
                            : (e.roi_pct || 0) > 100
                            ? "text-amber-500"
                            : "text-red-500"
                        }`}
                      >
                        {e.roi_pct !== null ? `${e.roi_pct}%` : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          variant={
                            e.performance_rating === "overperformer"
                              ? "success"
                              : e.performance_rating === "underperformer"
                              ? "error"
                              : "default"
                          }
                        >
                          {e.performance_rating === "overperformer"
                            ? "Over"
                            : e.performance_rating === "underperformer"
                            ? "Under"
                            : "Target"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── F. Tenant Promotions ───────────────────────────────── */}
      {promotions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Tag size={16} className="text-wedja-accent" />
              Tenant Promotions
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Tenant
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Promotion
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Type
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Dates
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Discount
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Footfall Impact
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Revenue Impact
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                    >
                      <td className="px-4 py-2.5 text-text-primary font-medium">
                        {p.tenant_name}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs max-w-[200px] truncate">
                        {p.title}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs capitalize">
                        {typeLabel(p.promotion_type)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs whitespace-nowrap">
                        {formatDate(p.start_date)} — {formatDate(p.end_date)}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-amber-500">
                        {p.discount_pct ? `${p.discount_pct}%` : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-500">
                        {p.footfall_impact_pct
                          ? `+${p.footfall_impact_pct}%`
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-wedja-accent">
                        {p.revenue_impact_pct
                          ? `+${p.revenue_impact_pct}%`
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={statusBadgeVariant(p.status)}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── G. Create Event Form Modal ─────────────────────────── */}
      <FormModal
        title="Create New Event"
        open={showEventForm}
        onClose={() => setShowEventForm(false)}
      >
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Event Title *
            </label>
            <Input name="title" required placeholder="e.g. Summer Festival 2026" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Event Type *
              </label>
              <select
                name="event_type"
                required
                className="w-full rounded-lg border border-wedja-border bg-wedja-card text-text-primary text-sm px-3 py-2"
              >
                <option value="seasonal">Seasonal</option>
                <option value="holiday">Holiday</option>
                <option value="promotion">Promotion</option>
                <option value="entertainment">Entertainment</option>
                <option value="tenant_event">Tenant Event</option>
                <option value="community">Community</option>
                <option value="festival">Festival</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Target Audience
              </label>
              <select
                name="target_audience"
                className="w-full rounded-lg border border-wedja-border bg-wedja-card text-text-primary text-sm px-3 py-2"
              >
                <option value="all">All</option>
                <option value="families">Families</option>
                <option value="tourists">Tourists</option>
                <option value="youth">Youth</option>
                <option value="women">Women</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Start Date *
              </label>
              <Input name="start_date" type="date" required />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                End Date *
              </label>
              <Input name="end_date" type="date" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Start Time
              </label>
              <Input name="start_time" type="time" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                End Time
              </label>
              <Input name="end_time" type="time" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Location
            </label>
            <Input
              name="location"
              placeholder="e.g. Central Atrium, Entertainment Zone"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Expected Footfall Boost %
              </label>
              <Input
                name="expected_footfall_boost_pct"
                type="number"
                min="0"
                max="200"
                placeholder="e.g. 30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Budget (EGP)
              </label>
              <Input
                name="budget_egp"
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 300000"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Organizer
            </label>
            <Input name="organizer" placeholder="e.g. Senzo Events Team" />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              className="w-full rounded-lg border border-wedja-border bg-wedja-card text-text-primary text-sm px-3 py-2 resize-none"
              placeholder="Event description..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={() => setShowEventForm(false)}
              className="bg-wedja-border/50 hover:bg-wedja-border text-text-primary text-sm px-4 py-2 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-wedja-accent hover:bg-wedja-accent-hover text-black font-medium text-sm px-4 py-2 rounded-lg flex items-center gap-1.5"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Create Event
            </Button>
          </div>
        </form>
      </FormModal>

      {/* ── Create Campaign Form Modal ─────────────────────────── */}
      <FormModal
        title="Create New Campaign"
        open={showCampaignForm}
        onClose={() => setShowCampaignForm(false)}
      >
        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Campaign Name *
            </label>
            <Input
              name="name"
              required
              placeholder="e.g. Summer 2026 Social Media Blitz"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Campaign Type *
            </label>
            <select
              name="campaign_type"
              required
              className="w-full rounded-lg border border-wedja-border bg-wedja-card text-text-primary text-sm px-3 py-2"
            >
              <option value="social_media">Social Media</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="billboard">Billboard</option>
              <option value="radio">Radio</option>
              <option value="influencer">Influencer</option>
              <option value="partnership">Partnership</option>
              <option value="loyalty">Loyalty</option>
              <option value="seasonal">Seasonal</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Start Date *
              </label>
              <Input name="start_date" type="date" required />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                End Date *
              </label>
              <Input name="end_date" type="date" required />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Budget (EGP)
            </label>
            <Input
              name="budget_egp"
              type="number"
              min="0"
              step="1000"
              placeholder="e.g. 200000"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Target Audience
            </label>
            <Input
              name="target_audience"
              placeholder="e.g. Tourists + Local families"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Channels (comma-separated)
            </label>
            <Input
              name="channels"
              placeholder="e.g. instagram, facebook, billboards, radio"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              KPI Target
            </label>
            <Input
              name="kpi_target"
              placeholder="e.g. Increase footfall 25%, reach 1M impressions"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              className="w-full rounded-lg border border-wedja-border bg-wedja-card text-text-primary text-sm px-3 py-2 resize-none"
              placeholder="Campaign notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={() => setShowCampaignForm(false)}
              className="bg-wedja-border/50 hover:bg-wedja-border text-text-primary text-sm px-4 py-2 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-wedja-accent hover:bg-wedja-accent-hover text-black font-medium text-sm px-4 py-2 rounded-lg flex items-center gap-1.5"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Create Campaign
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
}
