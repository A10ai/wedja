"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Loader2,
  Shield,
  TrendingDown,
  Search,
  Play,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Target,
  DollarSign,
  BarChart3,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface DiscrepancySummary {
  total_discrepancies: number;
  total_variance_egp: number;
  avg_variance_pct: number;
  by_confidence: { high: number; medium: number; low: number };
  by_status: {
    flagged: number;
    investigating: number;
    resolved: number;
    dismissed: number;
  };
  top_discrepancies: DiscrepancyRecord[];
  total_potential_recovery_egp: number;
}

interface DiscrepancyRecord {
  id?: string;
  tenant_id: string;
  tenant_name?: string;
  brand_name?: string;
  category?: string;
  unit_number?: string;
  period_month: number;
  period_year: number;
  reported_revenue_egp: number;
  estimated_revenue_egp: number;
  variance_egp: number;
  variance_pct: number;
  confidence: number;
  status: string;
  resolution_notes?: string;
  tenants?: { id: string; name: string; brand_name: string; category: string };
  units?: { id: string; unit_number: string };
}

interface VerificationResult {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  unit_id: string;
  unit_number: string;
  lease_id: string;
  footfall: number;
  reported_revenue_egp: number | null;
  estimated_low_egp: number;
  estimated_mid_egp: number;
  estimated_high_egp: number;
  variance_egp: number;
  variance_pct: number;
  confidence: number;
  status: string;
}

interface FullReport {
  summary: {
    total_tenants: number;
    tenants_with_sales: number;
    total_discrepancies: number;
    high_confidence_flags: number;
    total_reported_egp: number;
    total_estimated_egp: number;
    total_variance_egp: number;
    avg_variance_pct: number;
    potential_recovery_egp: number;
  };
  tenants: VerificationResult[];
  run_at: string;
}

interface TenantProfile {
  tenant_id: string;
  tenant_name: string;
  brand_name: string;
  category: string;
  monthly_history: Array<{
    month: number;
    year: number;
    reported_egp: number | null;
    estimated_egp: number | null;
    variance_egp: number | null;
    variance_pct: number | null;
    confidence: number | null;
  }>;
  pattern: string;
  avg_variance_pct: number;
  risk_score: number;
}

