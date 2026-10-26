import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { emitEvent } from "@/lib/event-bus";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ============================================================
// Wedja AI Brain — The Decision Engine of Senzo Mall
//
// Gathers data from ALL engines, reasons about the property,
// and produces actionable decisions. Works in two modes:
//   - Supervised: decisions require human approval
//   - Autonomous: safe decisions auto-execute via Event Bus
//
// Uses Claude (official @anthropic-ai/sdk) when ANTHROPIC_API_KEY
// is set, otherwise — or when the model output fails validation —
// falls back to rule-based analysis. Every stored decision records
// its source ("claude" | "rules"), model id and fallback reason.
//
// Configuration and counters live in the `system_settings` table,
// never in module memory: on Vercel each serverless instance has
// its own memory, so a mode switch must be visible to all of them.
// ============================================================

export const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export const BRAIN_CATEGORIES = [
  "revenue",
  "leasing",
  "operations",
  "energy",
  "tenant",
  "marketing",
  "maintenance",
] as const;

export type BrainCategory = (typeof BRAIN_CATEGORIES)[number];

export type BrainSource = "claude" | "rules";

export interface BrainDecision {
  id?: string;
  cycle_id: string;
  category: BrainCategory;
  action: string;
  reasoning: string;
  confidence: number;
  impact_estimate: string | null;
  auto_executable: boolean;
  executed: boolean;
  approved: boolean | null;
  mode: "supervised" | "autonomous";
  event_type: string | null;
  event_payload: Record<string, unknown>;
  data_snapshot: Record<string, unknown>;
  summary: string | null;
  /** Where the decision came from — lets the UI tell Claude from rules. */
  source: BrainSource;
  /** Model that produced the decision (null for rule-based decisions). */
  model: string | null;
  /** Why Claude was not used for this cycle (null when source = "claude"). */
  fallback_reason: string | null;
  created_at?: string;
}

export interface PropertySnapshot {
  timestamp: string;
  tenants: {
    total: number;
    by_category: Record<string, number>;
    vacant_units: number;
    occupancy_rate: number;
  };
  revenue: {
    total_rent_collected_this_month: number;
    overdue_amount: number;
    overdue_count: number;
    percentage_rent_premium: number;
  };
  leases: {
    expiring_within_90_days: number;
    expiring_leases: Array<{ tenant_name: string; end_date: string; unit: string }>;
    wale_years: number;
    total_active: number;
  };
  footfall: {
    today_total: number;
    yesterday_total: number;
    change_pct: number;
    busiest_zone: string | null;
    trend: "up" | "down" | "stable";
  };
  energy: {
    today_consumption_kwh: number;
    today_cost_egp: number;
    waste_estimate_egp: number;
  };
  maintenance: {
    open_tickets: number;
    urgent_count: number;
  };
  anomalies: {
    active_count: number;
    critical_count: number;
  };
  discrepancies: {
    flagged_count: number;
    total_variance_egp: number;
  };
  marketing: {
    active_campaigns: number;
    upcoming_events: number;
  };
  social: {
    followers_total: number;
    engagement_rate: number;
  };
}

export interface BrainConfig {
  mode: "supervised" | "autonomous";
  enabled: boolean;
  interval_minutes: number;
  last_cycle: string | null;
  total_cycles: number;
  total_decisions: number;
  total_executed: number;
}

export interface BrainCycleResult {
  cycle_id: string;
  timestamp: string;
  snapshot: PropertySnapshot;
  decisions: BrainDecision[];
  summary: string;
  source: BrainSource;
  /** Model that served the cycle (null when rules were used). */
  model: string | null;
  /** Why the cycle fell back to rules (null when source = "claude"). */
  fallback_reason: string | null;
  duration_ms: number;
}

// ── System settings (durable, shared across instances) ──────

export const SETTINGS_TABLE = "system_settings";

/** Read one system_settings value; null when missing or on error. */
export async function readSetting<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  key: string,
  propertyId: string = PROPERTY_ID
): Promise<T | null> {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select("value")
    .eq("property_id", propertyId)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    logger.error({ err: error, key }, "Failed to read system setting");
    return null;
  }
  const value = (data as { value?: unknown } | null)?.value;
  return value && typeof value === "object" ? (value as T) : null;
}

/** Read every setting whose key starts with `prefix` (e.g. "automation:"). */
export async function readSettingsByPrefix<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  prefix: string,
  propertyId: string = PROPERTY_ID
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select("key, value")
    .eq("property_id", propertyId)
    .like("key", `${prefix}%`);
  if (error) {
    logger.error({ err: error, prefix }, "Failed to read system settings");
    return out;
  }
  for (const row of (data || []) as Array<{ key: string; value: unknown }>) {
    if (row && typeof row.key === "string" && row.value && typeof row.value === "object") {
      out.set(row.key, row.value as T);
    }
  }
  return out;
}

/** Upsert one system_settings value. Returns false on error. */
export async function writeSetting(
  supabase: SupabaseClient,
  key: string,
  value: Record<string, unknown>,
  opts: { propertyId?: string; updatedBy?: string | null } = {}
): Promise<boolean> {
  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      property_id: opts.propertyId ?? PROPERTY_ID,
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: opts.updatedBy ?? null,
    },
    { onConflict: "property_id,key" }
  );
  if (error) {
    logger.error({ err: error, key }, "Failed to write system setting");
    return false;
  }
  return true;
}

