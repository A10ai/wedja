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
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const REPORT_TYPES = [
  { value: "revenue_verification", label: "Revenue Verification" },
  { value: "tenant_performance", label: "Tenant Performance" },
  { value: "footfall_analysis", label: "Footfall Analysis" },
  { value: "rent_collection", label: "Rent Collection" },
  { value: "maintenance", label: "Maintenance" },
  { value: "energy", label: "Energy Report" },
  { value: "marketing", label: "Marketing Report" },
  { value: "anomaly", label: "Anomaly Report" },
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
    } else if (type === "energy" && reportData.data?.zones) {
      csv = "Zone,Type,Consumption (kWh),Cost (EGP),Share %,kWh/sqm\n";
      reportData.data.zones.forEach((z: any) => {
        csv += `"${z.zone_name}","${z.zone_type}",${z.consumption_kwh},${z.cost_egp},${z.share_pct}%,${z.kwh_per_sqm}\n`;
      });
    } else if (type === "marketing" && reportData.data?.events) {
      csv = "Event,Type,Start,End,Status,Budget (EGP)\n";
      reportData.data.events.forEach((e: any) => {
        csv += `"${e.name}","${e.type}","${e.start_date}","${e.end_date}","${e.status}",${e.budget_egp || 0}\n`;
      });
    } else if (type === "anomaly" && reportData.data?.anomalies) {
      csv = "Title,Type,Severity,Zone,Status,Created\n";
      reportData.data.anomalies.forEach((a: any) => {
        csv += `"${a.title}","${a.type}","${a.severity}","${a.zone_name || "N/A"}","${a.status}","${a.created_at}"\n`;
      });
    }

    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wedja-${type}-${year}-${String(month).padStart(2, "0")}.csv`;
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
          <FileBarChart size={28} className="text-wedja-accent" />
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
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent cursor-pointer"
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
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent cursor-pointer"
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
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent cursor-pointer"
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
          <Loader2 size={24} className="animate-spin text-wedja-accent" />
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

          {/* Energy Report */}
          {reportData.type === "energy" && (
            <EnergyReport data={reportData.data} />
          )}

          {/* Marketing Report */}
          {reportData.type === "marketing" && (
            <MarketingReport data={reportData.data} />
          )}

          {/* Anomaly Report */}
          {reportData.type === "anomaly" && (
            <AnomalyReport data={reportData.data} />
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
              <p className="text-lg font-bold font-mono text-wedja-accent">{formatCurrency(s.total_variance_egp)}</p>
              <p className="text-xs text-text-muted">Total Variance</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-status-success">{formatCurrency(s.potential_recovery_egp)}</p>
              <p className="text-xs text-text-muted">Recovery Potential</p>
            </div>
          </div>

          {/* Revenue Comparison Chart */}
          {(data.tenants || []).length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Reported vs Estimated Revenue</h3>
              <ResponsiveContainer width="100%" height={Math.max(220, (data.tenants || []).length * 36)}>
                <BarChart
                  data={(data.tenants || []).map((t: any) => ({
                    name: t.brand_name?.length > 14 ? t.brand_name.slice(0, 14) + "..." : t.brand_name,
                    Reported: t.reported_revenue_egp || 0,
                    Estimated: t.estimated_mid_egp || 0,
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#F9FAFB" }}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: any, name: any) => [formatCurrency(value), name]}
                  />
                  <Bar dataKey="Reported" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="Estimated" fill="#818CF8" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border">
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
                  <tr key={t.tenant_id} className="border-b border-wedja-border/50 hover:bg-wedja-border/10">
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
  const SCORE_COLORS = ["#EF4444", "#F59E0B", "#10B981"];
  const getScoreColor = (s: number) => s >= 70 ? SCORE_COLORS[2] : s >= 40 ? SCORE_COLORS[1] : SCORE_COLORS[0];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text-primary">
          Tenant Performance Report
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        {/* Performance Score Chart */}
        {tenants.length > 0 && (
          <div className="px-4 pb-4">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Overall Performance Scores</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, tenants.length * 32)}>
              <BarChart
                data={tenants.map((t: any) => ({
                  name: t.brand_name?.length > 14 ? t.brand_name.slice(0, 14) + "..." : t.brand_name,
                  score: t.overall_score,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#F9FAFB" }}
                  labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                  formatter={(value: any) => [value.toFixed(0), "Score"]}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={16}>
                  {tenants.map((t: any, i: number) => (
                    <Cell key={i} fill={getScoreColor(t.overall_score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wedja-border">
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
                <tr key={t.tenant_id} className="border-b border-wedja-border/50">
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
            {/* Zone Footfall Bar Chart */}
            <div className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={zones.map((z: any) => ({
                    name: z.zone_name?.length > 12 ? z.zone_name.slice(0, 12) + "..." : z.zone_name,
                    visitors: z.total_in,
                    dwell: z.avg_dwell_seconds,
                  }))}
                  margin={{ top: 4, right: 12, bottom: 0, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#F9FAFB" }}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: any, name: any) => [value.toLocaleString(), name === "visitors" ? "Visitors" : "Avg Dwell (s)"]}
                  />
                  <Bar dataKey="visitors" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Zone</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Type</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Visitors</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Share</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Avg Dwell</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z: any) => (
                    <tr key={z.zone_id} className="border-b border-wedja-border/50">
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
                <p className="text-lg font-bold font-mono text-wedja-accent">{s.collection_rate.toFixed(1)}%</p>
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

      {/* Rent Collection Chart */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-text-primary">Due vs Collected</h3></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, transactions.length * 36)}>
              <BarChart
                data={transactions.map((t: any) => ({
                  name: (t.lease?.tenant?.brand_name || "Unknown").slice(0, 14),
                  Due: t.amount_due || 0,
                  Paid: t.amount_paid || 0,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: any) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#F9FAFB" }}
                  labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                  formatter={(value: any, name: any) => [formatCurrency(value), name]}
                />
                <Bar dataKey="Due" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="Paid" fill="#10B981" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Tenant</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Due</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Paid</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: any) => (
                  <tr key={t.id} className="border-b border-wedja-border/50">
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
            <div className="flex gap-3 text-xs mb-4">
              {Object.entries(s.by_priority || {}).map(([key, val]) => (
                <span key={key} className="text-text-muted">
                  {key}: <span className="text-text-primary font-mono">{val as number}</span>
                </span>
              ))}
            </div>

            {/* Tickets by Category Chart */}
            {s.by_category && Object.keys(s.by_category).length > 0 && (
              <div className="mt-2">
                <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">By Category</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={Object.entries(s.by_category).map(([cat, count]) => ({ category: cat, tickets: count }))}
                    margin={{ top: 4, right: 12, bottom: 0, left: -10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="category" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#F9FAFB" }}
                      labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                      formatter={(value: any) => [value, "Tickets"]}
                    />
                    <Bar dataKey="tickets" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Title</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Category</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Priority</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Location</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => (
                  <tr key={t.id} className="border-b border-wedja-border/50">
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

function EnergyReport({ data }: { data: any }) {
  const zones = data?.zones || [];
  const overview = data?.overview;

  return (
    <div className="space-y-4">
      {overview && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Energy Overview</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">
                  {(overview.total_this_month_kwh || 0).toLocaleString()} kWh
                </p>
                <p className="text-xs text-text-muted">Monthly Consumption</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-wedja-accent">
                  {formatCurrency(overview.cost_this_month_egp || 0)}
                </p>
                <p className="text-xs text-text-muted">Monthly Cost</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">
                  {(overview.avg_daily_kwh || 0).toLocaleString()} kWh
                </p>
                <p className="text-xs text-text-muted">Daily Average</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">
                  {formatCurrency(overview.avg_daily_cost_egp || 0)}
                </p>
                <p className="text-xs text-text-muted">Avg Daily Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {zones.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Energy by Zone</h2>
          </CardHeader>
          <CardContent className="p-0">
            {/* Energy Consumption Chart */}
            <div className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={zones.map((z: any) => ({
                    name: z.zone_name?.length > 12 ? z.zone_name.slice(0, 12) + "..." : z.zone_name,
                    kWh: z.consumption_kwh || 0,
                    cost: z.cost_egp || 0,
                  }))}
                  margin={{ top: 4, right: 12, bottom: 0, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#F9FAFB" }}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: any, name: any) => [name === "kWh" ? `${value.toLocaleString()} kWh` : formatCurrency(value), name === "kWh" ? "Consumption" : "Cost (EGP)"]}
                  />
                  <Bar dataKey="kWh" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Zone</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Type</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Consumption (kWh)</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Cost (EGP)</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Share %</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">kWh/sqm</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z: any) => (
                    <tr key={z.zone_id} className="border-b border-wedja-border/50">
                      <td className="px-3 py-2 text-text-primary font-medium">{z.zone_name}</td>
                      <td className="px-3 py-2 text-text-secondary capitalize">{z.zone_type}</td>
                      <td className="px-3 py-2 text-right font-mono">{(z.consumption_kwh || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(z.cost_egp || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{z.share_pct}%</td>
                      <td className="px-3 py-2 text-right font-mono">{z.kwh_per_sqm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {zones.length === 0 && !overview && (
        <Card>
          <CardContent className="py-8 text-center text-text-muted text-sm">
            No energy data available for this period
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MarketingReport({ data }: { data: any }) {
  const overview = data?.overview;
  const events = data?.events || [];
  const campaigns = data?.campaigns || [];

  return (
    <div className="space-y-4">
      {overview && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Marketing Overview</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{overview.total_events || 0}</p>
                <p className="text-xs text-text-muted">Total Events</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{overview.active_campaigns || 0}</p>
                <p className="text-xs text-text-muted">Active Campaigns</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-wedja-accent">
                  {formatCurrency(overview.total_budget_egp || 0)}
                </p>
                <p className="text-xs text-text-muted">Total Budget</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-success">
                  {overview.avg_roi ? `${overview.avg_roi.toFixed(1)}x` : "N/A"}
                </p>
                <p className="text-xs text-text-muted">Avg ROI</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Events & Campaigns</h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Name</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Type</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Dates</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-muted">Budget</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e: any, i: number) => (
                    <tr key={e.id || i} className="border-b border-wedja-border/50">
                      <td className="px-3 py-2 text-text-primary font-medium">{e.name || e.title}</td>
                      <td className="px-3 py-2 text-text-secondary capitalize">{e.type || e.category}</td>
                      <td className="px-3 py-2 text-text-secondary text-xs">
                        {e.start_date} - {e.end_date}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(e.budget_egp || 0)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={e.status === "active" ? "success" : e.status === "completed" ? "default" : "warning"}>
                          {e.status}
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

      {events.length === 0 && !overview && (
        <Card>
          <CardContent className="py-8 text-center text-text-muted text-sm">
            No marketing data available for this period
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnomalyReport({ data }: { data: any }) {
  const stats = data?.stats;
  const anomalies = data?.anomalies || [];

  return (
    <div className="space-y-4">
      {stats && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">Anomaly Summary</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-text-primary">{stats.total || anomalies.length}</p>
                <p className="text-xs text-text-muted">Total Anomalies</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-error">{stats.critical || 0}</p>
                <p className="text-xs text-text-muted">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-warning">{stats.warning || stats.medium || 0}</p>
                <p className="text-xs text-text-muted">Warning</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-status-success">{stats.resolved || 0}</p>
                <p className="text-xs text-text-muted">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {anomalies.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">All Anomalies</h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Title</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Type</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Severity</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Zone</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((a: any) => (
                    <tr key={a.id} className="border-b border-wedja-border/50">
                      <td className="px-3 py-2 text-text-primary font-medium">{a.title}</td>
                      <td className="px-3 py-2 text-text-secondary capitalize">{a.type}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={a.severity === "critical" ? "error" : a.severity === "warning" || a.severity === "high" ? "warning" : "info"}>
                          {a.severity}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-text-secondary text-xs">{a.zone_name || "-"}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={a.status === "resolved" ? "success" : a.status === "active" ? "warning" : "default"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-text-secondary text-xs">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {anomalies.length === 0 && !stats && (
        <Card>
          <CardContent className="py-8 text-center text-text-muted text-sm">
            No anomaly data available for this period
          </CardContent>
        </Card>
      )}
    </div>
  );
}
