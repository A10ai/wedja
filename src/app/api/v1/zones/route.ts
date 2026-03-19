import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: zones, error } = await supabase
      .from("zones")
      .select("*, units(id, status)")
      .order("floor", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute unit counts per zone
    const zonesWithCounts = (zones || []).map((zone) => {
      const units = zone.units || [];
      return {
        ...zone,
        unit_count: units.length,
        occupied_count: units.filter(
          (u: { status: string }) => u.status === "occupied"
        ).length,
        vacant_count: units.filter(
          (u: { status: string }) => u.status === "vacant"
        ).length,
        maintenance_count: units.filter(
          (u: { status: string }) => u.status === "maintenance"
        ).length,
        units: undefined,
      };
    });

    return NextResponse.json(zonesWithCounts);
  } catch (error) {
    console.error("Zones GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch zones" },
      { status: 500 }
    );
  }
}
