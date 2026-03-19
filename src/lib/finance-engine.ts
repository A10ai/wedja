import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Custis Finance Engine
//
// Financial analytics: income, expenses, budgets, P&L.
// All monetary values in EGP.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface FinanceOverview {
  total_income_egp: number;
  total_expenses_egp: number;
  net_profit_egp: number;
  profit_margin_pct: number;
  income_vs_last_month_pct: number;
  expenses_vs_last_month_pct: number;
  overdue_rent_egp: number;
  expense_breakdown: {
    category: string;
    amount_egp: number;
    percentage: number;
  }[];
}

export interface CashFlowMonth {
  month: number;
  year: number;
  label: string;
  income_egp: number;
  expenses_egp: number;
  net_egp: number;
}

export interface BudgetLine {
  category: string;
  budgeted_egp: number;
  actual_egp: number;
  variance_egp: number;
  variance_pct: number;
  status: "under" | "over" | "on_track";
}

export interface ProfitAndLoss {
  period: string;
  income: {
    rent_collected: number;
    other_income: number;
    total_income: number;
  };
  expenses: {
    category: string;
    amount_egp: number;
  }[];
  total_expenses: number;
  net_income: number;
}

// ── Helper: get month boundaries ────────────────────────────

function getMonthRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

// ── Finance Overview ────────────────────────────────────────

export async function getFinanceOverview(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month?: number,
  year?: number
): Promise<FinanceOverview> {
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const y = year || now.getFullYear();
  const range = getMonthRange(m, y);

  // Previous month
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevRange = getMonthRange(prevM, prevY);

  const [incomeRes, prevIncomeRes, expensesRes, prevExpensesRes, overdueRes] =
    await Promise.all([
      // Current month income
      supabase
        .from("rent_transactions")
        .select("amount_paid, lease:leases!inner(property_id)")
        .eq("period_month", m)
        .eq("period_year", y)
        .eq("leases.property_id", propertyId),

      // Previous month income
      supabase
        .from("rent_transactions")
        .select("amount_paid, lease:leases!inner(property_id)")
        .eq("period_month", prevM)
        .eq("period_year", prevY)
        .eq("leases.property_id", propertyId),

      // Current month expenses
      supabase
        .from("expenses")
        .select("amount_egp, category")
        .eq("property_id", propertyId)
        .gte("expense_date", range.start)
        .lte("expense_date", range.end),

      // Previous month expenses
      supabase
        .from("expenses")
        .select("amount_egp")
        .eq("property_id", propertyId)
        .gte("expense_date", prevRange.start)
        .lte("expense_date", prevRange.end),

      // Overdue rent
      supabase
        .from("rent_transactions")
        .select("amount_due, amount_paid, lease:leases!inner(property_id)")
        .eq("status", "overdue")
        .eq("leases.property_id", propertyId),
    ]);

  const totalIncome = (incomeRes.data || []).reduce(
    (s, t) => s + (Number(t.amount_paid) || 0),
    0
  );
  const prevIncome = (prevIncomeRes.data || []).reduce(
    (s, t) => s + (Number(t.amount_paid) || 0),
    0
  );
  const totalExpenses = (expensesRes.data || []).reduce(
    (s, e) => s + (Number(e.amount_egp) || 0),
    0
  );
  const prevExpenses = (prevExpensesRes.data || []).reduce(
    (s, e) => s + (Number(e.amount_egp) || 0),
    0
  );
  const overdueRent = (overdueRes.data || []).reduce(
    (s, t) => s + ((Number(t.amount_due) || 0) - (Number(t.amount_paid) || 0)),
    0
  );

  // Expense breakdown by category
  const categoryMap: Record<string, number> = {};
  (expensesRes.data || []).forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + Number(e.amount_egp);
  });

  const expenseBreakdown = Object.entries(categoryMap)
    .map(([category, amount_egp]) => ({
      category,
      amount_egp,
      percentage: totalExpenses > 0 ? (amount_egp / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount_egp - a.amount_egp);

  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const incomeChange =
    prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome) * 100 : 0;
  const expenseChange =
    prevExpenses > 0
      ? ((totalExpenses - prevExpenses) / prevExpenses) * 100
      : 0;

  return {
    total_income_egp: totalIncome,
    total_expenses_egp: totalExpenses,
    net_profit_egp: netProfit,
    profit_margin_pct: Math.round(profitMargin * 10) / 10,
    income_vs_last_month_pct: Math.round(incomeChange * 10) / 10,
    expenses_vs_last_month_pct: Math.round(expenseChange * 10) / 10,
    overdue_rent_egp: overdueRent,
    expense_breakdown: expenseBreakdown,
  };
}

// ── Expenses by Category (monthly for chart) ────────────────

export async function getExpensesByCategory(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  months: number = 6
) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const { data } = await supabase
    .from("expenses")
    .select("category, amount_egp, expense_date")
    .eq("property_id", propertyId)
    .gte("expense_date", startDate.toISOString().split("T")[0])
    .order("expense_date", { ascending: true });

  // Group by month and category
  const result: Record<string, Record<string, number>> = {};
  (data || []).forEach((e) => {
    const d = new Date(e.expense_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!result[key]) result[key] = {};
    result[key][e.category] =
      (result[key][e.category] || 0) + Number(e.amount_egp);
  });

  return result;
}

