/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { PropertySnapshot } from "@/lib/ai-brain";
import { createRoutingSupabase } from "./helpers/routing-supabase-mock";
import { createSettingsStore } from "./helpers/settings-store";

// Hoisted so the same mock instances survive vi.resetModules().
const { emitEvent, createNotification, logAudit, logger, anthropicCreate, anthropicCtor } = vi.hoisted(() => ({
  emitEvent: vi.fn(),
  createNotification: vi.fn(),
  logAudit: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  anthropicCreate: vi.fn(),
  anthropicCtor: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/event-bus", () => ({ emitEvent }));
vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/audit", () => ({ logAudit }));
// The official SDK is mocked: nothing in this file may reach the network.
// Error classes stay real so `instanceof` checks in the code work.
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    beta = { messages: { create: anthropicCreate } };
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
  }
  return { ...actual, default: MockAnthropic, Anthropic: MockAnthropic };
});

// Load a fresh module copy per test (keeps mocks/env changes isolated).
async function loadBrain() {
  vi.resetModules();
  return await import("@/lib/ai-brain");
}

/** A routing Supabase mock with only an in-memory system_settings table. */
function settingsDb(initial: Record<string, any> = {}) {
  const store = createSettingsStore(initial);
  const db = createRoutingSupabase({ system_settings: store.routing });
  return Object.assign(db, { store });
}

