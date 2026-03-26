"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  DollarSign,
  Loader2,
  Shield,
  ArrowRight,
  Percent,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

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

  // Cross-data
  const [percentRentPremium, setPercentRentPremium] = useState<number>(0);

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

  // Fetch percentage rent premium
  useEffect(() => {
    async function fetchPctRent() {
      try {
        const res = await fetch("/api/v1/percentage-rent?type=overview");
        if (res.ok) {
          const data = await res.json();
          setPercentRentPremium(
            data?.summary?.total_percentage_rent_premium_egp ??
            data?.total_percentage_rent_premium_egp ?? 0
          );
        }
      } catch {
        // Optional
      }
    }
    fetchPctRent();
  }, []);

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

  // Base rent total (min rent due)
  const totalBase = transactions.reduce(
    (sum, t) => sum + (t.min_rent_due || 0),
    0
  );

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

      {/* % Rent Analysis Link */}
      <Link
        href="/dashboard/percentage-rent"
        className="flex items-center justify-between px-5 py-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <Percent size={20} className="text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              % Rent Analysis
            </p>
            <p className="text-xs text-text-muted">
              Percentage rent premium, inflation hedge, and rate optimization
            </p>
          </div>
        </div>
        <ArrowRight
          size={18}
          className="text-emerald-500 group-hover:translate-x-1 transition-transform"
        />
      </Link>

      {/* Revenue Summary Line */}
      {(totalBase > 0 || percentRentPremium > 0) && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-text-secondary">
              Total base: <span className="font-mono font-semibold text-text-primary">{formatCurrency(totalBase)}</span>
              {percentRentPremium > 0 && (
                <>
                  {" "}+ % premium: <span className="font-mono font-semibold text-emerald-500">{formatCurrency(percentRentPremium)}</span>
                  {" "}= Total: <span className="font-mono font-bold text-wedja-accent">{formatCurrency(totalBase + percentRentPremium)}</span>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-bold text-status-success font-mono">
              {formatCurrency(totalCollected)}
            </p>
            <p className="text-xs text-text-muted mt-1">Total Collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-bold text-status-warning font-mono">
              {formatCurrency(totalOutstanding)}
            </p>
            <p className="text-xs text-text-muted mt-1">Outstanding</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-bold text-status-error font-mono">
              {formatCurrency(totalOverdue)}
            </p>
            <p className="text-xs text-text-muted mt-1">Overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-bold text-emerald-500 font-mono">
              {percentRentPremium > 0 ? formatCurrency(percentRentPremium) : "N/A"}
            </p>
            <p className="text-xs text-text-muted mt-1">% Rent Premium</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue Bar Chart (Recharts) */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Monthly Revenue Trend
          </h2>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' }}
                labelStyle={{ color: '#9CA3AF' }}
                itemStyle={{ color: '#F9FAFB' }}
                formatter={(value: any) => formatCurrency(Number(value))}
              />
              <Bar dataKey="due" fill="#374151" name="Due" />
              <Bar dataKey="collected" fill="#4F46E5" name="Collected" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 text-xs mt-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#4F46E5' }} />
              Collected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#374151' }} />
              Due
            </span>
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
