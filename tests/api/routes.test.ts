// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createMockSupabase } from "../lib/helpers/supabase-mock";

const state = vi.hoisted(() => ({ supabase: null as unknown, forecastArgs: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ requireAuth: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.supabase }));
vi.mock("@/lib/prediction-model", () => ({
  forecastFootfall: async (_s: unknown, days: number) => {
    state.forecastArgs.push(days);
    return { days };
  },
  forecastRevenue: async (_s: unknown, months: number) => {
    state.forecastArgs.push(months);
    return { months };
  },
  getModelPerformance: async () => ({}),
}));

import { POST as importPOST } from "@/app/api/v1/import/route";
import { GET as tenantsGET } from "@/app/api/v1/tenants/route";
import { GET as predictionsGET } from "@/app/api/v1/ai/predictions/route";
import { GET as eventsGET } from "@/app/api/v1/ai/events/route";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mock = ReturnType<typeof createMockSupabase>;
const mock = () => state.supabase as Mock;
let payloads: { table: string; row: any }[] = [];
let updates: { table: string; row: any }[] = [];
/** Inserted rows for a table (bulk inserts are flattened to one entry per row). */
const inserts = (table: string) =>
  payloads.filter((p) => p.table === table).flatMap((p) => (Array.isArray(p.row) ? p.row : [p.row]));
const updatesTo = (table: string) => updates.filter((p) => p.table === table).map((p) => p.row);

/** Wrap the mock so full insert/update payloads are captured (the helper truncates its log). */
function withInsertCapture(m: Mock): Mock {
  const from = m.from;
  m.from = (table: string) => {
    const chain = from(table);
    const insert = chain.insert;
    chain.insert = (row: any) => {
      payloads.push({ table, row });
      return insert(row);
    };
    const update = chain.update;
    chain.update = (row: any) => {
      updates.push({ table, row });
      return update(row);
    };
    return chain;
  };
  return m;
}

/** Turn captured inserts into "existing rows" for a second import run. */
const asStored = (rows: any[]) =>
  rows.map((r, i) => ({ id: `existing-${i + 1}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`, ...r }));

