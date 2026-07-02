import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMarketingOverview,
  getSeasonalCalendar,
  getEventPerformance,
  getCampaignROI,
  getEventFootfallCorrelation,
  getUpcomingSeasonalAlerts,
  getTenantPromotions,
} from "@/lib/marketing-engine";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { validateQuery, validateBody, formatZodErrors, marketingQuerySchema, createEventSchema, createCampaignSchema, createPromotionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const queryValidation = validateQuery(marketingQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const type = queryValidation.data.type || "overview";
    const year = queryValidation.data.year;
    const status = queryValidation.data.status;

    switch (type) {
      case "overview":
        return NextResponse.json(
          await getMarketingOverview(supabase, PROPERTY_ID)
        );

      case "calendar":
        return NextResponse.json(
          await getSeasonalCalendar(supabase, PROPERTY_ID, year)
        );

      case "performance":
        return NextResponse.json(
          await getEventPerformance(supabase, PROPERTY_ID)
        );

      case "campaigns":
        return NextResponse.json(
          await getCampaignROI(supabase, PROPERTY_ID)
        );

      case "correlation":
        return NextResponse.json(
          await getEventFootfallCorrelation(supabase, PROPERTY_ID)
        );

      case "alerts":
        return NextResponse.json(
          await getUpcomingSeasonalAlerts(supabase, PROPERTY_ID)
        );

      case "promotions":
        return NextResponse.json(
          await getTenantPromotions(supabase, PROPERTY_ID, status)
        );

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, "Marketing GET error:");
    return NextResponse.json(
      { error: "Failed to fetch marketing data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const entity = body.entity; // "event", "campaign", or "promotion"

    // Validate body — discriminated by entity field
    const schema = entity === "event"
      ? createEventSchema
      : entity === "campaign"
        ? createCampaignSchema
        : entity === "promotion"
          ? createPromotionSchema
          : null;
    if (!schema) {
      return NextResponse.json(
        { error: "entity must be 'event', 'campaign', or 'promotion'" },
        { status: 400 }
      );
    }
    const validation = validateBody(schema as z.ZodSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

    if (entity === "event") {
      const { data, error } = await supabase
        .from("events")
        .insert({
          property_id: PROPERTY_ID,
          title: body.title,
          description: body.description || null,
          event_type: body.event_type,
          start_date: body.start_date,
          end_date: body.end_date,
          start_time: body.start_time || null,
          end_time: body.end_time || null,
          location: body.location || null,
          zone_id: body.zone_id || null,
          target_audience: body.target_audience || "all",
          expected_footfall_boost_pct: body.expected_footfall_boost_pct || 0,
          budget_egp: body.budget_egp || null,
          status: body.status || "planned",
          organizer: body.organizer || null,
          notes: body.notes || null,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (entity === "campaign") {
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          property_id: PROPERTY_ID,
          name: body.name,
          campaign_type: body.campaign_type,
          start_date: body.start_date,
          end_date: body.end_date,
          budget_egp: body.budget_egp || null,
          target_audience: body.target_audience || null,
          channels: body.channels || [],
          kpi_target: body.kpi_target || null,
          status: body.status || "draft",
          notes: body.notes || null,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (entity === "promotion") {
      const { data, error } = await supabase
        .from("tenant_promotions")
        .insert({
          property_id: PROPERTY_ID,
          tenant_id: body.tenant_id,
          title: body.title,
          promotion_type: body.promotion_type || null,
          start_date: body.start_date,
          end_date: body.end_date,
          discount_pct: body.discount_pct || null,
          status: body.status || "planned",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 201 });
    }

    return NextResponse.json(
      { error: "entity must be 'event', 'campaign', or 'promotion'" },
      { status: 400 }
    );
  } catch (error) {
    logger.error({ err: error }, "Marketing POST error:");
    return NextResponse.json(
      { error: "Failed to create marketing entity" },
      { status: 500 }
    );
  }
}