/**
 * Take a job lock (row "lock:<job>" in system_settings) so a cron job never
 * runs twice at once across instances or retries. Returns a holder token, or
 * null when another holder has an unexpired lock. An expired lock is taken
 * over with a single conditional UPDATE, so two contenders cannot both win.
 */
export async function acquireJobLock(
  supabase: SupabaseClient,
  job: string,
  ttlMs: number,
  propertyId: string = PROPERTY_ID
): Promise<string | null> {
  const key = `lock:${job}`;
  const holder = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date();
  const value = {
    holder,
    acquired_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
  };

  const { error: insertError } = await supabase
    .from(SETTINGS_TABLE)
    .insert({ property_id: propertyId, key, value, updated_at: now.toISOString() });
  if (!insertError) return holder;

  // 23505 = unique_violation: a lock row exists — take it only if expired.
  if ((insertError as { code?: string }).code !== "23505") {
    logger.error({ err: insertError, job }, "Failed to acquire job lock");
    return null;
  }
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ value, updated_at: now.toISOString() })
    .eq("property_id", propertyId)
    .eq("key", key)
    .lt("value->>expires_at", now.toISOString())
    .select("key");
  if (error) {
    logger.error({ err: error, job }, "Failed to take over expired job lock");
    return null;
  }
  return Array.isArray(data) && data.length > 0 ? holder : null;
}

/** Release a lock taken by acquireJobLock (only if we still hold it). */
export async function releaseJobLock(
  supabase: SupabaseClient,
  job: string,
  holder: string,
  propertyId: string = PROPERTY_ID
): Promise<void> {
  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .delete()
    .eq("property_id", propertyId)
    .eq("key", `lock:${job}`)
    .eq("value->>holder", holder);
  if (error) logger.error({ err: error, job }, "Failed to release job lock");
}

// ── Brain config (persisted) ────────────────────────────────

const BRAIN_CONFIG_KEY = "brain_config";
const BRAIN_STATS_KEY = "brain_stats";
const INTERVAL_MIN = 5;
const INTERVAL_MAX = 120;

type BrainSettings = Pick<BrainConfig, "mode" | "enabled" | "interval_minutes">;
type BrainStats = Pick<BrainConfig, "last_cycle" | "total_cycles" | "total_decisions" | "total_executed">;

const DEFAULT_BRAIN_SETTINGS: BrainSettings = {
  mode: "supervised",
  enabled: true,
  interval_minutes: 30,
};

/** Clamp an interval to [5,120] minutes; non-finite input yields null. */
export function clampBrainInterval(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(INTERVAL_MIN, Math.min(INTERVAL_MAX, Math.round(value)));
}

function sanitizeBrainSettings(raw: Record<string, unknown> | null): BrainSettings {
  const r = raw || {};
  return {
    // Anything other than an explicit "autonomous" is treated as supervised:
    // a missing or corrupt row must never switch on auto-execution.
    mode: r.mode === "autonomous" ? "autonomous" : "supervised",
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_BRAIN_SETTINGS.enabled,
    interval_minutes: clampBrainInterval(r.interval_minutes) ?? DEFAULT_BRAIN_SETTINGS.interval_minutes,
  };
}

function nonNegInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function sanitizeBrainStats(raw: Record<string, unknown> | null): BrainStats {
  const r = raw || {};
  return {
    last_cycle: typeof r.last_cycle === "string" ? r.last_cycle : null,
    total_cycles: nonNegInt(r.total_cycles),
    total_decisions: nonNegInt(r.total_decisions),
    total_executed: nonNegInt(r.total_executed),
  };
}

// ── Config accessors ────────────────────────────────────────

