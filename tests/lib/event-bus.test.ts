import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, type MockOptions } from "./helpers/supabase-mock";

/* eslint-disable @typescript-eslint/no-explicit-any */

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: loggerMock, createLogger: () => loggerMock }));

type Bus = typeof import("@/lib/event-bus");
let bus: Bus;

// Fresh module per test => fresh handler registry (built-ins only).
beforeEach(async () => {
  Object.values(loggerMock).forEach((fn) => fn.mockClear());
  vi.resetModules();
  bus = await import("@/lib/event-bus");
});

const EVENT = { id: "evt-1", type: "x", processed: false, results: [] };

function sbFor(tableData: Record<string, any> = {}, opts: MockOptions = {}) {
  return createMockSupabase({ system_events: EVENT, notifications: { id: "n" }, ...tableData }, opts);
}
const callsTo = (sb: any, table: string) => sb._calls.filter((c: any) => c.table === table);
const notifPayloads = (sb: any) => callsTo(sb, "notifications").flatMap((c: any) => c.payloads);
const ok = (handler: string) => ({ handler, success: true, message: "ok", timestamp: "t" });

describe("event-bus: registry", () => {
  test("built-in handlers are registered, sorted by type, in registration order", () => {
    const types = bus.getRegisteredEventTypes();
    expect(types.map((t) => t.type)).toEqual([
      "anomaly.critical",
      "anomaly.detected",
      "campaign.started",
      "energy.waste_detected",
      "footfall.drop",
      "lease.expiring",
      "maintenance.created",
      "maintenance.resolved",
      "rent.overdue",
      "tenant.underreporting",
    ]);
    const byType = Object.fromEntries(types.map((t) => [t.type, t]));
    expect(byType["lease.expiring"].handlers).toEqual(["notify-lease-expiring", "check-tenant-performance"]);
    expect(byType["rent.overdue"].handlerCount).toBe(2);
  });

  test("registerHandler adds a new type and appends to existing ones", () => {
    bus.registerHandler("rent.paid", "h1", async () => ok("h1"));
    bus.registerHandler("anomaly.critical", "extra", async () => ok("extra"));
    const byType = Object.fromEntries(bus.getRegisteredEventTypes().map((t) => [t.type, t]));
    expect(byType["rent.paid"]).toEqual({ type: "rent.paid", handlerCount: 1, handlers: ["h1"] });
    expect(byType["anomaly.critical"].handlers).toEqual(["broadcast-critical", "extra"]);
  });

  test("registering the same name twice registers two handlers (no dedupe)", () => {
    bus.registerHandler("rent.paid", "dup", async () => ok("dup"));
    bus.registerHandler("rent.paid", "dup", async () => ok("dup"));
    const t = bus.getRegisteredEventTypes().find((x) => x.type === "rent.paid")!;
    expect(t.handlerCount).toBe(2);
  });

  test("getRegisteredEventTypes returns copies — mutating it does not affect the registry", () => {
    const first = bus.getRegisteredEventTypes();
    first[0].handlers.push("hacked");
    first.length = 0;
    const again = bus.getRegisteredEventTypes();
    expect(again).toHaveLength(10);
    expect(again[0].handlers).not.toContain("hacked");
  });
});

