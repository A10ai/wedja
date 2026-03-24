"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  BarChart3,
  DollarSign,
  Users,
  Target,
  ArrowUp,
  ArrowDown,
  Activity,
  Brain,
  Zap,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";

// ── Shared tooltip style ─────────────────────────────────────

const DARK_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#111827",
    border: "1px solid #1F2937",
    borderRadius: "8px",
  },
  labelStyle: { color: "#9CA3AF" },
  itemStyle: { color: "#F9FAFB" },
};

// ── Types ───────────────────────────────────────────────────

interface TrainedModel {
  model_type: "footfall" | "revenue";
  trend_slope: number;
  trend_intercept: number;
  dow_coefficients: number[];
  residual_std: number;
  training_samples: number;
  training_date: string;
  accuracy_mae: number;
  accuracy_mape: number;
  r_squared: number;
}

interface Prediction {
  date: string;
  predicted_value: number;
  confidence_low: number;
  confidence_high: number;
  factors: string[];
}

interface ForecastResult {
  model: TrainedModel;
  predictions: Prediction[];
}

interface BacktestResult {
  model_type: "footfall" | "revenue";
  training_samples: number;
  test_samples: number;
  mae: number;
  mape: number;
  r_squared: number;
  baseline_mae: number;
  baseline_mape: number;
  improvement_pct: number;
}

interface ModelPerformance {
  footfall: BacktestResult;
  revenue: BacktestResult;
}

// ── Day-of-week labels ──────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
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
];

// ── Component ───────────────────────────────────────────────

export default function PredictionsPage() {
  const [footfall, setFootfall] = useState<ForecastResult | null>(null);
  const [revenue, setRevenue] = useState<ForecastResult | null>(null);
  const [performance, setPerformance] = useState<ModelPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, rRes, pRes] = await Promise.all([
        fetch("/api/v1/ai/predictions?type=footfall"),
        fetch("/api/v1/ai/predictions?type=revenue"),
        fetch("/api/v1/ai/predictions?type=performance"),
      ]);

      const fJson = await fRes.json();
      const rJson = await rRes.json();
      const pJson = await pRes.json();

      if (fJson.error) throw new Error(fJson.error);
      if (rJson.error) throw new Error(rJson.error);

      setFootfall(fJson.data);
      setRevenue(rJson.data);
      setPerformance(pJson.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load predictions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      const res = await fetch("/api/v1/ai/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "train" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // Refresh all data after retraining
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retrain failed");
    } finally {
      setRetraining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
          <p className="text-text-secondary text-sm">
            Training ML models on Senzo Mall data...
          </p>
        </div>
      </div>
    );
  }

  if (error && !footfall && !revenue) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent>
            <div className="text-center space-y-3 py-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                <Activity className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-text-primary font-medium">Model Training Error</p>
              <p className="text-text-secondary text-sm">{error}</p>
              <Button onClick={fetchAll} variant="secondary" size="sm">
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              ML Predictions
            </h1>
            <p className="text-sm text-text-secondary">
              Trained on {formatNumber((footfall?.model.training_samples || 0) + (revenue?.model.training_samples || 0))} real data points from Senzo Mall
            </p>
          </div>
        </div>
        <Button
          onClick={handleRetrain}
          disabled={retraining}
          variant="secondary"
          size="sm"
        >
          {retraining ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {retraining ? "Retraining..." : "Retrain Models"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Footfall Forecast */}
        {footfall && (
          <div className="space-y-4">
            <FootfallPanel data={footfall} />
            <DowCoefficientsChart
              coefficients={footfall.model.dow_coefficients}
            />
          </div>
        )}

        {/* Right: Revenue Forecast */}
        {revenue && (
          <div className="space-y-4">
            <RevenuePanel data={revenue} />
            <MonthlyCoefficientsChart
              coefficients={revenue.model.dow_coefficients}
            />
          </div>
        )}
      </div>

      {/* Bottom: Model Comparison */}
      {performance && <ModelComparisonPanel performance={performance} />}
    </div>
  );
}

// ── Footfall Panel ──────────────────────────────────────────

