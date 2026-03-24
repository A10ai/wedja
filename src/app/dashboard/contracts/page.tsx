"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ScrollText,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  BarChart3,
  Bell,
  Target,
  Users,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercentage,
} from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import type {
  ContractOverview,
  ExpiringLease,
  LeasePerformanceItem,
  EscalationItem,
  RentVsSalesItem,
  ContractAlert,
  PortfolioAnalytics,
} from "@/lib/contract-engine";

// ── Constants ───────────────────────────────────────────────

type TabKey =
  | "overview"
  | "expiring"
  | "rent_vs_sales"
  | "portfolio"
  | "performance"
  | "escalations"
  | "alerts";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "overview", label: "Overview", icon: ScrollText },
  { key: "expiring", label: "Expiring", icon: Clock },
  { key: "rent_vs_sales", label: "Rent vs Sales", icon: Target },
  { key: "portfolio", label: "Portfolio", icon: BarChart3 },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "escalations", label: "Escalations", icon: ArrowUpRight },
  { key: "alerts", label: "Alerts", icon: Bell },
];

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; badge: "error" | "warning" | "info" | "gold" }> = {
  critical: { border: "border-red-500/40", bg: "bg-red-500/5", text: "text-red-500", badge: "error" },
  warning: { border: "border-amber-500/40", bg: "bg-amber-500/5", text: "text-amber-500", badge: "warning" },
  info: { border: "border-blue-500/40", bg: "bg-blue-500/5", text: "text-blue-500", badge: "info" },
  opportunity: { border: "border-wedja-accent/40", bg: "bg-wedja-accent/5", text: "text-wedja-accent", badge: "gold" },
};

const PERFORMANCE_BADGE: Record<string, "success" | "warning" | "error"> = {
  good: "success",
  watch: "warning",
  underperforming: "error",
};

type SortField = "revenue_per_sqm" | "payment_compliance" | "performance_score" | "expiry_date" | "min_rent" | "brand_name";

// ── Main Page ───────────────────────────────────────────────