describe("event-bus: emitEvent core", () => {
  test("stores the event unprocessed, then updates it processed with results", async () => {
    bus.registerHandler("rent.paid", "h1", async () => ok("h1"));
    const sb = sbFor();
    await bus.emitEvent("rent.paid", "manual", { amount: 5 }, sb);
    const ev = callsTo(sb, "system_events");
    expect(ev).toHaveLength(2);
    expect(ev[0].payloads[0]).toEqual({
      type: "rent.paid",
      source_system: "manual",
      payload: { amount: 5 },
      processed: false,
      results: [],
    });
    expect(ev[1].payloads[0]).toEqual({ processed: true, results: [ok("h1")] });
    expect(ev[1].filters).toContain('eq("id", "evt-1")');
  });

  test("handlers receive {type, source_system, payload} and the same supabase client", async () => {
    const h = vi.fn(async () => ok("h"));
    bus.registerHandler("rent.paid", "h", h);
    const sb = sbFor();
    const payload = { tenant_id: "t1" };
    await bus.emitEvent("rent.paid", "revenue-engine", payload, sb);
    expect(h).toHaveBeenCalledTimes(1);
    expect(h).toHaveBeenCalledWith({ type: "rent.paid", source_system: "revenue-engine", payload }, sb);
  });

  test("handlers run sequentially in registration order", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    bus.registerHandler("rent.paid", "first", async () => {
      order.push("first:start");
      await gate;
      order.push("first:end");
      return ok("first");
    });
    bus.registerHandler("rent.paid", "second", async () => {
      order.push("second:start");
      return ok("second");
    });
    const p = bus.emitEvent("rent.paid", "manual", {}, sbFor());
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["first:start"]);
    release();
    const { results } = await p;
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
    expect(results.map((r) => r.handler)).toEqual(["first", "second"]);
  });

  test("a throwing handler is captured as a failed result and later handlers still run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
    try {
      bus.registerHandler("rent.paid", "boom", async () => {
        throw new Error("db exploded");
      });
      const after = vi.fn(async () => ok("after"));
      bus.registerHandler("rent.paid", "after", after);
      const { results } = await bus.emitEvent("rent.paid", "manual", {}, sbFor());
      expect(results[0]).toEqual({
        handler: "boom",
        success: false,
        message: "db exploded",
        timestamp: "2026-10-26T10:00:00.000Z",
      });
      expect(after).toHaveBeenCalled();
      expect(results[1]).toEqual(ok("after"));
    } finally {
      vi.useRealTimers();
    }
  });

  test("synchronous throws and non-Error throws are captured too", async () => {
    bus.registerHandler("rent.paid", "sync", (() => {
      throw new Error("sync fail");
    }) as any);
    bus.registerHandler("rent.paid", "str", async () => {
      throw "a string";
    });
    bus.registerHandler("rent.paid", "undef", async () => {
      throw undefined;
    });
    const { results } = await bus.emitEvent("rent.paid", "manual", {}, sbFor());
    expect(results.map((r) => [r.handler, r.success, r.message])).toEqual([
      ["sync", false, "sync fail"],
      ["str", false, "Unknown handler error"],
      ["undef", false, "Unknown handler error"],
    ]);
  });

  test("event type with no handlers is still stored, marked processed, with zero results", async () => {
    const sb = sbFor();
    const { event, results } = await bus.emitEvent("occupancy.threshold", "manual", {}, sb);
    expect(results).toEqual([]);
    expect(event).toEqual(EVENT);
    expect(callsTo(sb, "system_events")[1].payloads[0]).toEqual({ processed: true, results: [] });
  });

  test("unknown (non-typed) event type is accepted at runtime and dispatches nothing", async () => {
    const sb = sbFor();
    const { results } = await bus.emitEvent("totally.bogus" as any, "manual", {}, sb);
    expect(results).toEqual([]);
    expect(callsTo(sb, "notifications")).toHaveLength(0);
    expect(callsTo(sb, "system_events")[0].payloads[0].type).toBe("totally.bogus");
  });

  test("insert error: returns {event:null, results:[]}, runs no handlers, no audit, logs", async () => {
    const h = vi.fn(async () => ok("h"));
    bus.registerHandler("rent.paid", "h", h);
    const err = { message: "relation system_events does not exist" };
    const sb = sbFor({}, { errors: { system_events: err } });
    const res = await bus.emitEvent("rent.paid", "manual", {}, sb);
    expect(res).toEqual({ event: null, results: [] });
    expect(h).not.toHaveBeenCalled();
    expect(callsTo(sb, "audit_log")).toHaveLength(0);
    expect(callsTo(sb, "system_events")).toHaveLength(1);
    expect(loggerMock.error).toHaveBeenCalledWith({ err }, expect.stringContaining("[EventBus]"));
  });

  test("insert returning no row (and no error) is treated as failure", async () => {
    const h = vi.fn(async () => ok("h"));
    bus.registerHandler("rent.paid", "h", h);
    const sb = createMockSupabase({});
    const res = await bus.emitEvent("rent.paid", "manual", {}, sb);
    expect(res).toEqual({ event: null, results: [] });
    expect(h).not.toHaveBeenCalled();
  });

  test("returns the updated row when the update succeeds", async () => {
    const updated = { ...EVENT, processed: true };
    const sb = sbFor({}, { sequences: { system_events: [{ data: EVENT }, { data: updated }] } });
    const { event } = await bus.emitEvent("rent.paid", "manual", {}, sb);
    expect(event).toBe(updated);
  });

  test("update failure falls back to the originally-inserted event and still returns results", async () => {
    bus.registerHandler("rent.paid", "h", async () => ok("h"));
    const sb = sbFor({}, {
      sequences: { system_events: [{ data: EVENT }, { data: null, error: { message: "update denied" } }] },
    });
    const { event, results } = await bus.emitEvent("rent.paid", "manual", {}, sb);
    expect(event).toEqual(EVENT);
    expect(results).toEqual([ok("h")]);
  });

  test("writes an audit_log entry describing the emitted event", async () => {
    bus.registerHandler("rent.paid", "a", async () => ok("a"));
    bus.registerHandler("rent.paid", "b", async () => {
      throw new Error("x");
    });
    const sb = sbFor();
    await bus.emitEvent("rent.paid", "revenue-engine", {}, sb);
    const audit = callsTo(sb, "audit_log");
    expect(audit).toHaveLength(1);
    expect(audit[0].payloads[0]).toMatchObject({
      user_id: "system",
      action: "event_emitted",
      category: "system",
      resource_type: "system_event",
      resource_id: "evt-1",
      description: "Event rent.paid from revenue-engine — 2 handler results",
      new_data: { type: "rent.paid", source: "revenue-engine", handlers: 2 },
    });
  });

  test("audit failure does not break emitEvent", async () => {
    const sb = sbFor({}, { throws: { audit_log: new Error("audit down") } });
    await expect(bus.emitEvent("rent.paid", "manual", {}, sb)).resolves.toMatchObject({ results: [] });
  });

  test("audit is written after the system_events update (ordering)", async () => {
    const sb = sbFor();
    await bus.emitEvent("rent.paid", "manual", {}, sb);
    expect(sb._calls.map((c: any) => c.table)).toEqual(["system_events", "system_events", "audit_log"]);
  });
});

