import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runRevenueVerification,
  getDiscrepancySummary,
  getVerificationReport,
  getTenantRevenueProfile,
} from "@/lib/revenue-engine";
import { requireAuth } from "@/lib/api-auth";
import {
  validateBody,
  validateQuery,
  formatZodErrors,
  revenueVerificationQuerySchema,
  revenueVerificationActionSchema,
} from "@/lib/validation";
import { logger } from "@/lib/logger";

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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const queryValidation = validateQuery(revenueVerificationQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const { type = "summary", month, year, tenant_id: tenantId } = queryValidation.data;

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
    logger.error({ err: error }, "Revenue verification GET error:");
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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const validation = validateBody(revenueVerificationActionSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const validated = validation.data;

    const { month, year } = validated;

    const result = await runRevenueVerification(
      supabase,
      PROPERTY_ID,
      month,
      year
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "Revenue verification POST error:");
    return NextResponse.json(
      { error: "Failed to run verification" },
      { status: 500 }
    );
  }
}
