"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Loader2,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  BarChart3,
  Receipt,
  PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface Overview {
  total_income_egp: number;
  total_expenses_egp: number;
  net_profit_egp: number;
  profit_margin_pct: number;
  income_vs_last_month_pct: number;
  expenses_vs_last_month_pct: number;
  overdue_rent_egp: number;
  expense_breakdown: { category: string; amount_egp: number; percentage: number }[];
}

interface CashFlowMonth {
  month: number;
  year: number;
  label: string;
  income_egp: number;
  expenses_egp: number;
  net_egp: number;
}

interface BudgetLine {
  category: string;
  budgeted_egp: number;
  actual_egp: number;
  variance_egp: number;
  variance_pct: number;
  status: "under" | "over" | "on_track";
}

interface PnL {
  period: string;
  income: { rent_collected: number; other_income: number; total_income: number };
  expenses: { category: string; amount_egp: number }[];
  total_expenses: number;
  net_income: number;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount_egp: number;
  vendor: string | null;
  invoice_reference: string | null;
  expense_date: string;
  status: string;
  is_recurring: boolean;
}

const EXPENSE_CATEGORIES = [
  "utilities",
  "maintenance",
  "security",
  "cleaning",
  "marketing",
  "insurance",
  "salaries",
  "admin",
  "technology",
  "other",
];

const CATEGORY_COLORS: Record<string, string> = {
  salaries: "bg-blue-500",
  utilities: "bg-amber-500",
  security: "bg-red-500",
  cleaning: "bg-emerald-500",
  maintenance: "bg-orange-500",
  marketing: "bg-purple-500",
  insurance: "bg-cyan-500",
  technology: "bg-indigo-500",
  admin: "bg-gray-500",
  other: "bg-slate-500",
};

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  salaries: "text-blue-500",
  utilities: "text-amber-500",
  security: "text-red-500",
  cleaning: "text-emerald-500",
  maintenance: "text-orange-500",
  marketing: "text-purple-500",
  insurance: "text-cyan-500",
  technology: "text-indigo-500",
  admin: "text-gray-500",
  other: "text-slate-500",
};

// ── Main Component ──────────────────────────────────────────

