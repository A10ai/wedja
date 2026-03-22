import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBrainConfig,
  updateBrainConfig,
  runBrainCycle,
  approveDecision,
  rejectDecision,
  getRecentDecisions,
} from "@/lib/ai-brain";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const config = getBrainConfig();
    const decisions = await getRecentDecisions(supabase, 50);

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
    console.error("Brain GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch brain data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = createAdminClient();

    switch (action) {
      case "run_cycle": {
        const result = await runBrainCycle(supabase);
        return NextResponse.json({ data: result });
      }

      case "update_config": {
        const { mode, enabled, interval_minutes } = body;
        const config = updateBrainConfig({ mode, enabled, interval_minutes });
        return NextResponse.json({ data: { config } });
      }

      case "approve": {
        const { decision_id } = body;
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
        const { decision_id } = body;
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
    console.error("Brain POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
