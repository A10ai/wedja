import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSchedulerState,
  runScheduledJob,
  updateSchedulerState,
  SCHEDULER_INTERVAL_MIN,
  SCHEDULER_INTERVAL_MAX,
} from "@/lib/automations-engine";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

// ============================================================
// Scheduler control. Jobs are fired by Vercel Cron
// (vercel.json → GET /api/v1/ai/cron); this route only reads
// and changes the persisted scheduler state, and lets an owner
// run the jobs immediately. No timers live in this process.
// ============================================================

// "run_now" runs the brain cycle and the automations back to back.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const state = await getSchedulerState(createAdminClient());
    return NextResponse.json({
      data: {
        ...state,
        // Vercel Cron is always firing; "running" means the switch is on.
        is_running: state.enabled,
        schedule: {
          cycle: "hourly (Vercel Cron)",
          automations: "daily 04:15 UTC (Vercel Cron)",
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Every scheduler action (start/stop/run/interval) is owner-only.
  const auth = await requireAuth(request, { roles: ["owner"] });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      interval_minutes?: number;
    };
    const supabase = createAdminClient();

    const audit = (action: string, description: string, data: Record<string, unknown>) =>
      logAudit(supabase, {
        user_id: auth.id,
        user_email: auth.email ?? undefined,
        action,
        category: "scheduler",
        description,
        new_data: data,
      });

    switch (body.action) {
      case "start": {
        const state = await updateSchedulerState(supabase, { enabled: true }, { updatedBy: auth.id });
        await audit("scheduler_started", "Scheduler enabled", { enabled: true });
        return NextResponse.json({
          data: { message: `Scheduler started (every ${state.interval_minutes}m)`, enabled: true },
        });
      }

      case "stop": {
        await updateSchedulerState(supabase, { enabled: false }, { updatedBy: auth.id });
        await audit("scheduler_stopped", "Scheduler disabled", { enabled: false });
        return NextResponse.json({ data: { message: "Scheduler stopped", enabled: false } });
      }

      case "run_now": {
        const cycle = await runScheduledJob(supabase, "cycle", { force: true, trigger: "manual" });
        const automations = await runScheduledJob(supabase, "automations", {
          force: true,
          trigger: "manual",
        });
        await audit("scheduler_run_now", "Scheduler run manually", {
          cycle: cycle.status,
          automations: automations.status,
        });
        return NextResponse.json({
          data: {
            ...(cycle.results ?? {}),
            automations_job: automations.results ?? { status: automations.status, reason: automations.reason },
            jobs: { cycle: cycle.status, automations: automations.status },
          },
        });
      }

      case "set_interval": {
        const requested = Number(body.interval_minutes);
        const state = await updateSchedulerState(
          supabase,
          { interval_minutes: Number.isFinite(requested) ? requested : SCHEDULER_INTERVAL_MIN },
          { updatedBy: auth.id }
        );
        await audit("scheduler_interval_set", `Scheduler interval set to ${state.interval_minutes}m`, {
          interval_minutes: state.interval_minutes,
        });
        return NextResponse.json({
          data: {
            message: `Interval set to ${state.interval_minutes}m (allowed ${SCHEDULER_INTERVAL_MIN}–${SCHEDULER_INTERVAL_MAX}m; cron fires hourly)`,
            interval_minutes: state.interval_minutes,
          },
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
