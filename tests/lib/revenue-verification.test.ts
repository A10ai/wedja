/**
 * Behaviour of the revenue verification run (the "revenue protector").
 * Uses a small in-memory fake of the Supabase query builder that applies
 * filters, ranges and deletes for real, so the tests exercise the actual
 * queries runRevenueVerification makes.
 */
import { describe, test, expect, afterEach } from "vitest";
import {
  assessLease,
  rentAtRisk,
  rentDue,
  runRevenueVerification,
  getVerificationReport,
  getDiscrepancySummary,
  estimateRevenue,
  MIN_FOOTFALL_COVERAGE,
} from "@/lib/revenue-engine";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const db: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(tables)) db[k] = v.map((r) => ({ ...r }));
  const inserts: Record<string, Row[]> = {};

  function from(table: string) {
    db[table] ??= [];
    const preds: ((r: Row) => boolean)[] = [];
    let range: [number, number] | null = null;
    let op: "select" | "delete" = "select";
    const run = () => {
      const matched = db[table].filter((r) => preds.every((p) => p(r)));
      if (op === "delete") {
        db[table] = db[table].filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      const page = range ? matched.slice(range[0], range[1] + 1) : matched.slice(0, 1000);
      return { data: page, error: null };
    };
    const chain: any = {
      select: () => chain,
      delete: () => ((op = "delete"), chain),
      eq: (c: string, v: any) => (preds.push((r) => r[c] === v), chain),
      neq: (c: string, v: any) => (preds.push((r) => r[c] !== v), chain),
      gt: (c: string, v: any) => (preds.push((r) => r[c] > v), chain),
      gte: (c: string, v: any) => (preds.push((r) => r[c] >= v), chain),
      lt: (c: string, v: any) => (preds.push((r) => r[c] < v), chain),
      in: (c: string, v: any[]) => (preds.push((r) => v.includes(r[c])), chain),
      order: () => chain,
      range: (a: number, b: number) => ((range = [a, b]), chain),
      insert: (row: Row) => {
        (inserts[table] ??= []).push(row);
        db[table].push({ id: `${table}-${db[table].length}`, ...row });
        return Promise.resolve({ data: null, error: null });
      },
      then: (ok: any, err: any) => Promise.resolve(run()).then(ok, err),
    };
    return chain;
  }
  return { client: { from } as any, db, inserts };
}

const PROPERTY = "prop-1";
const MONTH = 9;
const YEAR = 2026; // September: 30 days

function lease(id: string, tenant: string, unit: string, opts: Partial<Row> = {}): Row {
  return {
    id,
    unit_id: unit,
    tenant_id: tenant,
    property_id: PROPERTY,
    status: "active",
    min_rent_monthly_egp: 50_000,
    percentage_rate: 10,
    tenants: { id: tenant, name: tenant, brand_name: tenant, category: "fashion" },
    units: { id: unit, unit_number: unit.toUpperCase() },
    ...opts,
  };
}

/** Daily footfall rows for a unit: `days` days of `perDay` visitors. */
function footfall(unit: string, perDay: number, days = 30, startDay = 1): Row[] {
  return Array.from({ length: days }, (_, i) => ({
    id: `${unit}-${startDay + i}`,
    unit_id: unit,
    date: `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(startDay + i).padStart(2, "0")}`,
    total_in: perDay,
  }));
}

function sales(leaseId: string | null, tenant: string, amount: number): Row {
  return { lease_id: leaseId, tenant_id: tenant, period_month: MONTH, period_year: YEAR, reported_revenue_egp: amount };
}

// Fashion, 500/day × 30 days = 15,000 visitors.
// low = 15,000 × 0.15 × 300 = 675,000; mid ≈ 1,423,025; high = 3,000,000
const LOW = 675_000;

afterEach(() => {
  delete process.env.REVENUE_USE_LEARNED_RATES;
});

