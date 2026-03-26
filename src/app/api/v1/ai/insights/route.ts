import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateCrossDataInsights,
  generateDailyBriefing,
  calculatePropertyHealthScore,
  getPropertySnapshot,
} from "@/lib/ai-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [insights, healthScore, briefing, snapshot] = await Promise.all([
      generateCrossDataInsights(supabase, PROPERTY_ID).catch(() => []),
      calculatePropertyHealthScore(supabase, PROPERTY_ID).catch(() => ({
        overall: 0,
        dimensions: {},
        details: {},
      })),
      generateDailyBriefing(supabase, PROPERTY_ID),
      getPropertySnapshot(supabase, PROPERTY_ID).catch(() => null),
    ]);

    // Ensure health_score always has overall and dimensions
    const safeHealthScore = {
      overall: healthScore?.overall ?? 0,
      dimensions: healthScore?.dimensions ?? {},
      details: healthScore?.details ?? {},
      ...healthScore,
    };

    return NextResponse.json({
      insights,
      health_score: safeHealthScore,
      briefing,
      snapshot,
    });
  } catch (error) {
    console.error("AI Insights API error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI insights" },
      { status: 500 }
    );
  }
}
