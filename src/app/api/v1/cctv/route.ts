import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCCTVDashboardData,
  getPeopleCountLive,
  getVisitorFlow,
  getDwellAnalysis,
  getQueueStatus,
  getOccupancyStatus,
  getDeadZones,
  getDemographics,
  getParkingStatus,
  getSecurityAlerts,
  getStoreConversion,
} from "@/lib/cctv-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type") || "overview";
    const date = searchParams.get("date") || undefined;
    const hours = searchParams.get("hours")
      ? parseInt(searchParams.get("hours")!)
      : undefined;
    const status = searchParams.get("status") || undefined;

    switch (type) {
      case "overview": {
        const data = await getCCTVDashboardData(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "people_count": {
        const data = await getPeopleCountLive(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "flow": {
        const data = await getVisitorFlow(supabase, PROPERTY_ID, hours);
        return NextResponse.json(data);
      }

      case "dwell": {
        const data = await getDwellAnalysis(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      case "queues": {
        const data = await getQueueStatus(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "occupancy": {
        const data = await getOccupancyStatus(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "dead_zones": {
        const data = await getDeadZones(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      case "demographics": {
        const data = await getDemographics(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      case "parking": {
        const data = await getParkingStatus(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "security": {
        const data = await getSecurityAlerts(supabase, PROPERTY_ID, status);
        return NextResponse.json(data);
      }

      case "conversion": {
        const data = await getStoreConversion(supabase, PROPERTY_ID, date);
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}. Valid types: overview, people_count, flow, dwell, queues, occupancy, dead_zones, demographics, parking, security, conversion` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[CCTV API Error]", error);
    return NextResponse.json(
      { error: "Failed to fetch CCTV analytics data" },
      { status: 500 }
    );
  }
}