describe("rent arithmetic", () => {
  test("rentDue is the higher of minimum rent and percentage of sales", () => {
    expect(rentDue(50_000, 10, 300_000)).toBe(50_000);
    expect(rentDue(50_000, 10, 900_000)).toBe(90_000);
  });

  test("rentAtRisk is zero when minimum rent covers both figures", () => {
    // 10% of 1.42M = 142k < 150k minimum → nothing to recover
    expect(rentAtRisk(150_000, 10, 1_380_000, 1_423_025)).toBe(0);
  });

  test("rentAtRisk is the rent gap, not the sales gap", () => {
    expect(rentAtRisk(50_000, 10, 600_000, 900_000)).toBe(30_000);
  });

  test("rentAtRisk counts only the part above minimum rent", () => {
    // reported → min rent 50k; estimate → 70k
    expect(rentAtRisk(50_000, 10, 300_000, 700_000)).toBe(20_000);
  });

  test("leases without a percentage clause have nothing at risk", () => {
    expect(rentAtRisk(50_000, 0, 100_000, 900_000)).toBe(0);
  });
});

describe("assessLease", () => {
  const base = { footfall: 15_000, footfallDays: 30, periodDays: 30, category: "fashion", minRent: 50_000, percentageRate: 10 };

  test("an honest tenant just below the midpoint is NOT flagged", () => {
    const a = assessLease({ ...base, reportedRevenue: 1_380_334 });
    expect(a.status).toBe("ok");
    expect(a.variance_egp).toBeGreaterThan(0); // still shown for information
    expect(a.rent_at_risk_egp).toBe(0);
  });

  test("a report below the conservative estimate is flagged with the rent at stake", () => {
    const a = assessLease({ ...base, reportedRevenue: 500_000 });
    expect(a.estimate.low_egp).toBe(LOW);
    expect(a.status).toBe("flagged");
    expect(a.rent_at_risk_egp).toBe(rentAtRisk(50_000, 10, 500_000, LOW)); // 17,500
  });

  test("no report → missing_report, never ok", () => {
    expect(assessLease({ ...base, reportedRevenue: null }).status).toBe("missing_report");
  });

  test(`footfall coverage below ${MIN_FOOTFALL_COVERAGE * 100}% is not judged either way`, () => {
    const a = assessLease({ ...base, footfall: 5_000, footfallDays: 10, reportedRevenue: 1 });
    expect(a.status).toBe("insufficient_data");
    expect(a.rent_at_risk_egp).toBe(0);
  });

  test("zero footfall is insufficient data, not a free pass", () => {
    expect(assessLease({ ...base, footfall: 0, footfallDays: 0, reportedRevenue: 1 }).status).toBe(
      "insufficient_data"
    );
  });

  test("coverage is capped at 100%", () => {
    expect(assessLease({ ...base, footfallDays: 31, reportedRevenue: 2_000_000 }).coverage).toBe(1);
  });
});

