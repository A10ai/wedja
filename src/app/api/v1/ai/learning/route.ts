import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runLearningCycle,
  recordFeedback,
  getLearningStats,
  getLearningHistory,
  getLearnedPatterns,
} from "@/lib/learning-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * GET /api/v1/ai/learning
 *
 * Returns learning stats, recent cycles, active patterns,
 * calibrated params, and feedback history.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const [stats, history, patterns, paramsResult, feedbackResult] =
      await Promise.all([
        getLearningStats(supabase, PROPERTY_ID),
        getLearningHistory(supabase, PROPERTY_ID, 30),
        getLearnedPatterns(supabase, PROPERTY_ID),
        supabase
          .from("ai_learned_params")
          .select("*")
          .eq("property_id", PROPERTY_ID)
          .order("confidence", { ascending: false }),
        supabase
          .from("ai_feedback")
          .select(
            "id, decision_id, feedback_type, reason, created_at, original_value, corrected_value, ai_decisions(type, category, recommendation)"
          )
          .eq("property_id", PROPERTY_ID)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    return NextResponse.json({
      stats,
      history,
      patterns,
      params: paramsResult.data || [],
      feedback: feedbackResult.data || [],
    });
  } catch (error) {
    console.error("Learning API GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch learning data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/ai/learning
 *
 * Actions:
 * - { action: "run_cycle" } — triggers a learning cycle
 * - { action: "feedback", decision_id, feedback_type, corrected_value, reason } — records feedback
 * - { action: "dismiss_pattern", pattern_id } — dismisses a pattern
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    switch (body.action) {
      case "run_cycle": {
        const result = await runLearningCycle(supabase, PROPERTY_ID);
        return NextResponse.json({ success: true, result });
      }

      case "feedback": {
        const { decision_id, feedback_type, corrected_value, reason, staff_id } =
          body;

        if (!decision_id || !feedback_type) {
          return NextResponse.json(
            { error: "decision_id and feedback_type are required" },
            { status: 400 }
          );
        }

        const result = await recordFeedback(
          supabase,
          decision_id,
          feedback_type,
          corrected_value || null,
          reason || null,
          staff_id || null,
          PROPERTY_ID
        );
        return NextResponse.json({ success: true, feedback_id: result.id });
      }

      case "dismiss_pattern": {
        const { pattern_id } = body;
        if (!pattern_id) {
          return NextResponse.json(
            { error: "pattern_id is required" },
            { status: 400 }
          );
        }

        await supabase
          .from("ai_patterns")
          .update({ status: "dismissed" })
          .eq("id", pattern_id);

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Learning API POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process action",
      },
      { status: 500 }
    );
  }
}
