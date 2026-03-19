import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const upcoming = searchParams.get("upcoming");

    let query = supabase
      .from("events")
      .select("*")
      .eq("property_id", PROPERTY_ID)
      .order("start_date", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    if (type) {
      query = query.eq("event_type", type);
    }

    if (upcoming === "true") {
      const today = new Date().toISOString().split("T")[0];
      query = query.gte("start_date", today).in("status", ["planned", "active"]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Events GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

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
  } catch (error) {
    console.error("Events POST error:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Event id is required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    const allowedFields = [
      "title",
      "description",
      "event_type",
      "start_date",
      "end_date",
      "start_time",
      "end_time",
      "location",
      "zone_id",
      "target_audience",
      "expected_footfall_boost_pct",
      "actual_footfall_boost_pct",
      "budget_egp",
      "actual_cost_egp",
      "revenue_impact_egp",
      "status",
      "organizer",
      "notes",
    ];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    const { data, error } = await supabase
      .from("events")
      .update(updateData)
      .eq("id", body.id)
      .eq("property_id", PROPERTY_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Events PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}
