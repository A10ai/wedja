"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  TrendingUp,
  Loader2,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  Users,
  BarChart3,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercentage } from "@/lib/utils";

const DARK_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#111827",
    border: "1px solid #1F2937",
    borderRadius: "8px",
  },
};

// ── Types ───────────────────────────────────────────────────

interface TenantItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_number: string;
  area_sqm: number;
  min_rent: number;
  percentage_rate: number;
  reported_sales: number | null;
  estimated_sales: number | null;
  reported_percentage_rent: number;
  estimated_percentage_rent: number;
  actual_rent_type: "percentage" | "minimum";
  rent_paid: number;
  potential_rent: number;
  gap_egp: number;
  gap_reason: string;
}

interface Overview {
  tenants: TenantItem[];
  total_base_rent_egp: number;
  total_percentage_rent_reported_egp: number;
  total_percentage_rent_estimated_egp: number;
  total_actual_collected_egp: number;
  total_potential_egp: number;
  total_gap_egp: number;
  percentage_premium_pct: number;
  tenants_paying_minimum_only: { count: number; list: TenantItem[] };
  tenants_paying_percentage: { count: number; list: TenantItem[] };
  tenants_with_gap: TenantItem[];
}

interface TrendMonth {
  month: number;
  year: number;
  label: string;
  base_rent_total: number;
  percentage_rent_total: number;
  total_collected: number;
  gap: number;
}

interface InflationHedge {
  percentage_rent_share_pct: number;
  fixed_rent_share_pct: number;
  current_percentage_revenue_egp: number;
  current_fixed_revenue_egp: number;
  total_monthly_revenue_egp: number;
  devaluation_10pct_increase_egp: number;
  devaluation_10pct_increase_pct: number;
  hedge_ratio: number;
  target_hedge_ratio: number;
  tenants_with_zero_rate: Array<{
    tenant_name: string;
    brand_name: string;
    min_rent: number;
    category: string;
  }>;
  ai_recommendation: string;
}

interface OptimizationItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  current_rate: number;
  category_avg_rate: number;
  rate_gap: number;
  estimated_sales: number;
  reported_sales: number;
  opportunity_egp: number;
  sensitivity_sales: number;
  note: string;
}

interface OptimizationResult {
  tenants: OptimizationItem[];
  total_portfolio_uplift_egp: number;
  category_averages: Record<string, { avg_rate: number; count: number }>;
}

interface CompositionItem {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  base_rent: number;
  percentage_premium: number;
  total_rent: number;
  rent_type: "percentage" | "minimum";
}

// ── Main Component ──────────────────────────────────────────

