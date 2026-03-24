import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const todayStart = today + "T00:00:00Z";
    const todayEnd = today + "T23:59:59Z";

    const { data, error, count } = await supabase
      .from("footfall_readings")
      .select("count_in", { count: "exact" })
      .gte("timestamp", todayStart)
      .lte("timestamp", todayEnd);

    const total = (data || []).reduce(
      (sum: number, r: { count_in: number }) => sum + (r.count_in || 0),
      0
    );

    return NextResponse.json({
      today,
      todayStart,
      todayEnd,
      rows_returned: (data || []).length,
      exact_count: count,
      total_people: total,
      error: error?.message || null,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30),
      has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
