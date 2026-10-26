import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import { logAudit, getAuditLog, getAuditStats } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

const auditCalls = (sb: any) => sb._calls.filter((c: any) => c.table === "audit_log");

describe("audit: logAudit", () => {
  let errSpy: any;
  let warnSpy: any;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  test("inserts exactly one row into audit_log", async () => {
    const sb = createMockSupabase();
    await logAudit(sb, { action: "a", category: "c", description: "d" });
    expect(sb._calls).toHaveLength(1);
    expect(sb._calls[0].table).toBe("audit_log");
    expect(sb._calls[0].payloads).toHaveLength(1);
  });

  test("fills system defaults for missing user / data fields", async () => {
    const sb = createMockSupabase();
    await logAudit(sb, { action: "lease.update", category: "contracts", description: "x" });
    expect(sb._calls[0].payloads[0]).toEqual({
      user_id: "system",
      user_email: "system@wedja.ai",
      action: "lease.update",
      category: "contracts",
      resource_type: undefined,
      resource_id: undefined,
      description: "x",
      old_data: null,
      new_data: null,
      metadata: {},
    });
  });

  test("passes through every provided field unchanged", async () => {
    const sb = createMockSupabase();
    const entry = {
      user_id: "u-1",
      user_email: "owner@senzo.eg",
      action: "approve",
      category: "ai_decision",
      resource_type: "discrepancy",
      resource_id: "d-9",
      description: "Approved flag",
      old_data: { status: "flagged" },
      new_data: { status: "investigating" },
      metadata: { ip: "10.0.0.1" },
    };
    await logAudit(sb, entry);
    expect(sb._calls[0].payloads[0]).toEqual(entry);
  });

  test("empty-string user_id / email fall back to system identity", async () => {
    const sb = createMockSupabase();
    await logAudit(sb, { user_id: "", user_email: "", action: "a", category: "c", description: "d" });
    const p = sb._calls[0].payloads[0];
    expect(p.user_id).toBe("system");
    expect(p.user_email).toBe("system@wedja.ai");
  });

  test("empty object old/new data are preserved (not coerced to null)", async () => {
    const sb = createMockSupabase();
    await logAudit(sb, { action: "a", category: "c", description: "d", old_data: {}, new_data: {} });
    const p = sb._calls[0].payloads[0];
    expect(p.old_data).toEqual({});
    expect(p.new_data).toEqual({});
  });

  test("does not mutate the caller's entry object", async () => {
    const sb = createMockSupabase();
    const entry = { action: "a", category: "c", description: "d" };
    const snapshot = JSON.parse(JSON.stringify(entry));
    await logAudit(sb, entry);
    expect(entry).toEqual(snapshot);
  });

  test("never rejects when supabase.from throws synchronously", async () => {
    const sb = createMockSupabase({}, { throws: { audit_log: new Error("network down") } });
    await expect(
      logAudit(sb, { action: "a", category: "c", description: "d" })
    ).resolves.toBeUndefined();
  });

  test("never rejects when insert resolves with an error", async () => {
    const sb = createMockSupabase({}, { errors: { audit_log: { message: "column does not exist" } } });
    await expect(
      logAudit(sb, { action: "a", category: "c", description: "d" })
    ).resolves.toBeUndefined();
  });

  // BUG: src/lib/audit.ts:23-36 — supabase-js does not throw on DB errors, it
  // resolves `{ error }`. logAudit ignores the returned error, so the try/catch
  // never fires and failed audit writes vanish without any log line. (Relevant
  // because 00001_foundation.sql's audit_log has no category/description/
  // user_email/metadata columns and user_id is UUID, so "system" is rejected.)
  test.fails("surfaces (logs) an insert error returned by supabase", async () => {
    const sb = createMockSupabase({}, { errors: { audit_log: { message: "invalid input syntax for type uuid" } } });
    await logAudit(sb, { action: "a", category: "c", description: "d" });
    expect(errSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("audit: getAuditLog", () => {
  test("default query: select * with exact count, newest first, range 0..49", async () => {
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditLog(sb);
    const c = auditCalls(sb)[0];
    expect(c.selects[0]).toEqual(["*", { count: "exact" }]);
    expect(c.filters).toEqual([
      'order("created_at", {"ascending":false})',
      "range(0, 49)",
    ]);
  });

  test("custom limit/offset produce an inclusive range", async () => {
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditLog(sb, { limit: 10, offset: 20 });
    expect(auditCalls(sb)[0].filters).toContain("range(20, 29)");
  });

  test("limit 1 yields a single-row range", async () => {
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditLog(sb, { limit: 1, offset: 5 });
    expect(auditCalls(sb)[0].filters).toContain("range(5, 5)");
  });

  test("limit 0 is treated as 'unset' and falls back to 50 (falsy default)", async () => {
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditLog(sb, { limit: 0 });
    expect(auditCalls(sb)[0].filters).toContain("range(0, 49)");
  });

  test("category filter is applied as eq when provided", async () => {
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditLog(sb, { category: "ai_brain" });
    expect(auditCalls(sb)[0].filters).toContain('eq("category", "ai_brain")');
  });

  test("no category filter when category is empty string", async () => {
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditLog(sb, { category: "" });
    expect(auditCalls(sb)[0].filters.some((f: string) => f.startsWith("eq("))).toBe(false);
  });

  test("returns rows and exact total count", async () => {
    const rows = [{ id: "1" }, { id: "2" }];
    const sb = createMockSupabase({ audit_log: rows }, { counts: { audit_log: 137 } });
    const res = await getAuditLog(sb);
    expect(res).toEqual({ entries: rows, total: 137 });
  });

  test("null data / null count normalise to [] and 0", async () => {
    const sb = createMockSupabase({});
    expect(await getAuditLog(sb)).toEqual({ entries: [], total: 0 });
  });

  test("supabase error yields empty result rather than throwing", async () => {
    const sb = createMockSupabase({}, { errors: { audit_log: { message: "boom" } } });
    await expect(getAuditLog(sb)).resolves.toEqual({ entries: [], total: 0 });
  });
});

describe("audit: getAuditStats", () => {
  afterEach(() => vi.useRealTimers());

  test("issues three audit_log queries: total, today (UTC date), categories", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T23:30:00Z"));
    const sb = createMockSupabase({ audit_log: [] });
    await getAuditStats(sb);
    const calls = auditCalls(sb);
    expect(calls).toHaveLength(3);
    expect(calls[0].selects[0]).toEqual(["id", { count: "exact", head: true }]);
    expect(calls[0].filters).toEqual([]);
    expect(calls[1].selects[0]).toEqual(["id", { count: "exact", head: true }]);
    expect(calls[1].filters).toEqual(['gte("created_at", "2026-10-26")']);
    expect(calls[2].selects[0]).toEqual(["category"]);
  });

  test("aggregates totals, today count and per-category histogram", async () => {
    const sb = createMockSupabase({}, {
      sequences: {
        audit_log: [
          { count: 500 },
          { count: 12 },
          {
            data: [
              { category: "system" },
              { category: "ai_brain" },
              { category: "ai_brain" },
              { category: "ai_decision" },
              { category: "revenue" },
            ],
          },
        ],
      },
    });
    const stats = await getAuditStats(sb);
    expect(stats).toEqual({
      total_entries: 500,
      today_entries: 12,
      by_category: { system: 1, ai_brain: 2, ai_decision: 1, revenue: 1 },
      ai_decisions: 3,
    });
  });

  test("ai_decisions counts only ai_brain + ai_decision categories", async () => {
    const sb = createMockSupabase({}, {
      sequences: { audit_log: [{}, {}, { data: [{ category: "ai" }, { category: "AI_BRAIN" }] }] },
    });
    const stats = await getAuditStats(sb);
    expect(stats.ai_decisions).toBe(0);
  });

  test("empty / errored queries yield zeroed stats rather than throwing", async () => {
    const sb = createMockSupabase({}, { errors: { audit_log: { message: "down" } } });
    await expect(getAuditStats(sb)).resolves.toEqual({
      total_entries: 0,
      today_entries: 0,
      by_category: {},
      ai_decisions: 0,
    });
  });

  // BUG: src/lib/audit.ts:68-71 — byCategory is a plain `{}` literal, so
  // `byCategory[r.category] || 0` reads inherited Object.prototype members.
  // A category named "toString"/"constructor" produces a string like
  // "function toString() { [native code] }11" instead of a count of 2.
  // Low severity (categories are code-controlled) but trivially fixed with
  // Object.create(null) / Map / hasOwn.
  test.fails("category histogram is not polluted by prototype keys", async () => {
    const sb = createMockSupabase({}, {
      sequences: { audit_log: [{}, {}, { data: [{ category: "toString" }, { category: "toString" }] }] },
    });
    const stats = await getAuditStats(sb);
    expect(stats.by_category.toString).toBe(2);
  });
});