export default function ContractsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);

  // Data states
  const [overview, setOverview] = useState<ContractOverview | null>(null);
  const [expiring, setExpiring] = useState<ExpiringLease[]>([]);
  const [performance, setPerformance] = useState<LeasePerformanceItem[]>([]);
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [rentVsSales, setRentVsSales] = useState<RentVsSalesItem[]>([]);
  const [alerts, setAlerts] = useState<ContractAlert[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioAnalytics | null>(null);

  // Sort state for performance table
  const [sortField, setSortField] = useState<SortField>("revenue_per_sqm");
  const [sortAsc, setSortAsc] = useState(false);

  // Fetch helper
  const fetchData = useCallback(async (type: string) => {
    try {
      const res = await fetch(`/api/v1/contracts?type=${type}`);
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  // Load overview + alerts on mount
  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      const [overviewData, alertsData, expiringData, portfolioData] = await Promise.all([
        fetchData("overview"),
        fetchData("alerts"),
        fetchData("expiring"),
        fetchData("portfolio"),
      ]);
      setOverview(overviewData);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setExpiring(Array.isArray(expiringData) ? expiringData : []);
      setPortfolio(portfolioData);
      setLoading(false);
    }
    loadInitial();
  }, [fetchData]);

  // Load tab-specific data
  useEffect(() => {
    async function loadTab() {
      if (activeTab === "performance" && performance.length === 0) {
        setLoading(true);
        const data = await fetchData("performance");
        setPerformance(Array.isArray(data) ? data : []);
        setLoading(false);
      }
      if (activeTab === "escalations" && escalations.length === 0) {
        setLoading(true);
        const data = await fetchData("escalations");
        setEscalations(Array.isArray(data) ? data : []);
        setLoading(false);
      }
      if (activeTab === "rent_vs_sales" && rentVsSales.length === 0) {
        setLoading(true);
        const data = await fetchData("rent_vs_sales");
        setRentVsSales(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    }
    loadTab();
  }, [activeTab, fetchData, performance.length, escalations.length, rentVsSales.length]);

  // Sorted performance data
  const sortedPerformance = useMemo(() => {
    const items = [...performance];
    items.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "revenue_per_sqm": valA = a.revenue_per_sqm; valB = b.revenue_per_sqm; break;
        case "payment_compliance": valA = a.payment_compliance; valB = b.payment_compliance; break;
        case "performance_score":
          const scoreOrder: Record<string, number> = { good: 3, watch: 2, underperforming: 1 };
          valA = scoreOrder[a.performance_score]; valB = scoreOrder[b.performance_score]; break;
        case "expiry_date": valA = new Date(a.expiry_date).getTime(); valB = new Date(b.expiry_date).getTime(); break;
        case "min_rent": valA = a.min_rent; valB = b.min_rent; break;
        case "brand_name": valA = a.brand_name; valB = b.brand_name; break;
        default: valA = 0; valB = 0;
      }
      if (typeof valA === "string") return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortAsc ? valA - valB : valB - valA;
    });
    return items;
  }, [performance, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    sortField === field ? (
      sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
    ) : null
  );

  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const expiringCount90 = expiring.filter((l) => l.days_until_expiry <= 90).length;

  // ── Chart Data ──────────────────────────────────────────────

  const STATUS_COLORS: Record<string, string> = {
    Active: "#10B981",
    Expired: "#EF4444",
    Pending: "#F59E0B",
    Terminated: "#6B7280",
  };

  const statusPieData = useMemo(() => {
    if (!overview) return [];
    const terminated =
      overview.total_leases -
      overview.active_leases -
      overview.expired_leases -
      overview.pending_leases;
    return [
      { name: "Active", value: overview.active_leases },
      { name: "Expired", value: overview.expired_leases },
      { name: "Pending", value: overview.pending_leases },
      { name: "Terminated", value: Math.max(terminated, 0) },
    ].filter((d) => d.value > 0);
  }, [overview]);

  const expiryTimelineData = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      const label = monthDate.toLocaleString("default", {
        month: "short",
        year: "2-digit",
      });
      const count = expiring.filter((l) => {
        const d = new Date(l.expiry_date);
        return d >= monthDate && d <= monthEnd;
      }).length;
      months.push({ label, count });
    }
    return months;
  }, [expiring]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <ScrollText size={28} className="text-wedja-accent" />
          Contract Analytics
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Portfolio intelligence, lease performance, and revenue gap analysis
        </p>
      </div>

      {/* Urgent Banner */}
      {!loading && (expiringCount90 > 0 || criticalAlerts > 0) && (
        <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-500">
                Action Required
              </p>
              <p className="text-sm text-text-secondary mt-0.5">
                {expiringCount90 > 0 && `${expiringCount90} lease${expiringCount90 > 1 ? "s" : ""} expiring within 90 days`}
                {expiringCount90 > 0 && criticalAlerts > 0 && " | "}
                {criticalAlerts > 0 && `${criticalAlerts} critical alert${criticalAlerts > 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setActiveTab("alerts")}
          >
            <Bell size={14} />
            View Alerts
          </Button>
        </div>
      )}

      {/* A. Overview Stats */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-wedja-accent font-mono">
                {overview.active_leases}
              </p>
              <p className="text-xs text-text-muted mt-0.5">Active Leases</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-text-primary font-mono">
                {formatCurrency(overview.total_monthly_min_rent_egp)}
              </p>
              <p className="text-xs text-text-muted mt-0.5">Monthly Rent Roll</p>
            </CardContent>
          </Card>
          <Card className="border-wedja-accent/30">
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-wedja-accent font-mono">
                {portfolio ? `${portfolio.wale_years}y` : "--"}
              </p>
              <p className="text-xs text-text-muted mt-0.5">WALE</p>
              <p className="text-[10px] text-text-muted">Weighted Avg Lease Expiry</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-status-success font-mono">
                {formatPercentage(overview.occupancy_rate)}
              </p>
              <p className="text-xs text-text-muted mt-0.5">Occupancy Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className={`text-2xl font-bold font-mono ${expiring.length > 0 ? "text-status-warning" : "text-status-success"}`}>
                {expiring.length}
              </p>
              <p className="text-xs text-text-muted mt-0.5">Expiring Soon</p>
              <p className="text-[10px] text-text-muted">within 180 days</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-wedja-accent-muted text-wedja-accent"
                  : "text-text-secondary hover:text-text-primary hover:bg-wedja-border/30"
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {tab.key === "alerts" && criticalAlerts > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full font-bold">
                  {criticalAlerts}
                </span>
              )}
              {tab.key === "expiring" && expiringCount90 > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-bold">
                  {expiringCount90}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-wedja-accent" />
        </div>
      )}

      {/* Tab Content */}
      {!loading && (
        <>
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && overview && portfolio && (
            <div className="space-y-6">
              {/* Additional Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-text-primary font-mono">
                      {formatCurrency(overview.avg_rent_per_sqm)}
                    </p>
                    <p className="text-xs text-text-muted">Avg Rent/sqm</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-text-primary font-mono">
                      {overview.avg_lease_duration_years}y
                    </p>
                    <p className="text-xs text-text-muted">Avg Lease Duration</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-text-primary font-mono">
                      {formatNumber(overview.total_leased_area_sqm)} sqm
                    </p>
                    <p className="text-xs text-text-muted">Total Leased Area</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-status-warning font-mono">
                      {formatCurrency(portfolio.vacancy_cost_monthly)}
                    </p>
                    <p className="text-xs text-text-muted">Vacancy Cost /mo</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Donut */}
                {statusPieData.length > 0 && (
                  <Card>
                    <CardHeader>
                      <h2 className="text-sm font-semibold text-text-primary">
                        Contracts by Status
                      </h2>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={statusPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                            stroke="none"
                          >
                            {statusPieData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={STATUS_COLORS[entry.name] || "#6B7280"}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#111827",
                              border: "1px solid #1F2937",
                              borderRadius: "0.75rem",
                              color: "#F9FAFB",
                              fontSize: "0.75rem",
                            }}
                            formatter={(value: any, name: any) => [
                              `${value} leases`,
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex items-center justify-center gap-4 mt-2">
                        {statusPieData.map((entry) => (
                          <span
                            key={entry.name}
                            className="flex items-center gap-1.5 text-xs text-text-secondary"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{
                                backgroundColor:
                                  STATUS_COLORS[entry.name] || "#6B7280",
                              }}
                            />
                            {entry.name} ({entry.value})
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Lease Expiry Timeline */}
                <Card>
                  <CardHeader>
                    <h2 className="text-sm font-semibold text-text-primary">
                      Lease Expiry Timeline — Next 6 Months
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={expiryTimelineData}
                        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1F2937"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#9CA3AF", fontSize: 12 }}
                          axisLine={{ stroke: "#1F2937" }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#9CA3AF", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#111827",
                            border: "1px solid #1F2937",
                            borderRadius: "0.75rem",
                            color: "#F9FAFB",
                            fontSize: "0.75rem",
                          }}
                          formatter={(value: any) => [
                            `${value} lease${value !== 1 ? "s" : ""}`,
                            "Expiring",
                          ]}
                          cursor={{ fill: "rgba(245,158,11,0.08)" }}
                        />
                        <Bar
                          dataKey="count"
                          fill="#F59E0B"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={48}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Min Rent vs % Potential */}
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-text-primary">
                    Revenue Structure
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs text-text-muted mb-1">Minimum Rent (Contracted)</p>
                      <p className="text-2xl font-bold text-text-primary font-mono">
                        {formatCurrency(overview.total_monthly_min_rent_egp)}
                      </p>
                      <p className="text-xs text-text-muted">per month guaranteed</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Percentage Rent Potential</p>
                      <p className="text-2xl font-bold text-wedja-accent font-mono">
                        {formatCurrency(overview.total_monthly_percentage_potential_egp)}
                      </p>
                      <p className="text-xs text-text-muted">based on reported sales</p>
                      {overview.total_monthly_percentage_potential_egp > overview.total_monthly_min_rent_egp && (
                        <p className="text-xs text-status-success mt-1">
                          +{formatCurrency(overview.total_monthly_percentage_potential_egp - overview.total_monthly_min_rent_egp)} above minimum
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Rent Roll Chart (mini) */}
              <RentRollChart rentRoll={portfolio.rent_roll} />

              {/* Alerts Summary */}
              {alerts.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-wedja-accent" />
                      <h2 className="text-sm font-semibold text-text-primary">
                        Latest Alerts
                      </h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab("alerts")}>
                      View All
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {alerts.slice(0, 3).map((alert) => {
                      const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                      return (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${style.border} ${style.bg}`}
                        >
                          <AlertTriangle size={16} className={`${style.text} mt-0.5 shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${style.text}`}>{alert.title}</p>
                            <p className="text-xs text-text-secondary mt-0.5">{alert.message}</p>
                          </div>
                          <Badge variant={style.badge}>{alert.severity}</Badge>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* EXPIRING LEASES TAB */}
          {activeTab === "expiring" && (
            <ExpiringLeasesSection expiring={expiring} />
          )}

          {/* RENT VS SALES TAB */}
          {activeTab === "rent_vs_sales" && (
            <RentVsSalesSection data={rentVsSales} />
          )}

          {/* PORTFOLIO TAB */}
          {activeTab === "portfolio" && portfolio && (
            <PortfolioSection portfolio={portfolio} />
          )}

          {/* PERFORMANCE TAB */}
          {activeTab === "performance" && (
            <PerformanceSection
              data={sortedPerformance}
              sortField={sortField}
              sortAsc={sortAsc}
              onSort={handleSort}
              SortIcon={SortIcon}
            />
          )}

          {/* ESCALATIONS TAB */}
          {activeTab === "escalations" && (
            <EscalationsSection data={escalations} />
          )}

          {/* ALERTS TAB */}
          {activeTab === "alerts" && (
            <AlertsSection alerts={alerts} />
          )}
        </>
      )}
    </div>
  );
}

