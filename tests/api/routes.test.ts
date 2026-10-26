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
const inserts = (table: string) => payloads.filter((p) => p.table === table).map((p) => p.row);

/** Wrap the mock so full insert payloads are captured (the helper truncates its log). */
function withInsertCapture(m: Mock): Mock {
  const from = m.from;
  m.from = (table: string) => {
    const chain = from(table);
    const insert = chain.insert;
    chain.insert = (row: any) => {
      payloads.push({ table, row });
      return insert(row);
    };
    return chain;
  };
  return m;
}

function upload(type: string, name: string, content: BlobPart) {
  const form = new FormData();
  form.append("type", type);
  form.append("file", new File([content], name));
  return new NextRequest("http://localhost/api/v1/import", { method: "POST", body: form });
}

beforeEach(() => {
  payloads = [];
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