export default function PercentageRentPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [inflation, setInflation] = useState<InflationHedge | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [composition, setComposition] = useState<CompositionItem[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [ovRes, trRes, infRes, optRes, compRes] = await Promise.all([
        fetch("/api/v1/percentage-rent?type=overview"),
        fetch("/api/v1/percentage-rent?type=trend"),
        fetch("/api/v1/percentage-rent?type=inflation"),
        fetch("/api/v1/percentage-rent?type=optimization"),
        fetch("/api/v1/percentage-rent?type=composition"),
      ]);

      const [ov, tr, inf, opt, comp] = await Promise.all([
        ovRes.json(),
        trRes.json(),
        infRes.json(),
        optRes.json(),
        compRes.json(),
      ]);

      setOverview(ov);
      setTrend(tr);
      setInflation(inf);
      setOptimization(opt);
      setComposition(comp);
    } catch {
      // Handled by empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <TrendingUp size={28} className="text-wedja-accent" />
          Percentage Rent Analysis
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Revenue composition, inflation hedge, and percentage rent optimization
        </p>
      </div>

      {/* ── A. Revenue Composition Banner ────────────────────── */}
      {overview && (
        <RevenueCompositionBanner overview={overview} />
      )}

      {/* ── B. Stats Cards ───────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Total Monthly Rent"
            value={formatCurrency(overview.total_actual_collected_egp)}
            sublabel="Base + % Rent"
            icon={<DollarSign size={18} />}
            color="text-wedja-accent"
          />
          <StatCard
            label="Percentage Premium"
            value={formatCurrency(overview.total_percentage_rent_reported_egp)}
            sublabel={`${overview.percentage_premium_pct}% on top of base`}
            icon={<TrendingUp size={18} />}
            color="text-status-success"
          />
          <StatCard
            label="Revenue Gap"
            value={formatCurrency(overview.total_gap_egp)}
            sublabel="Potential not collected"
            icon={<AlertTriangle size={18} />}
            color="text-status-error"
          />
          <StatCard
            label="Inflation Hedge"
            value={inflation ? formatPercentage(inflation.hedge_ratio) : "--"}
            sublabel={`Target: ${inflation?.target_hedge_ratio || 50}%`}
            icon={<ShieldCheck size={18} />}
            color="text-indigo-400"
          />
          <StatCard
            label="Paying Min Only"
            value={String(overview.tenants_paying_minimum_only.count)}
            sublabel={`of ${overview.tenants.length} tenants`}
            icon={<Users size={18} />}
            color="text-amber-400"
          />
        </div>
      )}

      {/* ── C. Rent Type Split (Donut) + Top Premiums (Bar) ── */}
      {overview && composition.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RentTypePieChart overview={overview} />
          <TopPremiumBarChart items={composition} />
        </div>
      )}

      {/* ── D. Inflation Hedge Analysis ──────────────────────── */}
      {inflation && (
        <InflationHedgeCard inflation={inflation} />
      )}

      {/* ── E. Monthly Trend ─────────────────────────────────── */}
      {trend.length > 0 && (
        <MonthlyTrendChart trend={trend} />
      )}

      {/* ── F. Rate Optimization Table ───────────────────────── */}
      {optimization && optimization.tenants.length > 0 && (
        <RateOptimizationTable optimization={optimization} />
      )}

      {/* ── G. Tenants Paying Minimum Only ───────────────────── */}
      {overview && overview.tenants_paying_minimum_only.count > 0 && (
        <MinimumOnlySection tenants={overview.tenants_paying_minimum_only.list} />
      )}

      {/* ── H. Gap Analysis Table ────────────────────────────── */}
      {overview && overview.tenants_with_gap.length > 0 && (
        <GapAnalysisTable tenants={overview.tenants_with_gap} totalGap={overview.total_gap_egp} />
      )}
    </div>
  );
}

// ── Sub-Components ──────────────────────────────────────────

