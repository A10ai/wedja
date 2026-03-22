import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emitEvent,
  getRegisteredEventTypes,
  type EventType,
  type SourceSystem,
} from "@/lib/event-bus";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ai/events
 *
 * Returns recent events, stats, and registered event types.
 * Query params:
 *   limit: number (default 50)
 *   type: EventType filter
 *   source: SourceSystem filter
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const typeFilter = searchParams.get("type");
    const sourceFilter = searchParams.get("source");

    // Fetch events
    let query = supabase
      .from("system_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (typeFilter && typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }
    if (sourceFilter && sourceFilter !== "all") {
      query = query.eq("source_system", sourceFilter);
    }

    const { data: events, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Stats: events today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: eventsToday } = await supabase
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());

    // Total actions triggered today
    const { data: todayEvents } = await supabase
      .from("system_events")
      .select("results")
      .gte("created_at", todayStart.toISOString())
      .eq("processed", true);

    const actionsToday = (todayEvents || []).reduce((sum, evt) => {
      const results = evt.results as Array<{ success: boolean }> | null;
      return sum + (results?.filter((r) => r.success).length || 0);
    }, 0);

    // Unique source systems
    const { data: sources } = await supabase
      .from("system_events")
      .select("source_system")
      .limit(100);

    const uniqueSources = Array.from(
      new Set((sources || []).map((s: { source_system: string }) => s.source_system))
    );

    // Registered types
    const registeredTypes = getRegisteredEventTypes();

    return NextResponse.json({
      events: events || [],
      stats: {
        events_today: eventsToday || 0,
        actions_today: actionsToday,
        systems_connected: uniqueSources.length || 0,
        registered_types: registeredTypes.length,
      },
      registered_types: registeredTypes,
      source_systems: uniqueSources,
    });
  } catch (error) {
    console.error("Events GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/ai/events
 *
 * Emit a new event through the event bus.
 * Body: { type: EventType, source_system: string, payload: object }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { type, source_system, payload } = body as {
      type: EventType;
      source_system: SourceSystem | string;
      payload: Record<string, unknown>;
    };

    if (!type || !source_system) {
      return NextResponse.json(
        { error: "type and source_system are required" },
        { status: 400 }
      );
    }

    const result = await emitEvent(type, source_system, payload || {}, supabase);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Events POST error:", error);
    return NextResponse.json(
      { error: "Failed to emit event" },
      { status: 500 }
    );
  }
}
