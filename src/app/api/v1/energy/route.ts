import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEnergyOverview,
  getEnergyByZone,
  getEnergyHourly,
  getEnergyTrend,
  getEnergyVsFootfall,
  getEnergyRecommendations,
} from "@/lib/energy-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "overview";
    const date = searchParams.get("date") || undefined;

    switch (type) {
      case "overview":
        return NextResponse.json(
          await getEnergyOverview(supabase, PROPERTY_ID, date)
        );

      case "by_zone":
        return NextResponse.json(
          await getEnergyByZone(supabase, PROPERTY_ID, date)
        );

      case "hourly":
        return NextResponse.json(
          await getEnergyHourly(supabase, PROPERTY_ID, date)
        );

      case "trend":
        return NextResponse.json(
          await getEnergyTrend(supabase, PROPERTY_ID)
        );

      case "vs_footfall":
        return NextResponse.json(
          await getEnergyVsFootfall(supabase, PROPERTY_ID)
        );

      case "recommendations":
        return NextResponse.json(
          await getEnergyRecommendations(supabase, PROPERTY_ID)
        );

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Energy GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch energy data" },
      { status: 500 }
    );
  }
}
