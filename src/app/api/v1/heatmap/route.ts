import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getLiveHeatmapData,
  getZoneDeepDive,
  getVisitorFlowData,
  getLiveFeed,
} from "@/lib/heatmap-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "live";
    const zoneId = searchParams.get("zone_id") || "";

    switch (type) {
      case "live":
        return NextResponse.json(
          await getLiveHeatmapData(supabase, PROPERTY_ID)
        );

      case "zone_deep_dive":
        if (!zoneId) {
          return NextResponse.json(
            { error: "zone_id is required for zone_deep_dive" },
            { status: 400 }
          );
        }
        return NextResponse.json(
          await getZoneDeepDive(supabase, zoneId)
        );

      case "flow":
        return NextResponse.json(
          await getVisitorFlowData(supabase, PROPERTY_ID)
        );

      case "feed":
        return NextResponse.json(
          await getLiveFeed(supabase, PROPERTY_ID)
        );

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}. Use: live, zone_deep_dive, flow, feed` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Heatmap GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch heatmap data" },
      { status: 500 }
    );
  }
}
