"use client";

import { useEffect, useState, useCallback } from "react";
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
  const maxVal = Math.max(...predictions.map((p) => p.confidence_high));

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

        {/* Bar chart with confidence bands */}
        <div className="space-y-1">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">
            Daily Predicted Visitors
          </p>
          <div className="h-48 flex items-end gap-px overflow-x-auto">
            {predictions.map((p, i) => {
              const barHeight = maxVal > 0 ? (p.predicted_value / maxVal) * 100 : 0;
              const lowHeight = maxVal > 0 ? (p.confidence_low / maxVal) * 100 : 0;
              const highHeight = maxVal > 0 ? (p.confidence_high / maxVal) * 100 : 0;
              const dayLabel = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
              });
              const dow = new Date(p.date + "T00:00:00").getDay();
              const isWeekend = dow === 5 || dow === 6;

              return (
                <div
                  key={p.date}
                  className="flex-1 min-w-[8px] flex flex-col items-center justify-end relative group"
                  title={`${dayLabel}: ${formatNumber(p.predicted_value)} (${formatNumber(p.confidence_low)}-${formatNumber(p.confidence_high)})`}
                >
                  {/* Confidence band */}
                  <div
                    className="absolute bottom-0 w-full bg-indigo-500/5 rounded-t"
                    style={{ height: `${highHeight}%` }}
                  />
                  {/* Predicted bar */}
                  <div
                    className={cn(
                      "relative w-full rounded-t transition-all",
                      isWeekend
                        ? "bg-indigo-500"
                        : "bg-indigo-500/60"
                    )}
                    style={{ height: `${barHeight}%` }}
                  />
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-wedja-elevated border border-wedja-border rounded-lg px-2 py-1 text-xs text-text-primary whitespace-nowrap shadow-lg">
                    {dayLabel}: {formatNumber(p.predicted_value)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-text-muted pt-1">
            <span>{formatDateShort(predictions[0]?.date)}</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> Weekend
              <span className="w-2 h-2 rounded-sm bg-indigo-500/60 inline-block ml-2" /> Weekday
            </span>
            <span>{formatDateShort(predictions[predictions.length - 1]?.date)}</span>
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
  const maxVal = Math.max(...predictions.map((p) => p.confidence_high));

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

        {/* Monthly bars */}
        <div className="space-y-2">
          {predictions.map((p) => {
            const barWidth = maxVal > 0 ? (p.predicted_value / maxVal) * 100 : 0;
            const lowWidth = maxVal > 0 ? (p.confidence_low / maxVal) * 100 : 0;
            const highWidth = maxVal > 0 ? (p.confidence_high / maxVal) * 100 : 0;
            const monthLabel = new Date(p.date + "T00:00:00").toLocaleDateString(
              "en-US",
              { month: "short", year: "numeric" }
            );

            return (
              <div key={p.date} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">{monthLabel}</span>
                  <span className="text-text-primary font-mono">
                    {formatCurrency(p.predicted_value)}
                  </span>
                </div>
                <div className="h-5 bg-wedja-bg rounded-full overflow-hidden relative">
                  {/* Confidence band */}
                  <div
                    className="absolute top-0 left-0 h-full bg-indigo-500/10 rounded-full"
                    style={{ width: `${highWidth}%` }}
                  />
                  {/* Predicted */}
                  <div
                    className="absolute top-0 left-0 h-full bg-indigo-500/70 rounded-full transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                  {/* Low mark */}
                  <div
                    className="absolute top-0 h-full w-px bg-indigo-300"
                    style={{ left: `${lowWidth}%` }}
                  />
                </div>
                {p.factors.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.factors.slice(0, 2).map((f, i) => (
                      <span
                        key={i}
                        className="text-[10px] text-text-muted bg-wedja-border/30 rounded px-1.5 py-0.5"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Day-of-Week Coefficients Chart ──────────────────────────

function DowCoefficientsChart({ coefficients }: { coefficients: number[] }) {
  const maxAbs = Math.max(...coefficients.map(Math.abs), 1);

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
        <div className="space-y-2">
          {coefficients.map((coeff, i) => {
            const isPositive = coeff >= 0;
            const barWidth = (Math.abs(coeff) / maxAbs) * 50;

            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-text-secondary w-8 text-right font-mono">
                  {DOW_LABELS[i]}
                </span>
                <div className="flex-1 h-5 flex items-center">
                  {/* Center line */}
                  <div className="w-1/2 flex justify-end">
                    {!isPositive && (
                      <div
                        className="h-4 bg-red-500/40 rounded-l"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                  <div className="w-px h-5 bg-wedja-border" />
                  <div className="w-1/2">
                    {isPositive && (
                      <div
                        className="h-4 bg-indigo-500/60 rounded-r"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-xs font-mono w-16 text-right",
                    isPositive ? "text-indigo-400" : "text-red-400"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {Math.round(coeff)}
                </span>
              </div>
            );
          })}
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
  const maxAbs = Math.max(...coefficients.map(Math.abs), 1);

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
        <div className="grid grid-cols-6 gap-1">
          {coefficients.map((coeff, i) => {
            const isPositive = coeff >= 0;
            const intensity = Math.abs(coeff) / maxAbs;

            return (
              <div
                key={i}
                className="flex flex-col items-center gap-1"
                title={`${MONTH_LABELS[i]}: ${isPositive ? "+" : ""}${formatCurrency(Math.round(coeff))}`}
              >
                <div
                  className={cn(
                    "w-full h-10 rounded flex items-center justify-center text-[10px] font-mono",
                    isPositive
                      ? "bg-indigo-500/10 text-indigo-400"
                      : "bg-red-500/10 text-red-400"
                  )}
                  style={{
                    opacity: 0.3 + intensity * 0.7,
                  }}
                >
                  {isPositive ? "+" : ""}
                  {Math.abs(coeff) >= 1000
                    ? `${(coeff / 1000).toFixed(0)}K`
                    : Math.round(coeff)}
                </div>
                <span className="text-[10px] text-text-muted">
                  {MONTH_LABELS[i]}
                </span>
              </div>
            );
          })}
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
      <CardContent>
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

function formatDateShort(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
