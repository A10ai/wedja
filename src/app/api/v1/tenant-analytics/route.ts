import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTenantScorecard,
  getTenantRankings,
  getZoneBenchmarks,
  getSqmValueAnalysis,
  getTenantMixAnalysis,
  getPercentageRateAnalysis,
  getReplacementAnalysis,
} from "@/lib/tenant-analytics";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * GET /api/v1/tenant-analytics
 *
 * Query params:
 *   type: "scorecard" | "rankings" | "benchmarks" | "sqm_value" | "tenant_mix" | "percentage_rates" | "replacement"
 *   tenant_id: UUID (required when type=scorecard)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type") || "rankings";
    const tenantId = searchParams.get("tenant_id");

    switch (type) {
      case "scorecard": {
        if (!tenantId) {
          return NextResponse.json(
            { error: "tenant_id is required for scorecard" },
            { status: 400 }
          );
        }
        const scorecard = await getTenantScorecard(supabase, tenantId);
        if (!scorecard) {
          return NextResponse.json(
            { error: "Tenant not found or no active lease" },
            { status: 404 }
          );
        }
        return NextResponse.json(scorecard);
      }

      case "rankings": {
        const rankings = await getTenantRankings(supabase, PROPERTY_ID);
        return NextResponse.json(rankings);
      }

      case "benchmarks": {
        const benchmarks = await getZoneBenchmarks(supabase, PROPERTY_ID);
        return NextResponse.json(benchmarks);
      }

      case "sqm_value": {
        const sqmValue = await getSqmValueAnalysis(supabase, PROPERTY_ID);
        return NextResponse.json(sqmValue);
      }

      case "tenant_mix": {
        const tenantMix = await getTenantMixAnalysis(supabase, PROPERTY_ID);
        return NextResponse.json(tenantMix);
      }

      case "percentage_rates": {
        const pctRates = await getPercentageRateAnalysis(supabase, PROPERTY_ID);
        return NextResponse.json(pctRates);
      }

      case "replacement": {
        const replacement = await getReplacementAnalysis(supabase, PROPERTY_ID);
        return NextResponse.json(replacement);
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}. Valid: scorecard, rankings, benchmarks, sqm_value, tenant_mix, percentage_rates, replacement` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Tenant analytics GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenant analytics" },
      { status: 500 }
    );
  }
}
