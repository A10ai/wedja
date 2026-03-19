import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const status = searchParams.get("status");

    let query = supabase
      .from("tenants")
      .select(
        "*, leases(id, unit_id, status, min_rent_monthly_egp, percentage_rate, start_date, end_date, unit:units(id, name, unit_number, zone:zones(id, name)))"
      )
      .order("brand_name", { ascending: true });

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,brand_name.ilike.%${search}%,contact_name.ilike.%${search}%`
      );
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Attach active lease info
    const enriched = (data || []).map((tenant) => {
      const activeLease = (tenant.leases || []).find(
        (l: { status: string }) => l.status === "active"
      );
      return {
        ...tenant,
        active_lease: activeLease || null,
        leases: undefined,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Tenants GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenants" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { data, error } = await supabase
      .from("tenants")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Tenants POST error:", error);
    return NextResponse.json(
      { error: "Failed to create tenant" },
      { status: 500 }
    );
  }
}
