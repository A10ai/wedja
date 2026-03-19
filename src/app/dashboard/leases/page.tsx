"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Lease {
  id: string;
  unit_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  min_rent_monthly_egp: number;
  percentage_rate: number;
  security_deposit_egp: number;
  escalation_rate: number;
  status: string;
  tenant: {
    id: string;
    name: string;
    brand_name: string;
    category: string;
  } | null;
  unit: {
    id: string;
    name: string;
    unit_number: string;
    area_sqm: number;
    zone: { id: string; name: string } | null;
  } | null;
}

const STATUS_FILTERS = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "terminated", label: "Terminated" },
  { value: "pending", label: "Pending" },
];

const statusVariant: Record<string, "success" | "warning" | "error" | "default" | "gold"> = {
  active: "success",
  expired: "error",
  terminated: "error",
  pending: "warning",
};

function isExpiringSoon(endDate: string): boolean {
  const end = new Date(endDate);
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);
  return end <= threeMonths && end >= new Date();
}

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchLeases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/v1/leases?${params.toString()}`);
      const data = await res.json();
      setLeases(Array.isArray(data) ? data : []);
    } catch {
      setLeases([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLeases();
  }, [fetchLeases]);

  const totalMonthlyRent = leases
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + l.min_rent_monthly_egp, 0);

  const activeCount = leases.filter((l) => l.status === "active").length;
  const expiringCount = leases.filter(
    (l) => l.status === "active" && isExpiringSoon(l.end_date)
  ).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <FileText size={28} className="text-custis-gold" />
          Leases
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Active leases, terms, and rent schedules
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-custis-gold font-mono">
              {formatCurrency(totalMonthlyRent)}
            </p>
            <p className="text-xs text-text-muted">Total Monthly Min. Rent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-text-primary font-mono">{leases.length}</p>
            <p className="text-xs text-text-muted">Total Leases</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-status-success font-mono">{activeCount}</p>
            <p className="text-xs text-text-muted">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className={`text-lg font-bold font-mono ${expiringCount > 0 ? "text-status-warning" : "text-status-success"}`}>
              {expiringCount}
            </p>
            <p className="text-xs text-text-muted">Expiring Soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="py-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-custis-gold" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-custis-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tenant</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Unit</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Zone</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Min Rent</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">% Rate</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Start</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">End</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leases.map((lease, i) => {
                    const expiring =
                      lease.status === "active" && isExpiringSoon(lease.end_date);
                    return (
                      <tr
                        key={lease.id}
                        className={`border-b border-custis-border/50 hover:bg-custis-border/20 ${
                          expiring
                            ? "bg-amber-500/5"
                            : i % 2 === 1
                            ? "bg-custis-border/10"
                            : ""
                        }`}
                      >
                        <td className="px-5 py-3">
                          <p className="font-medium text-text-primary">
                            {lease.tenant?.brand_name || "Unknown"}
                          </p>
                          <p className="text-xs text-text-muted">{lease.tenant?.category}</p>
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell font-mono text-text-secondary text-xs">
                          {lease.unit?.unit_number}
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell text-text-secondary text-xs">
                          {lease.unit?.zone?.name || "-"}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-text-primary">
                          {formatCurrency(lease.min_rent_monthly_egp)}
                        </td>
                        <td className="px-5 py-3 text-center hidden md:table-cell font-mono text-text-secondary">
                          {lease.percentage_rate}%
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell text-text-secondary text-xs">
                          {formatDate(lease.start_date)}
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell text-text-secondary text-xs">
                          <div className="flex items-center gap-1">
                            {formatDate(lease.end_date)}
                            {expiring && (
                              <span title="Expiring within 3 months">
                                <AlertTriangle
                                  size={14}
                                  className="text-status-warning"
                                />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={statusVariant[lease.status] || "default"}>
                            {lease.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {leases.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-text-muted">
                        No leases found
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