export default function FinancePage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowMonth[]>([]);
  const [budget, setBudget] = useState<BudgetLine[]>([]);
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [creating, setCreating] = useState(false);

  // Cross-data
  const [percentRentPremium, setPercentRentPremium] = useState<number>(0);
  const [inflationHedgeRatio, setInflationHedgeRatio] = useState<number | null>(null);

  const [newExpense, setNewExpense] = useState({
    category: "utilities",
    description: "",
    amount_egp: "",
    vendor: "",
    expense_date: new Date().toISOString().split("T")[0],
  });

  const fetchAll = useCallback(async () => {
    try {
      const [overviewRes, cashFlowRes, budgetRes, pnlRes, recentRes] =
        await Promise.all([
          fetch("/api/v1/finance?type=overview"),
          fetch("/api/v1/finance?type=cashflow"),
          fetch("/api/v1/finance?type=budget"),
          fetch("/api/v1/finance?type=pnl"),
          fetch("/api/v1/finance?type=recent"),
        ]);

      const [ov, cf, bg, pl, re] = await Promise.all([
        overviewRes.json(),
        cashFlowRes.json(),
        budgetRes.json(),
        pnlRes.json(),
        recentRes.json(),
      ]);

      setOverview(ov);
      setCashFlow(cf);
      setBudget(bg);
      setPnl(pl);
      setRecentExpenses(re);
    } catch {
      // Handled by empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Fetch cross-data: percentage rent and inflation hedge
  useEffect(() => {
    async function fetchCrossData() {
      try {
        const [pctRes, inflRes] = await Promise.all([
          fetch("/api/v1/percentage-rent?type=overview").catch(() => null),
          fetch("/api/v1/percentage-rent?type=inflation").catch(() => null),
        ]);

        if (pctRes?.ok) {
          const pctData = await pctRes.json();
          setPercentRentPremium(
            pctData?.summary?.total_percentage_rent_premium_egp ??
            pctData?.total_percentage_rent_premium_egp ?? 0
          );
        }

        if (inflRes?.ok) {
          const inflData = await inflRes.json();
          setInflationHedgeRatio(
            inflData?.hedge_ratio ?? inflData?.inflation_hedge_ratio ?? null
          );
        }
      } catch {
        // Cross-data optional
      }
    }
    fetchCrossData();
  }, []);

  const handleCreateExpense = async () => {
    if (!newExpense.description || !newExpense.amount_egp) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newExpense,
          amount_egp: parseFloat(newExpense.amount_egp),
        }),
      });
      if (res.ok) {
        setShowNewExpense(false);
        setNewExpense({
          category: "utilities",
          description: "",
          amount_egp: "",
          vendor: "",
          expense_date: new Date().toISOString().split("T")[0],
        });
        fetchAll();
      }
    } catch {
      // Silent
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  // Cash flow chart max value
  const cfMax = Math.max(
    ...cashFlow.map((c) => Math.max(c.income_egp, c.expenses_egp, 1))
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Wallet size={28} className="text-wedja-accent" />
            Finance
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Income, expenses, budgets, and profitability
          </p>
        </div>
        <Button onClick={() => setShowNewExpense(true)} size="sm">
          <Plus size={16} />
          Add Expense
        </Button>
      </div>

      {/* ── 4 Stat Cards ─────────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Income"
            value={formatCurrency(overview.total_income_egp)}
            change={overview.income_vs_last_month_pct}
            icon={<TrendingUp size={18} />}
            color="text-status-success"
          />
          <StatCard
            label="Total Expenses"
            value={formatCurrency(overview.total_expenses_egp)}
            change={overview.expenses_vs_last_month_pct}
            icon={<TrendingDown size={18} />}
            color="text-status-error"
            invertChange
          />
          <StatCard
            label="Net Profit"
            value={formatCurrency(overview.net_profit_egp)}
            icon={<DollarSign size={18} />}
            color={overview.net_profit_egp >= 0 ? "text-status-success" : "text-status-error"}
          />
          <StatCard
            label="Profit Margin"
            value={formatPercentage(overview.profit_margin_pct)}
            icon={<PieChart size={18} />}
            color="text-wedja-accent"
          />
          {inflationHedgeRatio !== null && (
            <StatCard
              label="Inflation Hedge Ratio"
              value={`${(inflationHedgeRatio * 100).toFixed(1)}%`}
              icon={<TrendingUp size={18} />}
              color="text-status-info"
            />
          )}
        </div>
      )}

      {/* ── New Expense Form ─────────────────────────────────── */}
      {showNewExpense && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              New Expense
            </h2>
            <button
              onClick={() => setShowNewExpense(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Category
                </label>
                <select
                  value={newExpense.category}
                  onChange={(e) =>
                    setNewExpense({ ...newExpense, category: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Description"
                value={newExpense.description}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, description: e.target.value })
                }
                placeholder="What is this expense for?"
              />
              <Input
                label="Amount (EGP)"
                type="number"
                value={newExpense.amount_egp}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, amount_egp: e.target.value })
                }
                placeholder="0.00"
              />
              <Input
                label="Vendor"
                value={newExpense.vendor}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, vendor: e.target.value })
                }
                placeholder="Vendor name"
              />
              <Input
                label="Date"
                type="date"
                value={newExpense.expense_date}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, expense_date: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowNewExpense(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateExpense}
                disabled={creating || !newExpense.description || !newExpense.amount_egp}
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                Create Expense
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── P&L Summary + Expense Breakdown Row ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P&L Summary */}
        {pnl && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Receipt size={16} className="text-wedja-accent" />
                P&L Summary &mdash; {pnl.period}
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Income */}
              <div>
                <p className="text-xs font-semibold text-status-success uppercase tracking-wider mb-2">
                  Income
                </p>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-text-secondary">Rent Collected</span>
                  <span className="text-sm font-mono text-text-primary">
                    {formatCurrency(pnl.income.rent_collected)}
                  </span>
                </div>
                {percentRentPremium > 0 && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-text-secondary">% Rent Premium</span>
                    <span className="text-sm font-mono text-emerald-500">
                      {formatCurrency(percentRentPremium)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1.5 border-t border-wedja-border">
                  <span className="text-sm font-semibold text-text-primary">Total Income</span>
                  <span className="text-sm font-mono font-bold text-status-success">
                    {formatCurrency(pnl.income.total_income + percentRentPremium)}
                  </span>
                </div>
              </div>

              {/* Expenses */}
              <div>
                <p className="text-xs font-semibold text-status-error uppercase tracking-wider mb-2">
                  Expenses
                </p>
                {pnl.expenses.map((e) => (
                  <div
                    key={e.category}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-text-secondary capitalize">
                      {e.category}
                    </span>
                    <span className="text-sm font-mono text-text-primary">
                      {formatCurrency(e.amount_egp)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1.5 border-t border-wedja-border">
                  <span className="text-sm font-semibold text-text-primary">
                    Total Expenses
                  </span>
                  <span className="text-sm font-mono font-bold text-status-error">
                    {formatCurrency(pnl.total_expenses)}
                  </span>
                </div>
              </div>

              {/* Bottom Line */}
              <div className="pt-2 border-t-2 border-wedja-border">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-text-primary">
                    Net Income
                  </span>
                  <span
                    className={`text-base font-mono font-bold ${
                      pnl.net_income >= 0
                        ? "text-status-success"
                        : "text-status-error"
                    }`}
                  >
                    {formatCurrency(pnl.net_income)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expense Breakdown */}
        {overview && overview.expense_breakdown.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <PieChart size={16} className="text-wedja-accent" />
                Expense Breakdown
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.expense_breakdown.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-primary capitalize">
                      {item.category}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted">
                        {formatPercentage(item.percentage)}
                      </span>
                      <span className="text-sm font-mono text-text-primary w-28 text-right">
                        {formatCurrency(item.amount_egp)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-wedja-border/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        CATEGORY_COLORS[item.category] || "bg-gray-500"
                      }`}
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Cash Flow Chart ──────────────────────────────────── */}
      {cashFlow.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <BarChart3 size={16} className="text-wedja-accent" />
              Cash Flow (6 months)
            </h2>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 sm:gap-4 h-56">
              {cashFlow.map((m) => {
                const incomeH = cfMax > 0 ? (m.income_egp / cfMax) * 100 : 0;
                const expenseH = cfMax > 0 ? (m.expenses_egp / cfMax) * 100 : 0;

                return (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    {/* Net indicator */}
                    <span
                      className={`text-[10px] font-mono ${
                        m.net_egp >= 0
                          ? "text-status-success"
                          : "text-status-error"
                      }`}
                    >
                      {m.net_egp >= 0 ? "+" : ""}
                      {formatCurrency(m.net_egp)}
                    </span>

                    {/* Bars */}
                    <div className="flex gap-0.5 sm:gap-1 items-end w-full h-40">
                      {/* Income bar */}
                      <div
                        className="flex-1 bg-emerald-500/80 rounded-t-sm transition-all duration-500 min-h-[2px]"
                        style={{ height: `${incomeH}%` }}
                        title={`Income: ${formatCurrency(m.income_egp)}`}
                      />
                      {/* Expense bar */}
                      <div
                        className="flex-1 bg-red-500/70 rounded-t-sm transition-all duration-500 min-h-[2px]"
                        style={{ height: `${expenseH}%` }}
                        title={`Expenses: ${formatCurrency(m.expenses_egp)}`}
                      />
                    </div>

                    {/* Label */}
                    <span className="text-[10px] text-text-muted whitespace-nowrap">
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
                <span className="text-xs text-text-muted">Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500/70" />
                <span className="text-xs text-text-muted">Expenses</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Budget vs Actual ─────────────────────────────────── */}
      {budget.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Budget vs Actual ({new Date().getFullYear()})
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Category
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Budgeted
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Actual
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Variance
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {budget.map((b) => (
                    <tr
                      key={b.category}
                      className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                    >
                      <td className="px-4 py-2.5 text-text-primary font-medium capitalize">
                        {b.category}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {formatCurrency(b.budgeted_egp)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                        {formatCurrency(b.actual_egp)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        <span
                          className={
                            b.variance_egp >= 0
                              ? "text-status-success"
                              : "text-status-error"
                          }
                        >
                          {b.variance_egp >= 0 ? "+" : ""}
                          {formatCurrency(b.variance_egp)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          variant={
                            b.status === "over"
                              ? "error"
                              : b.status === "under"
                              ? "success"
                              : "default"
                          }
                        >
                          {b.status === "over"
                            ? "Over Budget"
                            : b.status === "under"
                            ? "Under Budget"
                            : "On Track"}
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

      {/* ── Recent Expenses ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Recent Expenses
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {recentExpenses.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              No expenses recorded yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wedja-border">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Date
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Category
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Description
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted">
                      Amount
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted">
                      Vendor
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentExpenses.map((exp) => (
                    <tr
                      key={exp.id}
                      className="border-b border-wedja-border/50 hover:bg-wedja-border/10"
                    >
                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap">
                        {new Date(exp.expense_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs font-medium capitalize ${
                            CATEGORY_TEXT_COLORS[exp.category] || "text-text-secondary"
                          }`}
                        >
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-text-primary max-w-xs truncate">
                        {exp.description}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                        {formatCurrency(exp.amount_egp)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs">
                        {exp.vendor || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          variant={
                            exp.status === "paid"
                              ? "success"
                              : exp.status === "approved"
                              ? "gold"
                              : exp.status === "rejected"
                              ? "error"
                              : "warning"
                          }
                        >
                          {exp.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat Card Component ─────────────────────────────────────

function StatCard({
  label,
  value,
  change,
  icon,
  color,
  invertChange,
}: {
  label: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  color: string;
  invertChange?: boolean;
}) {
  const isPositiveChange = invertChange
    ? (change || 0) < 0
    : (change || 0) > 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted font-medium">{label}</span>
          <span className={color}>{icon}</span>
        </div>
        <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {isPositiveChange ? (
              <ArrowUpRight size={12} className="text-status-success" />
            ) : (
              <ArrowDownRight size={12} className="text-status-error" />
            )}
            <span
              className={`text-xs font-mono ${
                isPositiveChange ? "text-status-success" : "text-status-error"
              }`}
            >
              {Math.abs(change).toFixed(1)}% vs last month
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