// ── Constants ───────────────────────────────────────────────

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = [
  "",
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

const STATUS_COLORS: Record<string, string> = {
  flagged: "text-red-500",
  investigating: "text-amber-500",
  resolved: "text-emerald-500",
  dismissed: "text-gray-400",
  ok: "text-emerald-500",
};

const STATUS_BADGE: Record<string, "error" | "warning" | "success" | "default"> = {
  flagged: "error",
  investigating: "warning",
  resolved: "success",
  dismissed: "default",
  ok: "success",
};

const CONFIDENCE_BADGE: Record<string, "error" | "warning" | "default"> = {
  high: "error",
  medium: "warning",
  low: "default",
};

function getConfidenceLevel(conf: number): "high" | "medium" | "low" {
  if (conf >= 0.75) return "high";
  if (conf >= 0.5) return "medium";
  return "low";
}

// ── Page Component ──────────────────────────────────────────

export default function DiscrepanciesPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<DiscrepancySummary | null>(null);
  const [report, setReport] = useState<FullReport | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyRecord[]>([]);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [runningVerification, setRunningVerification] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        type: "summary",
        month: String(selectedMonth),
        year: String(selectedYear),
      });
      const res = await fetch(`/api/v1/revenue-verification?${params}`);
      const data = await res.json();
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [selectedMonth, selectedYear]);

  // Fetch full report
  const fetchReport = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        type: "full",
        month: String(selectedMonth),
        year: String(selectedYear),
      });
      const res = await fetch(`/api/v1/revenue-verification?${params}`);
      const data = await res.json();
      setReport(data);
      if (data.run_at) setLastRunAt(data.run_at);
    } catch {
      setReport(null);
    }
  }, [selectedMonth, selectedYear]);

  // Fetch discrepancies list
  const fetchDiscrepancies = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        month: String(selectedMonth),
        year: String(selectedYear),
      });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/v1/discrepancies?${params}`);
      const data = await res.json();
      setDiscrepancies(Array.isArray(data) ? data : []);
    } catch {
      setDiscrepancies([]);
    }
  }, [selectedMonth, selectedYear, statusFilter]);

  // Fetch tenant profile
  const fetchTenantProfile = useCallback(async (tenantId: string) => {
    try {
      const params = new URLSearchParams({
        type: "tenant",
        tenant_id: tenantId,
      });
      const res = await fetch(`/api/v1/revenue-verification?${params}`);
      const data = await res.json();
      setTenantProfile(data);
    } catch {
      setTenantProfile(null);
    }
  }, []);

  // Load all data
  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSummary(), fetchReport(), fetchDiscrepancies()]);
    setLoading(false);
  }, [fetchSummary, fetchReport, fetchDiscrepancies]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Run verification
  const handleRunVerification = async () => {
    setRunningVerification(true);
    try {
      const res = await fetch("/api/v1/revenue-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_verification",
          month: selectedMonth,
          year: selectedYear,
        }),
      });
      const data = await res.json();
      if (data.run_at) setLastRunAt(data.run_at);
      await loadAll();
    } catch (error) {
      console.error("Verification failed:", error);
    } finally {
      setRunningVerification(false);
    }
  };

  // Update discrepancy status
  const handleStatusChange = async (
    id: string,
    newStatus: string,
    notes?: string
  ) => {
    try {
      await fetch("/api/v1/discrepancies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: newStatus,
          resolution_notes: notes,
        }),
      });
      await fetchDiscrepancies();
      await fetchSummary();
    } catch (error) {
      console.error("Status update failed:", error);
    }
  };

  // Toggle tenant profile
  const toggleTenantProfile = (tenantId: string) => {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
      setTenantProfile(null);
    } else {
      setExpandedTenant(tenantId);
      fetchTenantProfile(tenantId);
    }
  };

  const hasDiscrepancies = (summary?.total_discrepancies || 0) > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Shield size={28} className="text-wedja-accent" />
            Revenue Verification
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Forensic analysis of tenant revenue reporting
          </p>
        </div>
        {lastRunAt && (
          <p className="text-xs text-text-muted">
            Last verification:{" "}
            {new Date(lastRunAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {/* A. Alert Banner */}
      {hasDiscrepancies && !loading && (
        <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={24}
              className="text-red-500 mt-0.5 shrink-0"
            />
            <div>
              <p className="font-semibold text-red-500">
                {summary!.total_discrepancies} discrepanc
                {summary!.total_discrepancies === 1 ? "y" : "ies"} detected
              </p>
              <p className="text-sm text-text-secondary mt-0.5">
                {formatCurrency(summary!.total_potential_recovery_egp)} potential
                underreporting identified for{" "}
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={handleRunVerification}
            disabled={runningVerification}
          >
            {runningVerification ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Re-run Verification
          </Button>
        </div>
      )}

      {/* B. Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-text-primary font-mono">
              {loading ? (
                <Loader2 size={24} className="animate-spin mx-auto" />
              ) : (
                summary?.total_discrepancies ?? 0
              )}
            </p>
            <p className="text-xs text-text-muted mt-1 flex items-center justify-center gap-1">
              <AlertTriangle size={12} />
              Total Discrepancies
            </p>
          </CardContent>
        </Card>

        <Card className="border-wedja-accent/30">
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-wedja-accent font-mono">
              {loading ? (
                <Loader2 size={24} className="animate-spin mx-auto" />
              ) : (
                formatCurrency(summary?.total_potential_recovery_egp ?? 0)
              )}
            </p>
            <p className="text-xs text-text-muted mt-1 flex items-center justify-center gap-1">
              <DollarSign size={12} />
              Potential Recovery
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-red-500 font-mono">
              {loading ? (
                <Loader2 size={24} className="animate-spin mx-auto" />
              ) : (
                summary?.by_confidence.high ?? 0
              )}
            </p>
            <p className="text-xs text-text-muted mt-1 flex items-center justify-center gap-1">
              <Target size={12} />
              High Confidence Flags
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-text-primary font-mono">
              {loading ? (
                <Loader2 size={24} className="animate-spin mx-auto" />
              ) : (
                formatPercentage(summary?.avg_variance_pct ?? 0)
              )}
            </p>
            <p className="text-xs text-text-muted mt-1 flex items-center justify-center gap-1">
              <TrendingDown size={12} />
              Average Variance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* C. Verification Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Period
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
              >
                {MONTH_NAMES.slice(1).map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
              >
                {[2025, 2026].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
              >
                <option value="">All</option>
                <option value="flagged">Flagged</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            <div className="ml-auto">
              <Button
                onClick={handleRunVerification}
                disabled={runningVerification}
              >
                {runningVerification ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                Run Verification
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* F. Revenue Comparison Chart */}
      {report && report.tenants.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                Revenue Comparison — Top 15 Tenants
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-gray-400/60" />
                Reported
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-wedja-accent" />
                Estimated
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.tenants
                .filter((t) => t.reported_revenue_egp !== null)
                .sort((a, b) => b.estimated_mid_egp - a.estimated_mid_egp)
                .slice(0, 15)
                .map((t) => {
                  const maxVal = Math.max(
                    t.reported_revenue_egp || 0,
                    t.estimated_mid_egp
                  );
                  const reportedPct =
                    maxVal > 0
                      ? ((t.reported_revenue_egp || 0) / maxVal) * 100
                      : 0;
                  const estimatedPct =
                    maxVal > 0 ? (t.estimated_mid_egp / maxVal) * 100 : 0;
                  const isUnderreporting =
                    t.status === "flagged" || t.status === "investigating";

                  return (
                    <div key={t.tenant_id} className="group">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-28 text-xs font-medium truncate ${isUnderreporting ? "text-red-500" : "text-text-secondary"}`}
                          title={t.brand_name}
                        >
                          {t.brand_name}
                        </span>
                        <div className="flex-1 space-y-0.5">
                          {/* Reported bar */}
                          <div className="h-3 rounded-sm bg-wedja-border/30 relative overflow-hidden">
                            <div
                              className="h-full rounded-sm bg-gray-400/60 transition-all duration-500"
                              style={{ width: `${reportedPct}%` }}
                            />
                          </div>
                          {/* Estimated bar */}
                          <div className="h-3 rounded-sm bg-wedja-border/30 relative overflow-hidden">
                            <div
                              className="h-full rounded-sm bg-wedja-accent transition-all duration-500"
                              style={{ width: `${estimatedPct}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-24 text-right text-xs font-mono text-text-muted">
                          {t.variance_egp > 0 && (
                            <span className="text-red-500">
                              -{formatPercentage(t.variance_pct)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* G. Confidence Breakdown */}
      {summary && hasDiscrepancies && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["high", "medium", "low"] as const).map((level) => {
            const count = summary.by_confidence[level];
            const total = summary.total_discrepancies;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const colors = {
              high: { bar: "bg-red-500", text: "text-red-500", label: "High Confidence" },
              medium: { bar: "bg-amber-500", text: "text-amber-500", label: "Medium Confidence" },
              low: { bar: "bg-gray-400", text: "text-gray-400", label: "Low Confidence" },
            };
            const c = colors[level];

            return (
              <Card key={level}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-text-muted">
                      {c.label}
                    </span>
                    <span className={`text-lg font-bold font-mono ${c.text}`}>
                      {count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-wedja-border/30">
                    <div
                      className={`h-full rounded-full ${c.bar} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-text-muted mt-1 text-right">
                    {formatPercentage(pct, 0)} of total
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* D. Discrepancy Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Verification Results
            </h2>
          </div>
          <p className="text-xs text-text-muted">
            {report?.tenants.length ?? 0} tenant
            {(report?.tenants.length ?? 0) !== 1 ? "s" : ""} analyzed
            {report?.summary.total_discrepancies
              ? ` | ${report.summary.total_discrepancies} flagged`
              : ""}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin text-wedja-accent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border bg-wedja-bg/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                      Category
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                      Footfall
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Reported
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Estimated
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Variance
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">
                      Confidence
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.tenants || []).map((t, i) => {
                    const isExpanded = expandedTenant === t.tenant_id;
                    const confLevel = getConfidenceLevel(t.confidence);
                    const isFlagged =
                      t.status === "flagged" || t.status === "investigating";
                    const discrepancy = discrepancies.find(
                      (d) =>
                        (d.tenant_id === t.tenant_id ||
                          d.tenants?.id === t.tenant_id)
                    );

                    return (
                      <>
                        <tr
                          key={t.tenant_id}
                          className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 cursor-pointer transition-colors ${
                            isFlagged ? "bg-red-500/[0.03]" : ""
                          } ${i % 2 === 1 && !isFlagged ? "bg-wedja-border/[0.06]" : ""}`}
                          onClick={() => toggleTenantProfile(t.tenant_id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronUp
                                  size={14}
                                  className="text-text-muted shrink-0"
                                />
                              ) : (
                                <ChevronDown
                                  size={14}
                                  className="text-text-muted shrink-0"
                                />
                              )}
                              <div>
                                <p
                                  className={`font-medium ${isFlagged ? "text-red-500" : "text-text-primary"}`}
                                >
                                  {t.brand_name}
                                </p>
                                <p className="text-[11px] text-text-muted font-mono">
                                  {t.unit_number}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-text-secondary capitalize">
                              {t.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right hidden lg:table-cell font-mono text-text-secondary">
                            {formatNumber(t.footfall)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-text-secondary">
                            {t.reported_revenue_egp !== null
                              ? formatCurrency(t.reported_revenue_egp)
                              : <span className="text-text-muted italic">N/A</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-text-primary font-medium">
                            {formatCurrency(t.estimated_mid_egp)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {t.reported_revenue_egp !== null ? (
                              <div>
                                <span
                                  className={`font-mono font-medium ${
                                    t.variance_egp > 0
                                      ? "text-red-500"
                                      : t.variance_egp < 0
                                        ? "text-emerald-500"
                                        : "text-text-muted"
                                  }`}
                                >
                                  {t.variance_egp > 0 ? "+" : ""}
                                  {formatCurrency(t.variance_egp)}
                                </span>
                                <p
                                  className={`text-[11px] font-mono ${
                                    t.variance_pct > 15
                                      ? "text-red-400"
                                      : t.variance_pct > 5
                                        ? "text-amber-400"
                                        : "text-text-muted"
                                  }`}
                                >
                                  {t.variance_pct > 0 ? "+" : ""}
                                  {formatPercentage(t.variance_pct)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-text-muted">--</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center hidden sm:table-cell">
                            <Badge variant={CONFIDENCE_BADGE[confLevel]}>
                              {formatPercentage(t.confidence * 100, 0)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {discrepancy?.id && isFlagged ? (
                              <select
                                value={t.status}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(
                                    discrepancy.id!,
                                    e.target.value
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`text-xs px-2 py-1 rounded-lg border border-wedja-border bg-wedja-bg ${STATUS_COLORS[t.status]} font-medium focus:outline-none focus:ring-2 focus:ring-wedja-accent`}
                              >
                                <option value="flagged">Flagged</option>
                                <option value="investigating">
                                  Investigating
                                </option>
                                <option value="resolved">Resolved</option>
                                <option value="dismissed">Dismissed</option>
                              </select>
                            ) : (
                              <Badge variant={STATUS_BADGE[t.status] || "success"}>
                                {t.status === "ok" ? "OK" : t.status}
                              </Badge>
                            )}
                          </td>
                        </tr>

                        {/* E. Expanded Tenant Profile */}
                        {isExpanded && (
                          <tr key={`${t.tenant_id}-profile`}>
                            <td
                              colSpan={8}
                              className="px-4 py-0 border-b border-wedja-border"
                            >
                              <TenantProfilePanel
                                tenantProfile={tenantProfile}
                                tenantId={t.tenant_id}
                                onClose={() => {
                                  setExpandedTenant(null);
                                  setTenantProfile(null);
                                }}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {(!report || report.tenants.length === 0) && !loading && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-16 text-center text-text-muted"
                      >
                        <Shield
                          size={48}
                          className="mx-auto text-text-muted/50 mb-4"
                        />
                        <p className="text-sm mb-2">
                          No verification data for this period
                        </p>
                        <p className="text-xs">
                          Click "Run Verification" to analyze tenant revenue
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tenant Profile Panel ────────────────────────────────────

function TenantProfilePanel({
  tenantProfile,
  tenantId,
  onClose,
}: {
  tenantProfile: TenantProfile | null;
  tenantId: string;
  onClose: () => void;
}) {
  if (!tenantProfile || tenantProfile.tenant_id !== tenantId) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  const p = tenantProfile;
  const historyWithData = p.monthly_history.filter(
    (m) => m.reported_egp !== null || m.estimated_egp !== null
  );
  const maxRevenue = Math.max(
    ...historyWithData.map((m) =>
      Math.max(m.reported_egp || 0, m.estimated_egp || 0)
    ),
    1
  );

  // Risk score color
  const riskColor =
    p.risk_score >= 70
      ? "text-red-500"
      : p.risk_score >= 40
        ? "text-amber-500"
        : "text-emerald-500";

  const riskBg =
    p.risk_score >= 70
      ? "bg-red-500"
      : p.risk_score >= 40
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary text-sm">
            {p.brand_name} — Revenue Profile
          </h3>
          <p className="text-xs text-text-muted capitalize">
            {p.category} | {p.pattern}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 hover:bg-wedja-border/50 rounded"
        >
          <X size={16} className="text-text-muted" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Risk Score */}
        <div className="flex flex-col items-center">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="currentColor"
                className="text-wedja-border/30"
                strokeWidth="6"
              />
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="currentColor"
                className={riskColor}
                strokeWidth="6"
                strokeDasharray={`${(p.risk_score / 100) * 220} 220`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold font-mono ${riskColor}`}>
                {p.risk_score}
              </span>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-1">Risk Score</p>
        </div>

        {/* Average Variance */}
        <div className="flex flex-col items-center justify-center">
          <p
            className={`text-2xl font-bold font-mono ${p.avg_variance_pct > 15 ? "text-red-500" : p.avg_variance_pct > 5 ? "text-amber-500" : "text-emerald-500"}`}
          >
            {p.avg_variance_pct > 0 ? "+" : ""}
            {formatPercentage(p.avg_variance_pct)}
          </p>
          <p className="text-xs text-text-muted mt-1">Avg. Variance</p>
        </div>

        {/* Status */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${riskBg}`} />
            <span className="text-sm font-medium text-text-primary">
              {p.risk_score >= 70
                ? "High Risk"
                : p.risk_score >= 40
                  ? "Moderate Risk"
                  : "Low Risk"}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">Risk Assessment</p>
        </div>
      </div>

      {/* Monthly History Chart */}
      {historyWithData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
            Monthly Revenue History
          </p>
          <div className="flex items-end gap-1 h-32">
            {historyWithData.map((m) => {
              const reportedH =
                maxRevenue > 0
                  ? ((m.reported_egp || 0) / maxRevenue) * 100
                  : 0;
              const estimatedH =
                maxRevenue > 0
                  ? ((m.estimated_egp || 0) / maxRevenue) * 100
                  : 0;

              return (
                <div
                  key={`${m.year}-${m.month}`}
                  className="flex-1 flex flex-col items-center gap-0.5"
                >
                  <div className="w-full flex items-end gap-0.5 h-24">
                    <div className="flex-1 relative">
                      <div
                        className="w-full bg-gray-400/40 rounded-t transition-all duration-500"
                        style={{
                          height: `${reportedH}%`,
                          minHeight: m.reported_egp ? "2px" : "0",
                        }}
                      />
                    </div>
                    <div className="flex-1 relative">
                      <div
                        className="w-full bg-wedja-accent rounded-t transition-all duration-500"
                        style={{
                          height: `${estimatedH}%`,
                          minHeight: m.estimated_egp ? "2px" : "0",
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-[9px] text-text-muted">
                    {MONTH_SHORT[m.month]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-400/40" />
              <span className="text-text-muted">Reported</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-wedja-accent" />
              <span className="text-text-muted">Estimated</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