// ── Section Components ──────────────────────────────────────

function RentRollChart({ rentRoll }: { rentRoll: PortfolioAnalytics["rent_roll"] }) {
  const maxRent = Math.max(...rentRoll.map((m) => m.contracted_rent), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-wedja-accent" />
          <h2 className="text-sm font-semibold text-text-primary">
            Rent Roll — 24 Month Forecast
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-wedja-accent" />
            Contracted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500/60" />
            Expiring
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[2px] h-48 overflow-x-auto">
          {rentRoll.map((month, i) => {
            const barHeight = (month.contracted_rent / maxRent) * 100;
            const expiringHeight = month.expiring_rent > 0
              ? (month.expiring_rent / maxRent) * 100
              : 0;
            const showLabel = i % 3 === 0;

            return (
              <div
                key={`${month.month}-${month.year}`}
                className="flex-1 min-w-[20px] flex flex-col items-center gap-0.5 group relative"
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-wedja-card border border-wedja-border rounded-lg p-2 shadow-lg whitespace-nowrap text-xs">
                  <p className="font-medium text-text-primary">{month.month} {month.year}</p>
                  <p className="text-text-secondary">Rent: {formatCurrency(month.contracted_rent)}</p>
                  <p className="text-text-secondary">Leases: {month.active_leases}</p>
                  {month.expiring_rent > 0 && (
                    <p className="text-red-500">Expiring: {formatCurrency(month.expiring_rent)}</p>
                  )}
                </div>

                <div className="w-full h-36 flex flex-col justify-end relative">
                  <div
                    className="w-full bg-wedja-accent/80 rounded-t transition-all duration-300"
                    style={{ height: `${barHeight}%`, minHeight: "2px" }}
                  />
                  {expiringHeight > 0 && (
                    <div
                      className="w-full bg-red-500/60 absolute bottom-0 left-0 rounded-t"
                      style={{ height: `${expiringHeight}%` }}
                    />
                  )}
                </div>
                {showLabel && (
                  <span className="text-[9px] text-text-muted whitespace-nowrap">
                    {month.month} {String(month.year).slice(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ExpiringLeasesSection({ expiring }: { expiring: ExpiringLease[] }) {
  const urgent = expiring.filter((l) => l.days_until_expiry <= 90);
  const approaching = expiring.filter((l) => l.days_until_expiry > 90 && l.days_until_expiry <= 180);

  function getExpiryColor(days: number) {
    if (days <= 90) return "text-red-500";
    if (days <= 180) return "text-amber-500";
    return "text-emerald-500";
  }

  function getExpiryBg(days: number) {
    if (days <= 90) return "bg-red-500/5";
    if (days <= 180) return "bg-amber-500/5";
    return "";
  }

  const recTypeBadge: Record<string, "error" | "success" | "warning"> = {
    renew: "success",
    do_not_renew: "error",
    negotiate: "warning",
  };

  return (
    <div className="space-y-6">
      {/* Urgent Banner */}
      {urgent.length > 0 && (
        <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="font-semibold text-red-500">
              {urgent.length} lease{urgent.length > 1 ? "s" : ""} expiring within 90 days
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {urgent.map((l) => (
              <span key={l.lease_id} className="text-xs px-2 py-1 bg-red-500/10 text-red-500 rounded-lg font-medium">
                {l.brand_name} — {l.days_until_expiry}d
              </span>
            ))}
          </div>
        </div>
      )}

      {approaching.length > 0 && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            <p className="font-semibold text-amber-500">
              {approaching.length} lease{approaching.length > 1 ? "s" : ""} expiring in 90-180 days
            </p>
          </div>
        </div>
      )}

      {/* Expiring Table */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Expiring Leases ({expiring.length})
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border bg-wedja-bg/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tenant</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Unit</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Area</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Rent</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">% Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Expiry</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Days Left</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden xl:table-cell">AI Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((l, i) => (
                  <tr
                    key={l.lease_id}
                    className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${getExpiryBg(l.days_until_expiry)} ${i % 2 === 1 && l.days_until_expiry > 90 ? "bg-wedja-border/[0.06]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{l.brand_name}</p>
                      <p className="text-[11px] text-text-muted capitalize">{l.category}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-text-secondary text-xs">
                      {l.unit_number}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-mono text-text-secondary text-xs">
                      {l.area_sqm} sqm
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {formatCurrency(l.current_rent)}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell font-mono text-text-secondary">
                      {l.percentage_rate}%
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-text-secondary text-xs">
                      {formatDate(l.expiry_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-mono font-bold ${getExpiryColor(l.days_until_expiry)}`}>
                        {l.days_until_expiry}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex items-center gap-2">
                        <Badge variant={recTypeBadge[l.recommendation_type]}>
                          {l.recommendation_type === "renew" ? "Renew" : l.recommendation_type === "negotiate" ? "Negotiate" : "Do Not Renew"}
                        </Badge>
                        <span className="text-xs text-text-secondary truncate max-w-[200px]" title={l.ai_recommendation}>
                          {l.ai_recommendation}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {expiring.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-text-muted">
                      No leases expiring within 180 days
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RentVsSalesSection({ data }: { data: RentVsSalesItem[] }) {
  const flagged = data.filter((d) => d.underreporting_flag);
  const payingMinOnly = data.filter((d) => d.paying_type === "min_rent" && d.avg_reported_sales > 0);
  const totalGap = data.reduce((sum, d) => sum + d.gap_egp, 0);
  const totalEstimatedGap = data.reduce((sum, d) => sum + (d.estimated_gap || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-red-500/30">
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-red-500 font-mono">{flagged.length}</p>
            <p className="text-xs text-text-muted mt-1">Underreporting Flags</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-amber-500 font-mono">{payingMinOnly.length}</p>
            <p className="text-xs text-text-muted mt-1">Paying Min Rent Only</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-wedja-accent font-mono">{formatCurrency(totalGap)}</p>
            <p className="text-xs text-text-muted mt-1">Reported Rent Gap</p>
          </CardContent>
        </Card>
        <Card className="border-wedja-accent/30">
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-wedja-accent font-mono">{formatCurrency(totalEstimatedGap)}</p>
            <p className="text-xs text-text-muted mt-1">Estimated True Gap</p>
            <p className="text-[10px] text-text-muted">from revenue verification</p>
          </CardContent>
        </Card>
      </div>

      {/* The Key Insight */}
      {flagged.length > 0 && (
        <div className="rounded-xl border-2 border-wedja-accent/40 bg-wedja-accent/5 p-4">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-wedja-accent mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-wedja-accent">Revenue Gap Detected</p>
              <p className="text-sm text-text-secondary mt-1">
                {flagged.length} tenant{flagged.length > 1 ? "s are" : " is"} paying minimum rent only, but revenue verification estimates
                suggest their sales are high enough to trigger percentage rent. The estimated gap
                of <span className="font-bold text-wedja-accent">{formatCurrency(totalEstimatedGap)}/month</span> represents
                potential uncollected revenue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Rent vs Sales Analysis
            </h2>
          </div>
          <p className="text-xs text-text-muted">{data.length} active leases</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border bg-wedja-bg/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tenant</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Min Rent</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Reported Sales</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">% Rent</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Paying</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Gap</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden xl:table-cell">Verification</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Flag</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr
                    key={item.tenant_id}
                    className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${
                      item.underreporting_flag
                        ? "bg-red-500/[0.03]"
                        : item.gap_egp > 0
                          ? "bg-amber-500/[0.02]"
                          : i % 2 === 1
                            ? "bg-wedja-border/[0.06]"
                            : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className={`font-medium ${item.underreporting_flag ? "text-red-500" : "text-text-primary"}`}>
                        {item.brand_name}
                      </p>
                      <p className="text-[11px] text-text-muted font-mono">{item.unit_number}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-secondary">
                      {formatCurrency(item.min_rent)}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-mono text-text-secondary">
                      {item.avg_reported_sales > 0 ? formatCurrency(item.avg_reported_sales) : <span className="text-text-muted italic">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell font-mono text-text-secondary">
                      {item.percentage_rent > 0 ? formatCurrency(item.percentage_rent) : "--"}
                      <span className="text-[10px] text-text-muted ml-1">({item.percentage_rate}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary font-medium">
                      {formatCurrency(item.actual_paying)}
                      <p className="text-[10px] text-text-muted">
                        {item.paying_type === "percentage" ? "% rent" : "min rent"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.gap_egp > 0 ? (
                        <span className="font-mono font-medium text-wedja-accent">
                          +{formatCurrency(item.gap_egp)}
                        </span>
                      ) : (
                        <span className="text-text-muted font-mono">--</span>
                      )}
                      {item.estimated_gap && item.estimated_gap > item.gap_egp && (
                        <p className="text-[10px] text-red-500 font-mono">
                          Est: +{formatCurrency(item.estimated_gap)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {item.revenue_verification_note ? (
                        <span className="text-xs text-text-secondary" title={item.revenue_verification_note}>
                          {item.revenue_verification_note.length > 50
                            ? item.revenue_verification_note.slice(0, 50) + "..."
                            : item.revenue_verification_note}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {item.underreporting_flag ? (
                        <Badge variant="error">
                          <AlertTriangle size={10} />
                          Flag
                        </Badge>
                      ) : item.gap_egp > 0 ? (
                        <Badge variant="warning">Gap</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-text-muted">
                      No rent vs sales data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PortfolioSection({ portfolio }: { portfolio: PortfolioAnalytics }) {
  return (
    <div className="space-y-6">
      {/* WALE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-wedja-accent/30">
          <CardContent className="py-6 text-center">
            <p className="text-4xl font-bold text-wedja-accent font-mono">
              {portfolio.wale_years}
            </p>
            <p className="text-sm text-text-muted mt-1">WALE (years)</p>
            <p className="text-xs text-text-muted">Weighted Average Lease Expiry</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-4xl font-bold text-text-primary font-mono">
              {formatCurrency(portfolio.total_contracted_rent)}
            </p>
            <p className="text-sm text-text-muted mt-1">Monthly Contracted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-4xl font-bold text-status-warning font-mono">
              {formatCurrency(portfolio.vacancy_cost_monthly)}
            </p>
            <p className="text-sm text-text-muted mt-1">Vacancy Cost /mo</p>
          </CardContent>
        </Card>
      </div>

      {/* Rent Roll Chart */}
      <RentRollChart rentRoll={portfolio.rent_roll} />

      {/* Tenant Concentration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Tenant Concentration — Top 10
            </h2>
          </div>
          <p className="text-xs text-text-muted">% of total rent</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {portfolio.tenant_concentration.map((t) => {
              const isHighConcentration = t.percentage_of_total > 15;
              return (
                <div key={t.brand_name} className="flex items-center gap-3">
                  <span className={`w-28 text-xs font-medium truncate ${isHighConcentration ? "text-amber-500" : "text-text-secondary"}`} title={t.brand_name}>
                    {t.brand_name}
                  </span>
                  <div className="flex-1 h-5 bg-wedja-border/20 rounded overflow-hidden relative">
                    <div
                      className={`h-full rounded transition-all duration-500 ${isHighConcentration ? "bg-amber-500/70" : "bg-wedja-accent/70"}`}
                      style={{ width: `${Math.min(t.percentage_of_total, 100)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs font-mono text-text-secondary">
                    {formatPercentage(t.percentage_of_total)}
                  </span>
                  <span className="w-24 text-right text-xs font-mono text-text-muted hidden sm:block">
                    {formatCurrency(t.monthly_rent)}
                  </span>
                </div>
              );
            })}
          </div>
          {portfolio.tenant_concentration.length > 0 && (
            <div className="mt-4 pt-3 border-t border-wedja-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Top 5 concentration:</span>
                <span className="font-mono font-bold text-text-primary">
                  {formatPercentage(
                    portfolio.tenant_concentration
                      .slice(0, 5)
                      .reduce((sum, t) => sum + t.percentage_of_total, 0)
                  )}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Diversification */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent size={16} className="text-wedja-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              Category Mix
            </h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {portfolio.category_diversification.map((cat) => (
              <div key={cat.category} className="flex items-center justify-between p-3 rounded-lg bg-wedja-bg/50 border border-wedja-border/50">
                <div>
                  <p className="text-sm font-medium text-text-primary capitalize">{cat.category}</p>
                  <p className="text-xs text-text-muted">{cat.lease_count} lease{cat.lease_count !== 1 ? "s" : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono text-wedja-accent">
                    {formatPercentage(cat.percentage_of_total)}
                  </p>
                  <p className="text-xs font-mono text-text-muted">
                    {formatCurrency(cat.monthly_rent)}/mo
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PerformanceSection({
  data,
  sortField,
  sortAsc,
  onSort,
  SortIcon,
}: {
  data: LeasePerformanceItem[];
  sortField: SortField;
  sortAsc: boolean;
  onSort: (f: SortField) => void;
  SortIcon: React.ComponentType<{ field: SortField }>;
}) {
  const goodCount = data.filter((d) => d.performance_score === "good").length;
  const watchCount = data.filter((d) => d.performance_score === "watch").length;
  const underCount = data.filter((d) => d.performance_score === "underperforming").length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-status-success font-mono">{goodCount}</p>
            <p className="text-xs text-text-muted">Good</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-status-warning font-mono">{watchCount}</p>
            <p className="text-xs text-text-muted">Watch</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-status-error font-mono">{underCount}</p>
            <p className="text-xs text-text-muted">Underperforming</p>
          </CardContent>
        </Card>
      </div>

      {/* Full Table */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Lease Performance ({data.length} leases)
          </h2>
          <p className="text-xs text-text-muted">Click column headers to sort</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border bg-wedja-bg/50">
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => onSort("brand_name")}
                  >
                    <span className="flex items-center gap-1">Tenant <SortIcon field="brand_name" /></span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Unit</th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => onSort("min_rent")}
                  >
                    <span className="flex items-center justify-end gap-1">Min Rent <SortIcon field="min_rent" /></span>
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Paying</th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary hidden lg:table-cell"
                    onClick={() => onSort("revenue_per_sqm")}
                  >
                    <span className="flex items-center justify-end gap-1">Rev/sqm <SortIcon field="revenue_per_sqm" /></span>
                  </th>
                  <th
                    className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary hidden md:table-cell"
                    onClick={() => onSort("payment_compliance")}
                  >
                    <span className="flex items-center justify-center gap-1">Compliance <SortIcon field="payment_compliance" /></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary hidden lg:table-cell"
                    onClick={() => onSort("expiry_date")}
                  >
                    <span className="flex items-center gap-1">Expiry <SortIcon field="expiry_date" /></span>
                  </th>
                  <th
                    className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => onSort("performance_score")}
                  >
                    <span className="flex items-center justify-center gap-1">Status <SortIcon field="performance_score" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr
                    key={item.lease_id}
                    className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${
                      item.performance_score === "underperforming"
                        ? "bg-red-500/[0.03]"
                        : i % 2 === 1
                          ? "bg-wedja-border/[0.06]"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{item.brand_name}</p>
                      <p className="text-[11px] text-text-muted capitalize">{item.category}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-text-secondary text-xs">
                      {item.unit_number}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {formatCurrency(item.min_rent)}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <Badge variant={item.actually_paying === "percentage" ? "success" : "default"}>
                        {item.actually_paying === "percentage" ? "% rent" : "min rent"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell font-mono text-text-secondary">
                      {formatCurrency(item.revenue_per_sqm)}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <span className={`font-mono font-medium ${
                        item.payment_compliance >= 90 ? "text-emerald-500" : item.payment_compliance >= 80 ? "text-amber-500" : "text-red-500"
                      }`}>
                        {formatPercentage(item.payment_compliance, 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-text-secondary text-xs">
                      {formatDate(item.expiry_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={PERFORMANCE_BADGE[item.performance_score]}>
                        {item.performance_score}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-text-muted">
                      No performance data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EscalationsSection({ data }: { data: EscalationItem[] }) {
  const totalIncrease = data.reduce((sum, d) => sum + d.increase_amount, 0);
  const next6Months = data.filter((d) => {
    const escalDate = new Date(d.next_escalation_date);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() + 6);
    return escalDate <= cutoff;
  });

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-text-primary font-mono">{data.length}</p>
            <p className="text-xs text-text-muted">Leases with Escalation</p>
          </CardContent>
        </Card>
        <Card className="border-wedja-accent/30">
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-wedja-accent font-mono">{formatCurrency(totalIncrease)}</p>
            <p className="text-xs text-text-muted">Total Monthly Increase</p>
            <p className="text-[10px] text-text-muted">at next escalation</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-status-success font-mono">{next6Months.length}</p>
            <p className="text-xs text-text-muted">Escalating within 6 months</p>
          </CardContent>
        </Card>
      </div>

      {/* Escalation Timeline Bar */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-wedja-accent" />
              <h2 className="text-sm font-semibold text-text-primary">
                Escalation Timeline — Next 24 Months
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {/* Group by quarter */}
              {(() => {
                const now = new Date();
                const quarters: { label: string; items: EscalationItem[] }[] = [];
                for (let q = 0; q < 8; q++) {
                  const qStart = new Date(now.getFullYear(), now.getMonth() + q * 3, 1);
                  const qEnd = new Date(now.getFullYear(), now.getMonth() + (q + 1) * 3, 0);
                  const label = `Q${Math.floor(qStart.getMonth() / 3) + 1} ${qStart.getFullYear()}`;
                  const items = data.filter((d) => {
                    const date = new Date(d.next_escalation_date);
                    return date >= qStart && date <= qEnd;
                  });
                  if (items.length > 0) {
                    quarters.push({ label, items });
                  }
                }
                return quarters.map(({ label, items }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-16 text-xs font-medium text-text-muted shrink-0">{label}</span>
                    <div className="flex-1 flex items-center gap-1 flex-wrap">
                      {items.map((item) => (
                        <span
                          key={item.lease_id}
                          className="text-[10px] px-2 py-0.5 bg-wedja-accent/10 text-wedja-accent rounded font-medium"
                          title={`${item.brand_name}: +${formatCurrency(item.increase_amount)}`}
                        >
                          {item.brand_name}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs font-mono text-wedja-accent shrink-0">
                      +{formatCurrency(items.reduce((s, i) => s + i.increase_amount, 0))}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Escalation Details ({data.length})
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wedja-border bg-wedja-bg/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tenant</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Unit</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Rate</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Current</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">After</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Increase</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Next Date</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr
                    key={item.lease_id}
                    className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${i % 2 === 1 ? "bg-wedja-border/[0.06]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{item.brand_name}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-text-secondary text-xs">
                      {item.unit_number}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-wedja-accent font-medium">
                      {item.escalation_rate}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-secondary">
                      {formatCurrency(item.current_rent)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary font-medium">
                      {formatCurrency(item.post_escalation_rent)}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-mono text-status-success">
                      +{formatCurrency(item.increase_amount)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-text-secondary text-xs">
                      {formatDate(item.next_escalation_date)}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-text-muted">
                      No leases with escalation clauses
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertsSection({ alerts }: { alerts: ContractAlert[] }) {
  return (
    <div className="space-y-4">
      {alerts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell size={48} className="mx-auto text-text-muted/50 mb-4" />
            <p className="text-sm text-text-muted">No active alerts</p>
          </CardContent>
        </Card>
      )}

      {alerts.map((alert) => {
        const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
        return (
          <Card key={alert.id} className={`${style.border} border-2`}>
            <CardContent className={`py-4 ${style.bg}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className={`${style.text} mt-0.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-sm font-semibold ${style.text}`}>{alert.title}</p>
                    <Badge variant={style.badge}>{alert.severity}</Badge>
                    <Badge variant="default">{alert.category}</Badge>
                  </div>
                  <p className="text-sm text-text-secondary">{alert.message}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight size={12} className="text-wedja-accent" />
                      <span className="text-xs text-wedja-accent font-medium">{alert.recommended_action}</span>
                    </div>
                    {alert.impact_egp && alert.impact_egp > 0 && (
                      <span className="text-xs font-mono text-text-muted">
                        Impact: {formatCurrency(alert.impact_egp)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
