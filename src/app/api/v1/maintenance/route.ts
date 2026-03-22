import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");

    let query = supabase
      .from("maintenance_tickets")
      .select(
        "*, zone:zones(name), unit:units(unit_number, name)"
      )
      .eq("property_id", PROPERTY_ID)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (priority && priority !== "all") {
      query = query.eq("priority", priority);
    }
    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tickets: data || [] });
  } catch (error) {
    console.error("Maintenance GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch maintenance tickets" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    // Status update
    if (body.action === "update_status" && body.id && body.status) {
      const updateData: any = { status: body.status };
      if (body.status === "completed") {
        updateData.resolved_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .update(updateData)
        .eq("id", body.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Emit maintenance.resolved when ticket is completed
      if (body.status === "completed" && data) {
        emitEvent(
          "maintenance.resolved",
          "maintenance",
          {
            ticket_id: data.id,
            title: data.title,
            zone_id: data.zone_id,
          },
          supabase
        ).catch((err) => console.error("[EventBus] maintenance.resolved emit failed:", err));
      }

      return NextResponse.json(data);
    }

    // Create new ticket
    const { data, error } = await supabase
      .from("maintenance_tickets")
      .insert({
        property_id: PROPERTY_ID,
        zone_id: body.zone_id || null,
        unit_id: body.unit_id || null,
        title: body.title,
        description: body.description || "",
        category: body.category || "other",
        priority: body.priority || "normal",
        status: "open",
        reported_by: body.reported_by || null,
        estimated_cost_egp: body.estimated_cost_egp || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Emit maintenance.created event through the event bus
    emitEvent(
      "maintenance.created",
      "maintenance",
      {
        ticket_id: data.id,
        title: data.title,
        priority: data.priority,
        category: data.category,
        zone_id: data.zone_id,
        unit_id: data.unit_id,
      },
      supabase
    ).catch((err) => console.error("[EventBus] maintenance.created emit failed:", err));

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Maintenance POST error:", error);
    return NextResponse.json(
      { error: "Failed to process maintenance request" },
      { status: 500 }
    );
  }
}
