/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createScriptedSupabase, type QueryCtx } from "./helpers/scripted-supabase";
import { createSettingsStore } from "./helpers/settings-store";

const emitEvent = vi.fn(async () => ({}));
const createNotification = vi.fn(async () => null);
const { runRevenueVerification, trainFootfallModel, trainRevenueModel, runBrainCycle } = vi.hoisted(() => ({
  runRevenueVerification: vi.fn(),
  trainFootfallModel: vi.fn(),
  trainRevenueModel: vi.fn(),
  runBrainCycle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/event-bus", () => ({ emitEvent: (...a: any[]) => (emitEvent as any)(...a) }));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: any[]) => (createNotification as any)(...a),
}));
vi.mock("@/lib/revenue-engine", () => ({
  runRevenueVerification: (...a: any[]) => runRevenueVerification(...a),
}));
vi.mock("@/lib/prediction-model", () => ({
  trainFootfallModel: (...a: any[]) => trainFootfallModel(...a),
  trainRevenueModel: (...a: any[]) => trainRevenueModel(...a),
}));
// Nothing here may reach the network: the SDK is never constructed without a
// key, and the brain cycle itself is stubbed for scheduler tests.
vi.mock("@anthropic-ai/sdk", async (orig) => ({ ...(await orig<object>()), default: class {} }));

type Engine = typeof import("@/lib/automations-engine");

// Fresh module per test so nothing module-level can leak between tests.
async function load(): Promise<Engine> {
  vi.resetModules();
  return await import("@/lib/automations-engine");
}

const NOW = new Date("2026-10-26T12:00:00Z");
const TODAY = "2026-10-26";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  emitEvent.mockClear();
  createNotification.mockClear();
  runRevenueVerification.mockReset();
  runRevenueVerification.mockResolvedValue({ results: [] });
  trainFootfallModel.mockReset().mockResolvedValue({ r_squared: 0.8, training_samples: 10 });
  trainRevenueModel.mockReset().mockResolvedValue({ r_squared: 0.7, training_samples: 12 });
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  vi.useRealTimers();
});

const ALL_IDS = [
  "auto-lease-monitor",
  "auto-rent-collector",
  "auto-revenue-verifier",
  "auto-energy-optimizer",
  "auto-maintenance-detector",
  "auto-footfall-analyzer",
  "auto-tenant-scorer",
];

/**
 * Scripted Supabase mock with a persistent in-memory system_settings table
 * and system_events log; every other table is answered by `resolver`.
 */
function scripted(resolver: ((ctx: QueryCtx) => any) | Record<string, any> = () => [], settings: Record<string, any> = {}) {
  const store = createSettingsStore(settings);
  const events: any[] = [];
  const sb = createScriptedSupabase((ctx: QueryCtx) => {
    if (ctx.table === "system_settings") return store.scripted(ctx);
    if (ctx.table === "system_events") {
      if (ctx.op === "insert") {
        events.unshift({ ...ctx.payload, created_at: new Date().toISOString() });
        return [];
      }
      const types = ctx.filters.find((f) => f[0] === "in")?.[2] as string[] | undefined;
      return events.filter((e) => !types || types.includes(e.type));
    }
    return typeof resolver === "function" ? resolver(ctx) : resolver[ctx.table] ?? null;
  });
  return Object.assign(sb, { store, events });
}

// An empty database: every automation goes down its "nothing to do" path.
const emptyDb = (settings: Record<string, any> = {}) => scripted(() => [], settings);

/** Calls to business tables only (ignores state/log bookkeeping). */
const dataCalls = (sb: any) =>
  sb._calls.filter((c: QueryCtx) => c.table !== "system_settings" && c.table !== "system_events");

// ── Registry / public API ───────────────────────────────────