/** Load the brain config + counters from system_settings (defaults if absent). */
export async function getBrainConfig(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<BrainConfig> {
  const [settings, stats] = await Promise.all([
    readSetting(supabase, BRAIN_CONFIG_KEY, propertyId),
    readSetting(supabase, BRAIN_STATS_KEY, propertyId),
  ]);
  return { ...sanitizeBrainSettings(settings), ...sanitizeBrainStats(stats) };
}

/**
 * Persist a change to mode / enabled / interval. Invalid values are ignored
 * (a NaN interval keeps the previous interval). Throws if the write fails so
 * callers never report a mode switch that did not happen.
 */
export async function updateBrainConfig(
  supabase: SupabaseClient,
  updates: Partial<BrainSettings>,
  opts: { propertyId?: string; updatedBy?: string | null } = {}
): Promise<BrainConfig> {
  const propertyId = opts.propertyId ?? PROPERTY_ID;
  const current = await getBrainConfig(supabase, propertyId);
  const before = sanitizeBrainSettings(current as unknown as Record<string, unknown>);
  const next: BrainSettings = { ...before };

  if (updates.mode === "supervised" || updates.mode === "autonomous") next.mode = updates.mode;
  if (typeof updates.enabled === "boolean") next.enabled = updates.enabled;
  const interval = clampBrainInterval(updates.interval_minutes);
  if (interval !== null) next.interval_minutes = interval;

  const ok = await writeSetting(supabase, BRAIN_CONFIG_KEY, { ...next }, {
    propertyId,
    updatedBy: opts.updatedBy,
  });
  if (!ok) throw new Error("Failed to save brain config");

  await logAudit(supabase, {
    user_id: opts.updatedBy ?? undefined,
    action: "brain_config_updated",
    category: "ai_brain",
    description: `Brain config changed: mode ${before.mode} → ${next.mode}, enabled ${before.enabled} → ${next.enabled}, interval ${before.interval_minutes} → ${next.interval_minutes}m`,
    old_data: { ...before },
    new_data: { ...next },
  });

  return { ...current, ...next };
}

/** Add to the persisted brain counters (best effort). */
async function bumpBrainStats(
  supabase: SupabaseClient,
  delta: { cycles?: number; decisions?: number; executed?: number; last_cycle?: string },
  propertyId: string = PROPERTY_ID
): Promise<void> {
  const stats = sanitizeBrainStats(await readSetting(supabase, BRAIN_STATS_KEY, propertyId));
  const next: BrainStats = {
    last_cycle: delta.last_cycle ?? stats.last_cycle,
    total_cycles: stats.total_cycles + (delta.cycles ?? 0),
    total_decisions: stats.total_decisions + (delta.decisions ?? 0),
    total_executed: stats.total_executed + (delta.executed ?? 0),
  };
  await writeSetting(supabase, BRAIN_STATS_KEY, { ...next }, { propertyId });
}

// ── Data Gathering ──────────────────────────────────────────

export async function gatherPropertySnapshot(
  supabase: SupabaseClient
): Promise<PropertySnapshot> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const ninetyDaysOut = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

  // Run all queries in parallel
  const [
    tenantsRes,
    unitsRes,
    rentRes,
    overdueRes,
    percentRentRes,
    leasesExpiringRes,
    allLeasesRes,
    footfallTodayRes,
    footfallYesterdayRes,
    footfallZonesRes,
    energyRes,
    maintenanceRes,
    urgentMaintenanceRes,
    anomaliesRes,
    criticalAnomaliesRes,
    discrepanciesRes,
    campaignsRes,
    eventsRes,
    socialRes,
  ] = await Promise.all([
    // Tenants
    supabase.from("tenants").select("id, category, status").eq("status", "active"),
    // Units
    supabase.from("units").select("id, status"),
    // Rent collected this month
    supabase
      .from("rent_transactions")
      .select("amount_paid")
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .eq("status", "paid"),
    // Overdue rent
    supabase
      .from("rent_transactions")
      .select("amount_due, amount_paid")
      .eq("status", "overdue"),
    // Percentage rent premium
    supabase
      .from("rent_transactions")
      .select("percentage_rent_due")
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .gt("percentage_rent_due", 0),
    // Expiring leases
    supabase
      .from("leases")
      .select("id, tenant_id, end_date, unit_id, tenants(name), units(unit_number)")
      .eq("status", "active")
      .lte("end_date", ninetyDaysOut)
      .gte("end_date", today),
    // All active leases (for WALE)
    supabase
      .from("leases")
      .select("id, start_date, end_date")
      .eq("status", "active"),
    // Footfall today
    supabase.from("footfall_daily").select("total_in, zone_id").eq("date", today),
    // Footfall yesterday
    supabase.from("footfall_daily").select("total_in").eq("date", yesterday),
    // Footfall by zone (today)
    supabase
      .from("footfall_daily")
      .select("total_in, zone_id, zones(name)")
      .eq("date", today)
      .order("total_in", { ascending: false })
      .limit(1),
    // Energy today
    supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .gte("timestamp", today),
    // Open maintenance tickets
    supabase
      .from("maintenance_tickets")
      .select("id")
      .in("status", ["open", "assigned", "in_progress"]),
    // Urgent maintenance
    supabase
      .from("maintenance_tickets")
      .select("id")
      .in("status", ["open", "assigned", "in_progress"])
      .in("priority", ["urgent", "emergency"]),
    // Active anomalies
    supabase.from("anomalies").select("id").eq("status", "active"),
    // Critical anomalies
    supabase
      .from("anomalies")
      .select("id")
      .eq("status", "active")
      .eq("severity", "critical"),
    // Discrepancies
    supabase
      .from("discrepancies")
      .select("variance_egp")
      .eq("status", "flagged"),
    // Active marketing campaigns
    supabase
      .from("marketing_campaigns")
      .select("id")
      .eq("status", "active"),
    // Upcoming events
    supabase
      .from("marketing_campaigns")
      .select("id")
      .eq("status", "planned")
      .gte("start_date", today),
    // Social followers (latest)
    supabase
      .from("social_metrics")
      .select("followers, engagement_rate")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Process tenants by category
  const tenants = tenantsRes.data || [];
  const byCategory: Record<string, number> = {};
  for (const t of tenants) {
    const cat = (t as Record<string, unknown>).category as string || "other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  const allUnits = unitsRes.data || [];
  const vacantUnits = allUnits.filter((u: Record<string, unknown>) => u.status === "vacant").length;
  const totalUnits = allUnits.length || 1;

  // Revenue
  const rentCollected = (rentRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.amount_paid as number) || 0),
    0
  );
  const overdueData = overdueRes.data || [];
  const overdueAmount = overdueData.reduce(
    (sum: number, r: Record<string, unknown>) =>
      sum + ((r.amount_due as number) || 0) - ((r.amount_paid as number) || 0),
    0
  );
  const percentRentPremium = (percentRentRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.percentage_rent_due as number) || 0),
    0
  );

  // Leases
  const expiringLeases = (leasesExpiringRes.data || []).map((l: Record<string, unknown>) => ({
    tenant_name: ((l.tenants as Record<string, unknown>)?.name as string) || "Unknown",
    end_date: l.end_date as string,
    unit: ((l.units as Record<string, unknown>)?.unit_number as string) || "N/A",
  }));

  // WALE calculation
  const activeLeases = allLeasesRes.data || [];
  let waleYears = 0;
  if (activeLeases.length > 0) {
    const nowMs = now.getTime();
    let totalRemaining = 0;
    for (const lease of activeLeases) {
      const endMs = new Date((lease as Record<string, unknown>).end_date as string).getTime();
      const remainingYears = Math.max(0, (endMs - nowMs) / (365.25 * 86400000));
      totalRemaining += remainingYears;
    }
    waleYears = Math.round((totalRemaining / activeLeases.length) * 10) / 10;
  }

  // Footfall
  const todayTotal = (footfallTodayRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.total_in as number) || 0),
    0
  );
  const yesterdayTotal = (footfallYesterdayRes.data || []).reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.total_in as number) || 0),
    0
  );
  const changePct =
    yesterdayTotal > 0
      ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
      : 0;
  const busiestZoneRow = (footfallZonesRes.data || [])[0] as Record<string, unknown> | undefined;
  const busiestZone = busiestZoneRow
    ? ((busiestZoneRow.zones as Record<string, unknown>)?.name as string) || null
    : null;

  // Energy
  const energyData = energyRes.data || [];
  const todayKwh = energyData.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.consumption_kwh as number) || 0),
    0
  );
  const todayCost = energyData.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.cost_egp as number) || 0),
    0
  );
  // Rough waste estimate: 15% of energy cost is typically wasted
  const wasteEstimate = Math.round(todayCost * 0.15);

  // Discrepancies
  const discrepancies = discrepanciesRes.data || [];
  const totalVariance = discrepancies.reduce(
    (sum: number, r: Record<string, unknown>) =>
      sum + Math.abs((r.variance_egp as number) || 0),
    0
  );

  // Social
  const socialData = socialRes.data || [];
  const followersTotal = socialData.reduce(
    (sum: number, r: Record<string, unknown>) => sum + ((r.followers as number) || 0),
    0
  );
  const avgEngagement =
    socialData.length > 0
      ? socialData.reduce(
          (sum: number, r: Record<string, unknown>) =>
            sum + ((r.engagement_rate as number) || 0),
          0
        ) / socialData.length
      : 0;

  return {
    timestamp: now.toISOString(),
    tenants: {
      total: tenants.length,
      by_category: byCategory,
      vacant_units: vacantUnits,
      occupancy_rate: Math.round(((totalUnits - vacantUnits) / totalUnits) * 100),
    },
    revenue: {
      total_rent_collected_this_month: Math.round(rentCollected),
      overdue_amount: Math.round(overdueAmount),
      overdue_count: overdueData.length,
      percentage_rent_premium: Math.round(percentRentPremium),
    },
    leases: {
      expiring_within_90_days: expiringLeases.length,
      expiring_leases: expiringLeases,
      wale_years: waleYears,
      total_active: activeLeases.length,
    },
    footfall: {
      today_total: todayTotal,
      yesterday_total: yesterdayTotal,
      change_pct: changePct,
      busiest_zone: busiestZone,
      trend: changePct > 5 ? "up" : changePct < -5 ? "down" : "stable",
    },
    energy: {
      today_consumption_kwh: Math.round(todayKwh),
      today_cost_egp: Math.round(todayCost),
      waste_estimate_egp: wasteEstimate,
    },
    maintenance: {
      open_tickets: (maintenanceRes.data || []).length,
      urgent_count: (urgentMaintenanceRes.data || []).length,
    },
    anomalies: {
      active_count: (anomaliesRes.data || []).length,
      critical_count: (criticalAnomaliesRes.data || []).length,
    },
    discrepancies: {
      flagged_count: discrepancies.length,
      total_variance_egp: Math.round(totalVariance),
    },
    marketing: {
      active_campaigns: (campaignsRes.data || []).length,
      upcoming_events: (eventsRes.data || []).length,
    },
    social: {
      followers_total: followersTotal,
      engagement_rate: Math.round(avgEngagement * 100) / 100,
    },
  };
}