describe("event-bus: built-in handlers", () => {
  test("lease.expiring: notifies and flags underperformer with >=2 flagged discrepancies", async () => {
    const sb = sbFor({ discrepancies: [{ id: "d1" }, { id: "d2" }] });
    const { results } = await bus.emitEvent(
      "lease.expiring",
      "contract-engine",
      { tenant_id: "t1", tenant_name: "Aldo", days_until_expiry: 30, lease_id: "l1" },
      sb
    );
    const disc = callsTo(sb, "discrepancies")[0];
    expect(disc.filters).toEqual(['eq("tenant_id", "t1")', 'eq("status", "flagged")', "limit(3)"]);
    const notes = notifPayloads(sb);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      title: "Lease Expiring Soon",
      message: "Tenant Aldo lease expires in 30 days",
      type: "warning",
      category: "contracts",
      link: "/dashboard/contracts",
    });
    expect(notes[1]).toMatchObject({ title: "Do Not Renew Recommendation", type: "critical" });
    expect(results.every((r) => r.success)).toBe(true);
    expect(results[1].message).toMatch(/underperformer/);
  });

  test("lease.expiring: one discrepancy is not enough to flag; missing lease_id => no link", async () => {
    const sb = sbFor({ discrepancies: [{ id: "d1" }] });
    await bus.emitEvent("lease.expiring", "contract-engine", { tenant_id: "t1", tenant_name: "Aldo" }, sb);
    const notes = notifPayloads(sb);
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBeNull();
    expect(notes[0].message).toBe("Tenant Aldo lease expires in ? days");
  });

  test("lease.expiring: missing tenant_id short-circuits performance check with failure", async () => {
    const sb = sbFor();
    const { results } = await bus.emitEvent("lease.expiring", "contract-engine", {}, sb);
    expect(callsTo(sb, "discrepancies")).toHaveLength(0);
    expect(results[1]).toMatchObject({ handler: "check-tenant-performance", success: false, message: "No tenant_id provided" });
    expect(notifPayloads(sb)[0].message).toBe("Tenant Unknown lease expires in ? days");
  });

  // BUG: src/lib/event-bus.ts:197 and :241 (and similar result messages
  // throughout, e.g. :341) — notification text falls back to "Unknown"
  // but HandlerResult.message interpolates tenant_name raw, producing
  // "Notification created for undefined" / "undefined performance acceptable".
  test.fails("result messages never contain the literal 'undefined'", async () => {
    const sb = sbFor({ discrepancies: [] });
    const { results } = await bus.emitEvent("lease.expiring", "contract-engine", { tenant_id: "t1" }, sb);
    for (const r of results) expect(r.message).not.toContain("undefined");
  });

  test("rent.overdue: notification formats EGP amount and days", async () => {
    const sb = sbFor({ rent_transactions: [] });
    await bus.emitEvent(
      "rent.overdue",
      "revenue-engine",
      { tenant_name: "KFC", days_overdue: 12, amount_due: 125000, lease_id: "l1" },
      sb
    );
    const n = notifPayloads(sb)[0];
    expect(n).toMatchObject({ title: "Rent Overdue", category: "revenue", link: "/dashboard/revenue", type: "warning" });
    expect(n.message).toBe(`Tenant KFC rent overdue by 12 days — EGP ${(125000).toLocaleString()} outstanding`);
  });

  test("rent.overdue: missing lease_id => pattern check fails without querying", async () => {
    const sb = sbFor();
    const { results } = await bus.emitEvent("rent.overdue", "revenue-engine", {}, sb);
    expect(callsTo(sb, "rent_transactions")).toHaveLength(0);
    expect(results[1]).toMatchObject({ handler: "check-overdue-pattern", success: false });
    expect(notifPayloads(sb)[0].message).toContain("EGP 0 outstanding");
  });

  test("rent.overdue: <3 overdue months => no anomaly emitted", async () => {
    const sb = sbFor({ rent_transactions: [{ id: 1 }, { id: 2 }] });
    const { results } = await bus.emitEvent("rent.overdue", "revenue-engine", { lease_id: "l1" }, sb);
    expect(callsTo(sb, "rent_transactions")[0].filters).toEqual([
      'eq("lease_id", "l1")',
      'eq("status", "overdue")',
      "limit(3)",
    ]);
    expect(callsTo(sb, "system_events")).toHaveLength(2);
    expect(results[1].message).toBe("No chronic pattern found");
  });

  test("rent.overdue: 3 overdue months cascades into a nested anomaly.detected event", async () => {
    const sb = sbFor({ rent_transactions: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const { results } = await bus.emitEvent(
      "rent.overdue",
      "revenue-engine",
      { lease_id: "l1", tenant_id: "t1", tenant_name: "KFC" },
      sb
    );
    const events = callsTo(sb, "system_events").filter((c: any) => c.payloads[0]?.type);
    expect(events.map((c: any) => c.payloads[0].type)).toEqual(["rent.overdue", "anomaly.detected"]);
    expect(events[1].payloads[0]).toMatchObject({
      source_system: "event-bus",
      payload: { severity: "warning", tenant_id: "t1", source_event: "rent.overdue" },
    });
    const anomalyNote = notifPayloads(sb).find((n: any) => n.title === "Anomaly Detected");
    expect(anomalyNote.message).toContain("Chronic late payer: KFC");
    expect(callsTo(sb, "audit_log")).toHaveLength(2); // one per emitted event
    expect(results[1].message).toMatch(/anomaly emitted/);
  });

  test("tenant.underreporting: critical notification + anomaly row with hard-coded property", async () => {
    const sb = sbFor({ anomalies: null });
    const { results } = await bus.emitEvent(
      "tenant.underreporting",
      "revenue-engine",
      { tenant_id: "t1", tenant_name: "Adidas", variance_egp: 50000, discrepancy_id: "d1" },
      sb
    );
    expect(notifPayloads(sb)[0]).toMatchObject({
      title: "Revenue Discrepancy Flagged",
      type: "critical",
      link: "/dashboard/discrepancies",
    });
    const anomaly = callsTo(sb, "anomalies")[0].payloads[0];
    expect(anomaly).toMatchObject({
      property_id: "a0000000-0000-0000-0000-000000000001",
      type: "revenue_discrepancy",
      severity: "warning",
      title: "Underreporting: Adidas",
      source_module: "event-bus",
      source_data: { tenant_id: "t1", discrepancy_id: "d1", variance_egp: 50000 },
      status: "active",
    });
    expect(results[1]).toMatchObject({ handler: "create-anomaly", success: true });
  });

  test("tenant.underreporting: anomaly insert error => failed result with message", async () => {
    const sb = sbFor({}, { errors: { anomalies: { message: "no such table" } } });
    const { results } = await bus.emitEvent("tenant.underreporting", "revenue-engine", { tenant_name: "X" }, sb);
    expect(results[1]).toMatchObject({
      handler: "create-anomaly",
      success: false,
      message: "Failed to create anomaly: no such table",
    });
  });

  // BUG: src/lib/event-bus.ts:330-343 (notify-underreporting; same pattern in every notify-* handler)
  // — createNotification returns null on DB failure, but the handler ignores
  // the return value and reports success:true "Underreporting notification
  // for X". The stored HandlerResult therefore claims an alert was sent when
  // none was. (In prod this matters: notifications.staff_id is NOT NULL in
  // 00001_foundation.sql, and the bus always inserts staff_id = null.)
  test.fails("notify handler reports failure when the notification insert fails", async () => {
    const sb = sbFor({}, { errors: { notifications: { message: "staff_id not null" } } });
    const { results } = await bus.emitEvent("tenant.underreporting", "revenue-engine", { tenant_name: "X" }, sb);
    const notify = results.find((r) => r.handler === "notify-underreporting")!;
    expect(notify.success).toBe(false);
  });

  test("footfall.drop: energy cost > 500 cascades to energy.waste_detected", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    try {
      const sb = sbFor({ energy_readings: [{ cost_egp: 300 }, { cost_egp: 250.5 }, { cost_egp: null }] });
      const { results } = await bus.emitEvent(
        "footfall.drop",
        "footfall-engine",
        { zone_id: "z1", zone_name: "Food Court", drop_pct: 40 },
        sb
      );
      const er = callsTo(sb, "energy_readings")[0];
      expect(er.filters).toEqual([
        'eq("zone_id", "z1")',
        'gte("timestamp", "2026-10-25T12:00:00.000Z")',
        "limit(10)",
      ]);
      const types = callsTo(sb, "system_events")
        .filter((c: any) => c.payloads[0]?.type)
        .map((c: any) => c.payloads[0].type);
      expect(types).toEqual(["footfall.drop", "energy.waste_detected"]);
      const titles = notifPayloads(sb).map((n: any) => n.title);
      expect(titles).toEqual(["Footfall Drop Detected", "Energy Waste Detected"]);
      expect(results[1].message).toContain("EGP 550.5/day");
    } finally {
      vi.useRealTimers();
    }
  });

  test("footfall.drop: cost exactly 500 is NOT waste (strict >)", async () => {
    const sb = sbFor({ energy_readings: [{ cost_egp: 500 }] });
    const { results } = await bus.emitEvent("footfall.drop", "footfall-engine", { zone_id: "z1", zone_name: "A" }, sb);
    expect(callsTo(sb, "system_events")).toHaveLength(2);
    expect(results[1].message).toMatch(/normal/);
  });

  test("footfall.drop: no zone_id => cross-reference fails, notification still sent", async () => {
    const sb = sbFor();
    const { results } = await bus.emitEvent("footfall.drop", "footfall-engine", {}, sb);
    expect(results[0].success).toBe(true);
    expect(results[1]).toMatchObject({ success: false, message: "No zone_id provided" });
    expect(notifPayloads(sb)[0].message).toBe("Zone Unknown footfall dropped ?% below normal");
  });

  test.each([
    ["urgent", 1],
    ["emergency", 1],
    ["high", 0],
    ["URGENT", 0], // case-sensitive match
    [undefined, 0],
  ])("maintenance.created priority=%s => %i urgent notifications", async (priority, n) => {
    const sb = sbFor();
    await bus.emitEvent("maintenance.created", "maintenance", { title: "Leak", priority, zone_name: "B1" }, sb);
    const urgent = notifPayloads(sb).filter((x: any) => x.title === "Urgent Maintenance");
    expect(urgent).toHaveLength(n);
    if (n) expect(urgent[0].message).toBe("Urgent maintenance: Leak in B1");
  });

  test("maintenance.created: >=3 zone tickets in 30 days emits anomaly", async () => {
    const sb = sbFor({ maintenance_tickets: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const { results } = await bus.emitEvent(
      "maintenance.created",
      "maintenance",
      { zone_id: "z9", priority: "low" },
      sb
    );
    const mt = callsTo(sb, "maintenance_tickets")[0];
    expect(mt.filters[0]).toBe('eq("zone_id", "z9")');
    expect(mt.filters[1]).toMatch(/^gte\("created_at", /);
    const anomalyNote = notifPayloads(sb).find((x: any) => x.title === "Anomaly Detected");
    expect(anomalyNote.message).toContain("Zone z9 has 3 maintenance tickets");
    expect(results[1].message).toMatch(/anomaly emitted/);
  });

  test("maintenance.created: no zone_id skips pattern check but counts as success", async () => {
    const sb = sbFor();
    const { results } = await bus.emitEvent("maintenance.created", "maintenance", {}, sb);
    expect(callsTo(sb, "maintenance_tickets")).toHaveLength(0);
    expect(results[1]).toMatchObject({ success: true, message: "No zone_id — skipping pattern check" });
  });

  test.each([
    ["critical", "critical"],
    ["warning", "warning"],
    ["info", "warning"],
    [undefined, "warning"],
  ])("anomaly.detected severity=%s => notification type %s", async (severity, type) => {
    const sb = sbFor();
    await bus.emitEvent("anomaly.detected", "anomaly-engine", { severity }, sb);
    const n = notifPayloads(sb)[0];
    expect(n.type).toBe(type);
    expect(n.message).toBe("An anomaly was detected in the system");
  });

  test("anomaly.critical broadcasts with null staff_id and CRITICAL prefix", async () => {
    const sb = sbFor();
    await bus.emitEvent("anomaly.critical", "anomaly-engine", { description: "Fire alarm" }, sb);
    expect(notifPayloads(sb)[0]).toMatchObject({
      title: "CRITICAL ANOMALY",
      message: "CRITICAL: Fire alarm",
      staff_id: null,
      type: "critical",
    });
  });

  test("campaign.started / maintenance.resolved produce info notifications", async () => {
    const sb = sbFor();
    await bus.emitEvent("campaign.started", "marketing", { campaign_name: "Summer" }, sb);
    const { results } = await bus.emitEvent("maintenance.resolved", "maintenance", { title: "Leak" }, sb);
    const notes = notifPayloads(sb);
    expect(notes.map((n: any) => [n.title, n.type, n.message])).toEqual([
      ["Campaign Active", "info", "Campaign Summer is now active"],
      ["Maintenance Resolved", "info", "Ticket resolved: Leak"],
    ]);
    expect(results[0].message).toBe("Resolution notification for ticket unknown");
  });
});