function FootfallPanel({ data }: { data: ForecastResult }) {
  const { model, predictions } = data;

  const chartData = useMemo(
    () =>
      predictions.map((p) => {
        const d = new Date(p.date + "T00:00:00");
        const dow = d.getDay();
        return {
          date: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
          predicted: Math.round(p.predicted_value),
          confidenceLow: Math.round(p.confidence_low),
          confidenceHigh: Math.round(p.confidence_high),
          // For the area band we need a range array
          confidenceRange: [Math.round(p.confidence_low), Math.round(p.confidence_high)],
          isWeekend: dow === 5 || dow === 6,
        };
      }),
    [predictions]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-text-primary">
            Footfall Forecast (30 Days)
          </span>
        </div>
        <Badge variant="info">ML Model</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model stats */}
        <div className="grid grid-cols-3 gap-3">
          <ModelStat
            label="R-Squared"
            value={model.r_squared.toFixed(4)}
            icon={Target}
            quality={model.r_squared > 0.7 ? "good" : model.r_squared > 0.4 ? "ok" : "weak"}
          />
          <ModelStat
            label="MAE"
            value={formatNumber(Math.round(model.accuracy_mae))}
            subtext="visitors"
            icon={BarChart3}
          />
          <ModelStat
            label="Training"
            value={formatNumber(model.training_samples)}
            subtext="samples"
            icon={Brain}
          />
        </div>

        {/* Trend indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-wedja-bg">
          {model.trend_slope > 0 ? (
            <ArrowUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
          <span className="text-sm text-text-secondary">
            Trend: {model.trend_slope > 0 ? "+" : ""}
            {model.trend_slope.toFixed(1)} visitors/day
          </span>
          <span className="text-xs text-text-muted ml-auto">
            MAPE: {model.accuracy_mape.toFixed(1)}%
          </span>
        </div>

        {/* Recharts AreaChart with confidence bands */}
        <div className="space-y-1">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">
            Daily Predicted Visitors
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="footfallGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6B7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1F2937" }}
                  interval={Math.ceil(chartData.length / 7) - 1}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: any) => formatNumber(v)}
                />
                <Tooltip
                  {...DARK_TOOLTIP}
                  formatter={(value: any, name: any) => {
                    if (name === "confidenceHigh") return [formatNumber(value), "Confidence High"];
                    if (name === "confidenceLow") return [formatNumber(value), "Confidence Low"];
                    return [formatNumber(value), "Predicted"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="confidenceHigh"
                  stroke="none"
                  fill="url(#confidenceGradient)"
                  fillOpacity={1}
                />
                <Area
                  type="monotone"
                  dataKey="confidenceLow"
                  stroke="none"
                  fill="#111827"
                  fillOpacity={0}
                />
                <Area
                  type="monotone"
                  dataKey="predicted"
                  stroke="#6366F1"
                  strokeWidth={2}
                  fill="url(#footfallGradient)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366F1", stroke: "#111827", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-[10px] text-text-muted pt-1">
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" /> Predicted
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-indigo-500/10 inline-block rounded" /> Confidence Band
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Revenue Panel ───────────────────────────────────────────

function RevenuePanel({ data }: { data: ForecastResult }) {
  const { model, predictions } = data;
  const totalLow = predictions.reduce((s, p) => s + p.confidence_low, 0);
  const totalHigh = predictions.reduce((s, p) => s + p.confidence_high, 0);
  const totalPredicted = predictions.reduce((s, p) => s + p.predicted_value, 0);

  const chartData = useMemo(
    () =>
      predictions.map((p) => {
        const d = new Date(p.date + "T00:00:00");
        return {
          month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          predicted: Math.round(p.predicted_value),
          confidenceLow: Math.round(p.confidence_low),
          confidenceHigh: Math.round(p.confidence_high),
          // Error bar range relative to predicted
          errorLow: Math.round(p.predicted_value - p.confidence_low),
          errorHigh: Math.round(p.confidence_high - p.predicted_value),
          factors: p.factors,
        };
      }),
    [predictions]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-text-primary">
            Revenue Forecast (6 Months)
          </span>
        </div>
        <Badge variant="info">ML Model</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model stats */}
        <div className="grid grid-cols-3 gap-3">
          <ModelStat
            label="R-Squared"
            value={model.r_squared.toFixed(4)}
            icon={Target}
            quality={model.r_squared > 0.7 ? "good" : model.r_squared > 0.4 ? "ok" : "weak"}
          />
          <ModelStat
            label="MAE"
            value={formatCurrency(model.accuracy_mae)}
            icon={BarChart3}
          />
          <ModelStat
            label="Training"
            value={formatNumber(model.training_samples)}
            subtext="transactions"
            icon={Brain}
          />
        </div>

        {/* Total predicted */}
        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg px-4 py-3">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
            Next 6 Months Total Predicted
          </p>
          <p className="text-lg font-semibold text-text-primary font-mono">
            {formatCurrency(totalPredicted)}
          </p>
          <p className="text-xs text-text-secondary">
            Range: {formatCurrency(totalLow)} to {formatCurrency(totalHigh)}
          </p>
        </div>

        {/* Trend indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-wedja-bg">
          {model.trend_slope > 0 ? (
            <ArrowUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
          <span className="text-sm text-text-secondary">
            Trend: {model.trend_slope > 0 ? "+" : ""}
            {formatCurrency(Math.round(model.trend_slope))}/month
          </span>
          <span className="text-xs text-text-muted ml-auto">
            MAPE: {model.accuracy_mape.toFixed(1)}%
          </span>
        </div>

        {/* Recharts BarChart for monthly revenue */}
        <div className="space-y-1">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">
            Monthly Predicted Revenue
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1F2937" }}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: any) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                    return String(v);
                  }}
                />
                <Tooltip
                  {...DARK_TOOLTIP}
                  formatter={(value: any, name: any) => {
                    if (name === "confidenceHigh") return [formatCurrency(value), "Conf. High"];
                    if (name === "confidenceLow") return [formatCurrency(value), "Conf. Low"];
                    return [formatCurrency(value), "Predicted"];
                  }}
                />
                {/* Confidence high as a background bar */}
                <Bar dataKey="confidenceHigh" fill="#6366F1" fillOpacity={0.1} radius={[4, 4, 0, 0]} />
                {/* Predicted as the main bar */}
                <Bar dataKey="predicted" fill="#6366F1" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                {/* Confidence low as an overlay reference */}
                <Bar dataKey="confidenceLow" fill="#818CF8" fillOpacity={0.15} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {chartData.map((d, i) =>
              d.factors.length > 0 ? (
                <div key={i} className="flex flex-wrap gap-1">
                  {d.factors.slice(0, 2).map((f: string, fi: number) => (
                    <span
                      key={fi}
                      className="text-[10px] text-text-muted bg-wedja-border/30 rounded px-1.5 py-0.5"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              ) : null
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Day-of-Week Coefficients Chart ──────────────────────────

function DowCoefficientsChart({ coefficients }: { coefficients: number[] }) {
  const chartData = useMemo(
    () =>
      coefficients.map((coeff, i) => ({
        day: DOW_LABELS[i],
        value: Math.round(coeff),
        fill: coeff >= 0 ? "#6366F1" : "#EF4444",
      })),
    [coefficients]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-text-primary">
            Learned Day-of-Week Effect
          </span>
        </div>
        <Badge variant="default">Coefficients</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-text-muted mb-3">
          Visitors above/below trend by day (learned from data)
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "#6B7280", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#1F2937" }}
              />
              <YAxis
                tick={{ fill: "#6B7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: any) => (v > 0 ? `+${v}` : String(v))}
              />
              <Tooltip
                {...DARK_TOOLTIP}
                formatter={(value: any) => [
                  `${value > 0 ? "+" : ""}${formatNumber(value)} visitors`,
                  "Effect",
                ]}
              />
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Monthly Seasonality Coefficients ────────────────────────

function MonthlyCoefficientsChart({
  coefficients,
}: {
  coefficients: number[];
}) {
  const chartData = useMemo(
    () =>
      coefficients.map((coeff, i) => ({
        month: MONTH_LABELS[i],
        value: Math.round(coeff),
        fill: coeff >= 0 ? "#6366F1" : "#EF4444",
      })),
    [coefficients]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-text-primary">
            Learned Monthly Seasonality
          </span>
        </div>
        <Badge variant="default">Coefficients</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-text-muted mb-3">
          Revenue above/below trend by month (learned from data)
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "#6B7280", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#1F2937" }}
              />
              <YAxis
                tick={{ fill: "#6B7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: any) => {
                  const abs = Math.abs(v);
                  const prefix = v >= 0 ? "+" : "-";
                  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(0)}K`;
                  return `${prefix}${abs}`;
                }}
              />
              <Tooltip
                {...DARK_TOOLTIP}
                formatter={(value: any) => [
                  `${value >= 0 ? "+" : ""}${formatCurrency(value)}`,
                  "Effect",
                ]}
              />
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Model Comparison Panel ──────────────────────────────────

function ModelComparisonPanel({
  performance,
}: {
  performance: ModelPerformance;
}) {
  const { footfall, revenue } = performance;

  const accuracyChartData = useMemo(() => {
    const items = [];
    if (footfall.training_samples > 0) {
      items.push({
        name: "Footfall MAE",
        mlModel: Math.round(footfall.mae),
        baseline: Math.round(footfall.baseline_mae),
      });
      items.push({
        name: "Footfall MAPE",
        mlModel: parseFloat(footfall.mape.toFixed(1)),
        baseline: parseFloat(footfall.baseline_mape.toFixed(1)),
      });
    }
    if (revenue.training_samples > 0) {
      items.push({
        name: "Revenue MAPE",
        mlModel: parseFloat(revenue.mape.toFixed(1)),
        baseline: parseFloat(revenue.baseline_mape.toFixed(1)),
      });
    }
    return items;
  }, [footfall, revenue]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-text-primary">
            Model Backtest Results (80/20 Split)
          </span>
        </div>
        <Badge variant="info">Validation</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Accuracy comparison bar chart */}
        {accuracyChartData.length > 0 && (
          <div>
            <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-3">
              ML Model vs Baseline Accuracy (lower is better)
            </p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accuracyChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#1F2937" }}
                  />
                  <YAxis
                    tick={{ fill: "#6B7280", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    {...DARK_TOOLTIP}
                    formatter={(value: any, name: any) => [
                      value,
                      name === "mlModel" ? "ML Model" : "Baseline (Mean)",
                    ]}
                  />
                  <Legend
                    formatter={(value: any) =>
                      value === "mlModel" ? "ML Model" : "Baseline (Mean)"
                    }
                    wrapperStyle={{ fontSize: 11, color: "#9CA3AF" }}
                  />
                  <Bar dataKey="mlModel" fill="#6366F1" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="baseline" fill="#374151" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Footfall backtest */}
          <BacktestCard result={footfall} label="Footfall Model" />
          {/* Revenue backtest */}
          <BacktestCard result={revenue} label="Revenue Model" />
        </div>
      </CardContent>
    </Card>
  );
}

function BacktestCard({
  result,
  label,
}: {
  result: BacktestResult;
  label: string;
}) {
  const hasData = result.training_samples > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {hasData && (
          <Badge variant={result.improvement_pct > 0 ? "success" : "warning"}>
            {result.improvement_pct > 0 ? "+" : ""}
            {result.improvement_pct}% vs baseline
          </Badge>
        )}
      </div>

      {hasData ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-wedja-bg rounded-lg px-3 py-2">
              <span className="text-text-muted block">Train / Test</span>
              <span className="text-text-primary font-mono">
                {formatNumber(result.training_samples)} /{" "}
                {formatNumber(result.test_samples)}
              </span>
            </div>
            <div className="bg-wedja-bg rounded-lg px-3 py-2">
              <span className="text-text-muted block">R-Squared</span>
              <span className="text-text-primary font-mono">
                {result.r_squared.toFixed(4)}
              </span>
            </div>
          </div>

          {/* ML vs Baseline comparison */}
          <div className="border border-wedja-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 text-[11px] text-text-muted bg-wedja-bg px-3 py-1.5 border-b border-wedja-border">
              <span>Metric</span>
              <span className="text-center">ML Model</span>
              <span className="text-center">Baseline (Mean)</span>
            </div>
            <div className="grid grid-cols-3 text-xs px-3 py-2 border-b border-wedja-border/50">
              <span className="text-text-secondary">MAE</span>
              <span className="text-center text-text-primary font-mono">
                {result.model_type === "revenue"
                  ? formatCurrency(result.mae)
                  : formatNumber(Math.round(result.mae))}
              </span>
              <span className="text-center text-text-muted font-mono">
                {result.model_type === "revenue"
                  ? formatCurrency(result.baseline_mae)
                  : formatNumber(Math.round(result.baseline_mae))}
              </span>
            </div>
            <div className="grid grid-cols-3 text-xs px-3 py-2">
              <span className="text-text-secondary">MAPE</span>
              <span className="text-center text-text-primary font-mono">
                {result.mape.toFixed(1)}%
              </span>
              <span className="text-center text-text-muted font-mono">
                {result.baseline_mape.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 bg-wedja-bg rounded-lg">
          <p className="text-sm text-text-muted">
            Insufficient data for backtesting
          </p>
        </div>
      )}
    </div>
  );
}

// ── Shared Sub-components ───────────────────────────────────

function ModelStat({
  label,
  value,
  subtext,
  icon: Icon,
  quality,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  quality?: "good" | "ok" | "weak";
}) {
  return (
    <div className="bg-wedja-bg rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-text-muted" />
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-sm font-semibold font-mono",
            quality === "good"
              ? "text-emerald-500"
              : quality === "ok"
                ? "text-amber-500"
                : quality === "weak"
                  ? "text-red-500"
                  : "text-text-primary"
          )}
        >
          {value}
        </span>
        {subtext && (
          <span className="text-[10px] text-text-muted">{subtext}</span>
        )}
      </div>
    </div>
  );
}
