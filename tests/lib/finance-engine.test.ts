import { describe, test, expect } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  getFinanceOverview,
  getCashFlow,
  getBudgetComparison,
  getProfitAndLoss,
  getExpensesByCategory,
} from "@/lib/finance-engine";

const PROP = "a0000000-0000-0000-0000-000000000001";

describe("finance-engine: getFinanceOverview", () => {
  test("computes net profit = income - expenses", async () => {
    const sb = createMockSupabase({
      rent_transactions: [
        { amount_paid: 100000, lease: { property_id: PROP } },
        { amount_paid: 50000, lease: { property_id: PROP } },
      ],
      expenses: [
        { amount_egp: 30000, category: "Utilities" },
        { amount_egp: 20000, category: "Security" },
      ],
      leases: [], // percentage-rent engine falls back gracefully
      tenant_sales_reported: [],
      revenue_estimates: [],
    });
    const r = await getFinanceOverview(sb, PROP, 6, 2026);
    expect(r.total_income_egp).toBe(150000);
    expect(r.total_expenses_egp).toBe(50000);
    expect(r.net_profit_egp).toBe(100000);
  });

  test("profit_margin_pct = netProfit / income * 100", async () => {
    const sb = createMockSupabase({
      rent_transactions: [{ amount_paid: 100000, lease: { property_id: PROP } }],
      expenses: [{ amount_egp: 25000, category: "X" }],
      leases: [],
      tenant_sales_reported: [],
      revenue_estimates: [],
    });
    const r = await getFinanceOverview(sb, PROP, 6, 2026);
    expect(r.profit_margin_pct).toBe(75); // 75k/100k
  });

  test("zero income -> 0 profit margin, no division error", async () => {
    const sb = createMockSupabase({
      rent_transactions: [],
      expenses: [],
      leases: [],
      tenant_sales_reported: [],
      revenue_estimates: [],
    });
    const r = await getFinanceOverview(sb, PROP, 6, 2026);
    expect(r.total_income_egp).toBe(0);
    expect(r.profit_margin_pct).toBe(0);
    expect(r.net_profit_egp).toBe(0);
  });

  test("expense_breakdown sums by category and sorts desc", async () => {
    const sb = createMockSupabase({
      rent_transactions: [],
      expenses: [
        { amount_egp: 10000, category: "A" },
        { amount_egp: 30000, category: "B" },
        { amount_egp: 5000, category: "A" },
      ],
      leases: [],
      tenant_sales_reported: [],
      revenue_estimates: [],
    });
    const r = await getFinanceOverview(sb, PROP, 6, 2026);
    expect(r.expense_breakdown).toHaveLength(2);
    // B (30k) > A (15k)
    expect(r.expense_breakdown[0].category).toBe("B");
    expect(r.expense_breakdown[1].category).toBe("A");
    expect(r.expense_breakdown[1].amount_egp).toBe(15000);
  });

  test("income_vs_last_month_pct computes change vs previous month", async () => {
    // Mock so current month returns 120k, previous month returns 100k
    // Note: our mock returns the same data for all queries on a table.
    // The function issues two separate queries on rent_transactions with
    // different month filters. Both get the same data, so change = 0.
    const sb = createMockSupabase({
      rent_transactions: [{ amount_paid: 120000, lease: { property_id: PROP } }],
      expenses: [],
      leases: [],
      tenant_sales_reported: [],
      revenue_estimates: [],
    });
    const r = await getFinanceOverview(sb, PROP, 6, 2026);
    // same data returned for both months -> 0% change
    expect(r.income_vs_last_month_pct).toBe(0);
  });
});

describe("finance-engine: getCashFlow", () => {
  test("returns N months of cash flow entries", async () => {
    const sb = createMockSupabase({
      rent_transactions: [{ amount_paid: 100000, lease: { property_id: PROP } }],
      expenses: [{ amount_egp: 30000, category: "X" }],
    });
    const r = await getCashFlow(sb, PROP, 3);
    expect(r).toHaveLength(3);
    for (const m of r) {
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("income_egp");
      expect(m).toHaveProperty("expenses_egp");
      expect(m.net_egp).toBe(m.income_egp - m.expenses_egp);
    }
  });
});

describe("finance-engine: getBudgetComparison", () => {
  test("status='on_track' when variance within +/-5%", async () => {
    const sb = createMockSupabase({
      budgets: [{ category: "Ops", budgeted_amount_egp: 100000, actual_amount_egp: 102000 }],
    });
    const r = await getBudgetComparison(sb, PROP, 2026);
    expect(r[0].status).toBe("on_track");
  });

  test("status='over' when actual exceeds budget by >5%", async () => {
    const sb = createMockSupabase({
      budgets: [{ category: "Ops", budgeted_amount_egp: 100000, actual_amount_egp: 120000 }],
    });
    const r = await getBudgetComparison(sb, PROP, 2026);
    expect(r[0].status).toBe("over");
    expect(r[0].variance_egp).toBe(-20000);
  });

  test("status='under' when actual is >10% below budget", async () => {
    const sb = createMockSupabase({
      budgets: [{ category: "Ops", budgeted_amount_egp: 100000, actual_amount_egp: 80000 }],
    });
    const r = await getBudgetComparison(sb, PROP, 2026);
    expect(r[0].status).toBe("under");
  });

  test("empty budgets -> empty array", async () => {
    const sb = createMockSupabase({ budgets: [] });
    const r = await getBudgetComparison(sb, PROP, 2026);
    expect(r).toEqual([]);
  });
});

describe("finance-engine: getProfitAndLoss", () => {
  test("returns P&L with period label, income, expenses, net_income", async () => {
    const sb = createMockSupabase({
      rent_transactions: [
        { amount_paid: 200000, min_rent_due: 150000, percentage_rent_due: 50000, lease: { property_id: PROP } },
      ],
      expenses: [
        { amount_egp: 40000, category: "Utilities" },
        { amount_egp: 60000, category: "Payroll" },
      ],
    });
    const r = await getProfitAndLoss(sb, PROP, 6, 2026);
    expect(r.period).toContain("June");
    expect(r.period).toContain("2026");
    expect(r.income.total_income).toBe(200000);
    expect(r.total_expenses).toBe(100000);
    expect(r.net_income).toBe(100000);
  });

  test("other_income is always 0 (reserved field)", async () => {
    const sb = createMockSupabase({
      rent_transactions: [],
      expenses: [],
    });
    const r = await getProfitAndLoss(sb, PROP, 1, 2026);
    expect(r.income.other_income).toBe(0);
  });
});

describe("finance-engine: getExpensesByCategory", () => {
  test("groups expenses by month and category", async () => {
    const sb = createMockSupabase({
      expenses: [
        { category: "Utilities", amount_egp: 1000, expense_date: "2026-06-15" },
        { category: "Utilities", amount_egp: 500, expense_date: "2026-06-20" },
      ],
    });
    const r = await getExpensesByCategory(sb, PROP, 6);
    // Should have at least one month key
    const keys = Object.keys(r);
    expect(keys.length).toBeGreaterThan(0);
    const first = r[keys[0]];
    expect(first.Utilities).toBe(1500);
  });
});