describe("runRevenueVerification", () => {
  test("flags only reports below the conservative estimate and stores the evidence", async () => {
    const { client, inserts } = fakeSupabase({
      leases: [lease("L1", "honest", "u1"), lease("L2", "cheat", "u2")],
      footfall_daily: [...footfall("u1", 500), ...footfall("u2", 500)],
      tenant_sales_reported: [sales("L1", "honest", 1_380_334), sales("L2", "cheat", 500_000)],
      discrepancies: [],
    });
    const run = await runRevenueVerification(client, PROPERTY, MONTH, YEAR);
    const byTenant = Object.fromEntries(run.results.map((r) => [r.tenant_id, r]));
    expect(byTenant.honest.status).toBe("ok");
    expect(byTenant.cheat.status).toBe("flagged");
    expect(run.total_discrepancies).toBe(1);

    const [d] = inserts.discrepancies;
    expect(d).toMatchObject({
      tenant_id: "cheat",
      estimated_low_egp: LOW,
      rent_at_risk_egp: 17_500,
      footfall_coverage: 1,
      model_version: "1.1.0",
      status: "flagged",
    });
    expect(d.reasoning).toMatch(/below the conservative estimate/);
    expect(d.reasoning).toMatch(/not as proof/);
  });

  test("reads all footfall rows past PostgREST's 1000-row page", async () => {
    // 40 units × 30 days = 1,200 rows. The last units would be missing
    // without paging and get a too-low estimate.
    const leases = Array.from({ length: 40 }, (_, i) => lease(`L${i}`, `t${i}`, `u${i}`));
    const { client } = fakeSupabase({
      leases,
      footfall_daily: leases.flatMap((l) => footfall(l.unit_id, 500)),
      tenant_sales_reported: leases.map((l) => sales(l.id, l.tenant_id, 1_000_000)),
      discrepancies: [],
    });
    const run = await runRevenueVerification(client, PROPERTY, MONTH, YEAR);
    expect(run.results.every((r) => r.footfall === 15_000)).toBe(true);
    expect(run.results.every((r) => r.status === "ok")).toBe(true);
  });

  test("duplicate footfall rows for the same day are not double counted", async () => {
    const dupes = footfall("u1", 500).map((r) => ({ ...r, id: `${r.id}-dup` }));
    const { client } = fakeSupabase({
      leases: [lease("L1", "honest", "u1")],
      footfall_daily: [...footfall("u1", 500), ...dupes],
      tenant_sales_reported: [sales("L1", "honest", 900_000)],
      discrepancies: [],
    });
    const [r] = (await runRevenueVerification(client, PROPERTY, MONTH, YEAR)).results;
    expect(r.footfall).toBe(15_000);
    expect(r.status).toBe("ok");
  });

  test("a camera outage does not clear an underreporter: it is marked insufficient data", async () => {
    const { client, inserts } = fakeSupabase({
      leases: [lease("L1", "cheat", "u1")],
      footfall_daily: footfall("u1", 500, 10),
      tenant_sales_reported: [sales("L1", "cheat", 1)],
      discrepancies: [],
    });
    const [r] = (await runRevenueVerification(client, PROPERTY, MONTH, YEAR)).results;
    expect(r.status).toBe("insufficient_data");
    expect(r.footfall_coverage).toBeCloseTo(10 / 30, 3);
    expect(inserts.discrepancies).toBeUndefined();
  });

  test("a tenant with two units is judged per lease, not against the other unit's sales", async () => {
    const { client } = fakeSupabase({
      leases: [lease("L1", "multi", "u1"), lease("L2", "multi", "u2")],
      footfall_daily: [...footfall("u1", 500), ...footfall("u2", 100)],
      tenant_sales_reported: [sales("L1", "multi", 1_400_000), sales("L2", "multi", 280_000)],
      discrepancies: [],
    });
    const results = (await runRevenueVerification(client, PROPERTY, MONTH, YEAR)).results;
    expect(results.map((r) => r.status)).toEqual(["ok", "ok"]);
  });

  test("sales rows without lease_id are ignored for multi-unit tenants instead of being guessed", async () => {
    const { client } = fakeSupabase({
      leases: [lease("L1", "multi", "u1"), lease("L2", "multi", "u2")],
      footfall_daily: [...footfall("u1", 500), ...footfall("u2", 500)],
      tenant_sales_reported: [sales(null, "multi", 100)],
      discrepancies: [],
    });
    const results = (await runRevenueVerification(client, PROPERTY, MONTH, YEAR)).results;
    expect(results.map((r) => r.status)).toEqual(["missing_report", "missing_report"]);
  });

  test("re-running keeps a dismissed discrepancy and its notes", async () => {
    const dismissed = {
      id: "d-1",
      unit_id: "u1",
      tenant_id: "cheat",
      period_month: MONTH,
      period_year: YEAR,
      status: "dismissed",
      resolution_notes: "Audited POS on 2026-10-10: figures match",
    };
    const { client, db, inserts } = fakeSupabase({
      leases: [lease("L1", "cheat", "u1")],
      footfall_daily: footfall("u1", 500),
      tenant_sales_reported: [sales("L1", "cheat", 500_000)],
      discrepancies: [dismissed],
    });
    const [r] = (await runRevenueVerification(client, PROPERTY, MONTH, YEAR)).results;
    expect(r.status).toBe("dismissed");
    expect(inserts.discrepancies).toBeUndefined();
    expect(db.discrepancies).toEqual([dismissed]);
  });

  test("re-running replaces stale machine flags", async () => {
    const { client, db } = fakeSupabase({
      leases: [lease("L1", "honest", "u1")],
      footfall_daily: footfall("u1", 500),
      tenant_sales_reported: [sales("L1", "honest", 1_380_334)],
      discrepancies: [{ id: "old", unit_id: "u1", tenant_id: "honest", period_month: MONTH, period_year: YEAR, status: "flagged" }],
    });
    await runRevenueVerification(client, PROPERTY, MONTH, YEAR);
    expect(db.discrepancies).toEqual([]);
  });

  test("learned conversion rates are ignored unless explicitly enabled", async () => {
    const tables = {
      leases: [lease("L1", "cheat", "u1")],
      footfall_daily: footfall("u1", 500),
      tenant_sales_reported: [sales("L1", "cheat", 500_000)],
      discrepancies: [],
      // learned from the cheat's own low reports
      ai_learned_params: [{ entity_id: "cheat", learned_value: 0.05, confidence: 90, property_id: PROPERTY, param_type: "conversion_rate", param_key: "conversion_rate" }],
    };
    const off = await runRevenueVerification(fakeSupabase(tables).client, PROPERTY, MONTH, YEAR);
    expect(off.results[0].methodology).toMatch(/category default/);
    expect(off.results[0].estimated_mid_egp).toBe(estimateRevenue(15_000, "fashion", 30).mid_egp);

    process.env.REVENUE_USE_LEARNED_RATES = "true";
    const on = await runRevenueVerification(fakeSupabase(tables).client, PROPERTY, MONTH, YEAR);
    expect(on.results[0].methodology).toMatch(/AI learned/);
  });
});

