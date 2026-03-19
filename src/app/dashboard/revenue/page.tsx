"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  DollarSign,
  Loader2,
  Shield,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface RentTransaction {
  id: string;
  period_month: number;
  period_year: number;
  min_rent_due: number;
  percentage_rent_due: number;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  status: string;
  lease: {
    id: string;
    tenant: { id: string; name: string; brand_name: string } | null;
    unit: { id: string; name: string; unit_number: string } | null;
  } | null;
}

const STATUS_FILTERS = [
  { value: "", label: "All Statuses" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
];

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  paid: "success",
  partial: "warning",
  overdue: "error",
  waived: "default",
};

export default function RevenuePage() {
  const [transactions, setTransactions] = useState<RentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/v1/rent-transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Summary calculations
  const totalCollected = transactions
    .filter((t) => t.status === "paid" || t.status === "partial")
    .reduce((sum, t) => sum + (t.amount_paid || 0), 0);
  const totalOutstanding = transactions.reduce(
    (sum, t) => sum + (t.amount_due - (t.amount_paid || 0)),
    0
  );
  const totalOverdue = transactions
    .filter((t) => t.status === "overdue")
    .reduce((sum, t) => sum + t.amount_due, 0);

  // Monthly revenue trend (last 6 months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { label: string; collected: number; due: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();

      const monthTx = transactions.filter(
        (t) => t.period_month === m && t.period_year === y
      );

      months.push({
        label: `${MONTH_NAMES[m]} ${y.toString().slice(2)}`,
        collected: monthTx.reduce((s, t) => s + (t.amount_paid || 0), 0),
        due: monthTx.reduce((s, t) => s + t.amount_due, 0),
      });
    }

    return months;
  }, [transactions]);

  const maxMonthly = Math.max(
    ...monthlyData.map((m) => Math.max(m.collected, m.due)),
    1
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <DollarSign size={28} className="text-wedja-accent" />
          Revenue
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Revenue tracking, collections, and analysis
        </p>
      </div>

      {/* Revenue Verification Link */}
      <Link
        href="/dashboard/discrepancies"
        className="flex items-center justify-between px-5 py-4 rounded-xl border-2 border-wedja-accent/30 bg-wedja-accent/5 hover:bg-wedja-accent/10 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-wedja-accent" />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Revenue Verification
            </p>
            <p className="text-xs text-text-muted">
              Detect underreporting with forensic analysis
            </p>
          </div>
        </div>
        <ArrowRight
          size={18}
          className="text-wedja-accent group-hover:translate-x-1 transition-transform"
        />
      </Link>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-status-success font-mono">
              {formatCurrency(totalCollected)}
            </p>
            <p className="text-xs text-text-muted mt-1">Total Collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-status-warning font-mono">
              {formatCurrency(totalOutstanding)}
            </p>
            <p className="text-xs text-text-muted mt-1">Outstanding</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-status-error font-mono">
              {formatCurrency(totalOverdue)}
            </p>
            <p className="text-xs text-text-muted mt-1">Overdue</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue Bar Chart (CSS-based) */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Monthly Revenue Trend
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-wedja-accent" />
              Collected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-wedja-border" />
              Due
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-48">
            {monthlyData.map((month) => (
              <div key={month.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-1 h-36">
                  {/* Due bar (background) */}
                  <div className="flex-1 relative">
                    <div
                      className="w-full bg-wedja-border/50 rounded-t"
                      style={{
                        height: `${(month.due / maxMonthly) * 100}%`,
                        minHeight: month.due > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                  {/* Collected bar */}
                  <div className="flex-1 relative">
                    <div
                      className="w-full bg-wedja-accent rounded-t"
                      style={{
                        height: `${(month.collected / maxMonthly) * 100}%`,
                        minHeight: month.collected > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-text-muted whitespace-nowrap">
                  {month.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <Card>
        <CardContent className="py-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Rent Collection Table */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Rent Collection Details
          </h2>
          <p className="text-xs text-text-muted">
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-wedja-accent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tenant</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Period</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Due</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Paid</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Date</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <tr
                      key={tx.id}
                      className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${
                        i % 2 === 1 ? "bg-wedja-border/10" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-text-primary">
                          {tx.lease?.tenant?.brand_name || "Unknown"}
                        </p>
                        <p className="text-xs text-text-muted font-mono">
                          {tx.lease?.unit?.unit_number}
                        </p>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-text-secondary">
                        {MONTH_NAMES[tx.period_month]} {tx.period_year}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-secondary">
                        {formatCurrency(tx.amount_due)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-primary font-medium">
                        {formatCurrency(tx.amount_paid)}
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-text-secondary text-xs">
                        {tx.payment_date
                          ? new Date(tx.payment_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Badge variant={statusVariant[tx.status] || "default"}>
                          {tx.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                        No transactions found
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
