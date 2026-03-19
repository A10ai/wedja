import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculatePercentageRent,
  getPercentageRentTrend,
  getInflationHedgeAnalysis,
  getPercentageRateOptimization,
  getRentCompositionBreakdown,
} from "@/lib/percentage-rent-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "overview";
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month")!)
      : undefined;
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year")!)
      : undefined;

    switch (type) {
      case "overview":
        return NextResponse.json(
          await calculatePercentageRent(supabase, PROPERTY_ID, month, year)
        );

      case "trend":
        return NextResponse.json(
          await getPercentageRentTrend(supabase, PROPERTY_ID)
        );

      case "inflation":
        return NextResponse.json(
          await getInflationHedgeAnalysis(supabase, PROPERTY_ID)
        );

      case "optimization":
        return NextResponse.json(
          await getPercentageRateOptimization(supabase, PROPERTY_ID)
        );

      case "composition":
        return NextResponse.json(
          await getRentCompositionBreakdown(supabase, PROPERTY_ID)
        );

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Percentage Rent GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch percentage rent data" },
      { status: 500 }
    );
  }
}
