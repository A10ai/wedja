import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getContractOverview,
  getExpiringLeases,
  getLeasePerformance,
  getEscalationTracker,
  getRentVsSalesAnalysis,
  getContractAlerts,
  getPortfolioAnalytics,
} from "@/lib/contract-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * GET /api/v1/contracts
 *
 * Query params:
 *   type: "overview" | "expiring" | "performance" | "escalations" | "rent_vs_sales" | "alerts" | "portfolio"
 *   within_days: number (for expiring, default 180)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "overview";
    const withinDays = searchParams.get("within_days")
      ? parseInt(searchParams.get("within_days")!)
      : 180;

    switch (type) {
      case "overview": {
        const data = await getContractOverview(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "expiring": {
        const data = await getExpiringLeases(supabase, PROPERTY_ID, withinDays);
        return NextResponse.json(data);
      }

      case "performance": {
        const data = await getLeasePerformance(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "escalations": {
        const data = await getEscalationTracker(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "rent_vs_sales": {
        const data = await getRentVsSalesAnalysis(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "alerts": {
        const data = await getContractAlerts(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      case "portfolio": {
        const data = await getPortfolioAnalytics(supabase, PROPERTY_ID);
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Contracts GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contract data" },
      { status: 500 }
    );
  }
}
