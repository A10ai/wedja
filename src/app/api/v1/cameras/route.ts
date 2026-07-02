import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { validateBody, formatZodErrors, createCameraSchema, updateCameraSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

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
    logger.error({ err: error }, "Cameras GET error:");
    return NextResponse.json(
      { error: "Failed to fetch cameras" },
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

    const validation = validateBody(createCameraSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const { name, rtsp_url, zone_id, location_description, angle_type, resolution } = validation.data;

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
    logger.error({ err: error }, "Cameras POST error:");
    return NextResponse.json(
      { error: "Failed to create camera" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const validation = validateBody(updateCameraSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const { id, ...updates } = validation.data;

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
    logger.error({ err: error }, "Cameras PUT error:");
    return NextResponse.json(
      { error: "Failed to update camera" },
      { status: 500 }
    );
  }
}
