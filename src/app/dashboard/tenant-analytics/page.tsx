"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BarChart3,
  Loader2,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface TenantRanking {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  area_sqm: number;
  unit_number: string;
  zone_name: string;
  zone_id: string;
  monthly_rent: number;
  rent_per_sqm: number;
  reported_sales_per_sqm: number;
  estimated_sales_per_sqm: number;
  percentage_rate: number;
  profit_per_sqm: number;
  opportunity_cost_per_sqm: number;
  overall_score: number;
  rank: number;
}

interface ZoneBenchmark {
  zone_id: string;
  zone_name: string;
  tenant_count: number;
  total_area_sqm: number;
  avg_revenue_per_sqm: number;
  avg_rent_per_sqm: number;
  avg_footfall_per_sqm: number;
  best_tenant: { name: string; revenue_per_sqm: number } | null;
  worst_tenant: { name: string; revenue_per_sqm: number } | null;
  zone_productivity_score: number;
}

interface TenantMixCategory {
  category: string;
  area_sqm: number;
  area_pct: number;
  revenue_egp: number;
  revenue_pct: number;
  footfall: number;
  footfall_pct: number;
  revenue_per_sqm: number;
  tenant_count: number;
  mismatch_direction: "over_spaced" | "under_spaced" | "balanced";
  mismatch_magnitude: number;
}

interface TenantMixAnalysis {
  categories: TenantMixCategory[];
  ai_recommendation: string;
  total_area_sqm: number;
  total_revenue_egp: number;
  total_footfall: number;
}

interface PercentageRateItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  current_rate: number;
  category_avg_rate: number;
  rate_gap: number;
  reported_sales: number;
  percentage_rent_at_current: number;
  min_rent: number;
  actual_paying: "min_rent" | "percentage";
  impact_at_plus_1: number;
  impact_at_plus_2: number;
  impact_at_plus_5: number;
  breakeven_sales: number;
  potential_uplift_egp: number;
}

interface PercentageRateAnalysis {
  tenants: PercentageRateItem[];
  total_potential_uplift_egp: number;
  avg_rate: number;
  avg_rate_by_category: Record<string, number>;
}

interface ReplacementItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  zone_name: string;
  current_revenue_per_sqm: number;
  zone_avg_revenue_per_sqm: number;
  zone_top_revenue_per_sqm: number;
  current_monthly_rent: number;
  if_avg_performer_rent: number;
  if_top_performer_rent: number;
  revenue_increase_avg: number;
  revenue_increase_top: number;
  vacancy_cost_per_month: number;
  vacancy_months_estimate: number;
  break_even_months_avg: number;
  break_even_months_top: number;
  overall_score: number;
}

interface ReplacementAnalysis {
  bottom_tenants: ReplacementItem[];
  total_potential_monthly_gain: number;
  total_vacancy_risk: number;
}

interface TenantScorecard {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  brand_type: string;
  area_sqm: number;
  unit_number: string;
  zone_name: string;
  lease_id: string;
  min_rent: number;
  percentage_rate: number;
  start_date: string;
  end_date: string;
  monthly_rent_amount: number;
  reported_sales_monthly_avg: number;
  estimated_sales_monthly_avg: number;
  revenue_per_sqm_monthly: number;
  estimated_revenue_per_sqm: number;
  revenue_gap_egp: number;
  revenue_gap_pct: number;
  min_rent_per_sqm: number;
  percentage_rent_would_be: number;
  actual_rent_type: "min_rent" | "percentage";
  rent_to_sales_ratio: number;
  if_accurate_rent_would_be: number;
  avg_daily_visitors: number;
  avg_conversion_rate: number;
  visitors_per_sqm: number;
  dwell_time_avg: number;
  productivity_score: number;
  rent_efficiency_score: number;
  footfall_attraction_score: number;
  payment_reliability_score: number;
  overall_score: number;
  ai_verdict: string;
  monthly_history: Array<{
    month: number;
    year: number;
    reported_sales: number;
    estimated_sales: number;
  }>;
}

