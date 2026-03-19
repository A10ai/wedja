import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("camera_feeds")
      .select("*, zone:zones(id, name, type, floor)")
      .eq("property_id", PROPERTY_ID)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Cameras GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cameras" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { name, rtsp_url, zone_id, location_description, angle_type, resolution } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Camera name is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("camera_feeds")
      .insert({
        property_id: PROPERTY_ID,
        name,
        rtsp_url: rtsp_url || null,
        zone_id: zone_id || null,
        location_description: location_description || null,
        angle_type: angle_type || null,
        resolution: resolution || "1920x1080",
        status: "offline",
      })
      .select("*, zone:zones(id, name, type, floor)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Cameras POST error:", error);
    return NextResponse.json(
      { error: "Failed to create camera" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Camera id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("camera_feeds")
      .update(updates)
      .eq("id", id)
      .select("*, zone:zones(id, name, type, floor)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Cameras PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update camera" },
      { status: 500 }
    );
  }
}