// ── Claude API Call ─────────────────────────────────────────

/**
 * Default model. Override with ANTHROPIC_MODEL (e.g. to pin a different
 * Claude model). Note: the request below uses adaptive thinking and
 * `output_config.effort`, which require a current (4.6+) Claude model.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

/** Per-request timeout (ms) and SDK retries (408/409/429/5xx + network). */
export const ANTHROPIC_TIMEOUT_MS = 90_000;
export const ANTHROPIC_MAX_RETRIES = 2;
const MAX_CLAUDE_DECISIONS = 25;

const BrainDecisionOutputSchema = z.object({
  category: z.enum(BRAIN_CATEGORIES),
  action: z.string().min(1),
  reasoning: z.string().min(1),
  confidence: z.number().describe("0-100, how sure you are"),
  impact_estimate: z.string().nullable(),
  auto_executable: z.boolean(),
});

/** Schema for the model's structured output; also validated client-side. */
export const BrainOutputSchema = z.object({
  decisions: z.array(BrainDecisionOutputSchema),
  summary: z.string().min(1),
});

/** Clamp a confidence to [0,100]; 0 stays 0, non-finite → 0. */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const BRAIN_SYSTEM_PROMPT = `You are Wedja Brain — the AI that runs Senzo Mall, Hurghada.
170,000 sqm, 166 tenants, 15,000+ daily visitors. All money is in EGP.

Analyze the property snapshot and return ACTIONABLE decisions.

For each decision provide:
- category (one of: ${BRAIN_CATEGORIES.join(", ")})
- action (specific actionable step, 1-2 sentences)
- reasoning (why this action matters, referencing the snapshot data)
- confidence (0-100, how sure you are; use low values when the data is thin)
- impact_estimate (in EGP where possible, e.g. "EGP 50,000/month savings"; null if unknown)
- auto_executable (true ONLY for safe routine actions like sending payment reminders)

Focus on:
- Revenue protection (underreporting detection, % rent optimization)
- Lease management (expiring leases, renewal terms)
- Operational efficiency (energy waste, maintenance patterns)
- Tenant performance (underperformers, replacement candidates)
- Marketing opportunities (seasonal events, campaigns)
- Maintenance urgency and preventive scheduling

Also give a 2-3 sentence executive summary.`;