describe("automations-engine: registry", () => {
  test("getAutomations lists 7 automations in a stable order without the run fn", async () => {
    const eng = await load();
    const list = await eng.getAutomations(emptyDb());
    expect(list.map((a) => a.id)).toEqual(ALL_IDS);
    for (const a of list) {
      expect(a).not.toHaveProperty("run");
      expect(a.enabled).toBe(true);
      expect(a.last_run).toBeNull();
      expect(a.actions_taken).toBe(0);
    }
  });

  test("mutating a returned meta object does not change stored state", async () => {
    const eng = await load();
    const sb = emptyDb();
    const [first] = await eng.getAutomations(sb);
    first.enabled = false;
    first.actions_taken = 999;
    const again = (await eng.getAutomations(sb))[0];
    expect(again.enabled).toBe(true);
    expect(again.actions_taken).toBe(0);
  });

  test("toggleAutomation on unknown id returns null and writes nothing", async () => {
    const eng = await load();
    const sb = emptyDb();
    expect(await eng.toggleAutomation(sb, "auto-does-not-exist", false)).toBeNull();
    expect(await eng.toggleAutomation(sb, "", false)).toBeNull();
    expect(sb.store.writes).toHaveLength(0);
    expect((await eng.getAutomations(sb)).every((a) => a.enabled)).toBe(true);
  });

  test("toggleAutomation persists to system_settings and survives a fresh module (other instance)", async () => {
    const sb = emptyDb();
    const eng = await load();
    const meta = await eng.toggleAutomation(sb, "auto-energy-optimizer", false, { updatedBy: "owner-1" });
    expect(meta).not.toBeNull();
    expect(meta!.enabled).toBe(false);
    expect(meta).not.toHaveProperty("run");
    expect(sb.store.rows.get("automation:auto-energy-optimizer")).toMatchObject({ enabled: false });
    expect(sb.store.writes.at(-1)).toMatchObject({ op: "upsert", updated_by: "owner-1" });

    const other = await load();
    const list = await other.getAutomations(sb);
    expect(list.find((a) => a.id === "auto-energy-optimizer")!.enabled).toBe(false);
    expect(list.filter((a) => !a.enabled)).toHaveLength(1);

    await other.toggleAutomation(sb, "auto-energy-optimizer", true);
    expect((await eng.getAutomations(sb)).every((a) => a.enabled)).toBe(true);
  });

  test("runAutomation on unknown id returns [] and never touches the database", async () => {
    const eng = await load();
    const sb = emptyDb();
    expect(await eng.runAutomation("nope", sb)).toEqual([]);
    expect(sb._calls).toHaveLength(0);
  });

  test("runAutomation persists last_run, accumulates actions_taken, stores latest results and logs to system_events", async () => {
    const eng = await load();
    const sb = emptyDb();
    const r1 = await eng.runAutomation("auto-lease-monitor", sb);
    expect(r1).toHaveLength(1);
    let meta = (await eng.getAutomations(sb))[0];
    expect(meta.last_run).toBe(NOW.toISOString());
    expect(meta.actions_taken).toBe(1);

    await eng.runAutomation("auto-lease-monitor", sb);
    meta = (await (await load()).getAutomations(sb))[0];
    expect(meta.actions_taken).toBe(2);
    expect(meta.results).toHaveLength(1); // replaced, not appended

    expect(sb.events).toHaveLength(2);
    expect(sb.events[0]).toMatchObject({
      type: "automation.run",
      source_system: "automations",
      processed: true,
      payload: { automation_id: "auto-lease-monitor", trigger: "manual", action_count: 1 },
    });
  });

  test("runAutomation converts a thrown error into a single error result, leaves last_run unset and logs automation.error", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "rent_transactions") throw new Error("db down");
      return [];
    });
    const res = await eng.runAutomation("auto-rent-collector", sb);
    expect(res).toHaveLength(1);
    expect(res[0].action).toBe("rent_collector");
    expect(res[0].description).toBe("Error in Rent Collector: db down");
    const meta = (await eng.getAutomations(sb)).find((a) => a.id === "auto-rent-collector")!;
    expect(meta.last_run).toBeNull();
    expect(meta.actions_taken).toBe(0);
    expect(sb.events[0].type).toBe("automation.error");
    expect((await eng.getAutomationLog(sb))[0].description).toBe("Error in Rent Collector: db down");
  });

  test("a database that throws everywhere still returns the error result", async () => {
    const eng = await load();
    const sb = { from: () => { throw new Error("db down"); } } as any;
    const res = await eng.runAutomation("auto-rent-collector", sb);
    expect(res).toEqual([expect.objectContaining({ description: "Error in Rent Collector: db down" })]);
  });

  test("getAutomationLog is newest-first, flattened and capped at the limit", async () => {
    const eng = await load();
    const sb = emptyDb();
    for (let i = 0; i < 4; i++) await eng.runAutomation("auto-lease-monitor", sb);
    await eng.runAutomation("auto-rent-collector", sb);
    const log = await eng.getAutomationLog(sb, 3);
    expect(log).toHaveLength(3);
    expect(log[0].action).toBe("rent_collector");
    expect((await eng.getAutomationLog(sb)).length).toBe(5);
    const q = sb._calls.find((c: QueryCtx) => c.table === "system_events" && c.op === "select");
    expect(q.has("in", "type")).toBe(true);
    expect(q.arg("order", "created_at")).toEqual({ ascending: false });
  });

  test("runAllAutomations skips disabled ones (persisted flags), counts only executed actions, notifies with ran count", async () => {
    const eng = await load();
    const sb = emptyDb({
      "automation:auto-tenant-scorer": { enabled: false },
      "automation:auto-rent-collector": { enabled: false },
    });
    const out = await eng.runAllAutomations(sb);
    expect(Object.keys(out.results).sort()).toEqual([...ALL_IDS].sort());
    expect(out.results["auto-tenant-scorer"][0].description).toBe("Tenant Scorer is disabled — skipped");
    // 5 enabled automations each produce exactly one "nothing to do" result on an empty DB
    expect(out.total_actions).toBe(5);
    expect(createNotification).toHaveBeenCalledTimes(1);
    const note = (createNotification.mock.calls[0] as any[])[1];
    expect(note.message).toBe("5 automations ran, 5 total actions taken");
    // Disabled automations do not get last_run stamped
    expect((await eng.getAutomations(sb)).find((a) => a.id === "auto-tenant-scorer")!.last_run).toBeNull();
    // Enabled state survives the run
    expect(sb.store.rows.get("automation:auto-tenant-scorer").enabled).toBe(false);
  });

  test("runAllAutomations isolates a failing automation from the rest", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "maintenance_tickets") throw new Error("boom");
      return [];
    });
    const out = await eng.runAllAutomations(sb);
    expect(out.results["auto-maintenance-detector"]).toHaveLength(1);
    expect(out.results["auto-maintenance-detector"][0].description).toBe(
      "Error in Maintenance Detector: boom"
    );
    expect(out.results["auto-footfall-analyzer"][0].action).toBe("footfall_analyzer");
    expect(out.total_actions).toBe(6);
  });
});

