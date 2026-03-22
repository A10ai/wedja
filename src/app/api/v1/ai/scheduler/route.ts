import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/event-bus";
import { runBrainCycle, getBrainConfig } from "@/lib/ai-brain";
import { runAllAutomations } from "@/lib/automations-engine";
import { trainFootfallModel, trainRevenueModel } from "@/lib/prediction-model";

// In-memory scheduler state (resets on deploy)
let lastRun: string | null = null;
let enabled = true;
let intervalMs = 15 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let totalCycles = 0;

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    data: {
      enabled,
      interval_minutes: intervalMs / 60000,
      last_run: lastRun,
      total_cycles: totalCycles,
      is_running: timer !== null,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, interval_minutes } = body;

    switch (action) {
      case "start":
        enabled = true;
        if (!timer) {
          timer = setInterval(() => { executeCycle(); }, intervalMs);
        }
        return NextResponse.json({ data: { message: `Scheduler started (every ${intervalMs / 60000}m)`, enabled: true } });

      case "stop":
        enabled = false;
        if (timer) { clearInterval(timer); timer = null; }
        return NextResponse.json({ data: { message: "Scheduler stopped", enabled: false } });

      case "run_now": {
        const result = await executeCycle();
        return NextResponse.json({ data: result });
      }

      case "set_interval": {
        const mins = Math.max(5, Math.min(60, interval_minutes || 15));
        intervalMs = mins * 60 * 1000;
        if (timer) {
          clearInterval(timer);
          timer = setInterval(() => { executeCycle(); }, intervalMs);
        }
        return NextResponse.json({ data: { message: `Interval set to ${mins}m`, interval_minutes: mins } });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function executeCycle() {
  const start = Date.now();
  const supabase = createAdminClient();
  const timestamp = new Date().toISOString();

  const results: Record<string, unknown> = { timestamp };

  try {
    // 0. Run AI Brain cycle (if enabled)
    const brainConfig = getBrainConfig();
    if (brainConfig.enabled) {
      try {
        const brainResult = await runBrainCycle(supabase);
        results.brain = {
          cycle_id: brainResult.cycle_id,
          decisions: brainResult.decisions.length,
          source: brainResult.source,
          summary: brainResult.summary,
          duration_ms: brainResult.duration_ms,
        };
      } catch (brainErr) {
        results.brain_error = brainErr instanceof Error ? brainErr.message : "Brain cycle failed";
      }
    } else {
      results.brain = { skipped: true, reason: "Brain disabled" };
    }

    // 0b. Run Smart Automations
    try {
      const autoResult = await runAllAutomations(supabase);
      results.automations = {
        total_actions: autoResult.total_actions,
        automation_count: Object.keys(autoResult.results).length,
      };
    } catch (autoErr) {
      results.automations_error = autoErr instanceof Error ? autoErr.message : "Automations failed";
    }

    // 0c. Retrain ML prediction models
    try {
      const [footfallModel, revenueModel] = await Promise.all([
        trainFootfallModel(supabase),
        trainRevenueModel(supabase),
      ]);
      results.predictions = {
        footfall_r2: footfallModel.r_squared,
        footfall_samples: footfallModel.training_samples,
        revenue_r2: revenueModel.r_squared,
        revenue_samples: revenueModel.training_samples,
      };
    } catch (predErr) {
      results.predictions_error = predErr instanceof Error ? predErr.message : "ML retraining failed";
    }

    // 1. Check for expiring leases (within 90 days)
    const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
    const { data: expiringLeases } = await supabase
      .from("leases")
      .select("id, tenant_id, end_date, tenants(name)")
      .eq("status", "active")
      .lte("end_date", ninetyDaysOut);

    if (expiringLeases && expiringLeases.length > 0) {
      for (const lease of expiringLeases.slice(0, 3)) {
        const tenantName = (lease.tenants as any)?.name || "Unknown";
        await emitEvent("lease.expiring", "scheduler", {
          lease_id: lease.id,
          tenant_id: lease.tenant_id,
          tenant_name: tenantName,
          end_date: lease.end_date,
        }, supabase);
      }
      results.expiring_leases = expiringLeases.length;
    }

    // 2. Check for overdue rent
    const { data: overdueRent } = await supabase
      .from("rent_transactions")
      .select("id, lease_id, amount_due, period_month, period_year")
      .eq("status", "overdue")
      .limit(10);

    results.overdue_rent = overdueRent?.length || 0;

    // 3. Check anomalies
    const { data: activeAnomalies } = await supabase
      .from("anomalies")
      .select("id, severity")
      .eq("status", "active");

    const criticalCount = (activeAnomalies || []).filter((a: any) => a.severity === "critical").length;
    results.active_anomalies = activeAnomalies?.length || 0;
    results.critical_anomalies = criticalCount;

    // 4. Check footfall trends (compare today vs yesterday)
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const { data: todayFootfall } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("date", today);

    const { data: yesterdayFootfall } = await supabase
      .from("footfall_daily")
      .select("total_in")
      .eq("date", yesterday);

    const todayTotal = (todayFootfall || []).reduce((s: number, r: any) => s + (r.total_in || 0), 0);
    const yesterdayTotal = (yesterdayFootfall || []).reduce((s: number, r: any) => s + (r.total_in || 0), 0);

    if (yesterdayTotal > 0 && todayTotal < yesterdayTotal * 0.7) {
      await emitEvent("footfall.drop", "scheduler", {
        today_total: todayTotal,
        yesterday_total: yesterdayTotal,
        drop_pct: Math.round((1 - todayTotal / yesterdayTotal) * 100),
      }, supabase);
      results.footfall_alert = true;
    }

    results.footfall_today = todayTotal;

    // 5. Energy check
    const { data: energyToday } = await supabase
      .from("energy_readings")
      .select("consumption_kwh, cost_egp")
      .gte("timestamp", today);

    const totalEnergy = (energyToday || []).reduce((s: number, r: any) => s + (r.consumption_kwh || 0), 0);
    const totalCost = (energyToday || []).reduce((s: number, r: any) => s + (r.cost_egp || 0), 0);
    results.energy_kwh_today = Math.round(totalEnergy);
    results.energy_cost_today = Math.round(totalCost);

    // 6. Log cycle
    results.duration_ms = Date.now() - start;
    lastRun = timestamp;
    totalCycles++;

    await supabase.from("system_events").insert({
      type: "scheduler.cycle_completed",
      source_system: "scheduler",
      payload: results,
      processed: true,
      results: [],
    });

    return results;
  } catch (e) {
    results.error = e instanceof Error ? e.message : "Cycle failed";
    results.duration_ms = Date.now() - start;
    return results;
  }
}