// ── Helpers ─────────────────────────────────────────────────

type SortKey = keyof TenantRanking;

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const categoryVariant: Record<string, "gold" | "success" | "warning" | "info" | "default"> = {
  fashion: "gold",
  food: "warning",
  electronics: "info",
  services: "success",
  entertainment: "info",
  grocery: "success",
};

function getRankColor(rank: number, total: number): string {
  const pct = (rank - 1) / Math.max(total - 1, 1);
  if (pct <= 0.2) return "text-emerald-500";
  if (pct <= 0.4) return "text-emerald-400";
  if (pct <= 0.6) return "text-amber-500";
  if (pct <= 0.8) return "text-orange-500";
  return "text-red-500";
}

function getScoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-500/15 text-emerald-500";
  if (score >= 50) return "bg-amber-500/15 text-amber-500";
  if (score >= 25) return "bg-orange-500/15 text-orange-500";
  return "bg-red-500/15 text-red-500";
}

function getScoreBarColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  if (score >= 25) return "bg-orange-500";
  return "bg-red-500";
}

function getMismatchBadge(dir: "over_spaced" | "under_spaced" | "balanced"): { label: string; variant: "error" | "success" | "default" } {
  if (dir === "over_spaced") return { label: "Over-spaced", variant: "error" };
  if (dir === "under_spaced") return { label: "Under-spaced", variant: "success" };
  return { label: "Balanced", variant: "default" };
}

// ── Page Component ──────────────────────────────────────────