// ── Cash Flow (income vs expenses per month) ────────────────

export async function getCashFlow(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  months: number = 6
): Promise<CashFlowMonth[]> {
  const MONTH_LABELS = [
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

  const now = new Date();
  const results: CashFlowMonth[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const range = getMonthRange(m, y);

    const [incomeRes, expenseRes] = await Promise.all([
      supabase
        .from("rent_transactions")
        .select("amount_paid, lease:leases!inner(property_id)")
        .eq("period_month", m)
        .eq("period_year", y)
        .eq("leases.property_id", propertyId),
      supabase
        .from("expenses")
        .select("amount_egp")
        .eq("property_id", propertyId)
        .gte("expense_date", range.start)
        .lte("expense_date", range.end),
    ]);

    const income = (incomeRes.data || []).reduce(
      (s, t) => s + (Number(t.amount_paid) || 0),
      0
    );
    const expenses = (expenseRes.data || []).reduce(
      (s, e) => s + (Number(e.amount_egp) || 0),
      0
    );

    results.push({
      month: m,
      year: y,
      label: `${MONTH_LABELS[m]} ${y}`,
      income_egp: income,
      expenses_egp: expenses,
      net_egp: income - expenses,
    });
  }

  return results;
}

// ── Budget Comparison ───────────────────────────────────────

export async function getBudgetComparison(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  year?: number
): Promise<BudgetLine[]> {
  const y = year || new Date().getFullYear();

  const { data } = await supabase
    .from("budgets")
    .select("category, budgeted_amount_egp, actual_amount_egp")
    .eq("property_id", propertyId)
    .eq("period_year", y);

  // Aggregate by category (sum all months)
  const categoryMap: Record<string, { budgeted: number; actual: number }> = {};
  (data || []).forEach((b) => {
    if (!categoryMap[b.category]) {
      categoryMap[b.category] = { budgeted: 0, actual: 0 };
    }
    categoryMap[b.category].budgeted += Number(b.budgeted_amount_egp);
    categoryMap[b.category].actual += Number(b.actual_amount_egp);
  });

  return Object.entries(categoryMap)
    .map(([category, { budgeted, actual }]) => {
      const variance = budgeted - actual;
      const variancePct = budgeted > 0 ? (variance / budgeted) * 100 : 0;
      let status: "under" | "over" | "on_track" = "on_track";
      if (variancePct < -5) status = "over";
      else if (variancePct > 10) status = "under";

      return {
        category,
        budgeted_egp: Math.round(budgeted),
        actual_egp: Math.round(actual),
        variance_egp: Math.round(variance),
        variance_pct: Math.round(variancePct * 10) / 10,
        status,
      };
    })
    .sort((a, b) => b.budgeted_egp - a.budgeted_egp);
}

// ── Profit and Loss ─────────────────────────────────────────

export async function getProfitAndLoss(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  month: number,
  year: number
): Promise<ProfitAndLoss> {
  const MONTH_LABELS = [
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

  const range = getMonthRange(month, year);

  const [incomeRes, expenseRes] = await Promise.all([
    supabase
      .from("rent_transactions")
      .select("amount_paid, min_rent_due, percentage_rent_due, lease:leases!inner(property_id)")
      .eq("period_month", month)
      .eq("period_year", year)
      .eq("leases.property_id", propertyId),
    supabase
      .from("expenses")
      .select("category, amount_egp")
      .eq("property_id", propertyId)
      .gte("expense_date", range.start)
      .lte("expense_date", range.end),
  ]);

  const rentCollected = (incomeRes.data || []).reduce(
    (s, t) => s + (Number(t.amount_paid) || 0),
    0
  );

  // Expense breakdown
  const categoryMap: Record<string, number> = {};
  (expenseRes.data || []).forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + Number(e.amount_egp);
  });

  const expenseLines = Object.entries(categoryMap)
    .map(([category, amount_egp]) => ({ category, amount_egp }))
    .sort((a, b) => b.amount_egp - a.amount_egp);

  const totalExpenses = expenseLines.reduce((s, e) => s + e.amount_egp, 0);

  return {
    period: `${MONTH_LABELS[month]} ${year}`,
    income: {
      rent_collected: rentCollected,
      other_income: 0,
      total_income: rentCollected,
    },
    expenses: expenseLines,
    total_expenses: totalExpenses,
    net_income: rentCollected - totalExpenses,
  };
}
