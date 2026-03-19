import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
    console.error("Units GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { data, error } = await supabase
      .from("units")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Units POST error:", error);
    return NextResponse.json(
      { error: "Failed to create unit" },
      { status: 500 }
    );
  }
}