describe("summary and report agree with the run", () => {
  const tables = () => ({
    leases: [lease("L1", "honest", "u1"), lease("L2", "cheat", "u2"), lease("L3", "big-min", "u3", { min_rent_monthly_egp: 150_000 })],
    footfall_daily: [...footfall("u1", 500), ...footfall("u2", 500), ...footfall("u3", 500)],
    tenant_sales_reported: [sales("L1", "honest", 1_380_334), sales("L2", "cheat", 500_000), sales("L3", "big-min", 600_000)],
    discrepancies: [],
    units: [{ id: "u1", property_id: PROPERTY }, { id: "u2", property_id: PROPERTY }, { id: "u3", property_id: PROPERTY }],
  });

  test("potential recovery is rent at risk, excluding cases covered by minimum rent", async () => {
    const { client, db } = fakeSupabase(tables());
    await runRevenueVerification(client, PROPERTY, MONTH, YEAR);
    // both cheat and big-min are below the low estimate…
    expect(db.discrepancies.map((d) => d.tenant_id).sort()).toEqual(["big-min", "cheat"]);
    // …but big-min's minimum rent (150k) exceeds 10% of the estimate (67.5k)
    const summaryRows = db.discrepancies.map((d) => ({ ...d, tenants: { name: d.tenant_id }, units: { unit_number: d.unit_id } }));
    const summary = await getDiscrepancySummary(fakeSupabase({ ...tables(), discrepancies: summaryRows }).client, PROPERTY, MONTH, YEAR);
    expect(summary.total_potential_recovery_egp).toBe(17_500);
  });

  test("closed cases do not count toward potential recovery", async () => {
    const rows = [
      { unit_id: "u2", tenant_id: "cheat", period_month: MONTH, period_year: YEAR, status: "resolved", rent_at_risk_egp: 17_500, tenants: {}, units: {} },
      { unit_id: "u2", tenant_id: "cheat", period_month: MONTH, period_year: YEAR, status: "investigating", rent_at_risk_egp: 5_000, tenants: {}, units: {} },
    ];
    const summary = await getDiscrepancySummary(fakeSupabase({ ...tables(), discrepancies: rows }).client, PROPERTY, MONTH, YEAR);
    expect(summary.total_potential_recovery_egp).toBe(5_000);
  });

  test("the report uses the same rule as the run", async () => {
    const { client } = fakeSupabase(tables());
    const run = await runRevenueVerification(client, PROPERTY, MONTH, YEAR);
    const report = await getVerificationReport(client, PROPERTY, MONTH, YEAR);
    const statuses = (rs: { tenant_id: string; status: string }[]) =>
      Object.fromEntries(rs.map((r) => [r.tenant_id, r.status]));
    expect(statuses(report.tenants)).toEqual(statuses(run.results));
    expect(report.summary.total_discrepancies).toBe(2);
    expect(report.summary.potential_recovery_egp).toBe(17_500);
  });
});
