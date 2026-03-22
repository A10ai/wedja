import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuditLog, getAuditStats } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") || "log";

    if (type === "stats") {
      const stats = await getAuditStats(supabase);
      return NextResponse.json({ data: stats });
    }

    const category = searchParams.get("category") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = await getAuditLog(supabase, { category, limit, offset });
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