function jdeWorkbook(rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet([
    ["JDE Revenue Report"],
    [""],
    ["Customer Number", "Customer Name", "2026-01-01", "2026-02-01", "x", "Total"],
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ALL Category");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function upload(type: string, name: string, content: BlobPart) {
  const form = new FormData();
  form.append("type", type);
  form.append("file", new File([content], name));
  return new NextRequest("http://localhost/api/v1/import", { method: "POST", body: form });
}

beforeEach(() => {
  payloads = [];
  updates = [];
  state.supabase = withInsertCapture(createMockSupabase());
  state.forecastArgs = [];
});

describe("POST /api/v1/import", () => {
  test("400 without a file", async () => {
    const form = new FormData();
    form.append("type", "sales");
    const res = await importPOST(new NextRequest("http://localhost/x", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });

  test("400 for an unknown import type", async () => {
    const res = await importPOST(upload("payroll", "a.csv", "a,b\n1,2"));
    expect(res.status).toBe(400);
  });

  test("400 for unsupported file extensions", async () => {
    const res = await importPOST(upload("sales", "a.txt", "a,b\n1,2"));
    expect(res.status).toBe(400);
  });

  test("400 for a header-only CSV", async () => {
    const res = await importPOST(upload("sales", "a.csv", "lease_id,tenant_id"));
    expect(res.status).toBe(400);
  });

  test("sales: valid rows imported, invalid months / revenue rejected with row numbers", async () => {
    const csv = [
      "lease_id,tenant_id,period_month,period_year,reported_revenue_egp",
      "L1,T1,3,2026,\"1,250,000\"", // row 2 ok
      "L1,T1,13,2026,5000", // row 3 bad month
      "L1,T1,0,2026,5000", // row 4 bad month
      "L1,T1,4,2026,abc", // row 5 NaN revenue
      "L1,T1,5,2026,-10", // row 6 negative revenue
      "L1,T1,6,26,100", // row 7 two-digit year
    ].join("\r\n");
    const res = await importPOST(upload("sales", "sales.csv", csv));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(body.errors.map((e: string) => e.split(":")[0])).toEqual([
      "Row 3",
      "Row 4",
      "Row 5",
      "Row 6",
      "Row 7",
    ]);
    const sent = inserts("tenant_sales_reported");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ period_month: 3, period_year: 2026, reported_revenue_egp: 1250000 });
  });

  test("rent: rejects NaN amounts instead of inserting them", async () => {
    const csv = "lease_id,period_month,period_year,amount_due,amount_paid\nL1,1,2026,10000,10000\nL1,2,2026,n/a,0";
    const body = await (await importPOST(upload("rent", "rent.csv", csv))).json();
    expect(body.imported).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/^Row 3: Invalid amount/);
    expect(inserts("rent_transactions").every((r) => Number.isFinite(r.amount_due))).toBe(true);
  });

  test("tenants: missing name/category reported, others imported", async () => {
    const csv = "name,category,brand\nAdidas,fashion,Adidas\n,food,Nameless";
    const body = await (await importPOST(upload("tenants", "t.csv", csv))).json();
    expect(body.imported).toBe(1);
    expect(body.errors[0]).toMatch(/^Row 3/);
  });

  test("Excel upload goes through the same validation", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Lease ID", "Tenant ID", "Period Month", "Period Year", "Reported Revenue EGP"],
      ["L1", "T1", 3, 2026, 50000],
      ["L1", "T1", 14, 2026, 50000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const body = await (await importPOST(upload("sales", "sales.xlsx", buf))).json();
    expect(body.imported).toBe(1);
    expect(body.errors).toHaveLength(1);
  });

  test("jde_revenue requires Excel", async () => {
    const res = await importPOST(upload("jde_revenue", "jde.csv", "a,b\n1,2"));
    expect(res.status).toBe(400);
  });

  test("jde_revenue does not book unrelated customers to short-named tenants", async () => {
    state.supabase = withInsertCapture(createMockSupabase({
      tenants: [
        { id: "t-hm", brand_name: "H&M", name: "H&M" },
        { id: "t-adidas", brand_name: "Adidas", name: "Adidas" },
      ],
      leases: [
        { id: "l-hm", tenant_id: "t-hm" },
        { id: "l-adidas", tenant_id: "t-adidas" },
      ],
    }));
    const ws = XLSX.utils.aoa_to_sheet([
      ["JDE Revenue Report"],
      [""],
      ["Customer Number", "Customer Name", "2026-01-01", "2026-02-01", "x", "Total"],
      ["1001", "Adidas Egypt SAE", "100,000", "0", "", "100000"],
      ["1002", "Mohammed Ahmed Trading", "55,000", "60,000", "", "115000"],
      ["", "Grand Total", "155,000", "60,000", "", "215000"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ALL Category");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const body = await (await importPOST(upload("jde_revenue", "jde.xlsx", buf))).json();
    expect(body).toMatchObject({ total_rows: 2, matched: 1, unmatched: 1, imported: 1 });
    const sent = inserts("rent_transactions");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ lease_id: "l-adidas", period_month: 1, period_year: 2026, amount_due: 100000 });
  });

  describe("re-import idempotency", () => {
    const rentCsv = [
      "lease_id,period_month,period_year,amount_due,amount_paid,status",
      "L1,1,2026,10000,10000,paid",
      "L1,2,2026,10000,0,overdue",
      "L2,1,2026,5000,5000,paid",
    ].join("\n");

    test("rent: importing the same CSV twice inserts nothing the second time", async () => {
      const first = await (await importPOST(upload("rent", "rent.csv", rentCsv))).json();
      expect(first).toMatchObject({ imported: 3, updated: 0, skipped: 0, rows_imported: 3 });
      const stored = asStored(inserts("rent_transactions"));
      expect(stored).toHaveLength(3);
      expect(stored.every((r) => r.source === "csv_import")).toBe(true);

      payloads = [];
      state.supabase = withInsertCapture(createMockSupabase({ rent_transactions: stored }));
      const second = await (await importPOST(upload("rent", "rent.csv", rentCsv))).json();
      expect(second).toMatchObject({ imported: 0, updated: 0, skipped: 3, errors: [] });
      expect(inserts("rent_transactions")).toHaveLength(0);
      expect(updatesTo("rent_transactions")).toHaveLength(0);
    });

    test("rent: one existence query per batch, using .in() on lease ids", async () => {
      await importPOST(upload("rent", "rent.csv", rentCsv));
      const lookups = mock()._calls.filter(
        (c: any) => c.table === "rent_transactions" && c.filters.some((f: string) => f.startsWith("in("))
      );
      expect(lookups).toHaveLength(1);
      expect(lookups[0].filters).toContain('in("lease_id", ["L1","L2"])');
    });

    test("rent: a changed row updates the existing record instead of inserting", async () => {
      const stored = asStored([
        { lease_id: "L1", period_month: 1, period_year: 2026, min_rent_due: 0, percentage_rent_due: 0,
          amount_due: "10000.00", amount_paid: "0.00", payment_date: null, payment_method: null, status: "overdue" },
      ]);
      state.supabase = withInsertCapture(createMockSupabase({ rent_transactions: stored }));
      const body = await (await importPOST(upload("rent", "rent.csv",
        "lease_id,period_month,period_year,amount_due,amount_paid,status\nL1,1,2026,10000,10000,paid"))).json();
      expect(body).toMatchObject({ imported: 0, updated: 1, skipped: 0 });
      expect(inserts("rent_transactions")).toHaveLength(0);
      expect(updatesTo("rent_transactions")).toEqual([{ amount_paid: 10000, status: "paid" }]);
      const updateCall = mock()._calls.find((c: any) => c.filters.some((f: string) => f.startsWith("update(")));
      expect(updateCall.filters).toContain('eq("id", "existing-1")');
    });

    test("rent: manual rows do not overwrite JDE-imported rows for the same period", async () => {
      const stored = asStored([
        { lease_id: "L1", period_month: 1, period_year: 2026, amount_due: 99, amount_paid: 99, status: "paid", source: "jde_import" },
      ]);
      state.supabase = withInsertCapture(createMockSupabase({ rent_transactions: stored }));
      const body = await (await importPOST(upload("rent", "rent.csv",
        "lease_id,period_month,period_year,amount_due\nL1,1,2026,10000"))).json();
      expect(body).toMatchObject({ imported: 1, updated: 0 });
      expect(updatesTo("rent_transactions")).toHaveLength(0);
    });

    test("rent: duplicate rows within one file are inserted once (last row wins)", async () => {
      const body = await (await importPOST(upload("rent", "rent.csv",
        "lease_id,period_month,period_year,amount_due\nL1,1,2026,100\nL1,1,2026,200"))).json();
      expect(body).toMatchObject({ imported: 1, skipped: 1 });
      expect(body.warnings[0]).toMatch(/^Row 2: same lease and period as Row 3/);
      expect(inserts("rent_transactions")).toEqual([expect.objectContaining({ amount_due: 200 })]);
    });

    test("rent: a failed existence check imports nothing (no blind inserts)", async () => {
      state.supabase = withInsertCapture(
        createMockSupabase({}, { errors: { rent_transactions: { message: "timeout" } } })
      );
      const body = await (await importPOST(upload("rent", "rent.csv", rentCsv))).json();
      expect(body.imported).toBe(0);
      expect(body.errors).toHaveLength(3);
      expect(body.errors[0]).toMatch(/could not check for an existing row/);
      expect(inserts("rent_transactions")).toHaveLength(0);
    });

    test("sales: importing the same CSV twice does not duplicate tenant_sales_reported", async () => {
      const csv = [
        "lease_id,tenant_id,period_month,period_year,reported_revenue_egp",
        "L1,T1,3,2026,\"1,250,000\"",
        "L1,T1,4,2026,900000",
      ].join("\n");
      const first = await (await importPOST(upload("sales", "sales.csv", csv))).json();
      expect(first).toMatchObject({ imported: 2, updated: 0, skipped: 0 });

      const stored = asStored(inserts("tenant_sales_reported")).map((r) => ({
        ...r,
        reported_revenue_egp: String(r.reported_revenue_egp), // NUMERIC may come back as a string
      }));
      payloads = [];
      state.supabase = withInsertCapture(createMockSupabase({ tenant_sales_reported: stored }));
      const second = await (await importPOST(upload("sales", "sales.csv", csv))).json();
      expect(second).toMatchObject({ imported: 0, updated: 0, skipped: 2 });
      expect(inserts("tenant_sales_reported")).toHaveLength(0);
    });

    test("sales: a corrected figure updates the row and resets verification", async () => {
      const stored = asStored([
        { lease_id: "L1", tenant_id: "T1", period_month: 3, period_year: 2026, reported_revenue_egp: 1000, verified: true },
      ]);
      state.supabase = withInsertCapture(createMockSupabase({ tenant_sales_reported: stored }));
      const body = await (await importPOST(upload("sales", "sales.csv",
        "lease_id,tenant_id,period_month,period_year,reported_revenue_egp\nL1,T1,3,2026,1500"))).json();
      expect(body).toMatchObject({ imported: 0, updated: 1 });
      expect(updatesTo("tenant_sales_reported")[0]).toMatchObject({ reported_revenue_egp: 1500, verified: false });
    });

    test("sales: re-importing the same xlsx does not create duplicates", async () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["Lease ID", "Tenant ID", "Period Month", "Period Year", "Reported Revenue EGP"],
        ["L1", "T1", 3, 2026, 50000],
        ["L2", "T2", 3, 2026, 70000],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      await importPOST(upload("sales", "sales.xlsx", buf));
      const stored = asStored(inserts("tenant_sales_reported"));
      expect(stored).toHaveLength(2);

      payloads = [];
      state.supabase = withInsertCapture(createMockSupabase({ tenant_sales_reported: stored }));
      const body = await (await importPOST(upload("sales", "sales.xlsx", buf))).json();
      expect(body).toMatchObject({ imported: 0, skipped: 2 });
      expect(inserts("tenant_sales_reported")).toHaveLength(0);
    });

    test("jde_revenue: re-importing the same workbook does not duplicate rent_transactions", async () => {
      const ref = {
        tenants: [{ id: "t-adidas", brand_name: "Adidas", name: "Adidas" }],
        leases: [{ id: "l-adidas", tenant_id: "t-adidas" }],
      };
      const buf = jdeWorkbook([["1001", "Adidas Egypt SAE", "100,000", "80,000", "", "180000"]]);
      state.supabase = withInsertCapture(createMockSupabase(ref));
      const first = await (await importPOST(upload("jde_revenue", "jde.xlsx", buf))).json();
      expect(first).toMatchObject({ imported: 2, updated: 0, skipped: 0 });
      const stored = asStored(inserts("rent_transactions"));
      expect(stored.every((r) => r.source === "jde_import")).toBe(true);

      payloads = [];
      state.supabase = withInsertCapture(createMockSupabase({ ...ref, rent_transactions: stored }));
      const second = await (await importPOST(upload("jde_revenue", "jde.xlsx", buf))).json();
      expect(second).toMatchObject({ imported: 0, updated: 0, skipped: 2 });
      expect(inserts("rent_transactions")).toHaveLength(0);
    });

    test("jde_revenue: matches legacy rows marked via payment_method and updates changed amounts", async () => {
      const ref = {
        tenants: [{ id: "t-adidas", brand_name: "Adidas", name: "Adidas" }],
        leases: [{ id: "l-adidas", tenant_id: "t-adidas" }],
        rent_transactions: asStored([
          { lease_id: "l-adidas", period_month: 1, period_year: 2026, amount_due: 90000, amount_paid: 90000,
            status: "paid", payment_method: "jde_import", source: null },
        ]),
      };
      state.supabase = withInsertCapture(createMockSupabase(ref));
      const buf = jdeWorkbook([["1001", "Adidas Egypt SAE", "100,000", "0", "", "100000"]]);
      const body = await (await importPOST(upload("jde_revenue", "jde.xlsx", buf))).json();
      expect(body).toMatchObject({ imported: 0, updated: 1 });
      expect(updatesTo("rent_transactions")).toEqual([{ amount_due: 100000, amount_paid: 100000 }]);
    });
  });
});

describe("GET /api/v1/tenants search", () => {
  test("strips PostgREST filter syntax from the search term", async () => {
    await tenantsGET(new NextRequest("http://localhost/api/v1/tenants?search=" + encodeURIComponent("x%,status.eq.inactive)")));
    const or = mock()._calls[0].filters.find((f: string) => f.startsWith("or("));
    expect(or).toBeDefined();
    // Exactly three conditions — the injected one must not become a fourth
    expect(JSON.parse(or!.slice(3, -1)).split(",")).toHaveLength(3);
  });

  test("a search of only special characters applies no filter", async () => {
    await tenantsGET(new NextRequest("http://localhost/api/v1/tenants?search=%25%2C()"));
    expect(mock()._calls[0].filters.some((f: string) => f.startsWith("or("))).toBe(false);
  });

  test("returns active_lease and drops the leases array", async () => {
    state.supabase = createMockSupabase({
      tenants: [{ id: "t1", leases: [{ status: "expired" }, { status: "active", id: "l2" }] }],
    });
    const body = await (await tenantsGET(new NextRequest("http://localhost/api/v1/tenants"))).json();
    expect(body[0].active_lease.id).toBe("l2");
    expect(body[0]).not.toHaveProperty("leases");
  });
});

describe("query-param clamping", () => {
  test.each([
    ["days=100000", 365],
    ["days=-5", 1],
    ["days=abc", 30],
    ["", 30],
  ])("predictions footfall %s → %d days", async (qs, expected) => {
    const res = await predictionsGET(new NextRequest(`http://localhost/x?type=footfall&${qs}`));
    expect(res.status).toBe(200);
    expect(state.forecastArgs).toEqual([expected]);
  });

  test.each([
    ["months=999", 24],
    ["months=0", 1],
    ["months=NaN", 6],
  ])("predictions revenue %s → %d months", async (qs, expected) => {
    await predictionsGET(new NextRequest(`http://localhost/x?type=revenue&${qs}`));
    expect(state.forecastArgs).toEqual([expected]);
  });

  test("predictions rejects an unknown type", async () => {
    const res = await predictionsGET(new NextRequest("http://localhost/x?type=weather"));
    expect(res.status).toBe(400);
  });

  test.each([
    ["limit=1000000", "limit(500)"],
    ["limit=abc", "limit(50)"],
    ["limit=0", "limit(1)"],
  ])("events %s → %s", async (qs, expected) => {
    await eventsGET(new NextRequest(`http://localhost/x?${qs}`));
    expect(mock()._calls[0].filters).toContain(expected);
  });
});
