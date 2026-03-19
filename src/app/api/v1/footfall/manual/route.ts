import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { unit_id, zone_id, count_in, count_out, timestamp } = body;

    if (!count_in && count_in !== 0) {
      return NextResponse.json(
        { error: "count_in is required" },
        { status: 400 }
      );
    }

    if (!unit_id && !zone_id) {
      return NextResponse.json(
        { error: "Either unit_id or zone_id is required" },
        { status: 400 }
      );
    }

    const ts = timestamp || new Date().toISOString();

    // Resolve zone_id from unit if not provided
    let resolvedZoneId = zone_id;
    if (!resolvedZoneId && unit_id) {
      const { data: unit } = await supabase
        .from("units")
        .select("zone_id")
        .eq("id", unit_id)
        .single();

      resolvedZoneId = unit?.zone_id || null;
    }

    // Insert footfall reading
    const { data: reading, error: readingError } = await supabase
      .from("footfall_readings")
      .insert({
        zone_id: resolvedZoneId,
        unit_id: unit_id || null,
        timestamp: ts,
        count_in: count_in || 0,
        count_out: count_out || 0,
        dwell_seconds: null,
        confidence: 1.0, // Manual entry = full confidence
      })
      .select()
      .single();

    if (readingError) {
      return NextResponse.json(
        { error: readingError.message },
        { status: 500 }
      );
    }

    // Also update (or insert) the footfall_daily summary
    const dateStr = new Date(ts).toISOString().split("T")[0];
    const hour = new Date(ts).getHours();

    // Check if daily record exists
    let dailyQuery = supabase
      .from("footfall_daily")
      .select("id, total_in, total_out, peak_hour, peak_count")
      .eq("property_id", PROPERTY_ID)
      .eq("date", dateStr);

    if (unit_id) {
      dailyQuery = dailyQuery.eq("unit_id", unit_id);
    } else {
      dailyQuery = dailyQuery.eq("zone_id", resolvedZoneId).is("unit_id", null);
    }

    const { data: existing } = await dailyQuery.maybeSingle();

    if (existing) {
      // Update existing
      const newTotalIn = (existing.total_in || 0) + (count_in || 0);
      const newTotalOut = (existing.total_out || 0) + (count_out || 0);
      const newPeakHour =
        count_in > (existing.peak_count || 0) ? hour : existing.peak_hour;
      const newPeakCount = Math.max(count_in || 0, existing.peak_count || 0);

      await supabase
        .from("footfall_daily")
        .update({
          total_in: newTotalIn,
          total_out: newTotalOut,
          peak_hour: newPeakHour,
          peak_count: newPeakCount,
        })
        .eq("id", existing.id);
    } else {
      // Insert new daily record
      await supabase.from("footfall_daily").insert({
        property_id: PROPERTY_ID,
        zone_id: resolvedZoneId,
        unit_id: unit_id || null,
        date: dateStr,
        total_in: count_in || 0,
        total_out: count_out || 0,
        peak_hour: hour,
        peak_count: count_in || 0,
        avg_dwell_seconds: null,
      });
    }

    return NextResponse.json(
      { success: true, reading },
      { status: 201 }
    );
  } catch (error) {
    console.error("Manual footfall POST error:", error);
    return NextResponse.json(
      { error: "Failed to save manual footfall entry" },
      { status: 500 }
    );
  }
}