export type ClaudeAnalysis =
  | { ok: true; decisions: BrainDecision[]; summary: string; model: string }
  | { ok: false; reason: string; model: string | null };

function createAnthropicClient(): Anthropic {
  return new Anthropic({
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  });
}

function describeClaudeError(err: unknown): string {
  // Most specific first.
  if (err instanceof NotFoundError) return `model not found (check ANTHROPIC_MODEL): ${err.message}`;
  if (err instanceof AuthenticationError) return `authentication failed: ${err.message}`;
  if (err instanceof RateLimitError) return `rate limited: ${err.message}`;
  if (err instanceof APIConnectionTimeoutError) return "request timed out";
  if (err instanceof APIConnectionError) return `connection error: ${err.message}`;
  if (err instanceof APIError) return `API error ${err.status ?? ""}: ${err.message}`.replace("  ", " ");
  return `unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * Ask Claude for decisions. Never throws: any failure (no key, API error,
 * refusal, truncation, invalid JSON, schema mismatch, empty list) comes back
 * as { ok: false, reason } so the caller can fall back to rules and record why.
 */
export async function analyzeWithClaude(snapshot: PropertySnapshot): Promise<ClaudeAnalysis> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "ANTHROPIC_API_KEY not set", model: null };
  }
  const requestedModel = getAnthropicModel();

  let response;
  try {
    const client = createAnthropicClient();
    response = await client.beta.messages.create({
      model: requestedModel,
      max_tokens: 16000,
      // Refusal fallback is enabled: if a safety classifier declines, the API
      // re-runs the request on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        // Structured outputs: the response text is JSON matching this schema.
        format: betaZodOutputFormat(BrainOutputSchema),
      },
      system: BRAIN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Property Snapshot (${snapshot.timestamp}):\n\n${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
    });
  } catch (err) {
    const reason = describeClaudeError(err);
    logger.error({ err, model: requestedModel }, "Claude API call failed");
    return { ok: false, reason, model: requestedModel };
  }

  // The served model may differ from the requested one after a fallback.
  const model = typeof response.model === "string" && response.model ? response.model : requestedModel;

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unspecified";
    logger.warn({ model, category }, "Claude declined the brain request");
    return { ok: false, reason: `model refused (category: ${category})`, model };
  }
  if (response.stop_reason === "max_tokens") {
    return { ok: false, reason: "model output truncated (max_tokens)", model };
  }

  const text = (response.content || [])
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "model output is not valid JSON", model };
  }

  const parsed = BrainOutputSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    logger.warn({ model, issues }, "Claude brain output failed validation");
    return { ok: false, reason: `schema validation failed — ${issues}`, model };
  }
  if (parsed.data.decisions.length === 0) {
    return { ok: false, reason: "model returned no decisions", model };
  }

  return {
    ok: true,
    model,
    summary: parsed.data.summary,
    decisions: parsed.data.decisions.slice(0, MAX_CLAUDE_DECISIONS).map((d) => ({
      cycle_id: "",
      category: d.category,
      action: d.action,
      reasoning: d.reasoning,
      confidence: clampConfidence(d.confidence),
      impact_estimate: d.impact_estimate,
      auto_executable: d.auto_executable,
      executed: false,
      approved: null,
      mode: "supervised" as const,
      event_type: null,
      event_payload: {},
      data_snapshot: {},
      summary: null,
      source: "claude" as const,
      model,
      fallback_reason: null,
    })),
  };
}

// ── Rule-Based Analysis (Fallback) ──────────────────────────

export function runRuleBasedAnalysis(
  snapshot: PropertySnapshot
): { decisions: BrainDecision[]; summary: string } {
  const decisions: BrainDecision[] = [];
  const cycleId = ""; // Will be set by caller
  const base: Omit<BrainDecision, "category" | "action" | "reasoning" | "confidence" | "impact_estimate" | "auto_executable" | "event_type"> = {
    cycle_id: cycleId,
    executed: false,
    approved: null,
    mode: "supervised",
    event_payload: {},
    data_snapshot: {},
    summary: null,
    source: "rules",
    model: null,
    fallback_reason: null,
  };

  // Rule 1: Low occupancy
  if (snapshot.tenants.occupancy_rate < 85) {
    decisions.push({
      ...base,
      category: "leasing",
      action: `Occupancy at ${snapshot.tenants.occupancy_rate}% — consider rent reduction or marketing push for ${snapshot.tenants.vacant_units} vacant units`,
      reasoning: `${snapshot.tenants.vacant_units} units are vacant. Every empty unit costs approximately EGP 15,000-30,000/month in lost rent.`,
      confidence: 85,
      impact_estimate: `EGP ${(snapshot.tenants.vacant_units * 20000).toLocaleString()}/month potential`,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 2: High footfall + discrepancies = revenue leakage
  if (snapshot.footfall.today_total > 5000 && snapshot.discrepancies.flagged_count > 0) {
    decisions.push({
      ...base,
      category: "revenue",
      action: `Revenue leakage detected — ${snapshot.discrepancies.flagged_count} tenants flagged with EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()} total variance`,
      reasoning: `High footfall (${snapshot.footfall.today_total.toLocaleString()}) indicates strong traffic, but ${snapshot.discrepancies.flagged_count} tenants show discrepancies. Verify tenant sales reporting.`,
      confidence: 80,
      impact_estimate: `EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()} at risk`,
      auto_executable: false,
      event_type: "tenant.underreporting",
    });
  }

  // Rule 3: Expiring leases for review
  if (snapshot.leases.expiring_within_90_days > 0) {
    const leaseList = snapshot.leases.expiring_leases
      .slice(0, 3)
      .map((l) => `${l.tenant_name} (${l.end_date})`)
      .join(", ");
    decisions.push({
      ...base,
      category: "leasing",
      action: `${snapshot.leases.expiring_within_90_days} leases expiring within 90 days — review renewal terms. Priority: ${leaseList}`,
      reasoning: `Proactive lease management prevents vacancy gaps. WALE is ${snapshot.leases.wale_years} years.`,
      confidence: 90,
      impact_estimate: null,
      auto_executable: false,
      event_type: "lease.expiring",
    });
  }

  // Rule 4: Energy waste
  if (snapshot.energy.waste_estimate_egp > 500) {
    decisions.push({
      ...base,
      category: "energy",
      action: `Reduce HVAC and lighting in low-traffic zones — estimated EGP ${snapshot.energy.waste_estimate_egp.toLocaleString()} waste today`,
      reasoning: `Today's energy cost is EGP ${snapshot.energy.today_cost_egp.toLocaleString()} with ~15% estimated waste. Reduce in off-peak zones.`,
      confidence: 70,
      impact_estimate: `EGP ${(snapshot.energy.waste_estimate_egp * 30).toLocaleString()}/month savings`,
      auto_executable: false,
      event_type: "energy.waste_detected",
    });
  }

  // Rule 5: Multiple discrepancies — investigate
  if (snapshot.discrepancies.flagged_count >= 3) {
    decisions.push({
      ...base,
      category: "revenue",
      action: `Priority: investigate top ${Math.min(3, snapshot.discrepancies.flagged_count)} underreporters — ${snapshot.discrepancies.flagged_count} total flagged`,
      reasoning: `Multiple discrepancies suggest systemic underreporting. Total variance: EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()}.`,
      confidence: 85,
      impact_estimate: `EGP ${snapshot.discrepancies.total_variance_egp.toLocaleString()} recovery potential`,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 6: Overdue rent
  if (snapshot.revenue.overdue_count > 0) {
    decisions.push({
      ...base,
      category: "revenue",
      action: `Send payment reminders to ${snapshot.revenue.overdue_count} tenants — EGP ${snapshot.revenue.overdue_amount.toLocaleString()} overdue`,
      reasoning: `Overdue rent impacts cash flow. Automated reminders improve collection rates by 30-40%.`,
      confidence: 95,
      impact_estimate: `EGP ${snapshot.revenue.overdue_amount.toLocaleString()} collection`,
      auto_executable: true,
      event_type: "rent.overdue",
    });
  }

  // Rule 7: Critical anomalies
  if (snapshot.anomalies.critical_count > 0) {
    decisions.push({
      ...base,
      category: "operations",
      action: `Immediate attention: ${snapshot.anomalies.critical_count} critical anomalies detected (${snapshot.anomalies.active_count} total active)`,
      reasoning: `Critical anomalies may indicate security issues, system failures, or significant operational problems.`,
      confidence: 95,
      impact_estimate: null,
      auto_executable: false,
      event_type: "anomaly.critical",
    });
  }

  // Rule 8: Seasonal/marketing opportunity
  if (snapshot.marketing.active_campaigns === 0 && snapshot.footfall.today_total > 0) {
    decisions.push({
      ...base,
      category: "marketing",
      action: "No active marketing campaigns — plan promotional event to boost footfall and tenant sales",
      reasoning: `No campaigns running. Seasonal promotions typically increase footfall by 20-35% and tenant sales by 15-25%.`,
      confidence: 65,
      impact_estimate: "10-25% footfall increase potential",
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 9: High percentage of min-rent tenants
  if (snapshot.revenue.percentage_rent_premium < snapshot.revenue.total_rent_collected_this_month * 0.05) {
    decisions.push({
      ...base,
      category: "revenue",
      action: "Low percentage rent contribution — renegotiate percentage rates or verify tenant sales data",
      reasoning: `Percentage rent premium (EGP ${snapshot.revenue.percentage_rent_premium.toLocaleString()}) is below 5% of total rent. Many tenants may be paying only minimum rent.`,
      confidence: 70,
      impact_estimate: "10-20% additional rent potential",
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 10: Maintenance patterns
  if (snapshot.maintenance.urgent_count > 0) {
    decisions.push({
      ...base,
      category: "maintenance",
      action: `${snapshot.maintenance.urgent_count} urgent maintenance tickets — schedule preventive maintenance review`,
      reasoning: `Urgent tickets indicate reactive maintenance. Preventive scheduling reduces emergency costs by 40-60%.`,
      confidence: 80,
      impact_estimate: "30-50% maintenance cost reduction",
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 11: Social engagement
  if (snapshot.social.engagement_rate < 2.0 && snapshot.social.followers_total > 0) {
    decisions.push({
      ...base,
      category: "marketing",
      action: `Social media engagement at ${snapshot.social.engagement_rate}% — refresh content strategy`,
      reasoning: `Engagement below 2% indicates stale content. Target 3-5% for retail properties.`,
      confidence: 60,
      impact_estimate: null,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 12: WALE declining
  if (snapshot.leases.wale_years < 2.0 && snapshot.leases.total_active > 0) {
    decisions.push({
      ...base,
      category: "leasing",
      action: `WALE at ${snapshot.leases.wale_years} years — accelerate lease renewals to stabilize income`,
      reasoning: `Weighted Average Lease Expiry below 2 years signals instability. Target 3+ years for portfolio health.`,
      confidence: 85,
      impact_estimate: null,
      auto_executable: false,
      event_type: null,
    });
  }

  // Rule 13: Footfall drop
  if (snapshot.footfall.trend === "down" && snapshot.footfall.change_pct < -15) {
    decisions.push({
      ...base,
      category: "operations",
      action: `Footfall dropped ${Math.abs(snapshot.footfall.change_pct)}% vs yesterday — investigate cause and consider promotional response`,
      reasoning: `Significant drop may indicate external factors (weather, competition) or internal issues (maintenance, events).`,
      confidence: 75,
      impact_estimate: null,
      auto_executable: false,
      event_type: "footfall.drop",
    });
  }

  // Build summary
  const summaryParts: string[] = [];
  if (decisions.length === 0) {
    summaryParts.push("All systems operating within normal parameters.");
  } else {
    const critical = decisions.filter((d) => d.confidence >= 85).length;
    const revenue = decisions.filter((d) => d.category === "revenue").length;
    if (critical > 0) summaryParts.push(`${critical} high-confidence action(s) require attention.`);
    if (revenue > 0) summaryParts.push(`${revenue} revenue-related finding(s).`);
    summaryParts.push(`${decisions.length} total decisions from rule-based analysis.`);
  }

  return {
    decisions,
    summary: summaryParts.join(" "),
  };
}

// ── Main Brain Cycle ────────────────────────────────────────

export async function runBrainCycle(
  supabase: SupabaseClient,
  opts: { propertyId?: string } = {}
): Promise<BrainCycleResult> {
  const propertyId = opts.propertyId ?? PROPERTY_ID;
  const start = Date.now();
  const cycleId = `brain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Load persisted config + gather snapshot
  const [config, snapshot] = await Promise.all([
    getBrainConfig(supabase, propertyId),
    gatherPropertySnapshot(supabase),
  ]);

  // 2. Try Claude, fall back to rules (recording why)
  let result: { decisions: BrainDecision[]; summary: string };
  let source: BrainSource = "rules";
  let model: string | null = null;
  let fallbackReason: string | null = null;

  const claude = await analyzeWithClaude(snapshot);
  if (claude.ok) {
    result = claude;
    source = "claude";
    model = claude.model;
  } else {
    result = runRuleBasedAnalysis(snapshot);
    fallbackReason = claude.reason;
    if (process.env.ANTHROPIC_API_KEY) {
      logger.warn({ reason: claude.reason, model: claude.model }, "Brain cycle fell back to rule-based analysis");
    }
  }

  // 3. Finalize decisions
  const mode = config.mode;
  const decisions: BrainDecision[] = result.decisions.map((d) => ({
    ...d,
    cycle_id: cycleId,
    mode,
    data_snapshot: snapshot as unknown as Record<string, unknown>,
    summary: result.summary,
    source,
    model,
    fallback_reason: fallbackReason,
  }));

  // 4. Store decisions in brain_decisions table
  if (decisions.length > 0) {
    const rows = decisions.map((d) => ({
      property_id: propertyId,
      cycle_id: d.cycle_id,
      category: d.category,
      action: d.action,
      reasoning: d.reasoning,
      confidence: d.confidence,
      impact_estimate: d.impact_estimate,
      auto_executable: d.auto_executable,
      executed: false,
      approved: null,
      mode: d.mode,
      event_type: d.event_type,
      event_payload: d.event_payload,
      data_snapshot: d.data_snapshot,
      summary: d.summary,
      source: d.source,
      model: d.model,
      fallback_reason: d.fallback_reason,
    }));

    const { data: inserted, error } = await supabase
      .from("brain_decisions")
      .insert(rows)
      .select();

    if (error) {
      logger.error({ err: error }, "Failed to store brain decisions:");
    } else if (inserted) {
      // Update decisions with IDs
      for (let i = 0; i < inserted.length && i < decisions.length; i++) {
        decisions[i].id = (inserted[i] as Record<string, unknown>).id as string;
      }
    }
  }

  // 5. In autonomous mode, auto-execute safe decisions. Re-read the mode
  //    first: an owner may have switched autonomy off while we were thinking.
  let executedCount = 0;
  if (mode === "autonomous" && decisions.some((d) => d.auto_executable && d.event_type)) {
    const live = await getBrainConfig(supabase, propertyId);
    if (live.mode !== "autonomous") {
      logger.info({ cycleId }, "Autonomous mode switched off mid-cycle — not auto-executing");
    } else {
      for (const decision of decisions) {
        if (!decision.auto_executable || !decision.event_type) continue;
        try {
          await emitEvent(
            decision.event_type as Parameters<typeof emitEvent>[0],
            "ai-brain",
            {
              brain_cycle_id: cycleId,
              decision_id: decision.id,
              action: decision.action,
              ...decision.event_payload,
            },
            supabase
          );

          // Mark as executed
          if (decision.id) {
            await supabase
              .from("brain_decisions")
              .update({ executed: true, approved: true })
              .eq("id", decision.id);
          }
          decision.executed = true;
          decision.approved = true;
          executedCount++;
        } catch (err) {
          logger.error({ err, decisionId: decision.id }, "Auto-execute failed for decision");
        }
      }
    }
  }

  // 6. Create notification
  await createNotification(supabase, {
    title: `Brain Cycle Complete — ${decisions.length} decision(s)`,
    message:
      source === "claude"
        ? result.summary
        : `${result.summary} (rule-based: ${fallbackReason ?? "Claude unavailable"})`,
    type: "info",
    category: "ai-brain",
    link: "/dashboard/ai/brain",
  });

  // 7. Update persisted stats
  await bumpBrainStats(
    supabase,
    {
      cycles: 1,
      decisions: decisions.length,
      executed: executedCount,
      last_cycle: new Date().toISOString(),
    },
    propertyId
  );

  // Audit log
  await logAudit(supabase, {
    action: "brain_cycle_completed",
    category: "ai_brain",
    description: `Brain cycle ${cycleId}: ${decisions.length} decisions (${source}${model ? `, ${model}` : ""}). ${result.summary}`,
    new_data: {
      cycle_id: cycleId,
      decisions_count: decisions.length,
      executed: executedCount,
      source,
      model,
      fallback_reason: fallbackReason,
    },
  });

  for (const d of decisions) {
    await logAudit(supabase, {
      action: d.executed ? "ai_decision_executed" : "ai_decision_proposed",
      category: "ai_decision",
      resource_type: "brain_decision",
      resource_id: d.id,
      description: `[${d.category}] ${d.action} — ${d.reasoning}`,
      new_data: {
        confidence: d.confidence,
        executed: d.executed,
        impact: d.impact_estimate,
        source: d.source,
        model: d.model,
      },
    });
  }

  return {
    cycle_id: cycleId,
    timestamp: snapshot.timestamp,
    snapshot,
    decisions,
    summary: result.summary,
    source,
    model,
    fallback_reason: fallbackReason,
    duration_ms: Date.now() - start,
  };
}

/** Lock TTL for scheduled/manual jobs; matches the routes' maxDuration (300s). */
export const JOB_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Run a brain cycle unless one is already running anywhere (lock row
 * "lock:brain_cycle"). Returns null when another cycle holds the lock.
 */
export async function runBrainCycleExclusive(
  supabase: SupabaseClient,
  opts: { propertyId?: string } = {}
): Promise<BrainCycleResult | null> {
  const propertyId = opts.propertyId ?? PROPERTY_ID;
  const holder = await acquireJobLock(supabase, "brain_cycle", JOB_LOCK_TTL_MS, propertyId);
  if (!holder) return null;
  try {
    return await runBrainCycle(supabase, { propertyId });
  } finally {
    await releaseJobLock(supabase, "brain_cycle", holder, propertyId);
  }
}


// ── Decision Actions ────────────────────────────────────────

export async function approveDecision(
  supabase: SupabaseClient,
  decisionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("brain_decisions")
    .update({ approved: true })
    .eq("id", decisionId)
    .select()
    .single();

  if (error || !data) return false;

  // If it has an event type, execute it
  const decision = data as Record<string, unknown>;
  if (decision.event_type && !decision.executed) {
    try {
      await emitEvent(
        decision.event_type as Parameters<typeof emitEvent>[0],
        "ai-brain",
        {
          brain_decision_id: decisionId,
          action: decision.action,
          ...(decision.event_payload as Record<string, unknown>),
        },
        supabase
      );
      await supabase
        .from("brain_decisions")
        .update({ executed: true })
        .eq("id", decisionId);
      await bumpBrainStats(supabase, { executed: 1 });
    } catch {
      // Event emission failed but approval stands
    }
  }

  return true;
}

export async function rejectDecision(
  supabase: SupabaseClient,
  decisionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("brain_decisions")
    .update({ approved: false })
    .eq("id", decisionId);

  return !error;
}

export async function getRecentDecisions(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<BrainDecision[]> {
  const { data, error } = await supabase
    .from("brain_decisions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error({ err: error }, "Failed to fetch brain decisions:");
    return [];
  }

  return (data || []) as BrainDecision[];
}

export async function getDecisionsByCycle(
  supabase: SupabaseClient,
  cycleId: string
): Promise<BrainDecision[]> {
  const { data, error } = await supabase
    .from("brain_decisions")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("confidence", { ascending: false });

  if (error) return [];
  return (data || []) as BrainDecision[];
}
