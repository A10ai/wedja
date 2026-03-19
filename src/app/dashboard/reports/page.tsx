"use client";

import { useState, useCallback } from "react";
import {
  FileBarChart,
  Loader2,
  Download,
  Printer,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

const REPORT_TYPES = [
  { value: "revenue_verification", label: "Revenue Verification" },
  { value: "tenant_performance", label: "Tenant Performance" },
  { value: "footfall_analysis", label: "Footfall Analysis" },
  { value: "rent_collection", label: "Rent Collection" },
  { value: "maintenance", label: "Maintenance" },
];

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function ReportsPage() {
  const now = new Date();
  const [reportType, setReportType] = useState("revenue_verification");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [error, setError] = useState("");

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setReportData(null);

    try {
      const params = new URLSearchParams({
        type: reportType,
        month: String(month),
        year: String(year),
      });
      const res = await fetch(`/api/v1/reports?${params}`);
      if (!res.ok) throw new Error("Failed to generate report");
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [reportType, month, year]);

  const exportCSV = useCallback(() => {
    if (!reportData) return;

    let csv = "";
    const type = reportData.type;

    if (type === "revenue_verification" && reportData.data?.tenants) {
      csv = "Tenant,Unit,Category,Footfall,Reported (EGP),Estimated (EGP),Variance (EGP),Variance %,Confidence,Status\n";
      reportData.data.tenants.forEach((t: any) => {
        csv += `"${t.brand_name}","${t.unit_number}","${t.category}",${t.footfall},${t.reported_revenue_egp || 0},${t.estimated_mid_egp},${t.variance_egp},${t.variance_pct}%,${(t.confidence * 100).toFixed(0)}%,${t.status}\n`;
      });
    } else if (type === "tenant_performance" && reportData.data?.tenants) {
      csv = "Tenant,Unit,Category,Overall Score,Revenue/sqm,Footfall %,Payment %,Risk %\n";
      reportData.data.tenants.forEach((t: any) => {
        csv += `"${t.brand_name}","${t.unit_number}","${t.category}",${t.overall_score},${t.revenue_per_sqm},${t.footfall_attraction}%,${t.payment_reliability}%,${t.discrepancy_risk}%\n`;
      });
    } else if (type === "rent_collection" && reportData.data?.transactions) {
      csv = "Tenant,Unit,Amount Due (EGP),Amount Paid (EGP),Status\n";
      reportData.data.transactions.forEach((t: any) => {
        csv += `"${t.lease?.tenant?.brand_name || "Unknown"}","${t.lease?.unit?.unit_number || "N/A"}",${t.amount_due},${t.amount_paid},${t.status}\n`;
      });
    } else if (type === "maintenance" && reportData.data?.tickets) {
      csv = "Title,Category,Priority,Status,Zone,Unit,Created\n";
      reportData.data.tickets.forEach((t: any) => {
        csv += `"${t.title}","${t.category}","${t.priority}","${t.status}","${t.zone?.name || "N/A"}","${t.unit?.unit_number || "N/A"}","${t.created_at}"\n`;
      });
    } else if (type === "footfall_analysis" && reportData.data?.zones) {
      csv = "Zone,Type,Total In,Total Out,Share %,Avg Dwell (s)\n";
      reportData.data.zones.forEach((z: any) => {
        csv += `"${z.zone_name}","${z.zone_type}",${z.total_in},${z.total_out},${z.share_of_total_pct}%,${z.avg_dwell_seconds}\n`;
      });
    }

    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `custis-${type}-${year}-${String(month).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [reportData, month, year]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <FileBarChart size={28} className="text-custis-gold" />
          Reports
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Generate, view, and export property reports
        </p>
      </div>

      {/* Report builder */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Report Builder
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Type */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider">
                Report Type
              </label>
              <div className="relative">
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold cursor-pointer"
                >
                  {REPORT_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </div>

            {/* Month */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider">
                Month
              </label>
              <div className="relative">
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold cursor-pointer"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </div>

            {/* Year */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider">
                Year
              </label>
              <div className="relative">
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold cursor-pointer"
                >
                  {[2024, 2025, 2026].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </div>

            <Button onClick={generateReport} disabled={loading}>
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileBarChart size={16} />
              )}
              Generate
            </Button>

            {reportData && (
              <>
                <Button variant="secondary" onClick={exportCSV}>
                  <Download size={16} />
                  Export CSV
                </Button>
                <Button variant="ghost" onClick={handlePrint}>
                  <Printer size={16} />
                  Print
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="text-center py-4 text-status-error text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-custis-gold" />
        </div>
      )}

      {/* Report output */}
      {reportData && !loading && (
        <div className="print:bg-white print:text-black">
          {/* Revenue Verification */}
          {reportData.type === "revenue_verification" && (
            <RevenueVerificationReport data={reportData.data} month={month} year={year} />
          )}

          {/* Tenant Performance */}
          {reportData.type === "tenant_performance" && (
            <TenantPerformanceReport data={reportData.data} />
          )}

          {/* Footfall Analysis */}
          {reportData.type === "footfall_analysis" && (
            <FootfallReport data={reportData.data} />
          )}

          {/* Rent Collection */}
          {reportData.type === "rent_collection" && (
            <RentCollectionReport data={reportData.data} month={month} year={year} />
          )}

          {/* Maintenance */}
          {reportData.type === "maintenance" && (
            <MaintenanceReport data={reportData.data} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components for each report type ─────────────────────

function RevenueVerificationReport({
  data,
  month,
  year,
}: {
  data: any;
  month: number;
  year: number;
}) {
  if (!data?.summary) return null;
  const s = data.summary;
  const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Revenue Verification Report — {MONTH_NAMES[month]} {year}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-text-primary">{s.total_tenants}</p>
              <p className="text-xs text-text-muted">Tenants Analysed</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-status-error">{s.total_discrepancies}</p>
              <p className="text-xs text-text-muted">Discrepancies</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-custis-gold">{formatCurrency(s.total_variance_egp)}</p>
              <p className="text-xs text-text-muted">Total Variance</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-status-success">{formatCurrency(s.potential_recovery_egp)}</p>
              <p className="text-xs text-text-muted">Recovery Potential</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-custis-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Tenant</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Reported</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Estimated</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Variance</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.tenants || []).map((t: any) => (
                  <tr key={t.tenant_id} className="border-b border-custis-border/50 hover:bg-custis-border/10">
                    <td className="px-3 py-2 text-text-primary font-medium">{t.brand_name}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.unit_number}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary">
                      {t.reported_revenue_egp !== null ? formatCurrency(t.reported_revenue_egp) : "N/A"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary">
                      {formatCurrency(t.estimated_mid_egp)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={t.variance_egp > 0 ? "text-status-error" : "text-status-success"}>
                        {t.variance_egp > 0 ? "+" : ""}
                        {formatCurrency(t.variance_egp)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={t.status === "flagged" ? "error" : t.status === "ok" ? "success" : "warning"}>
                        {t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TenantPerformanceReport({ data }: { data: any }) {
  const tenants = data?.tenants || [];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary">
          Tenant Performance Report
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-custis-border">
                <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">#</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Tenant</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Score</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Rev/sqm</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Footfall</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Payment</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Risk</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t: any, i: number) => (
                <tr key={t.tenant_id} className="border-b border-custis-border/50">
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="text-text-primary font-medium">{t.brand_name}</span>
                    <span className="block text-xs text-text-muted">{t.unit_number}</span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono font-bold">
                    <span
                      className={
                        t.overall_score >= 70
                          ? "text-emerald-500"
                          : t.overall_score >= 40
                          ? "text-amber-500"
                          : "text-red-500"
                      }
                    >
                      {t.overall_score.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(t.revenue_per_sqm)}</td>
                  <td className="px-3 py-2 text-right font-mono">{t.footfall_attraction.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right font-mono">{t.payment_reliability.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right">
                    <Badge variant={t.discrepancy_risk >= 50 ? "error" : t.discrepancy_risk >= 20 ? "warning" : "success"}>
                      {t.discrepancy_risk}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function FootfallReport({ data }: { data: any }) {
  const overview = data?.overview;
  const zones = data?.zones || [];
  const peaks = data?.peaks;

  return (
    <div className="space-y-4">
      {overview && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Footfall Overview</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{overview.total_visitors_today.toLocaleString()}</p>
                <p className="text-xs text-text-muted">Today</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{overview.avg_daily_visitors.toLocaleString()}</p>
                <p className="text-xs text-text-muted">Daily Avg (30d)</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{overview.total_visitors_this_month.toLocaleString()}</p>
                <p className="text-xs text-text-muted">Month Total</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold font-mono ${overview.change_vs_last_week_pct >= 0 ? "text-status-success" : "text-status-error"}`}>
                  {overview.change_vs_last_week_pct > 0 ? "+" : ""}{overview.change_vs_last_week_pct}%
                </p>
                <p className="text-xs text-text-muted">vs Last Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {zones.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Footfall by Zone</h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-custis-border">
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Zone</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Type</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Visitors</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Share</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Avg Dwell</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z: any) => (
                    <tr key={z.zone_id} className="border-b border-custis-border/50">
                      <td className="px-3 py-2 text-text-primary font-medium">{z.zone_name}</td>
                      <td className="px-3 py-2 text-text-secondary capitalize">{z.zone_type}</td>
                      <td className="px-3 py-2 text-right font-mono">{z.total_in.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{z.share_of_total_pct}%</td>
                      <td className="px-3 py-2 text-right font-mono">{z.avg_dwell_seconds}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {peaks && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Peak Patterns (30 days)</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-text-muted">Busiest Day</p>
                <p className="text-text-primary font-medium">{peaks.busiest_day} ({peaks.busiest_day_avg.toLocaleString()} avg)</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Quietest Day</p>
                <p className="text-text-primary font-medium">{peaks.quietest_day} ({peaks.quietest_day_avg.toLocaleString()} avg)</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Weekend vs Weekday</p>
                <p className="text-text-primary font-medium">{peaks.weekend_vs_weekday_ratio}x</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Peak Hour</p>
                <p className="text-text-primary font-medium">{peaks.peak_hour}:00 ({peaks.peak_hour_avg.toLocaleString()} avg)</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Weekend Avg</p>
                <p className="text-text-primary font-medium">{peaks.weekend_avg.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Weekday Avg</p>
                <p className="text-text-primary font-medium">{peaks.weekday_avg.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RentCollectionReport({
  data,
  month,
  year,
}: {
  data: any;
  month: number;
  year: number;
}) {
  const s = data?.summary;
  const transactions = data?.transactions || [];
  const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const statusBadgeVariant: Record<string, "success" | "warning" | "error" | "default"> = {
    paid: "success",
    partial: "warning",
    overdue: "error",
    waived: "default",
  };

  return (
    <div className="space-y-4">
      {s && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Rent Collection — {MONTH_NAMES[month]} {year}
            </h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{formatCurrency(s.total_due)}</p>
                <p className="text-xs text-text-muted">Total Due</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-success">{formatCurrency(s.total_paid)}</p>
                <p className="text-xs text-text-muted">Collected</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-custis-gold">{s.collection_rate.toFixed(1)}%</p>
                <p className="text-xs text-text-muted">Collection Rate</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-error">{s.overdue}</p>
                <p className="text-xs text-text-muted">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-custis-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Tenant</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Due</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Paid</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: any) => (
                  <tr key={t.id} className="border-b border-custis-border/50">
                    <td className="px-3 py-2 text-text-primary font-medium">{t.lease?.tenant?.brand_name || "Unknown"}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.lease?.unit?.unit_number || "N/A"}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(t.amount_due)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(t.amount_paid)}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={statusBadgeVariant[t.status] || "default"}>{t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MaintenanceReport({ data }: { data: any }) {
  const s = data?.summary;
  const tickets = data?.tickets || [];

  return (
    <div className="space-y-4">
      {s && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Maintenance Report</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{s.total}</p>
                <p className="text-xs text-text-muted">Total Tickets</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-warning">{s.open}</p>
                <p className="text-xs text-text-muted">Open</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-success">{s.completed}</p>
                <p className="text-xs text-text-muted">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{s.avg_resolution_days}d</p>
                <p className="text-xs text-text-muted">Avg Resolution</p>
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              {Object.entries(s.by_priority || {}).map(([key, val]) => (
                <span key={key} className="text-text-muted">
                  {key}: <span className="text-text-primary font-mono">{val as number}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-custis-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Title</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Category</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Priority</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Location</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => (
                  <tr key={t.id} className="border-b border-custis-border/50">
                    <td className="px-3 py-2 text-text-primary font-medium">{t.title}</td>
                    <td className="px-3 py-2 text-text-secondary capitalize">{t.category}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={t.priority === "emergency" || t.priority === "urgent" ? "error" : t.priority === "high" ? "warning" : "default"}>
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={t.status === "completed" ? "success" : t.status === "open" ? "warning" : "default"}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs">
                      {t.zone?.name || ""} {t.unit?.unit_number ? `/ ${t.unit.unit_number}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
