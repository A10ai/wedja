import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/event-bus";
import { requireAuth } from "@/lib/api-auth";
import {
  validateBody,
  validateQuery,
  formatZodErrors,
  discrepanciesQuerySchema,
  updateDiscrepancySchema,
} from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * GET /api/v1/discrepancies
 *
 * Query params:
 *   status: "flagged" | "investigating" | "resolved" | "dismissed"
 *   confidence: "high" | "medium" | "low"
 *   month: 1-12
 *   year: e.g. 2026
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const queryValidation = validateQuery(discrepanciesQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const { status, confidence, month, year } = queryValidation.data;

    // Get property unit IDs
    const { data: propertyUnits } = await supabase
      .from("units")
      .select("id")
      .eq("property_id", PROPERTY_ID);

    const unitIds = (propertyUnits || []).map((u: Record<string, any>) => u.id);

    let query = supabase
      .from("discrepancies")
      .select(
        "*, tenants!inner(id, name, brand_name, category), units!inner(id, unit_number)"
      )
      .in("unit_id", unitIds)
      .order("variance_egp", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (month) {
      query = query.eq("period_month", Number(month));
    }

    if (year) {
      query = query.eq("period_year", Number(year));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by confidence level if specified
    let filtered = data || [];
    if (confidence) {
      filtered = filtered.filter((d: Record<string, any>) => {
        const conf = d.confidence || 0;
        switch (confidence) {
          case "high":
            return conf >= 0.75;
          case "medium":
            return conf >= 0.5 && conf < 0.75;
          case "low":
            return conf < 0.5;
          default:
            return true;
        }
      });
    }

    return NextResponse.json(filtered);
  } catch (error) {
    logger.error({ err: error }, "Discrepancies GET error:");
    return NextResponse.json(
      { error: "Failed to fetch discrepancies" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/discrepancies
 *
 * Body:
 *   { id: UUID, status: "investigating" | "resolved" | "dismissed", resolution_notes?: string }
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const validation = validateBody(updateDiscrepancySchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const { id, status, resolution_notes } = validation.data;

    const updateData: Record<string, any> = { status };

    if (resolution_notes !== undefined) {
      updateData.resolution_notes = resolution_notes;
    }

    if (status === "resolved" || status === "dismissed") {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("discrepancies")
      .update(updateData)
      .eq("id", id)
      .select(
        "*, tenants!inner(id, name, brand_name, category), units!inner(id, unit_number)"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Emit tenant.underreporting when flagging a discrepancy
    if (data && status === "flagged") {
      emitEvent(
        "tenant.underreporting",
        "revenue-engine",
        {
          discrepancy_id: data.id,
          tenant_id: data.tenant_id,
          tenant_name: data.tenants?.name || data.tenants?.brand_name || "Unknown",
          variance_egp: data.variance_egp,
          variance_pct: data.variance_pct,
          unit_number: data.units?.unit_number,
        },
        supabase
      ).catch((err) => logger.error({ err: err }, "[EventBus] tenant.underreporting emit failed:"));
    }

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error }, "Discrepancies PUT error:");
    return NextResponse.json(
      { error: "Failed to update discrepancy" },
      { status: 500 }
    );
  }
}
