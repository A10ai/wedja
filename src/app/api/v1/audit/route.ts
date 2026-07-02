import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuditLog, getAuditStats } from "@/lib/audit";
import { requireAuth } from "@/lib/api-auth";
import { validateQuery, formatZodErrors, auditQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;

    const queryValidation = validateQuery(auditQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const type = queryValidation.data.type || "log";

    if (type === "stats") {
      const stats = await getAuditStats(supabase);
      return NextResponse.json({ data: stats });
    }

    const category = queryValidation.data.category || undefined;
    const limit = queryValidation.data.limit || 50;
    const offset = queryValidation.data.offset || 0;

    const result = await getAuditLog(supabase, { category, limit, offset });
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