function snap(overrides: Partial<{ [K in keyof PropertySnapshot]: Partial<PropertySnapshot[K]> }> = {}): PropertySnapshot {
  // A "healthy" baseline that triggers NO rule.
  const base: PropertySnapshot = {
    timestamp: "2026-10-26T08:00:00.000Z",
    tenants: { total: 160, by_category: { fashion: 60 }, vacant_units: 4, occupancy_rate: 97 },
    revenue: {
      total_rent_collected_this_month: 1_000_000,
      overdue_amount: 0,
      overdue_count: 0,
      percentage_rent_premium: 100_000,
    },
    leases: { expiring_within_90_days: 0, expiring_leases: [], wale_years: 4.2, total_active: 150 },
    footfall: { today_total: 12_000, yesterday_total: 12_000, change_pct: 0, busiest_zone: "Food Court", trend: "stable" },
    energy: { today_consumption_kwh: 10_000, today_cost_egp: 3_000, waste_estimate_egp: 450 },
    maintenance: { open_tickets: 3, urgent_count: 0 },
    anomalies: { active_count: 0, critical_count: 0 },
    discrepancies: { flagged_count: 0, total_variance_egp: 0 },
    marketing: { active_campaigns: 2, upcoming_events: 1 },
    social: { followers_total: 50_000, engagement_rate: 3.5 },
  };
  const out: any = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = { ...(base as any)[k], ...(v as any) };
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────
describe("ai-brain: persisted config (system_settings)", () => {
  test("defaults when nothing is stored: supervised, enabled, 30 min, zero counters", async () => {
    const { getBrainConfig } = await loadBrain();
    expect(await getBrainConfig(settingsDb())).toEqual({
      mode: "supervised",
      enabled: true,
      interval_minutes: 30,
      last_cycle: null,
      total_cycles: 0,
      total_decisions: 0,
      total_executed: 0,
    });
  });

  test("reads config + stats from system_settings for the property", async () => {
    const { getBrainConfig, PROPERTY_ID } = await loadBrain();
    const db = settingsDb({
      brain_config: { mode: "autonomous", enabled: false, interval_minutes: 45 },
      brain_stats: { last_cycle: "2026-10-26T10:00:00.000Z", total_cycles: 3, total_decisions: 9, total_executed: 2 },
    });
    expect(await getBrainConfig(db)).toEqual({
      mode: "autonomous",
      enabled: false,
      interval_minutes: 45,
      last_cycle: "2026-10-26T10:00:00.000Z",
      total_cycles: 3,
      total_decisions: 9,
      total_executed: 2,
    });
    const reads = db.opsFor("system_settings", "select");
    expect(reads.every((o: any) => o.eq("property_id") === PROPERTY_ID)).toBe(true);
  });

  test("a corrupt or unknown mode is treated as supervised (never autonomous)", async () => {
    const { getBrainConfig } = await loadBrain();
    const c = await getBrainConfig(settingsDb({ brain_config: { mode: "AUTONOMOUS", interval_minutes: "x" } }));
    expect(c.mode).toBe("supervised");
    expect(c.interval_minutes).toBe(30);
  });

  test("a read error falls back to safe defaults", async () => {
    const { getBrainConfig } = await loadBrain();
    const db = createRoutingSupabase({ system_settings: { __error: { message: "down" } } });
    expect((await getBrainConfig(db)).mode).toBe("supervised");
  });

  test("updateBrainConfig persists (upsert) and is visible to a fresh module instance", async () => {
    const db = settingsDb();
    const a = await loadBrain();
    await a.updateBrainConfig(db, { mode: "autonomous" }, { updatedBy: "user-1" });
    const upsert = db.opsFor("system_settings", "upsert")[0];
    expect(upsert.payload).toMatchObject({
      property_id: a.PROPERTY_ID,
      key: "brain_config",
      value: { mode: "autonomous", enabled: true, interval_minutes: 30 },
      updated_by: "user-1",
    });
    // Simulates another serverless instance: new module, same DB.
    const b = await loadBrain();
    expect((await b.getBrainConfig(db)).mode).toBe("autonomous");
    expect(logAudit).toHaveBeenCalledWith(db, expect.objectContaining({ action: "brain_config_updated", user_id: "user-1" }));
  });

  test("updateBrainConfig clamps interval to [5,120]", async () => {
    const { updateBrainConfig } = await loadBrain();
    const db = settingsDb();
    expect((await updateBrainConfig(db, { interval_minutes: 1 })).interval_minutes).toBe(5);
    expect((await updateBrainConfig(db, { interval_minutes: -50 })).interval_minutes).toBe(5);
    expect((await updateBrainConfig(db, { interval_minutes: 5 })).interval_minutes).toBe(5);
    expect((await updateBrainConfig(db, { interval_minutes: 120 })).interval_minutes).toBe(120);
    expect((await updateBrainConfig(db, { interval_minutes: 10_000 })).interval_minutes).toBe(120);
    expect((await updateBrainConfig(db, { interval_minutes: 45 })).interval_minutes).toBe(45);
  });

  test("partial update leaves other fields untouched; enabled=false is honoured (falsy)", async () => {
    const { updateBrainConfig, getBrainConfig } = await loadBrain();
    const db = settingsDb();
    await updateBrainConfig(db, { mode: "autonomous" });
    const after = await updateBrainConfig(db, { enabled: false });
    expect(after.mode).toBe("autonomous");
    expect(after.enabled).toBe(false);
    expect(after.interval_minutes).toBe(30);
    expect((await getBrainConfig(db)).enabled).toBe(false);
  });

  test("updateBrainConfig with NaN interval keeps a finite interval", async () => {
    const { updateBrainConfig } = await loadBrain();
    const db = settingsDb({ brain_config: { interval_minutes: 40 } });
    const c = await updateBrainConfig(db, { interval_minutes: NaN });
    expect(Number.isFinite(c.interval_minutes)).toBe(true);
    expect(c.interval_minutes).toBe(40);
    expect((await updateBrainConfig(db, { interval_minutes: Infinity })).interval_minutes).toBe(40);
  });

  test("updateBrainConfig throws when the write fails (no silent mode switch)", async () => {
    const { updateBrainConfig } = await loadBrain();
    const db = createRoutingSupabase({
      system_settings: (ctx: any) => (ctx.op === "upsert" ? { __error: { message: "denied" } } : []),
    });
    await expect(updateBrainConfig(db, { mode: "autonomous" })).rejects.toThrow("Failed to save brain config");
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-brain: job locks", () => {
  test("acquire → busy → release → acquire again", async () => {
    const { acquireJobLock, releaseJobLock } = await loadBrain();
    const db = settingsDb();
    const h1 = await acquireJobLock(db, "brain_cycle", 60_000);
    expect(h1).toBeTruthy();
    expect(db.store.rows.get("lock:brain_cycle").holder).toBe(h1);
    expect(await acquireJobLock(db, "brain_cycle", 60_000)).toBeNull();
    // A stranger cannot release someone else's lock
    await releaseJobLock(db, "brain_cycle", "not-me");
    expect(db.store.rows.has("lock:brain_cycle")).toBe(true);
    await releaseJobLock(db, "brain_cycle", h1!);
    expect(db.store.rows.has("lock:brain_cycle")).toBe(false);
    expect(await acquireJobLock(db, "brain_cycle", 60_000)).toBeTruthy();
  });

  test("an expired lock is taken over", async () => {
    const { acquireJobLock } = await loadBrain();
    const db = settingsDb({
      "lock:brain_cycle": { holder: "old", acquired_at: "2020-01-01T00:00:00.000Z", expires_at: "2020-01-01T00:05:00.000Z" },
    });
    const h = await acquireJobLock(db, "brain_cycle", 60_000);
    expect(h).toBeTruthy();
    expect(db.store.rows.get("lock:brain_cycle").holder).toBe(h);
  });

  test("a non-conflict insert error does not grant the lock", async () => {
    const { acquireJobLock } = await loadBrain();
    const db = createRoutingSupabase({ system_settings: { __error: { code: "42P01", message: "no table" } } });
    expect(await acquireJobLock(db, "x", 1000)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-brain: runRuleBasedAnalysis", () => {
  test("healthy snapshot produces no decisions and the 'normal parameters' summary", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    const r = runRuleBasedAnalysis(snap());
    expect(r.decisions).toEqual([]);
    expect(r.summary).toBe("All systems operating within normal parameters.");
  });

  test("occupancy boundary: 85 does not trigger, 84 triggers leasing decision with vacant*20000 impact", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    expect(runRuleBasedAnalysis(snap({ tenants: { occupancy_rate: 85 } })).decisions).toHaveLength(0);
    const r = runRuleBasedAnalysis(snap({ tenants: { occupancy_rate: 84, vacant_units: 7 } }));
    expect(r.decisions).toHaveLength(1);
    const d = r.decisions[0];
    expect(d.category).toBe("leasing");
    expect(d.confidence).toBe(85);
    expect(d.action).toContain("84%");
    expect(d.action).toContain("7 vacant units");
    expect(d.impact_estimate).toBe(`EGP ${(140000).toLocaleString()}/month potential`);
  });

  test("revenue leakage requires footfall strictly > 5000 AND at least one discrepancy", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    const at5000 = runRuleBasedAnalysis(
      snap({ footfall: { today_total: 5000 }, discrepancies: { flagged_count: 1, total_variance_egp: 1000 } })
    );
    expect(at5000.decisions.find((d) => d.event_type === "tenant.underreporting")).toBeUndefined();
    const hit = runRuleBasedAnalysis(
      snap({ footfall: { today_total: 5001 }, discrepancies: { flagged_count: 1, total_variance_egp: 1000 } })
    );
    const d = hit.decisions.find((x) => x.event_type === "tenant.underreporting")!;
    expect(d.category).toBe("revenue");
    expect(d.auto_executable).toBe(false);
  });

  test("expiring leases lists only the first 3 and references WALE", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    const leases = ["A", "B", "C", "D", "E"].map((n, i) => ({
      tenant_name: n,
      end_date: `2026-12-0${i + 1}`,
      unit: `U${i}`,
    }));
    const r = runRuleBasedAnalysis(
      snap({ leases: { expiring_within_90_days: 5, expiring_leases: leases, wale_years: 4.2 } })
    );
    const d = r.decisions.find((x) => x.event_type === "lease.expiring")!;
    expect(d.action).toContain("A (2026-12-01), B (2026-12-02), C (2026-12-03)");
    expect(d.action).not.toContain("D (");
    expect(d.reasoning).toContain("4.2 years");
    expect(d.confidence).toBe(90);
  });

  test("energy waste boundary: 500 does not trigger, 501 triggers with x30 monthly projection", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    expect(runRuleBasedAnalysis(snap({ energy: { waste_estimate_egp: 500 } })).decisions).toHaveLength(0);
    const d = runRuleBasedAnalysis(snap({ energy: { waste_estimate_egp: 501 } })).decisions[0];
    expect(d.category).toBe("energy");
    expect(d.event_type).toBe("energy.waste_detected");
    expect(d.impact_estimate).toBe(`EGP ${(15030).toLocaleString()}/month savings`);
  });

  test("discrepancy investigation fires at >=3 flagged and caps 'top N' at 3", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    const two = runRuleBasedAnalysis(snap({ footfall: { today_total: 100 }, discrepancies: { flagged_count: 2 } }));
    expect(two.decisions.some((d) => d.action.startsWith("Priority: investigate"))).toBe(false);
    const ten = runRuleBasedAnalysis(snap({ footfall: { today_total: 100 }, discrepancies: { flagged_count: 10, total_variance_egp: 5 } }));
    const d = ten.decisions.find((x) => x.action.startsWith("Priority: investigate"))!;
    expect(d.action).toContain("top 3 underreporters — 10 total flagged");
  });

  test("overdue rent is the only auto-executable rule", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    // Trigger as many rules as possible at once
    const r = runRuleBasedAnalysis(
      snap({
        tenants: { occupancy_rate: 50, vacant_units: 20 },
        footfall: { today_total: 9000, change_pct: -40, trend: "down" },
        discrepancies: { flagged_count: 5, total_variance_egp: 100_000 },
        leases: { expiring_within_90_days: 1, expiring_leases: [{ tenant_name: "X", end_date: "2026-11-01", unit: "1" }], wale_years: 1, total_active: 10 },
        energy: { waste_estimate_egp: 1000, today_cost_egp: 6000 },
        revenue: { overdue_count: 3, overdue_amount: 45_000, percentage_rent_premium: 0, total_rent_collected_this_month: 1_000_000 },
        anomalies: { critical_count: 1, active_count: 4 },
        marketing: { active_campaigns: 0 },
        maintenance: { urgent_count: 2 },
        social: { engagement_rate: 1.2, followers_total: 100 },
      })
    );
    expect(r.decisions).toHaveLength(13);
    const auto = r.decisions.filter((d) => d.auto_executable);
    expect(auto).toHaveLength(1);
    expect(auto[0].event_type).toBe("rent.overdue");
    expect(auto[0].confidence).toBe(95);
    // all decisions are unexecuted, unapproved, supervised, with confidence in [0,100]
    for (const d of r.decisions) {
      expect(d.executed).toBe(false);
      expect(d.approved).toBeNull();
      expect(d.mode).toBe("supervised");
      expect(d.cycle_id).toBe("");
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(100);
    }
    // Summary counts: high-confidence = conf >= 85
    const high = r.decisions.filter((d) => d.confidence >= 85).length;
    const rev = r.decisions.filter((d) => d.category === "revenue").length;
    expect(r.summary).toBe(
      `${high} high-confidence action(s) require attention. ${rev} revenue-related finding(s). 13 total decisions from rule-based analysis.`
    );
  });

  test("rule order is stable (occupancy → leakage → expiring → energy → ...)", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    const r = runRuleBasedAnalysis(
      snap({
        tenants: { occupancy_rate: 50 },
        footfall: { today_total: 9000 },
        discrepancies: { flagged_count: 1 },
        leases: { expiring_within_90_days: 1, expiring_leases: [] },
        energy: { waste_estimate_egp: 1000 },
      })
    );
    expect(r.decisions.map((d) => d.category)).toEqual(["leasing", "revenue", "leasing", "energy"]);
  });

  test("marketing rule needs zero campaigns AND non-zero footfall", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    expect(
      runRuleBasedAnalysis(snap({ marketing: { active_campaigns: 0 }, footfall: { today_total: 0 } })).decisions
    ).toHaveLength(0);
    const r = runRuleBasedAnalysis(snap({ marketing: { active_campaigns: 0 }, footfall: { today_total: 1 } }));
    expect(r.decisions).toHaveLength(1);
    expect(r.decisions[0].category).toBe("marketing");
  });

  test("percentage-rent rule: strict < 5% of collected; zero/zero does not trigger", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    const zero = runRuleBasedAnalysis(
      snap({ revenue: { percentage_rent_premium: 0, total_rent_collected_this_month: 0 } })
    );
    expect(zero.decisions).toHaveLength(0);
    const exactly5 = runRuleBasedAnalysis(
      snap({ revenue: { percentage_rent_premium: 50_000, total_rent_collected_this_month: 1_000_000 } })
    );
    expect(exactly5.decisions).toHaveLength(0);
    const below = runRuleBasedAnalysis(
      snap({ revenue: { percentage_rent_premium: 49_999, total_rent_collected_this_month: 1_000_000 } })
    );
    expect(below.decisions).toHaveLength(1);
    expect(below.decisions[0].action).toMatch(/Low percentage rent/);
  });

  test("social rule requires followers > 0 and engagement < 2.0 (2.0 itself is fine)", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    expect(runRuleBasedAnalysis(snap({ social: { engagement_rate: 0, followers_total: 0 } })).decisions).toHaveLength(0);
    expect(runRuleBasedAnalysis(snap({ social: { engagement_rate: 2.0 } })).decisions).toHaveLength(0);
    const d = runRuleBasedAnalysis(snap({ social: { engagement_rate: 1.99 } })).decisions;
    expect(d).toHaveLength(1);
    expect(d[0].confidence).toBe(60);
  });

  test("WALE rule ignored when there are no active leases (WALE=0 is not 'declining')", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    expect(runRuleBasedAnalysis(snap({ leases: { wale_years: 0, total_active: 0 } })).decisions).toHaveLength(0);
    const r = runRuleBasedAnalysis(snap({ leases: { wale_years: 1.9, total_active: 1 } }));
    expect(r.decisions[0].action).toContain("WALE at 1.9 years");
  });

  test("footfall drop needs trend 'down' AND change < -15 (exactly -15 is ignored)", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    expect(runRuleBasedAnalysis(snap({ footfall: { trend: "down", change_pct: -15 } })).decisions).toHaveLength(0);
    // inconsistent input: big drop but trend says stable → no decision
    expect(runRuleBasedAnalysis(snap({ footfall: { trend: "stable", change_pct: -30 } })).decisions).toHaveLength(0);
    const d = runRuleBasedAnalysis(snap({ footfall: { trend: "down", change_pct: -16 } })).decisions[0];
    expect(d.action).toContain("Footfall dropped 16%");
    expect(d.event_type).toBe("footfall.drop");
  });

  test("summary omits high-confidence/revenue clauses when none apply", async () => {
    const { runRuleBasedAnalysis } = await loadBrain();
    // Only social (conf 60, marketing)
    const r = runRuleBasedAnalysis(snap({ social: { engagement_rate: 1 } }));
    expect(r.summary).toBe("1 total decisions from rule-based analysis.");
  });
});

