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
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { validateQuery, formatZodErrors, energyQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const queryValidation = validateQuery(energyQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const type = queryValidation.data.type || "overview";
    const date = queryValidation.data.date || undefined;

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
    logger.error({ err: error }, "Energy GET error:");
    return NextResponse.json(
      { error: "Failed to fetch energy data" },
      { status: 500 }
    );
  }
}
