import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runRevenueVerification,
  getDiscrepancySummary,
  getVerificationReport,
  getTenantRevenueProfile,
} from "@/lib/revenue-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * GET /api/v1/revenue-verification
 *
 * Query params:
 *   type: "summary" | "full" | "tenant" (default: "summary")
 *   month: 1-12
 *   year: e.g. 2026
 *   tenant_id: UUID (required when type=tenant)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type") || "summary";
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month")!)
      : undefined;
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year")!)
      : undefined;
    const tenantId = searchParams.get("tenant_id");

    switch (type) {
      case "summary": {
        const summary = await getDiscrepancySummary(
          supabase,
          PROPERTY_ID,
          month,
          year
        );
        return NextResponse.json(summary);
      }

      case "full": {
        if (!month || !year) {
          return NextResponse.json(
            { error: "month and year are required for full report" },
            { status: 400 }
          );
        }
        const report = await getVerificationReport(
          supabase,
          PROPERTY_ID,
          month,
          year
        );
        return NextResponse.json(report);
      }

      case "tenant": {
        if (!tenantId) {
          return NextResponse.json(
            { error: "tenant_id is required for tenant profile" },
            { status: 400 }
          );
        }
        const profile = await getTenantRevenueProfile(supabase, tenantId);
        return NextResponse.json(profile);
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Revenue verification GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch verification data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/revenue-verification
 *
 * Body:
 *   { action: "run_verification", month: number, year: number }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    if (body.action !== "run_verification") {
      return NextResponse.json(
        { error: `Unknown action: ${body.action}` },
        { status: 400 }
      );
    }

    const { month, year } = body;
    if (!month || !year) {
      return NextResponse.json(
        { error: "month and year are required" },
        { status: 400 }
      );
    }

    const result = await runRevenueVerification(
      supabase,
      PROPERTY_ID,
      month,
      year
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Revenue verification POST error:", error);
    return NextResponse.json(
      { error: "Failed to run verification" },
      { status: 500 }
    );
  }
}