// ── Lease Monitor ───────────────────────────────────────────

function leaseRow(over: Record<string, any> = {}) {
  return {
    id: "L1",
    tenant_id: "T1",
    unit_id: "U1",
    end_date: "2026-11-25",
    min_rent_monthly_egp: 25000,
    tenants: { id: "T1", name: "Aldo", category: "fashion" },
    units: { unit_number: "G-12", zone_id: "Z1", area_sqm: 100, zones: { id: "Z1", name: "Fashion Wing" } },
    ...over,
  };
}

describe("automations-engine: lease monitor", () => {
  test("no expiring leases yields a single no-op result", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-lease-monitor", emptyDb());
    expect(r).toEqual([expect.objectContaining({ description: "No leases expiring within 90 days" })]);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  test("queries active leases within [today, today+90d]", async () => {
    const eng = await load();
    const sb = emptyDb();
    await eng.runAutomation("auto-lease-monitor", sb);
    const q = sb._calls[0] as QueryCtx;
    expect(q.table).toBe("leases");
    expect(q.arg("gte", "end_date")).toBe(TODAY);
    expect(q.arg("lte", "end_date")).toBe("2027-01-24");
  });

  test("lease without zone gets neutral recommendation with ceil'd days left and formatted rent", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "leases") return [leaseRow({ units: { unit_number: "G-12", area_sqm: 100 } })];
      if (ctx.table === "tenant_sales_reported") return [{ reported_revenue_egp: 50000 }];
      return [];
    });
    const [r] = await eng.runAutomation("auto-lease-monitor", sb);
    // 2026-11-25T00:00Z - 2026-10-26T12:00Z = 29.5 days → ceil 30
    expect(r.description).toBe("Lease expiring in 30 days - Aldo (Unit G-12), review renewal terms");
    expect(r.impact).toBe("30 days until expiry — monthly rent EGP 25,000");
    const payload = (emitEvent.mock.calls[0] as any[])[2];
    expect(payload).toMatchObject({ days_until_expiry: 30, zone_avg_per_sqm: 0, is_underperformer: false });
  });

  test("missing tenant / unit info falls back to Unknown / N/A and unit area of 1 (no Infinity)", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "leases") return [leaseRow({ tenants: null, units: null, min_rent_monthly_egp: null })];
      if (ctx.table === "tenant_sales_reported") return [{ reported_revenue_egp: 1234 }];
      return [];
    });
    const [r] = await eng.runAutomation("auto-lease-monitor", sb);
    expect(r.description).toContain("Unknown (Unit N/A)");
    expect(r.impact).toContain("monthly rent EGP 0");
    const payload = (emitEvent.mock.calls[0] as any[])[2];
    expect(payload.revenue_per_sqm).toBe(1234);
  });

  test("clear underperformer is recommended for non-renewal", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "leases" && ctx.has("in", "unit_id"))
        return [{ tenant_id: "T1", unit_id: "U1" }, { tenant_id: "T2", unit_id: "U2" }];
      if (ctx.table === "leases") return [leaseRow()];
      if (ctx.table === "units") return [{ id: "U1", area_sqm: 100 }, { id: "U2", area_sqm: 100 }];
      if (ctx.table === "tenant_sales_reported" && ctx.eq("tenant_id") === "T1")
        return Array.from({ length: 6 }, () => ({ reported_revenue_egp: 10000 }));
      if (ctx.table === "tenant_sales_reported")
        return [
          ...Array.from({ length: 6 }, () => ({ tenant_id: "T1", reported_revenue_egp: 10000 })),
          ...Array.from({ length: 6 }, () => ({ tenant_id: "T2", reported_revenue_egp: 90000 })),
        ];
      return [];
    });
    const [r] = await eng.runAutomation("auto-lease-monitor", sb);
    expect(r.description).toMatch(/^Do not renew - Aldo \(Unit G-12\) revenue\/sqm EGP 100\/sqm/);
    expect((emitEvent.mock.calls[0] as any[])[2].is_underperformer).toBe(true);
  });

  test("clear top performer is flagged for priority renewal", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "leases" && ctx.has("in", "unit_id"))
        return [{ tenant_id: "T1", unit_id: "U1" }, { tenant_id: "T2", unit_id: "U2" }];
      if (ctx.table === "leases") return [leaseRow({ units: { ...leaseRow().units, area_sqm: 50 } })];
      if (ctx.table === "units") return [{ id: "U1", area_sqm: 50 }, { id: "U2", area_sqm: 100 }];
      if (ctx.table === "tenant_sales_reported" && ctx.eq("tenant_id") === "T1")
        return [{ reported_revenue_egp: 100000 }];
      if (ctx.table === "tenant_sales_reported")
        return [{ tenant_id: "T1", reported_revenue_egp: 100000 }, { tenant_id: "T2", reported_revenue_egp: 10000 }];
      return [];
    });
    const [r] = await eng.runAutomation("auto-lease-monitor", sb);
    expect(r.description).toMatch(/^Priority renewal - retain Aldo/);
    expect(r.impact).toBe("Retain revenue of EGP 100000/month");
    expect((emitEvent.mock.calls[0] as any[])[2].is_top_performer).toBe(true);
  });

  // BUG: automations-engine.ts:173-176 computes `uniqueMonths` as
  // new Set(zoneSales.map(() => 1)).size, which is always 1. The zone average is
  // therefore 6 months of sales / area, compared against the tenant's *monthly*
  // average — a tenant who is exactly the zone average is flagged "Do not renew".
  test.fails("tenant performing exactly at zone average is NOT an underperformer", async () => {
    const eng = await load();
    const monthly = Array.from({ length: 6 }, () => ({ tenant_id: "T1", reported_revenue_egp: 100000 }));
    const sb = scripted((ctx) => {
      if (ctx.table === "leases" && ctx.has("in", "unit_id")) return [{ tenant_id: "T1", unit_id: "U1" }];
      if (ctx.table === "leases") return [leaseRow()];
      if (ctx.table === "units") return [{ id: "U1", area_sqm: 100 }];
      if (ctx.table === "tenant_sales_reported") return monthly;
      return [];
    });
    const [r] = await eng.runAutomation("auto-lease-monitor", sb);
    expect(r.description).not.toMatch(/Do not renew/);
    expect((emitEvent.mock.calls[0] as any[])[2].zone_avg_per_sqm).toBe(1000);
  });
});