// ─────────────────────────────────────────────────────────────
// gatherPropertySnapshot
// ─────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-26T12:00:00.000Z");
const TODAY = "2026-10-26";
const YESTERDAY = "2026-10-25";

function snapshotDb(over: Record<string, any> = {}) {
  return createRoutingSupabase({
    tenants: [
      { id: "t1", category: "fashion", status: "active" },
      { id: "t2", category: "fashion", status: "active" },
      { id: "t3", category: null, status: "active" },
    ],
    units: [
      { id: "u1", status: "occupied" },
      { id: "u2", status: "vacant" },
      { id: "u3", status: "occupied" },
      { id: "u4", status: "maintenance" },
    ],
    rent_transactions: (ctx: any) => {
      if (ctx.eq("status") === "paid") return [{ amount_paid: 1000.4 }, { amount_paid: null }, { amount_paid: 2000 }];
      if (ctx.eq("status") === "overdue")
        return [
          { amount_due: 5000, amount_paid: 1000 },
          { amount_due: 3000, amount_paid: null },
        ];
      // percentage rent query
      return [{ percentage_rent_due: 250 }, { percentage_rent_due: 250.6 }];
    },
    leases: (ctx: any) => {
      if (ctx.filters.some((f: any) => f.name === "lte"))
        return [
          { end_date: "2026-11-30", tenants: { name: "Aldo" }, units: { unit_number: "G-12" } },
          { end_date: "2026-12-15", tenants: null, units: null },
        ];
      return [
        { id: "l1", start_date: "2020-01-01", end_date: "2028-10-26T12:00:00.000Z" }, // ~2 yrs
        { id: "l2", start_date: "2020-01-01", end_date: "2020-01-01" }, // expired → clamps to 0
      ];
    },
    footfall_daily: (ctx: any) => {
      const date = ctx.eq("date");
      const isZoneQuery = ctx.filters.some((f: any) => f.name === "limit");
      if (isZoneQuery) return [{ total_in: 900, zone_id: "z1", zones: { name: "Food Court" } }];
      if (date === TODAY) return [{ total_in: 600 }, { total_in: 600 }];
      if (date === YESTERDAY) return [{ total_in: 1000 }];
      return [];
    },
    energy_readings: [
      { consumption_kwh: 100.4, cost_egp: 1000 },
      { consumption_kwh: null, cost_egp: 2000 },
    ],
    maintenance_tickets: (ctx: any) =>
      ctx.filters.filter((f: any) => f.name === "in").length === 2 ? [{ id: "m1" }] : [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
    anomalies: (ctx: any) => (ctx.eq("severity") === "critical" ? [{ id: "a1" }] : [{ id: "a1" }, { id: "a2" }]),
    discrepancies: [{ variance_egp: -10_000 }, { variance_egp: 5_000 }, { variance_egp: null }],
    marketing_campaigns: (ctx: any) => (ctx.eq("status") === "active" ? [{ id: "c1" }] : []),
    social_metrics: [
      { followers: 1000, engagement_rate: 1.234 },
      { followers: 2000, engagement_rate: 2.0 },
    ],
    ...over,
  });
}

describe("ai-brain: gatherPropertySnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  test("aggregates every section from seeded rows", async () => {
    const { gatherPropertySnapshot } = await loadBrain();
    const s = await gatherPropertySnapshot(snapshotDb());

    expect(s.timestamp).toBe(NOW.toISOString());
    expect(s.tenants).toEqual({
      total: 3,
      by_category: { fashion: 2, other: 1 },
      vacant_units: 1,
      occupancy_rate: 75, // (4-1)/4
    });
    expect(s.revenue).toEqual({
      total_rent_collected_this_month: 3000, // null paid treated as 0, rounded
      overdue_amount: 7000, // (5000-1000) + (3000-0)
      overdue_count: 2,
      percentage_rent_premium: 501,
    });
    expect(s.leases.expiring_within_90_days).toBe(2);
    expect(s.leases.expiring_leases).toEqual([
      { tenant_name: "Aldo", end_date: "2026-11-30", unit: "G-12" },
      { tenant_name: "Unknown", end_date: "2026-12-15", unit: "N/A" },
    ]);
    expect(s.leases.total_active).toBe(2);
    // l1 ≈ 2.0 yrs remaining, l2 expired → 0; average ≈ 1.0
    expect(s.leases.wale_years).toBe(1);
    expect(s.footfall).toEqual({
      today_total: 1200,
      yesterday_total: 1000,
      change_pct: 20,
      busiest_zone: "Food Court",
      trend: "up",
    });
    expect(s.energy).toEqual({ today_consumption_kwh: 100, today_cost_egp: 3000, waste_estimate_egp: 450 });
    expect(s.maintenance).toEqual({ open_tickets: 3, urgent_count: 1 });
    expect(s.anomalies).toEqual({ active_count: 2, critical_count: 1 });
    // variance uses absolute values
    expect(s.discrepancies).toEqual({ flagged_count: 3, total_variance_egp: 15_000 });
    expect(s.marketing).toEqual({ active_campaigns: 1, upcoming_events: 0 });
    expect(s.social).toEqual({ followers_total: 3000, engagement_rate: 1.62 });
  });

  test("empty database: no NaN anywhere, occupancy 100, change 0, trend stable", async () => {
    const { gatherPropertySnapshot } = await loadBrain();
    const s = await gatherPropertySnapshot(createRoutingSupabase({}));
    const walk = (o: any) => {
      for (const v of Object.values(o)) {
        if (typeof v === "number") expect(Number.isNaN(v)).toBe(false);
        else if (v && typeof v === "object") walk(v);
      }
    };
    walk(s);
    expect(s.tenants.occupancy_rate).toBe(100);
    expect(s.tenants.total).toBe(0);
    expect(s.footfall.change_pct).toBe(0);
    expect(s.footfall.trend).toBe("stable");
    expect(s.footfall.busiest_zone).toBeNull();
    expect(s.leases.wale_years).toBe(0);
    expect(s.social.engagement_rate).toBe(0);
  });

  test("zero footfall yesterday never divides by zero", async () => {
    const { gatherPropertySnapshot } = await loadBrain();
    const s = await gatherPropertySnapshot(
      snapshotDb({
        footfall_daily: (ctx: any) => (ctx.eq("date") === TODAY ? [{ total_in: 5000 }] : [{ total_in: 0 }]),
      })
    );
    expect(s.footfall.change_pct).toBe(0);
    expect(s.footfall.trend).toBe("stable");
  });

  test("trend thresholds: +5% stable, +6% up, -6% down", async () => {
    const { gatherPropertySnapshot } = await loadBrain();
    const at = async (today: number) =>
      (
        await gatherPropertySnapshot(
          snapshotDb({
            footfall_daily: (ctx: any) =>
              ctx.eq("date") === TODAY ? [{ total_in: today }] : [{ total_in: 100 }],
          })
        )
      ).footfall.trend;
    expect(await at(105)).toBe("stable");
    expect(await at(106)).toBe("up");
    expect(await at(95)).toBe("stable");
    expect(await at(94)).toBe("down");
  });

  test("all-vacant property gives 0% occupancy", async () => {
    const { gatherPropertySnapshot } = await loadBrain();
    const s = await gatherPropertySnapshot(
      snapshotDb({ units: [{ id: "a", status: "vacant" }, { id: "b", status: "vacant" }] })
    );
    expect(s.tenants.occupancy_rate).toBe(0);
    expect(s.tenants.vacant_units).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// runBrainCycle
// ─────────────────────────────────────────────────────────────

function cycleDb(extra: Record<string, any> = {}, settings: Record<string, any> = {}) {
  let n = 0;
  const store = createSettingsStore(settings);
  const db = snapshotDb({
    brain_decisions: (ctx: any) => {
      if (ctx.op === "insert") return ctx.payload.map(() => ({ id: `bd-${++n}` }));
      return [];
    },
    system_settings: store.routing,
    ...extra,
  });
  return Object.assign(db, { store });
}

/** A Messages API response carrying `payload` as the structured-output text. */
function claudeResponse(payload: unknown, over: Record<string, any> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    stop_details: null,
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
    ...over,
  };
}

const validDecision = (over: Record<string, any> = {}) => ({
  category: "revenue",
  action: "Audit Aldo",
  reasoning: "gap",
  confidence: 88,
  impact_estimate: "EGP 10k",
  auto_executable: true,
  ...over,
});

describe("ai-brain: runBrainCycle", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    delete process.env.ANTHROPIC_MODEL;
    // Belt and braces: any accidental raw HTTP call fails the test.
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network access in tests"); }));
  });

  test("without API key: uses rules, never calls the SDK, stores decisions with source/model and assigns IDs", async () => {
    const brain = await loadBrain();
    const db = cycleDb();
    const r = await brain.runBrainCycle(db);

    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(r.source).toBe("rules");
    expect(r.model).toBeNull();
    expect(r.fallback_reason).toBe("ANTHROPIC_API_KEY not set");
    expect(r.cycle_id).toMatch(/^brain-\d+-[a-z0-9]+$/);
    expect(r.decisions.length).toBeGreaterThan(0);
    r.decisions.forEach((d, i) => {
      expect(d.cycle_id).toBe(r.cycle_id);
      expect(d.id).toBe(`bd-${i + 1}`);
      expect(d.summary).toBe(r.summary);
      expect(d.mode).toBe("supervised");
      expect(d.executed).toBe(false);
      expect(d.source).toBe("rules");
      expect(d.model).toBeNull();
    });
    const inserts = db.opsFor("brain_decisions", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toHaveLength(r.decisions.length);
    expect(inserts[0].payload[0]).toMatchObject({
      property_id: brain.PROPERTY_ID,
      source: "rules",
      model: null,
      fallback_reason: "ANTHROPIC_API_KEY not set",
    });
    // supervised mode never emits events
    expect(emitEvent).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledTimes(1);
    // 1 cycle audit + 1 per decision
    expect(logAudit).toHaveBeenCalledTimes(1 + r.decisions.length);

    const cfg = await brain.getBrainConfig(db);
    expect(cfg.total_cycles).toBe(1);
    expect(cfg.total_decisions).toBe(r.decisions.length);
    expect(cfg.total_executed).toBe(0);
    expect(cfg.last_cycle).toBe(NOW.toISOString());
  });

  test("stats accumulate across cycles (persisted, not per-instance)", async () => {
    const db = cycleDb();
    const r1 = await (await loadBrain()).runBrainCycle(db);
    const brain2 = await loadBrain();
    const r2 = await brain2.runBrainCycle(db);
    const cfg = await brain2.getBrainConfig(db);
    expect(cfg.total_cycles).toBe(2);
    expect(cfg.total_decisions).toBe(r1.decisions.length + r2.decisions.length);
  });

  test("autonomous mode (persisted) auto-executes only auto_executable decisions with an event type", async () => {
    const brain = await loadBrain();
    (emitEvent as any).mockResolvedValue({ event: null, results: [] });
    const db = cycleDb({}, { brain_config: { mode: "autonomous" } });
    const r = await brain.runBrainCycle(db);

    const executed = r.decisions.filter((d) => d.executed);
    expect(executed).toHaveLength(1); // only the overdue-rent reminder
    expect(executed[0].event_type).toBe("rent.overdue");
    expect(executed[0].approved).toBe(true);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect((emitEvent as any).mock.calls[0][0]).toBe("rent.overdue");
    expect((emitEvent as any).mock.calls[0][2]).toMatchObject({ brain_cycle_id: r.cycle_id, decision_id: executed[0].id });
    const updates = db.opsFor("brain_decisions", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ executed: true, approved: true });
    expect((await brain.getBrainConfig(db)).total_executed).toBe(1);
  });

  test("autonomous switched off mid-cycle (by another instance) → nothing auto-executes", async () => {
    const brain = await loadBrain();
    (emitEvent as any).mockResolvedValue({});
    const store = createSettingsStore({ brain_config: { mode: "autonomous" } });
    let reads = 0;
    const db = cycleDb({
      system_settings: (ctx: any) => {
        // After the first config read, an owner flips the mode to supervised.
        if (ctx.op === "select" && ctx.eq("key") === "brain_config" && ++reads === 2) {
          store.rows.set("brain_config", { mode: "supervised" });
        }
        return store.routing(ctx);
      },
    });
    const r = await brain.runBrainCycle(db);
    expect(r.decisions.every((d) => d.mode === "autonomous")).toBe(true);
    expect(r.decisions.some((d) => d.executed)).toBe(false);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  test("autonomous: an emitEvent failure is swallowed and the decision stays unexecuted", async () => {
    const brain = await loadBrain();
    (emitEvent as any).mockRejectedValue(new Error("bus down"));
    const db = cycleDb({}, { brain_config: { mode: "autonomous" } });
    const r = await brain.runBrainCycle(db);
    expect(r.decisions.every((d) => !d.executed)).toBe(true);
    expect((await brain.getBrainConfig(db)).total_executed).toBe(0);
  });

  test("insert error: decisions still returned, but without IDs", async () => {
    const brain = await loadBrain();
    const r = await brain.runBrainCycle(
      cycleDb({ brain_decisions: { __error: { message: "rls" } } })
    );
    expect(r.decisions.length).toBeGreaterThan(0);
    expect(r.decisions.every((d) => d.id === undefined)).toBe(true);
  });

  test("uses Claude via the SDK with the documented parameters", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    anthropicCreate.mockResolvedValue(
      claudeResponse({
        decisions: [validDecision(), validDecision({ category: "energy", action: "Dim lights", reasoning: "waste", confidence: 40, impact_estimate: null, auto_executable: false })],
        summary: "Two things.",
      })
    );
    const brain = await loadBrain();
    const db = cycleDb();
    const r = await brain.runBrainCycle(db);

    expect(anthropicCtor).toHaveBeenCalledWith({ timeout: brain.ANTHROPIC_TIMEOUT_MS, maxRetries: brain.ANTHROPIC_MAX_RETRIES });
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const params = anthropicCreate.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(16000);
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params).not.toHaveProperty("temperature");
    expect(params.messages[0].content).toContain("Property Snapshot");

    expect(r.source).toBe("claude");
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.fallback_reason).toBeNull();
    expect(r.summary).toBe("Two things.");
    expect(r.decisions).toHaveLength(2);
    expect(r.decisions[0]).toMatchObject({ category: "revenue", confidence: 88, auto_executable: true, event_type: null, source: "claude", model: "claude-opus-5-5" });
    expect(r.decisions[1]).toMatchObject({ confidence: 40, impact_estimate: null, auto_executable: false });
    expect(db.opsFor("brain_decisions", "insert")[0].payload[0]).toMatchObject({ source: "claude", model: "claude-opus-5-5", fallback_reason: null });
  });

  test("ANTHROPIC_MODEL overrides the default; the served model (after a fallback) is recorded", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    anthropicCreate.mockResolvedValue(
      claudeResponse({ decisions: [validDecision()], summary: "s" }, { model: "claude-opus-4-8" })
    );
    const brain = await loadBrain();
    expect(brain.getAnthropicModel()).toBe("claude-sonnet-5-5");
    const r = await brain.runBrainCycle(cycleDb());
    expect(anthropicCreate.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
    expect(r.model).toBe("claude-opus-4-8");
    expect(r.decisions[0].model).toBe("claude-opus-4-8");
  });

  test("default model id is claude-opus-5-5", async () => {
    const brain = await loadBrain();
    expect(brain.DEFAULT_ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    expect(brain.getAnthropicModel()).toBe("claude-opus-5-5");
  });

  test("falls back to rules — recording the reason — for every failure mode", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const { NotFoundError, APIConnectionError } = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    const cases: Array<[() => void, RegExp]> = [
      [() => anthropicCreate.mockResolvedValue(claudeResponse("no json here")), /not valid JSON/],
      [() => anthropicCreate.mockResolvedValue(claudeResponse({ decisions: [], summary: "x" })), /no decisions/],
      [() => anthropicCreate.mockResolvedValue(claudeResponse({ decisions: [validDecision({ category: "finance" })], summary: "x" })), /schema validation failed.*category/],
      [() => anthropicCreate.mockResolvedValue(claudeResponse({ decisions: [validDecision({ reasoning: undefined })], summary: "x" })), /schema validation failed.*reasoning/],
      [() => anthropicCreate.mockResolvedValue(claudeResponse({ decisions: [validDecision({ confidence: "high" })], summary: "x" })), /schema validation failed.*confidence/],
      [() => anthropicCreate.mockResolvedValue(claudeResponse({ summary: "x" }, { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null }, content: [] })), /refused \(category: cyber\)/],
      [() => anthropicCreate.mockResolvedValue(claudeResponse('{"decisions": [', { stop_reason: "max_tokens" })), /truncated/],
      [() => anthropicCreate.mockRejectedValue(new NotFoundError(404, { type: "error", error: { type: "not_found_error", message: "model: claude-sonnet-4-20250514" } }, "model not found", new Headers())), /model not found/],
      [() => anthropicCreate.mockRejectedValue(new APIConnectionError({ message: "offline" })), /connection error/],
      [() => anthropicCreate.mockRejectedValue(new Error("weird")), /unexpected error: weird/],
    ];
    for (const [setup, reason] of cases) {
      anthropicCreate.mockReset();
      setup();
      const brain = await loadBrain();
      const db = cycleDb();
      const r = await brain.runBrainCycle(db);
      expect(r.source, String(reason)).toBe("rules");
      expect(r.fallback_reason, String(reason)).toMatch(reason);
      expect(r.decisions.every((d) => d.source === "rules" && d.fallback_reason === r.fallback_reason)).toBe(true);
      expect(db.opsFor("brain_decisions", "insert")[0].payload[0].source).toBe("rules");
    }
  });

  test("Claude confidence 0 is preserved (not replaced by the 50 default)", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    anthropicCreate.mockResolvedValue(claudeResponse({ decisions: [validDecision({ confidence: 0 })], summary: "s" }));
    const brain = await loadBrain();
    const r = await brain.runBrainCycle(cycleDb());
    expect(r.source).toBe("claude");
    expect(r.decisions[0].confidence).toBe(0);
  });

  test("Claude confidence is clamped to [0,100]", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    anthropicCreate.mockResolvedValue(
      claudeResponse({ decisions: [validDecision({ confidence: 150 }), validDecision({ confidence: -20 })], summary: "s" })
    );
    const brain = await loadBrain();
    const r = await brain.runBrainCycle(cycleDb());
    expect(r.source).toBe("claude");
    expect(r.decisions.map((d) => d.confidence)).toEqual([100, 0]);
  });

  test("runBrainCycleExclusive returns null while another cycle holds the lock, and releases its own", async () => {
    const brain = await loadBrain();
    const busy = cycleDb({}, {
      "lock:brain_cycle": { holder: "other", acquired_at: NOW.toISOString(), expires_at: new Date(NOW.getTime() + 60_000).toISOString() },
    });
    expect(await brain.runBrainCycleExclusive(busy)).toBeNull();
    expect(busy.opsFor("brain_decisions", "insert")).toHaveLength(0);

    const free = cycleDb();
    const r = await brain.runBrainCycleExclusive(free);
    expect(r?.decisions.length).toBeGreaterThan(0);
    expect(free.store.rows.has("lock:brain_cycle")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe("ai-brain: decision actions", () => {
  test("approveDecision emits the event once and marks executed", async () => {
    const brain = await loadBrain();
    (emitEvent as any).mockResolvedValue({});
    const store = createSettingsStore();
    const db = createRoutingSupabase({
      brain_decisions: (ctx: any) =>
        ctx.single
          ? { id: "d1", event_type: "rent.overdue", executed: false, action: "remind", event_payload: { x: 1 } }
          : [],
      system_settings: store.routing,
    });
    expect(await brain.approveDecision(db, "d1")).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith(
      "rent.overdue",
      "ai-brain",
      { brain_decision_id: "d1", action: "remind", x: 1 },
      db
    );
    const updates = db.opsFor("brain_decisions", "update").map((o: any) => o.payload);
    expect(updates).toEqual([{ approved: true }, { executed: true }]);
    expect((await brain.getBrainConfig(db)).total_executed).toBe(1);
  });

  test("approveDecision does not re-execute an already-executed or event-less decision", async () => {
    const brain = await loadBrain();
    for (const row of [
      { id: "d1", event_type: "rent.overdue", executed: true },
      { id: "d2", event_type: null, executed: false },
    ]) {
      const db = createRoutingSupabase({ brain_decisions: row });
      expect(await brain.approveDecision(db, row.id)).toBe(true);
    }
    expect(emitEvent).not.toHaveBeenCalled();
  });

  test("approveDecision returns false when the row is missing or errors", async () => {
    const brain = await loadBrain();
    expect(await brain.approveDecision(createRoutingSupabase({ brain_decisions: null }), "x")).toBe(false);
    expect(
      await brain.approveDecision(createRoutingSupabase({ brain_decisions: { __error: { message: "e" } } }), "x")
    ).toBe(false);
  });

  test("approveDecision still returns true if event emission throws", async () => {
    const brain = await loadBrain();
    (emitEvent as any).mockRejectedValue(new Error("x"));
    const db = createRoutingSupabase({
      brain_decisions: { id: "d", event_type: "lease.expiring", executed: false },
      system_settings: createSettingsStore().routing,
    });
    expect(await brain.approveDecision(db, "d")).toBe(true);
    expect((await brain.getBrainConfig(db)).total_executed).toBe(0);
  });

  test("rejectDecision sets approved=false and reflects errors", async () => {
    const brain = await loadBrain();
    const db = createRoutingSupabase({ brain_decisions: [] });
    expect(await brain.rejectDecision(db, "d")).toBe(true);
    expect(db.opsFor("brain_decisions", "update")[0].payload).toEqual({ approved: false });
    expect(await brain.rejectDecision(createRoutingSupabase({ brain_decisions: { __error: { message: "x" } } }), "d")).toBe(false);
  });

  test("getRecentDecisions passes the limit and returns [] on error/null", async () => {
    const brain = await loadBrain();
    const db = createRoutingSupabase({ brain_decisions: [{ id: "1" }] });
    expect(await brain.getRecentDecisions(db, 7)).toEqual([{ id: "1" }]);
    expect(db._ops[0].filters).toContainEqual({ name: "limit", args: [7] });
    expect(await brain.getRecentDecisions(createRoutingSupabase({ brain_decisions: { __error: { message: "x" } } }))).toEqual([]);
    expect(await brain.getRecentDecisions(createRoutingSupabase({}))).toEqual([]);
  });

  test("getDecisionsByCycle filters by cycle and orders by confidence desc", async () => {
    const brain = await loadBrain();
    const db = createRoutingSupabase({ brain_decisions: [{ id: "a" }] });
    await brain.getDecisionsByCycle(db, "brain-1");
    expect(db._ops[0].filters).toEqual([
      { name: "eq", args: ["cycle_id", "brain-1"] },
      { name: "order", args: ["confidence", { ascending: false }] },
    ]);
  });
});
