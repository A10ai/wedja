import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const confidence = searchParams.get("confidence");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    // Get property unit IDs
    const { data: propertyUnits } = await supabase
      .from("units")
      .select("id")
      .eq("property_id", PROPERTY_ID);

    const unitIds = (propertyUnits || []).map((u: any) => u.id);

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
      query = query.eq("period_month", parseInt(month));
    }

    if (year) {
      query = query.eq("period_year", parseInt(year));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by confidence level if specified
    let filtered = data || [];
    if (confidence) {
      filtered = filtered.filter((d: any) => {
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
    console.error("Discrepancies GET error:", error);
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
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { id, status, resolution_notes } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["flagged", "investigating", "resolved", "dismissed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

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

    return NextResponse.json(data);
  } catch (error) {
    console.error("Discrepancies PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update discrepancy" },
      { status: 500 }
    );
  }
}