export default function TenantAnalyticsPage() {
  const [rankings, setRankings] = useState<TenantRanking[]>([]);
  const [benchmarks, setBenchmarks] = useState<ZoneBenchmark[]>([]);
  const [tenantMix, setTenantMix] = useState<TenantMixAnalysis | null>(null);
  const [pctRates, setPctRates] = useState<PercentageRateAnalysis | null>(null);
  const [replacement, setReplacement] = useState<ReplacementAnalysis | null>(null);
  const [scorecard, setScorecard] = useState<TenantScorecard | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sort/filter state
  const [sortKey, setSortKey] = useState<SortKey>("overall_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterZone, setFilterZone] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Fetch all data
  useEffect(() => {
    async function fetchAll() {
      try {
        const [rankRes, benchRes, mixRes, pctRes, replRes] = await Promise.all([
          fetch("/api/v1/tenant-analytics?type=rankings"),
          fetch("/api/v1/tenant-analytics?type=benchmarks"),
          fetch("/api/v1/tenant-analytics?type=tenant_mix"),
          fetch("/api/v1/tenant-analytics?type=percentage_rates"),
          fetch("/api/v1/tenant-analytics?type=replacement"),
        ]);

        const [rankData, benchData, mixData, pctData, replData] = await Promise.all([
          rankRes.json(),
          benchRes.json(),
          mixRes.json(),
          pctRes.json(),
          replRes.json(),
        ]);

        setRankings(Array.isArray(rankData) ? rankData : []);
        setBenchmarks(Array.isArray(benchData) ? benchData : []);
        setTenantMix(mixData?.categories ? mixData : null);
        setPctRates(pctData?.tenants ? pctData : null);
        setReplacement(replData?.bottom_tenants ? replData : null);
      } catch {
        // handled by empty state
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // Fetch scorecard for a tenant
  const fetchScorecard = useCallback(async (tenantId: string) => {
    setScorecardLoading(true);
    try {
      const res = await fetch(`/api/v1/tenant-analytics?type=scorecard&tenant_id=${tenantId}`);
      const data = await res.json();
      if (data?.tenant_id) {
        setScorecard(data);
      }
    } catch {
      // ignored
    } finally {
      setScorecardLoading(false);
    }
  }, []);

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Filtered + sorted rankings
  const filteredRankings = rankings
    .filter((t) => (!filterZone || t.zone_id === filterZone))
    .filter((t) => (!filterCategory || t.category === filterCategory))
    .sort((a, b) => {
      const aVal = a[sortKey] as number;
      const bVal = b[sortKey] as number;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

  // Derived top-level metrics
  const avgRevPerSqm = rankings.length > 0
    ? Math.round(rankings.reduce((s, t) => s + t.reported_sales_per_sqm, 0) / rankings.length)
    : 0;
  const bestTenant = rankings.length > 0
    ? rankings.reduce((best, t) => t.reported_sales_per_sqm > best.reported_sales_per_sqm ? t : best, rankings[0])
    : null;
  const worstTenant = rankings.length > 0
    ? rankings.reduce((worst, t) => t.reported_sales_per_sqm < worst.reported_sales_per_sqm ? t : worst, rankings[0])
    : null;
  const totalOpportunityCost = rankings.reduce(
    (sum, t) => sum + t.opportunity_cost_per_sqm * t.area_sqm, 0
  );
  const avgPctRate = pctRates?.avg_rate || 0;

  // Unique zones and categories for filters
  const zones = Array.from(new Set(rankings.map((t) => JSON.stringify({ id: t.zone_id, name: t.zone_name }))))
    .map((s) => JSON.parse(s) as { id: string; name: string });
  const categories = Array.from(new Set(rankings.map((t) => t.category)));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown size={12} className="text-text-muted ml-1 inline" />;
    return sortDir === "asc"
      ? <ArrowUp size={12} className="text-wedja-accent ml-1 inline" />
      : <ArrowDown size={12} className="text-wedja-accent ml-1 inline" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <BarChart3 size={28} className="text-wedja-accent" />
          Tenant Analytics
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Deep performance analysis per square meter across {rankings.length} tenants
        </p>
      </div>

      {/* A. Top Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted uppercase tracking-wider">Avg Revenue/sqm</p>
            <p className="text-xl font-bold text-wedja-accent font-mono mt-1">
              {formatCurrency(avgRevPerSqm)}
            </p>
            <p className="text-[10px] text-text-muted">portfolio level / month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted uppercase tracking-wider">Best Revenue/sqm</p>
            <p className="text-xl font-bold text-emerald-500 font-mono mt-1">
              {bestTenant ? formatCurrency(bestTenant.reported_sales_per_sqm) : "-"}
            </p>
            <p className="text-[10px] text-text-muted truncate">{bestTenant?.brand_name || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted uppercase tracking-wider">Worst Revenue/sqm</p>
            <p className="text-xl font-bold text-red-500 font-mono mt-1">
              {worstTenant ? formatCurrency(worstTenant.reported_sales_per_sqm) : "-"}
            </p>
            <p className="text-[10px] text-text-muted truncate">{worstTenant?.brand_name || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted uppercase tracking-wider">Opportunity Cost</p>
            <p className="text-xl font-bold text-red-500 font-mono mt-1">
              {formatCurrency(Math.round(totalOpportunityCost))}
            </p>
            <p className="text-[10px] text-text-muted">lost vs optimal / month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted uppercase tracking-wider">Avg % Rate</p>
            <p className="text-xl font-bold text-text-primary font-mono mt-1">
              {formatPercentage(avgPctRate)}
            </p>
            <p className="text-[10px] text-text-muted">across all tenants</p>
          </CardContent>
        </Card>
      </div>

      {/* B. SQM Value Ranking Table */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            SQM Value Ranking — All Tenants
          </h2>
          <div className="flex gap-2">
            <select
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              className="px-2 py-1 rounded text-xs bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-1 focus:ring-wedja-accent"
            >
              <option value="">All Zones</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-2 py-1 rounded text-xs bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-1 focus:ring-wedja-accent"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-wedja-border bg-wedja-bg/50">
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">#</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("brand_name")} className="hover:text-text-primary">
                      Tenant <SortIcon column="brand_name" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Cat</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                    <button onClick={() => handleSort("area_sqm")} className="hover:text-text-primary">
                      Area <SortIcon column="area_sqm" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                    <button onClick={() => handleSort("monthly_rent")} className="hover:text-text-primary">
                      Rent <SortIcon column="monthly_rent" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("rent_per_sqm")} className="hover:text-text-primary">
                      Rent/sqm <SortIcon column="rent_per_sqm" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("reported_sales_per_sqm")} className="hover:text-text-primary">
                      Sales/sqm <SortIcon column="reported_sales_per_sqm" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                    <button onClick={() => handleSort("estimated_sales_per_sqm")} className="hover:text-text-primary">
                      Est/sqm <SortIcon column="estimated_sales_per_sqm" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                    <button onClick={() => handleSort("percentage_rate")} className="hover:text-text-primary">
                      % Rate <SortIcon column="percentage_rate" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("profit_per_sqm")} className="hover:text-text-primary">
                      Profit/sqm <SortIcon column="profit_per_sqm" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                    <button onClick={() => handleSort("opportunity_cost_per_sqm")} className="hover:text-text-primary">
                      Opp. Cost <SortIcon column="opportunity_cost_per_sqm" />
                    </button>
                  </th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("overall_score")} className="hover:text-text-primary">
                      Score <SortIcon column="overall_score" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRankings.map((t, i) => (
                  <tr
                    key={t.tenant_id}
                    onClick={() => fetchScorecard(t.tenant_id)}
                    className={`border-b border-wedja-border/30 hover:bg-wedja-accent-muted/30 cursor-pointer transition-colors ${
                      i % 2 === 1 ? "bg-wedja-border/5" : ""
                    }`}
                  >
                    <td className={`px-3 py-2 font-mono font-bold ${getRankColor(t.rank, rankings.length)}`}>
                      {t.rank}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-text-primary truncate max-w-[140px]">{t.brand_name}</p>
                      <p className="text-[10px] text-text-muted">{t.unit_number} / {t.zone_name}</p>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <Badge variant={categoryVariant[t.category] || "default"} className="text-[10px]">
                        {t.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary hidden md:table-cell">
                      {formatNumber(t.area_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary hidden lg:table-cell">
                      {formatCurrency(t.monthly_rent)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary">
                      {formatCurrency(t.rent_per_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary font-semibold">
                      {formatCurrency(t.reported_sales_per_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary hidden lg:table-cell">
                      {formatCurrency(t.estimated_sales_per_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary hidden md:table-cell">
                      {formatPercentage(t.percentage_rate)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-wedja-accent font-semibold">
                      {formatCurrency(t.profit_per_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono hidden lg:table-cell">
                      {t.opportunity_cost_per_sqm > 0 ? (
                        <span className="text-red-500">{formatCurrency(t.opportunity_cost_per_sqm)}</span>
                      ) : (
                        <span className="text-emerald-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold ${getScoreBg(t.overall_score)}`}>
                        {t.overall_score}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRankings.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-5 py-8 text-center text-text-muted text-sm">
                      No tenants match the selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-wedja-border text-[10px] text-text-muted">
            {filteredRankings.length} of {rankings.length} tenants shown. Click any row for full scorecard.
          </div>
        </CardContent>
      </Card>

      {/* Scorecard Modal / Expanded Panel */}
      {(scorecard || scorecardLoading) && (
        <Card className="border-wedja-accent/40 border-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                {scorecardLoading ? "Loading Scorecard..." : `${scorecard?.brand_name} — Full Scorecard`}
              </h2>
            </div>
            <button
              onClick={() => { setScorecard(null); }}
              className="p-1 rounded hover:bg-wedja-border/50 text-text-muted"
              aria-label="Close scorecard"
            >
              <X size={16} />
            </button>
          </CardHeader>
          {scorecardLoading ? (
            <CardContent className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-wedja-accent" />
            </CardContent>
          ) : scorecard ? (
            <CardContent className="space-y-5">
              {/* Verdict */}
              <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
                scorecard.ai_verdict.includes("High performer") ? "bg-emerald-500/10 text-emerald-500" :
                scorecard.ai_verdict.includes("Underperformer") ? "bg-red-500/10 text-red-500" :
                scorecard.ai_verdict.includes("underreporter") ? "bg-amber-500/10 text-amber-500" :
                "bg-wedja-border/30 text-text-secondary"
              }`}>
                {scorecard.ai_verdict}
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "Productivity", score: scorecard.productivity_score },
                  { label: "Rent Efficiency", score: scorecard.rent_efficiency_score },
                  { label: "Footfall", score: scorecard.footfall_attraction_score },
                  { label: "Payment", score: scorecard.payment_reliability_score },
                  { label: "Overall", score: scorecard.overall_score },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="w-full h-2 rounded-full bg-wedja-border/50 mb-1">
                      <div
                        className={`h-2 rounded-full ${getScoreBarColor(item.score)}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <p className="text-lg font-bold font-mono text-text-primary">{item.score}</p>
                    <p className="text-[10px] text-text-muted">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Revenue/sqm</p>
                  <p className="text-sm font-bold font-mono text-wedja-accent">{formatCurrency(scorecard.revenue_per_sqm_monthly)}</p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Est. Revenue/sqm</p>
                  <p className="text-sm font-bold font-mono text-text-primary">{formatCurrency(scorecard.estimated_revenue_per_sqm)}</p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Revenue Gap</p>
                  <p className={`text-sm font-bold font-mono ${scorecard.revenue_gap_egp > 0 ? "text-red-500" : "text-emerald-500"}`}>
                    {formatCurrency(Math.abs(scorecard.revenue_gap_egp))}
                    <span className="text-[10px] ml-1">({formatPercentage(Math.abs(scorecard.revenue_gap_pct))})</span>
                  </p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Rent Type</p>
                  <p className="text-sm font-bold text-text-primary capitalize">{scorecard.actual_rent_type.replace("_", " ")}</p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Avg Sales/mo</p>
                  <p className="text-sm font-bold font-mono text-text-primary">{formatCurrency(scorecard.reported_sales_monthly_avg)}</p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Monthly Rent</p>
                  <p className="text-sm font-bold font-mono text-text-primary">{formatCurrency(scorecard.monthly_rent_amount)}</p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Rent/Sales Ratio</p>
                  <p className="text-sm font-bold font-mono text-text-primary">{formatPercentage(scorecard.rent_to_sales_ratio * 100)}</p>
                </div>
                <div className="bg-wedja-bg rounded-lg p-3">
                  <p className="text-text-muted text-[10px] uppercase">Visitors/day</p>
                  <p className="text-sm font-bold font-mono text-text-primary">{formatNumber(scorecard.avg_daily_visitors)}</p>
                </div>
              </div>

              {/* Monthly History */}
              {scorecard.monthly_history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-2">Revenue Trend (Reported vs Estimated)</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {scorecard.monthly_history.slice(-6).map((m) => {
                      const maxVal = Math.max(m.reported_sales, m.estimated_sales, 1);
                      const reportedH = (m.reported_sales / maxVal) * 48;
                      const estimatedH = (m.estimated_sales / maxVal) * 48;
                      return (
                        <div key={`${m.year}-${m.month}`} className="text-center">
                          <div className="flex items-end justify-center gap-1 h-12">
                            <div
                              className="w-3 bg-wedja-accent rounded-t"
                              style={{ height: `${reportedH}px` }}
                              title={`Reported: ${formatCurrency(m.reported_sales)}`}
                            />
                            <div
                              className="w-3 bg-wedja-border rounded-t"
                              style={{ height: `${estimatedH}px` }}
                              title={`Estimated: ${formatCurrency(m.estimated_sales)}`}
                            />
                          </div>
                          <p className="text-[10px] text-text-muted mt-1">{MONTH_NAMES[m.month]}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-wedja-accent inline-block" /> Reported</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-wedja-border inline-block" /> Estimated</span>
                  </div>
                </div>
              )}

              {/* If estimated rent is significant */}
              {scorecard.if_accurate_rent_would_be > scorecard.monthly_rent_amount * 1.1 && (
                <div className="bg-amber-500/10 rounded-lg px-4 py-3 text-xs text-amber-500 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  <span>
                    If estimated sales are accurate, percentage rent would be{" "}
                    <span className="font-bold">{formatCurrency(scorecard.if_accurate_rent_would_be)}/mo</span>{" "}
                    vs current {formatCurrency(scorecard.monthly_rent_amount)}/mo
                  </span>
                </div>
              )}
            </CardContent>
          ) : null}
        </Card>
      )}

      {/* C. Zone Benchmarks */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">Zone Benchmarks</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {benchmarks.map((zone) => {
              const maxRevPerSqm = Math.max(...benchmarks.map((z) => z.avg_revenue_per_sqm), 1);
              const barW = (zone.avg_revenue_per_sqm / maxRevPerSqm) * 100;
              return (
                <div key={zone.zone_id} className="bg-wedja-bg rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">{zone.zone_name}</p>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${getScoreBg(zone.zone_productivity_score)}`}>
                      {zone.zone_productivity_score}
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-text-muted mb-1">
                      <span>Revenue/sqm</span>
                      <span className="font-mono">{formatCurrency(zone.avg_revenue_per_sqm)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-wedja-border/50">
                      <div className={`h-1.5 rounded-full ${getScoreBarColor(zone.zone_productivity_score)}`} style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="text-text-muted">Rent/sqm</p>
                      <p className="font-mono text-text-primary font-medium">{formatCurrency(zone.avg_rent_per_sqm)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Tenants</p>
                      <p className="font-mono text-text-primary font-medium">{zone.tenant_count}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Best</p>
                      <p className="text-emerald-500 truncate font-medium">{zone.best_tenant?.name || "-"}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Worst</p>
                      <p className="text-red-500 truncate font-medium">{zone.worst_tenant?.name || "-"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* D. Tenant Mix Analysis */}
      {tenantMix && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Tenant Mix Analysis</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bars side by side: Area % vs Revenue % */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Area allocation */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">% of Area by Category</p>
                <div className="space-y-2">
                  {tenantMix.categories.map((cat) => (
                    <div key={`area-${cat.category}`} className="flex items-center gap-2">
                      <span className="text-[10px] text-text-secondary w-20 truncate capitalize">{cat.category}</span>
                      <div className="flex-1 h-4 bg-wedja-border/30 rounded overflow-hidden">
                        <div
                          className="h-full bg-wedja-accent/70 rounded"
                          style={{ width: `${cat.area_pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-text-primary w-12 text-right">{formatPercentage(cat.area_pct)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Revenue allocation */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">% of Revenue by Category</p>
                <div className="space-y-2">
                  {tenantMix.categories.map((cat) => {
                    const badge = getMismatchBadge(cat.mismatch_direction);
                    return (
                      <div key={`rev-${cat.category}`} className="flex items-center gap-2">
                        <span className="text-[10px] text-text-secondary w-20 truncate capitalize">{cat.category}</span>
                        <div className="flex-1 h-4 bg-wedja-border/30 rounded overflow-hidden">
                          <div
                            className={`h-full rounded ${
                              cat.mismatch_direction === "under_spaced" ? "bg-emerald-500/70" :
                              cat.mismatch_direction === "over_spaced" ? "bg-red-500/70" :
                              "bg-wedja-accent/70"
                            }`}
                            style={{ width: `${cat.revenue_pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-text-primary w-12 text-right">{formatPercentage(cat.revenue_pct)}</span>
                        {cat.mismatch_magnitude > 5 && (
                          <Badge variant={badge.variant} className="text-[9px] hidden sm:inline-flex">{badge.label}</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI Recommendation */}
            <div className="bg-wedja-accent-muted rounded-lg px-4 py-3 text-xs text-wedja-accent">
              <p className="font-semibold mb-1">AI Recommendation</p>
              <p className="text-text-secondary">{tenantMix.ai_recommendation}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* E. Percentage Rate Analysis */}
      {pctRates && (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Percentage Rate Analysis</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                If all tenants paid category average %, additional monthly revenue:{" "}
                <span className="text-wedja-accent font-bold">{formatCurrency(pctRates.total_potential_uplift_egp)}</span>
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-wedja-border bg-wedja-bg/50">
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Tenant</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden sm:table-cell">Cat</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Rate</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Cat Avg</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden md:table-cell">Gap</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden lg:table-cell">Sales</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Paying</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden md:table-cell">+1%</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden lg:table-cell">+2%</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Uplift</th>
                  </tr>
                </thead>
                <tbody>
                  {pctRates.tenants.slice(0, 20).map((t, i) => (
                    <tr
                      key={t.tenant_id}
                      className={`border-b border-wedja-border/30 ${i % 2 === 1 ? "bg-wedja-border/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-text-primary truncate max-w-[120px]">{t.brand_name}</p>
                        <p className="text-[10px] text-text-muted">{t.unit_number}</p>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell capitalize text-text-secondary">{t.category}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">{formatPercentage(t.current_rate)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary">{formatPercentage(t.category_avg_rate)}</td>
                      <td className="px-3 py-2 text-right font-mono hidden md:table-cell">
                        {t.rate_gap > 0 ? (
                          <span className="text-red-500">-{formatPercentage(t.rate_gap)}</span>
                        ) : t.rate_gap < 0 ? (
                          <span className="text-emerald-500">+{formatPercentage(Math.abs(t.rate_gap))}</span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary hidden lg:table-cell">{formatCurrency(t.reported_sales)}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant={t.actual_paying === "percentage" ? "success" : "warning"} className="text-[9px]">
                          {t.actual_paying === "percentage" ? "%" : "min"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary hidden md:table-cell">
                        {t.impact_at_plus_1 > 0 ? `+${formatCurrency(t.impact_at_plus_1)}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary hidden lg:table-cell">
                        {t.impact_at_plus_2 > 0 ? `+${formatCurrency(t.impact_at_plus_2)}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {t.potential_uplift_egp > 0 ? (
                          <span className="text-emerald-500">+{formatCurrency(t.potential_uplift_egp)}</span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* G. Replacement Opportunity */}
      {replacement && replacement.bottom_tenants.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Replacement Opportunity</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                Replacing bottom performers could add{" "}
                <span className="text-emerald-500 font-bold">{formatCurrency(replacement.total_potential_monthly_gain)}/month</span>
                {" "}(vacancy risk: {formatCurrency(replacement.total_vacancy_risk)})
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-wedja-border bg-wedja-bg/50">
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Tenant</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden sm:table-cell">Area</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Current/sqm</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Zone Avg</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden md:table-cell">Zone Top</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">
                      <span className="flex items-center justify-end gap-1">
                        <TrendingUp size={10} /> If Avg
                      </span>
                    </th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden lg:table-cell">
                      <span className="flex items-center justify-end gap-1">
                        <TrendingUp size={10} /> If Top
                      </span>
                    </th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase hidden md:table-cell">Break-even</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-medium text-text-muted uppercase">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {replacement.bottom_tenants.map((t, i) => (
                    <tr
                      key={t.tenant_id}
                      className={`border-b border-wedja-border/30 ${i % 2 === 1 ? "bg-wedja-border/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-text-primary truncate max-w-[120px]">{t.brand_name}</p>
                        <p className="text-[10px] text-text-muted">{t.unit_number} / {t.zone_name}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary hidden sm:table-cell">{formatNumber(t.area_sqm)} sqm</td>
                      <td className="px-3 py-2 text-right font-mono text-red-500 font-semibold">{formatCurrency(t.current_revenue_per_sqm)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">{formatCurrency(t.zone_avg_revenue_per_sqm)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-500 hidden md:table-cell">{formatCurrency(t.zone_top_revenue_per_sqm)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-500 font-semibold">
                        +{formatCurrency(t.revenue_increase_avg)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-500 hidden lg:table-cell">
                        +{formatCurrency(t.revenue_increase_top)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary hidden md:table-cell">
                        {t.break_even_months_avg < 100 ? `${t.break_even_months_avg} mo` : "N/A"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold ${getScoreBg(t.overall_score)}`}>
                          {t.overall_score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