// ── Rent Collector ──────────────────────────────────────────

describe("automations-engine: rent collector", () => {
  test("no overdue rent → 'all current' and no notification", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-rent-collector", emptyDb());
    expect(r).toHaveLength(1);
    expect(r[0].impact).toBe("EGP 0 outstanding");
    expect(createNotification).not.toHaveBeenCalled();
  });

  function rentDb(historyByLease: Record<string, number>) {
    return scripted((ctx) => {
      if (ctx.table !== "rent_transactions") return [];
      if (ctx.has("in", "status"))
        return [
          { id: "R1", lease_id: "L1", amount_due: 50000, amount_paid: 10000, status: "partial", period_month: 10, period_year: 2026, leases: { tenant_id: "T1", tenants: { name: "KFC" } } },
          { id: "R2", lease_id: "L2", amount_due: 20000, amount_paid: null, status: "overdue", period_month: 9, period_year: 2026, leases: null },
        ];
      return Array.from({ length: historyByLease[ctx.eq("lease_id")] ?? 0 }, (_, i) => ({ id: `h${i}` }));
    });
  }

  test("computes outstanding per txn, flags chronic payers (>=3 overdue) and sends a critical summary", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-rent-collector", rentDb({ L1: 3, L2: 1 }));
    expect(r).toHaveLength(3);
    expect(r[0].description).toBe(
      "CHRONIC: KFC — EGP 40,000 overdue (3+ months late pattern). Flag as high risk."
    );
    expect(r[1].description).toBe("Unknown — EGP 20,000 overdue for 9/2026");
    expect(r[2].description).toBe("Summary: 2 overdue tenants, 1 chronic late payers");
    expect(r[2].impact).toBe("Total EGP 60,000 outstanding");
    const note = (createNotification.mock.calls[0] as any[])[1];
    expect(note.type).toBe("critical");
    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect((emitEvent.mock.calls[1] as any[])[2]).toMatchObject({ tenant_id: null, amount_paid: 0, outstanding: 20000, is_chronic: false });
  });

  test("no chronic payers → warning-level notification; 2 overdue in history is not chronic", async () => {
    const eng = await load();
    await eng.runAutomation("auto-rent-collector", rentDb({ L1: 2, L2: 0 }));
    expect((createNotification.mock.calls[0] as any[])[1].type).toBe("warning");
  });
});