function RevenueCompositionBanner({ overview }: { overview: Overview }) {
  const baseRent = overview.total_base_rent_egp;
  const pctPremium = overview.total_percentage_rent_reported_egp;
  const totalCollected = overview.total_actual_collected_egp;
  const totalPotential = overview.total_potential_egp;
  const gap = overview.total_gap_egp;

  const basePct = totalCollected > 0 ? (baseRent / totalCollected) * 100 : 0;
  const pctPct = totalCollected > 0 ? (pctPremium / totalCollected) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Split bar visualization */}
        <div className="relative h-16 w-full flex overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-slate-600 to-slate-500 flex items-center justify-center transition-all duration-700"
            style={{ width: `${Math.max(basePct, 5)}%` }}
          >
            <span className="text-xs font-bold text-white px-2 whitespace-nowrap">
              Base Rent: {formatPercentage(basePct, 0)}
            </span>
          </div>
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 flex items-center justify-center transition-all duration-700"
            style={{ width: `${Math.max(pctPct, 2)}%` }}
          >
            {pctPct > 8 && (
              <span className="text-xs font-bold text-white px-2 whitespace-nowrap">
                % Premium: {formatPercentage(pctPct, 0)}
              </span>
            )}
          </div>
        </div>

        {/* Numbers row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5">
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">Base Rent</p>
            <p className="text-lg font-bold font-mono text-text-primary">
              {formatCurrency(baseRent)}
            </p>
            <p className="text-xs text-text-muted">{formatPercentage(basePct, 1)} of collected</p>
          </div>
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">Percentage Premium</p>
            <p className="text-lg font-bold font-mono text-status-success">
              {formatCurrency(pctPremium)}
            </p>
            <p className="text-xs text-status-success">{formatPercentage(pctPct, 1)} inflation-protected</p>
          </div>
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">Total Collected</p>
            <p className="text-lg font-bold font-mono text-text-primary">
              {formatCurrency(totalCollected)}
            </p>
            <p className="text-xs text-text-muted">/month</p>
          </div>
          <div>
            <p className="text-xs text-text-muted font-medium mb-1">Revenue Gap</p>
            <p className="text-lg font-bold font-mono text-status-error">
              {formatCurrency(gap)}
            </p>
            <p className="text-xs text-status-error">
              potential {formatCurrency(totalPotential)}/mo
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
  color,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted font-medium">{label}</span>
          <span className={color}>{icon}</span>
        </div>
        <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

function RentTypePieChart({ overview }: { overview: Overview }) {
  const data = useMemo(
    () => [
      { name: "Percentage Rent", value: overview.tenants_paying_percentage.count },
      { name: "Base Only", value: overview.tenants_paying_minimum_only.count },
    ],
    [overview]
  );

  const COLORS = ["#10B981", "#F59E0B"];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Users size={16} className="text-wedja-accent" />
          Rent Type Split
        </h2>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              paddingAngle={4}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }: any) =>
                `${name}: ${(percent * 100).toFixed(0)}%`
              }
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx]} />
              ))}
            </Pie>
            <Tooltip
              {...DARK_TOOLTIP}
              formatter={(value: any) => [`${value} tenants`, ""]}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", color: "#9CA3AF" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function TopPremiumBarChart({ items }: { items: CompositionItem[] }) {
  const chartData = useMemo(
    () =>
      items
        .filter((i) => i.percentage_premium > 0)
        .sort((a, b) => b.percentage_premium - a.percentage_premium)
        .slice(0, 10)
        .map((i) => ({
          name: i.brand_name,
          premium: i.percentage_premium,
        })),
    [items]
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <BarChart3 size={16} className="text-wedja-accent" />
          Top 10 Tenants by % Rent Premium
        </h2>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v: any) => formatCurrency(v)}
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: "#F9FAFB", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...DARK_TOOLTIP}
              formatter={(value: any) => [formatCurrency(value), "Premium"]}
              labelStyle={{ color: "#F9FAFB" }}
            />
            <Bar dataKey="premium" fill="#10B981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function InflationHedgeCard({ inflation }: { inflation: InflationHedge }) {
  const hedgeRatio = inflation.hedge_ratio;
  const target = inflation.target_hedge_ratio;
  const gaugeWidth = Math.min(hedgeRatio, 100);

  // Color based on ratio
  const gaugeColor =
    hedgeRatio >= 50 ? "bg-emerald-500" :
    hedgeRatio >= 30 ? "bg-amber-500" :
    "bg-red-500";

  const gaugeTextColor =
    hedgeRatio >= 50 ? "text-emerald-400" :
    hedgeRatio >= 30 ? "text-amber-400" :
    "text-red-400";

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-400" />
          Inflation Hedge Analysis
        </h2>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Gauge */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">Hedge Ratio</span>
            <span className={`text-lg font-bold font-mono ${gaugeTextColor}`}>
              {formatPercentage(hedgeRatio)}
            </span>
          </div>
          <div className="relative w-full h-5 bg-wedja-border/30 rounded-full overflow-hidden">
            <div
              className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ${gaugeColor}`}
              style={{ width: `${gaugeWidth}%` }}
            />
            {/* Target marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-white/70"
              style={{ left: `${Math.min(target, 100)}%` }}
              title={`Target: ${target}%`}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-text-muted">0%</span>
            <span className="text-[10px] text-text-muted">
              Target: {target}%
            </span>
            <span className="text-[10px] text-text-muted">100%</span>
          </div>
        </div>

        {/* Devaluation scenario */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-wedja-border/10 border border-wedja-border/30">
            <p className="text-xs text-text-muted mb-1">If EGP devalues 10%</p>
            <p className="text-lg font-bold font-mono text-status-success">
              +{formatCurrency(inflation.devaluation_10pct_increase_egp)}/mo
            </p>
            <p className="text-xs text-text-muted">
              Revenue naturally increases by {formatPercentage(inflation.devaluation_10pct_increase_pct)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-wedja-border/10 border border-wedja-border/30">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-text-muted">Revenue Split</p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-mono text-status-success">
                {formatPercentage(inflation.percentage_rent_share_pct)} protected
              </span>
              <ArrowRight size={12} className="text-text-muted" />
              <span className="text-sm font-mono text-text-secondary">
                {formatPercentage(inflation.fixed_rent_share_pct)} fixed
              </span>
            </div>
          </div>
        </div>

        {/* Zero rate tenants */}
        {inflation.tenants_with_zero_rate.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-status-error uppercase tracking-wider mb-2">
              Tenants with 0% Rate — No Inflation Hedge
            </p>
            <div className="flex flex-wrap gap-2">
              {inflation.tenants_with_zero_rate.slice(0, 12).map((t) => (
                <Badge key={t.brand_name} variant="error" className="text-xs">
                  {t.brand_name} ({formatCurrency(t.min_rent)}/mo)
                </Badge>
              ))}
              {inflation.tenants_with_zero_rate.length > 12 && (
                <Badge variant="default" className="text-xs">
                  +{inflation.tenants_with_zero_rate.length - 12} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* AI Recommendation */}
        <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-indigo-400 mt-0.5 shrink-0" />
            <p className="text-sm text-text-secondary leading-relaxed">
              {inflation.ai_recommendation}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyTrendChart({ trend }: { trend: TrendMonth[] }) {
  const chartData = useMemo(
    () =>
      trend.map((m) => ({
        label: m.label,
        base: m.base_rent_total,
        premium: m.percentage_rent_total,
      })),
    [trend]
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <BarChart3 size={16} className="text-wedja-accent" />
          Monthly Trend — Base Rent vs Percentage Rent
        </h2>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: any) => formatCurrency(v)}
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...DARK_TOOLTIP}
              formatter={(value: any, name: any) => [
                formatCurrency(value),
                name === "base" ? "Base Rent" : "% Premium",
              ]}
              labelStyle={{ color: "#F9FAFB" }}
            />
            <Legend
              formatter={(value: any) =>
                value === "base" ? "Base Rent" : "% Premium"
              }
              wrapperStyle={{ fontSize: "12px", color: "#9CA3AF" }}
            />
            <Bar dataKey="base" stackId="rent" fill="#F59E0B" radius={[0, 0, 0, 0]} />
            <Bar dataKey="premium" stackId="rent" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function RateOptimizationTable({ optimization }: { optimization: OptimizationResult }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <TrendingUp size={16} className="text-wedja-accent" />
          Percentage Rate Optimization
        </h2>
        <Badge variant="gold" className="text-xs">
          +{formatCurrency(optimization.total_portfolio_uplift_egp)}/mo if all at category avg
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wedja-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">Tenant</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">Category</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Current %</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Avg %</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Gap</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Monthly Uplift</th>
              </tr>
            </thead>
            <tbody>
              {optimization.tenants.slice(0, 25).map((t) => (
                <tr
                  key={t.tenant_id}
                  className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-text-primary font-medium">{t.brand_name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-text-secondary capitalize">{t.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                    {formatPercentage(t.current_rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatPercentage(t.category_avg_rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-status-error">
                    +{formatPercentage(t.rate_gap)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-status-success">
                    +{formatCurrency(t.opportunity_egp)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-wedja-border bg-wedja-border/5">
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-text-primary">
                  Total Portfolio Uplift
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-status-success text-base">
                  +{formatCurrency(optimization.total_portfolio_uplift_egp)}/mo
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MinimumOnlySection({ tenants }: { tenants: TenantItem[] }) {
  return (
    <Card className="border-red-500/20">
      <CardHeader>
        <h2 className="text-sm font-semibold text-status-error flex items-center gap-2">
          <AlertTriangle size={16} />
          Tenants Paying Minimum Rent Only ({tenants.length})
        </h2>
        <p className="text-xs text-text-muted">
          Reported sales never trigger percentage rent — verify accuracy
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wedja-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">Tenant</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Min Rent</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">% Rate</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Reported Sales</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Estimated Sales</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">Flag</th>
              </tr>
            </thead>
            <tbody>
              {tenants.slice(0, 30).map((t) => {
                const reportedTrigger = t.percentage_rate > 0 && t.reported_sales !== null
                  ? t.reported_sales * (t.percentage_rate / 100)
                  : 0;
                const estimatedTrigger = t.percentage_rate > 0 && t.estimated_sales !== null
                  ? t.estimated_sales * (t.percentage_rate / 100)
                  : 0;
                const shouldTrigger = estimatedTrigger > t.min_rent;

                return (
                  <tr
                    key={t.tenant_id}
                    className={`border-b border-wedja-border/50 hover:bg-wedja-border/10 ${
                      shouldTrigger ? "bg-red-500/5" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-text-primary font-medium">{t.brand_name}</span>
                      <span className="text-xs text-text-muted ml-2">{t.unit_number}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                      {formatCurrency(t.min_rent)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                      {t.percentage_rate > 0 ? formatPercentage(t.percentage_rate) : "--"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                      {t.reported_sales !== null ? formatCurrency(t.reported_sales) : "--"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                      {t.estimated_sales !== null ? formatCurrency(t.estimated_sales) : "--"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {shouldTrigger ? (
                        <Badge variant="error" className="text-[10px]">
                          VERIFY
                        </Badge>
                      ) : t.percentage_rate === 0 ? (
                        <Badge variant="warning" className="text-[10px]">
                          NO %
                        </Badge>
                      ) : (
                        <span className="text-xs text-text-muted">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function GapAnalysisTable({ tenants, totalGap }: { tenants: TenantItem[]; totalGap: number }) {
  return (
    <Card className="border-red-500/20">
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <AlertTriangle size={16} className="text-status-error" />
          Gap Analysis — Revenue at Risk
        </h2>
        <Badge variant="error" className="text-xs">
          {formatCurrency(totalGap)}/mo at risk
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wedja-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">Tenant</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">Category</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Rent Paid</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Potential Rent</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">Gap</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">Reason</th>
              </tr>
            </thead>
            <tbody>
              {tenants.slice(0, 30).map((t) => (
                <tr
                  key={t.tenant_id}
                  className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-text-primary font-medium">{t.brand_name}</span>
                    <span className="text-xs text-text-muted ml-2">{t.unit_number}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-text-secondary capitalize">{t.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCurrency(t.rent_paid)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-status-success">
                    {formatCurrency(t.potential_rent)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-status-error">
                    {formatCurrency(t.gap_egp)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge
                      variant={
                        t.gap_reason === "underreporting" ? "error" :
                        t.gap_reason === "low_conversion" ? "warning" :
                        "default"
                      }
                      className="text-[10px]"
                    >
                      {t.gap_reason === "underreporting" ? "Underreporting" :
                       t.gap_reason === "low_conversion" ? "Low Conversion" :
                       t.gap_reason === "no_sales_data" ? "No Data" :
                       "--"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-wedja-border bg-red-500/5">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-text-primary">
                  Total Revenue at Risk
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-status-error text-base">
                  {formatCurrency(totalGap)}/mo
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
