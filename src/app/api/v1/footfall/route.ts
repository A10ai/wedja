import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getFootfallOverview,
  getFootfallByZone,
  getFootfallByUnit,
  getHourlyFootfall,
  getFootfallTrend,
  getFootfallHeatmap,
  getPeakPatterns,
} from "@/lib/footfall-engine";

export const dynamic = "force-dynamic"; // v2

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type") || "overview";
    const date = searchParams.get("date") || undefined;
    const zoneId = searchParams.get("zone_id") || undefined;
    const days = searchParams.get("days")
      ? parseInt(searchParams.get("days")!)
      : undefined;

    switch (type) {
      case "overview": {
        const todayStr = date || new Date().toISOString().split("T")[0];
        // Run engine overview and direct live count in parallel
        const [overview, liveResult] = await Promise.all([
          getFootfallOverview(supabase, PROPERTY_ID, date),
          supabase
            .from("footfall_readings")
            .select("count_in", { count: "exact" })
            .gte("timestamp", todayStr + "T00:00:00Z")
            .lte("timestamp", todayStr + "T23:59:59Z"),
        ]);
        const liveTotal = (liveResult.data || []).reduce((s: number, r: any) => s + (r.count_in || 0), 0);
        const result = { ...overview };
        result.total_visitors_today = Math.max(result.total_visitors_today, liveTotal);
        return NextResponse.json(result, {
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        });
      }

      case "by_zone": {
        const data = await getFootfallByZone(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      case "by_unit": {
        const data = await getFootfallByUnit(
          supabase,
          PROPERTY_ID,
          zoneId,
          date
        );
        return NextResponse.json(data);
      }

      case "hourly": {
        const data = await getHourlyFootfall(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      case "trend": {
        const data = await getFootfallTrend(supabase, PROPERTY_ID, days);
        return NextResponse.json(data);
      }

      case "heatmap": {
        const data = await getFootfallHeatmap(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      case "peaks": {
        const data = await getPeakPatterns(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Footfall GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch footfall data" },
      { status: 500 }
    );
  }
}
