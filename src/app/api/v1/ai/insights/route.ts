import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generatePropertyInsights,
  generateDailyBriefing,
  calculatePropertyHealthScore,
  getTenantPerformanceCards,
} from "@/lib/ai-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [insights, healthScore, briefing, tenantCards] = await Promise.all([
      generatePropertyInsights(supabase, PROPERTY_ID),
      calculatePropertyHealthScore(supabase, PROPERTY_ID),
      generateDailyBriefing(supabase, PROPERTY_ID),
      getTenantPerformanceCards(supabase, PROPERTY_ID),
    ]);

    return NextResponse.json({
      insights,
      health_score: healthScore,
      briefing,
      tenant_performance: tenantCards,
    });
  } catch (error) {
    console.error("AI Insights API error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI insights" },
      { status: 500 }
    );
  }
}
