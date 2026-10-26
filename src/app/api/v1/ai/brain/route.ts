import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBrainConfig,
  updateBrainConfig,
  runBrainCycleExclusive,
  approveDecision,
  rejectDecision,
  getRecentDecisions,
} from "@/lib/ai-brain";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { validateBody, formatZodErrors, aiBrainActionSchema } from "@/lib/validation";

// A brain cycle calls Claude (90s timeout, 2 retries) — allow the full 300s.
export const maxDuration = 300;

/** Actions that change what the AI may do (or trigger it) are owner-only. */
const OWNER_ACTIONS = new Set(["run_cycle", "update_config"]);

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [config, decisions] = await Promise.all([
      getBrainConfig(supabase),
      getRecentDecisions(supabase, 50),
    ]);

    // Group decisions by cycle
    const cycleMap = new Map<string, typeof decisions>();
    for (const d of decisions) {
      const existing = cycleMap.get(d.cycle_id) || [];
      existing.push(d);
      cycleMap.set(d.cycle_id, existing);
    }

    const cycles = Array.from(cycleMap.entries()).map(([cycleId, decs]) => ({
      cycle_id: cycleId,
      timestamp: decs[0]?.created_at || null,
      summary: decs[0]?.summary || null,
      decision_count: decs.length,
      decisions: decs,
    }));

    return NextResponse.json({
      data: {
        config,
        recent_decisions: decisions,
        cycles,
      },
    });
  } catch (err) {
    logger.error({ err: err }, "Brain GET error:");
    return NextResponse.json(
      { error: "Failed to fetch brain data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Parse the body before auth (no DB access) so the role can depend on the action.
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : undefined;

  const auth = await requireAuth(
    request,
    action && OWNER_ACTIONS.has(action) ? { roles: ["owner"] } : {}
  );
  if (auth instanceof NextResponse) return auth;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const validation = validateBody(aiBrainActionSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

    switch (action) {
      case "run_cycle": {
        const result = await runBrainCycleExclusive(supabase);
        if (!result) {
          return NextResponse.json(
            { error: "A brain cycle is already running" },
            { status: 409 }
          );
        }
        return NextResponse.json({ data: result });
      }

      case "update_config": {
        const { mode, enabled, interval_minutes } = validation.data;
        const config = await updateBrainConfig(
          supabase,
          { mode, enabled, interval_minutes },
          { updatedBy: auth.id }
        );
        return NextResponse.json({ data: { config } });
      }

      case "approve": {
        const { decision_id } = validation.data;
        if (!decision_id) {
          return NextResponse.json(
            { error: "decision_id required" },
            { status: 400 }
          );
        }
        const success = await approveDecision(supabase, decision_id);
        return NextResponse.json({
          data: { approved: success, decision_id },
        });
      }

      case "reject": {
        const { decision_id } = validation.data;
        if (!decision_id) {
          return NextResponse.json(
            { error: "decision_id required" },
            { status: 400 }
          );
        }
        const success = await rejectDecision(supabase, decision_id);
        return NextResponse.json({
          data: { rejected: success, decision_id },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    logger.error({ err: err }, "Brain POST error:");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