// ── Revenue Verifier ────────────────────────────────────────

function vResult(over: Record<string, any> = {}) {
  return {
    tenant_id: "T1",
    tenant_name: "Adidas",
    brand_name: "Adidas",
    category: "fashion",
    unit_id: "U1",
    unit_number: "G-01",
    lease_id: "L1",
    footfall: 10000,
    reported_revenue_egp: 10000,
    estimated_low_egp: 400000,
    estimated_mid_egp: 550000,
    estimated_high_egp: 700000,
    variance_egp: 540000,
    variance_pct: 98.2,
    confidence: 0.82,
    status: "flagged",
    methodology: "m",
    rent_at_risk_egp: 54000,
    ...over,
  };
}

describe("automations-engine: revenue verifier", () => {
  test("lastCompleteMonth is the previous month (and wraps January → December)", async () => {
    const eng = await load();
    expect(eng.lastCompleteMonth(new Date("2026-10-26T12:00:00Z"))).toEqual({ month: 9, year: 2026 });
    expect(eng.lastCompleteMonth(new Date("2027-01-01T00:00:00Z"))).toEqual({ month: 12, year: 2026 });
  });

  test("delegates to the revenue engine for the most recent COMPLETE month", async () => {
    const eng = await load();
    const sb = emptyDb();
    await eng.runAutomation("auto-revenue-verifier", sb);
    expect(runRevenueVerification).toHaveBeenCalledTimes(1);
    const [db, propertyId, month, year] = runRevenueVerification.mock.calls[0];
    expect(db).toBe(sb);
    expect(propertyId).toBe("a0000000-0000-0000-0000-000000000001");
    expect([month, year]).toEqual([9, 2026]);
    // The automation no longer touches discrepancies itself.
    expect(dataCalls(sb)).toHaveLength(0);
  });

  test("no tenants → single no-op result, no events", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-revenue-verifier", emptyDb());
    expect(r).toEqual([expect.objectContaining({ description: "No active tenants to verify for 2026-09" })]);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  test("flagged tenants → one result + one tenant.underreporting event each, sorted by variance; summary and notification", async () => {
    runRevenueVerification.mockResolvedValue({
      results: [
        vResult({ tenant_id: "T2", tenant_name: "Aldo", variance_egp: 20000, variance_pct: 40, rent_at_risk_egp: 2000, reported_revenue_egp: 30000, estimated_mid_egp: 50000 }),
        vResult(),
        vResult({ tenant_id: "T3", tenant_name: "KFC", status: "ok", variance_egp: 100 }),
        vResult({ tenant_id: "T4", tenant_name: "Kidzo", status: "missing_report", reported_revenue_egp: null }),
        vResult({ tenant_id: "T5", tenant_name: "Zara", status: "insufficient_data" }),
      ],
    });
    const eng = await load();
    const sb = emptyDb();
    const r = await eng.runAutomation("auto-revenue-verifier", sb);

    expect(r).toHaveLength(3);
    expect(r[0].description).toBe(
      "Adidas (fashion, unit G-01) — 2026-09: reported EGP 10,000 vs estimated EGP 550,000 (98% variance, confidence 0.82)"
    );
    expect(r[0].impact).toBe("EGP 540,000 potential underreporting — EGP 54,000 percentage rent at risk");
    expect(r[1].description).toContain("Aldo");
    expect(r[2].description).toBe(
      "Revenue verification 2026-09 complete — 5 tenants checked, 2 flagged, 1 missing reports, 1 with insufficient data"
    );
    expect(r[2].impact).toBe("EGP 56,000 percentage rent at risk (EGP 560,000 sales variance)");

    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect((emitEvent as any).mock.calls.map((c: any[]) => c[0])).toEqual(["tenant.underreporting", "tenant.underreporting"]);
    expect((emitEvent as any).mock.calls[0][1]).toBe("automations-engine");
    expect((emitEvent as any).mock.calls[0][2]).toMatchObject({
      tenant_id: "T1",
      tenant_name: "Adidas",
      lease_id: "L1",
      period_month: 9,
      period_year: 2026,
      reported_revenue: 10000,
      estimated_revenue: 550000,
      variance_egp: 540000,
      variance_pct: 98,
      rent_at_risk_egp: 54000,
      category: "fashion",
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    const note = (createNotification.mock.calls[0] as any[])[1];
    expect(note).toMatchObject({ type: "warning", category: "revenue" });
    expect(note.title).toBe("Revenue verification 2026-09: 2 tenant(s) flagged");
    expect(note.message).toContain("EGP 56,000 percentage rent at risk");
  });

  test("nothing flagged → only the summary, no events, no notification", async () => {
    runRevenueVerification.mockResolvedValue({ results: [vResult({ status: "ok" }), vResult({ status: "missing_report" })] });
    const eng = await load();
    const r = await eng.runAutomation("auto-revenue-verifier", emptyDb());
    expect(r).toHaveLength(1);
    expect(r[0].description).toContain("0 flagged, 1 missing reports");
    expect(emitEvent).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  test("missing rent_at_risk_egp is treated as 0", async () => {
    runRevenueVerification.mockResolvedValue({ results: [vResult({ rent_at_risk_egp: undefined })] });
    const eng = await load();
    const r = await eng.runAutomation("auto-revenue-verifier", emptyDb());
    expect(r[0].impact).toContain("EGP 0 percentage rent at risk");
  });

  test("an engine failure becomes an error result", async () => {
    runRevenueVerification.mockRejectedValue(new Error("estimates table missing"));
    const eng = await load();
    const r = await eng.runAutomation("auto-revenue-verifier", emptyDb());
    expect(r).toEqual([expect.objectContaining({ description: "Error in Revenue Verifier: estimates table missing" })]);
  });
});

// ── Energy Optimizer ────────────────────────────────────────

describe("automations-engine: energy optimizer", () => {
  test("no zones → no-op", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-energy-optimizer", emptyDb());
    expect(r[0].description).toBe("No zones configured for energy analysis");
  });

  test("detects waste (cost>500 & footfall<100) and poor kWh/visitor; skips zero-cost zones", async () => {
    const eng = await load();
    const energy: Record<string, any[]> = {
      Z1: [{ consumption_kwh: 300, cost_egp: 500 }, { consumption_kwh: 200, cost_egp: 300 }],
      Z2: [{ consumption_kwh: 1000, cost_egp: 400 }],
      Z3: [],
      Z4: [{ consumption_kwh: 100, cost_egp: 200 }],
    };
    const foot: Record<string, number> = { Z1: 50, Z2: 100, Z3: 9999, Z4: 1000 };
    const sb = scripted((ctx) => {
      if (ctx.table === "zones") return ["Z1", "Z2", "Z3", "Z4"].map((id) => ({ id, name: `Zone ${id}` }));
      if (ctx.table === "energy_readings") return energy[ctx.eq("zone_id")];
      if (ctx.table === "footfall_daily") return [{ total_in: foot[ctx.eq("zone_id")] }];
      return [];
    });
    const r = await eng.runAutomation("auto-energy-optimizer", sb);
    expect(r).toHaveLength(3);
    expect(r[0].description).toBe(
      "Zone Z1 — high energy (500 kWh / EGP 800) with only 50 visitors. Reduce HVAC/lighting."
    );
    expect(r[0].impact).toBe("EGP 320/day potential saving");
    expect(r[1].description).toBe(
      "Zone Z2 — energy efficiency below target (10.0 kWh/visitor vs target 5.0)"
    );
    expect(r[1].impact).toBe("EGP 80/day optimization potential");
    expect(r[2].description).toBe("Energy audit complete — 2 zone(s) flagged for optimization");
    expect(r[2].impact).toBe("Total daily saving potential: EGP 400");
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect((emitEvent.mock.calls[0] as any[])[0]).toBe("energy.waste_detected");
  });

  test("zero footfall with high cost counts as waste rather than dividing by zero", async () => {
    const eng = await load();
    const sb = scripted((ctx) => {
      if (ctx.table === "zones") return [{ id: "Z1", name: "Parking" }];
      if (ctx.table === "energy_readings") return [{ consumption_kwh: 100, cost_egp: 1000 }];
      return [];
    });
    const r = await eng.runAutomation("auto-energy-optimizer", sb);
    expect(r[0].description).toContain("with only 0 visitors");
    expect(r[0].description).not.toMatch(/NaN|Infinity/);
  });
});

// ── Maintenance Detector ────────────────────────────────────

describe("automations-engine: maintenance detector", () => {
  test("no tickets → no-op", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-maintenance-detector", emptyDb());
    expect(r[0].description).toBe("No maintenance tickets in the last 30 days");
  });

  test("finds 3+ ticket patterns per zone/category and escalates only stale open urgent tickets", async () => {
    const eng = await load();
    const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();
    const z = { name: "Food Court" };
    const tickets = [
      { id: "1", zone_id: "Z1", category: "hvac", priority: "normal", status: "open", title: "AC 1", created_at: hoursAgo(5), zones: z },
      { id: "2", zone_id: "Z1", category: "hvac", priority: "normal", status: "open", title: "AC 2", created_at: hoursAgo(50), zones: z },
      { id: "3", zone_id: "Z1", category: "hvac", priority: "low", status: "completed", title: "AC 3", created_at: hoursAgo(100), zones: z },
      { id: "4", zone_id: "Z1", category: "electrical", priority: "urgent", status: "open", title: "Sparks", created_at: hoursAgo(72), zones: z },
      { id: "5", zone_id: "Z2", category: "electrical", priority: "emergency", status: "assigned", title: "Fresh", created_at: hoursAgo(10), zones: null },
      { id: "6", zone_id: "Z2", category: "plumbing", priority: "urgent", status: "completed", title: "Done", created_at: hoursAgo(200), zones: null },
    ];
    const sb = scripted((ctx) => (ctx.table === "maintenance_tickets" ? tickets : []));
    const r = await eng.runAutomation("auto-maintenance-detector", sb);
    expect(r.map((x) => x.description)).toEqual([
      "Pattern: 3 hvac tickets in Food Court within 30 days — possible systemic issue",
      'ESCALATION: Urgent ticket "Sparks" in Food Court unresolved for 72 hours',
      "Maintenance scan: 6 tickets reviewed, 1 patterns, 1 escalations",
    ]);
    expect(r[2].impact).toBe("1 systemic issue(s) require root cause analysis");
  });

  test("tickets with null zone/category group into an 'unknown::other' bucket", async () => {
    const eng = await load();
    const tickets = Array.from({ length: 3 }, (_, i) => ({
      id: String(i), zone_id: null, category: null, priority: "low", status: "open", title: null, created_at: NOW.toISOString(), zones: null,
    }));
    const sb = scripted((ctx) => (ctx.table === "maintenance_tickets" ? tickets : []));
    const r = await eng.runAutomation("auto-maintenance-detector", sb);
    expect(r[0].description).toBe("Pattern: 3 other tickets in Unknown Zone within 30 days — possible systemic issue");
  });
});

// ── Footfall Analyzer ───────────────────────────────────────

describe("automations-engine: footfall analyzer", () => {
  function footDb(today: Record<string, number>, week: Record<string, { date: string; total_in: number }[]>, campaigns: any[] = []) {
    return scripted((ctx) => {
      if (ctx.table === "zones") return Object.keys(week).map((id) => ({ id, name: `Zone ${id}` }));
      if (ctx.table === "marketing_campaigns") return campaigns;
      if (ctx.table === "footfall_daily" && ctx.has("eq", "date")) return [{ total_in: today[ctx.eq("zone_id")] ?? 0 }];
      if (ctx.table === "footfall_daily") return week[ctx.eq("zone_id")];
      return [];
    });
  }

  test("uses distinct dates for the 7-day average and flags drops (with campaign) and spikes (without)", async () => {
    const eng = await load();
    const sb = footDb(
      { Z1: 500, Z2: 1400, Z3: 1000 },
      {
        // two rows on the same date must count as ONE day: avg = 2000/2 = 1000
        Z1: [{ date: "2026-10-24", total_in: 600 }, { date: "2026-10-24", total_in: 400 }, { date: "2026-10-25", total_in: 1000 }],
        Z2: [{ date: "2026-10-25", total_in: 1000 }],
        Z3: [{ date: "2026-10-25", total_in: 1000 }],
      },
      [{ id: "C1", name: "Autumn Sale", status: "active", target_zones: ["Z1"] }, { id: "C2", name: "Null targets", target_zones: null }]
    );
    const r = await eng.runAutomation("auto-footfall-analyzer", sb);
    expect(r).toHaveLength(2);
    expect(r[0].description).toBe("ALERT: Zone Z1 footfall dropped 50% vs 7-day average (500 vs avg 1000)");
    expect(r[0].impact).toBe('Active campaign "Autumn Sale" may need adjustment');
    expect(r[1].description).toBe("SPIKE: Zone Z2 footfall up 40% vs 7-day average (1400 vs avg 1000)");
    expect(r[1].impact).toBe("Investigate cause — capitalize on increased traffic");
    // 7-day window: [today-7, today)
    const weekQ = sb._calls.find((c: QueryCtx) => c.table === "footfall_daily" && c.has("gte", "date"));
    expect(weekQ.arg("gte", "date")).toBe("2026-10-19");
    expect(weekQ.arg("lt", "date")).toBe(TODAY);
  });

  test("zones without history or without today's data are skipped → 'all normal'", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-footfall-analyzer", footDb({ Z1: 0, Z2: 900 }, { Z1: [{ date: "2026-10-25", total_in: 1000 }], Z2: [] }));
    expect(r).toEqual([expect.objectContaining({ description: "All zones within normal footfall range" })]);
  });

  test("exact thresholds (-25% and +30%) are not flagged", async () => {
    const eng = await load();
    const r = await eng.runAutomation(
      "auto-footfall-analyzer",
      footDb({ Z1: 750, Z2: 1300 }, { Z1: [{ date: "2026-10-25", total_in: 1000 }], Z2: [{ date: "2026-10-25", total_in: 1000 }] })
    );
    expect(r[0].description).toBe("All zones within normal footfall range");
  });
});

// ── Tenant Scorer ───────────────────────────────────────────

describe("automations-engine: tenant scorer", () => {
  function scorerDb(tenants: any[], per: Record<string, { sales?: number[]; payments?: string[]; disc?: boolean }>, zoneAreas: number[] = [1000]) {
    const leaseToTenant: Record<string, string> = {};
    tenants.forEach((t) => (t.leases || []).forEach((l: any) => (leaseToTenant[l.id] = t.id)));
    return scripted((ctx) => {
      switch (ctx.table) {
        case "tenants":
          return tenants;
        case "tenant_sales_reported":
          return (per[ctx.eq("tenant_id")]?.sales || []).map((v) => ({ reported_revenue_egp: v }));
        case "rent_transactions":
          return (per[leaseToTenant[ctx.eq("lease_id")]]?.payments || []).map((s) => ({ status: s }));
        case "discrepancies":
          return per[ctx.eq("tenant_id")]?.disc ? [{ id: "d" }] : [];
        case "units":
          return zoneAreas.map((a) => ({ area_sqm: a }));
        default:
          return [];
      }
    });
  }
  const tenant = (id: string, name: string, unit: any, status = "active") => ({
    id, name, category: "fashion", leases: [{ id: `L-${id}`, unit_id: `U-${id}`, status, units: unit }],
  });

  test("composite score combines revenue, payments, discrepancy and area share; sorted and averaged", async () => {
    const eng = await load();
    const sb = scorerDb(
      [
        tenant("T2", "Weak", null),
        tenant("T1", "Star", { area_sqm: 100, zone_id: "Z1" }),
        tenant("T3", "NoLease", { area_sqm: 100, zone_id: "Z1" }, "expired"),
      ],
      {
        // 40,000/month / 100 sqm = 400/sqm → capped at 40 pts
        T1: { sales: [40000, 40000], payments: ["paid", "paid"] },
        // no sales, no payment history (→ 50% = 15 pts), discrepancy, no zone
        T2: { disc: true },
      }
    );
    const r = await eng.runAutomation("auto-tenant-scorer", sb);
    const tops = r.filter((x) => x.description.startsWith("TOP:"));
    expect(tops.map((x) => x.description)).toEqual([
      "TOP: Star (fashion) — Score 100/100, EGP 400/sqm, 100% on-time",
      "TOP: Weak (fashion) — Score 15/100, EGP 0/sqm, 50% on-time",
    ]);
    expect(r.some((x) => x.description.includes("NoLease"))).toBe(false);
    const summary = r.at(-1)!;
    expect(summary.description).toBe("Tenant scoring complete — 2 tenants scored, portfolio avg 58/100");
    expect(summary.impact).toBe("Top: Star (100), Bottom: Weak (15)");
    expect(r.find((x) => x.description.startsWith("FLAGGED: Weak"))!.description).toContain(", DISCREPANCY");
  });

  test("scores never exceed 100 even with extreme inputs", async () => {
    const eng = await load();
    const sb = scorerDb([tenant("T1", "Mega", { area_sqm: 1, zone_id: "Z1" })], { T1: { sales: [1e9], payments: ["paid"] } }, [1]);
    const r = await eng.runAutomation("auto-tenant-scorer", sb);
    const score = Number(r[0].description.match(/Score (\d+)\/100/)![1]);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(100);
  });

  test("no active tenants → no-op", async () => {
    const eng = await load();
    const r = await eng.runAutomation("auto-tenant-scorer", emptyDb());
    expect(r[0].description).toBe("No active tenants to score");
  });

  // BUG: automations-engine.ts:1029,1042 — top10 = scores.slice(0,10) and
  // bottom10 = scores.slice(-10) overlap whenever fewer than 20 tenants are scored,
  // so the best tenant is simultaneously "TOP: retain" and "FLAGGED: Consider replacement".
  test.fails("a tenant is never both TOP (retain) and FLAGGED (replace)", async () => {
    const eng = await load();
    const sb = scorerDb(
      [tenant("T1", "Star", { area_sqm: 100, zone_id: "Z1" }), tenant("T2", "Weak", null)],
      { T1: { sales: [40000], payments: ["paid"] }, T2: { disc: true } }
    );
    const r = await eng.runAutomation("auto-tenant-scorer", sb);
    expect(r.some((x) => x.description.startsWith("FLAGGED: Star"))).toBe(false);
  });
});
