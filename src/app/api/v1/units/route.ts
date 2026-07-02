import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { validateBody, formatZodErrors, createUnitSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zone_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("units")
      .select(
        "*, zone:zones(id, name, type), leases(id, tenant_id, status, min_rent_monthly_egp, tenant:tenants(id, name, brand_name, category))"
      )
      .order("unit_number", { ascending: true });

    if (zoneId) {
      query = query.eq("zone_id", zoneId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten: attach active lease + tenant info
    const enriched = (data || []).map((unit) => {
      const activeLease = (unit.leases || []).find(
        (l: { status: string }) => l.status === "active"
      );
      return {
        ...unit,
        active_lease: activeLease || null,
        current_tenant: activeLease?.tenant || null,
        leases: undefined,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    logger.error({ err: error }, "Units GET error:");
    return NextResponse.json(
      { error: "Failed to fetch units" },
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

    const validation = validateBody(createUnitSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const validated = validation.data;

    const { data, error } = await supabase
      .from("units")
      .insert(validated)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Units POST error:");
    return NextResponse.json(
      { error: "Failed to create unit" },
      { status: 500 }
    );
  }
}
