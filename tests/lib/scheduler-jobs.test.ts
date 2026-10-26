/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createScriptedSupabase, type QueryCtx } from "./helpers/scripted-supabase";
import { createSettingsStore } from "./helpers/settings-store";
import { createRoutingSupabase } from "./helpers/routing-supabase-mock";

const { emitEvent, createNotification, anthropicCreate } = vi.hoisted(() => ({
  emitEvent: vi.fn(async () => ({})),
  createNotification: vi.fn(async () => null),
  anthropicCreate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/event-bus", () => ({ emitEvent }));
vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/revenue-engine", () => ({ runRevenueVerification: vi.fn(async () => ({ results: [] })) }));
vi.mock("@/lib/prediction-model", () => ({
  trainFootfallModel: vi.fn(async () => ({ r_squared: 0.9, training_samples: 5 })),
  trainRevenueModel: vi.fn(async () => ({ r_squared: 0.8, training_samples: 6 })),
}));
vi.mock("@anthropic-ai/sdk", async (orig) => ({
  ...(await orig<object>()),
  default: class {
    beta = { messages: { create: anthropicCreate } };
  },
}));

const NOW = new Date("2026-10-26T12:07:00Z");

async function load() {
  vi.resetModules();
  return await import("@/lib/automations-engine");
}

function db(settings: Record<string, any> = {}) {
  const store = createSettingsStore(settings);
  const events: any[] = [];
  const sb = createScriptedSupabase((ctx: QueryCtx) => {
    if (ctx.table === "system_settings") return store.scripted(ctx);
    if (ctx.table === "system_events") {
      if (ctx.op === "insert") events.unshift(ctx.payload);
      return [];
    }
    return [];
  });
  return Object.assign(sb, { store, events });
}

const brainOff = { brain_config: { enabled: false } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network access in tests"); }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scheduler state", () => {
  test("defaults: enabled, 60 min, never run", async () => {
    const eng = await load();
    expect(await eng.getSchedulerState(db())).toEqual({
      enabled: true,
      interval_minutes: 60,
      last_run: null,
      total_cycles: 0,
      automations_last_run: null,
    });
  });

  test("updateSchedulerState persists and clamps the interval to [60,1440]; NaN is ignored", async () => {
    const eng = await load();
    const sb = db();
    expect((await eng.updateSchedulerState(sb, { interval_minutes: 15 })).interval_minutes).toBe(60);
    expect((await eng.updateSchedulerState(sb, { interval_minutes: 5000 })).interval_minutes).toBe(1440);
    expect((await eng.updateSchedulerState(sb, { interval_minutes: 120 })).interval_minutes).toBe(120);
    expect((await eng.updateSchedulerState(sb, { interval_minutes: NaN })).interval_minutes).toBe(120);
    await eng.updateSchedulerState(sb, { enabled: false }, { updatedBy: "owner" });
    expect(sb.store.rows.get("scheduler")).toMatchObject({ enabled: false, interval_minutes: 120 });
    expect((await (await load()).getSchedulerState(sb)).enabled).toBe(false);
  });
});

describe("runScheduledJob", () => {
  test("cron cycle: skipped when the scheduler is disabled (but force runs it)", async () => {
    const eng = await load();
    const sb = db({ ...brainOff, scheduler: { enabled: false } });
    expect(await eng.runScheduledJob(sb, "cycle")).toEqual({ job: "cycle", status: "skipped", reason: "scheduler disabled" });
    expect(await eng.runScheduledJob(sb, "automations")).toMatchObject({ status: "skipped" });
    expect((await eng.runScheduledJob(sb, "cycle", { force: true, trigger: "manual" })).status).toBe("ran");
  });

  test("cron cycle: skipped when not yet due; runs when due (with 5 min cron slack)", async () => {
    const eng = await load();
    const recent = db({ ...brainOff, scheduler: { interval_minutes: 120, last_run: new Date(NOW.getTime() - 60 * 60_000).toISOString() } });
    expect(await eng.runScheduledJob(recent, "cycle")).toMatchObject({ status: "skipped", reason: "not due (interval 120m)" });

    // Hourly cron firing a little early (58 min after the last run) still runs.
    const due = db({ ...brainOff, scheduler: { interval_minutes: 60, last_run: new Date(NOW.getTime() - 58 * 60_000).toISOString() } });
    expect((await eng.runScheduledJob(due, "cycle")).status).toBe("ran");
  });

  test("cycle run: stamps last_run/total_cycles, logs scheduler.cycle_completed, releases the lock", async () => {
    const eng = await load();
    const sb = db(brainOff);
    const out = await eng.runScheduledJob(sb, "cycle");
    expect(out.status).toBe("ran");
    expect(out.results).toMatchObject({ trigger: "cron", brain: { skipped: true, reason: "Brain disabled" }, overdue_rent: 0 });
    expect(sb.store.rows.get("scheduler")).toMatchObject({ last_run: NOW.toISOString(), total_cycles: 1 });
    expect(sb.events[0].type).toBe("scheduler.cycle_completed");
    expect(sb.store.rows.has("lock:scheduler_cycle")).toBe(false);
  });

  test("cycle run with the brain enabled runs a (rule-based) brain cycle under its own lock", async () => {
    const eng = await load();
    const sb = db();
    const out = await eng.runScheduledJob(sb, "cycle");
    expect((out.results as any).brain).toMatchObject({ source: "rules", fallback_reason: "ANTHROPIC_API_KEY not set" });
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(sb.store.rows.has("lock:brain_cycle")).toBe(false);
    expect(sb.store.rows.get("brain_stats")).toMatchObject({ total_cycles: 1 });
  });

  test("a held, unexpired lock makes the job a no-op (idempotent cron)", async () => {
    const eng = await load();
    const lock = { holder: "other", acquired_at: NOW.toISOString(), expires_at: new Date(NOW.getTime() + 60_000).toISOString() };
    // The routing mock can return a 23505 duplicate-key error on insert.
    const store = createSettingsStore({ ...brainOff, "lock:scheduler_cycle": lock, "lock:automations": lock });
    const sb = createRoutingSupabase({ system_settings: store.routing });
    expect(await eng.runScheduledJob(sb, "cycle")).toMatchObject({ status: "locked" });
    expect(await eng.runScheduledJob(sb, "automations", { force: true })).toMatchObject({ status: "locked" });
    expect(sb.opsFor("system_events")).toHaveLength(0);
    expect(store.rows.get("lock:scheduler_cycle").holder).toBe("other");
  });

  test("automations job: runs automations + ML retraining, stamps automations_last_run", async () => {
    const eng = await load();
    const sb = db(brainOff);
    const out = await eng.runScheduledJob(sb, "automations");
    expect(out.status).toBe("ran");
    expect(out.results).toMatchObject({
      automations: { automation_count: 7 },
      predictions: { footfall_r2: 0.9, revenue_samples: 6 },
    });
    expect(sb.store.rows.get("scheduler")).toMatchObject({ automations_last_run: NOW.toISOString() });
    expect(sb.events[0].type).toBe("scheduler.automations_completed");
    expect(sb.events.filter((e: any) => e.type === "automation.run")).toHaveLength(7);
    expect(sb.store.rows.has("lock:automations")).toBe(false);
  });

  test("the lock is released even when the job throws", async () => {
    const eng = await load();
    const sb = db(brainOff);
    const store = sb.store;
    // Make the final system_events insert throw.
    const throwing = createScriptedSupabase((ctx: QueryCtx) => {
      if (ctx.table === "system_settings") return store.scripted(ctx);
      if (ctx.table === "system_events" && (ctx.payload as any)?.type === "scheduler.cycle_completed") throw new Error("log down");
      return [];
    });
    await expect(eng.runScheduledJob(throwing, "cycle")).rejects.toThrow("log down");
    expect(store.rows.has("lock:scheduler_cycle")).toBe(false);
  });
});
