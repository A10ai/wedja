import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/event-bus";
import { requireAuth } from "@/lib/api-auth";
import { validateBody, formatZodErrors, createRentTransactionSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const leaseId = searchParams.get("lease_id");
    const status = searchParams.get("status");
    const period = searchParams.get("period"); // format: "2026-01" or "2026"

    let query = supabase
      .from("rent_transactions")
      .select(
        "*, lease:leases(id, tenant:tenants(id, name, brand_name), unit:units(id, name, unit_number))"
      )
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    if (leaseId) {
      query = query.eq("lease_id", leaseId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (period) {
      const parts = period.split("-");
      query = query.eq("period_year", parseInt(parts[0]));
      if (parts.length > 1) {
        query = query.eq("period_month", parseInt(parts[1]));
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    logger.error({ err: error }, "Rent transactions GET error:");
    return NextResponse.json(
      { error: "Failed to fetch rent transactions" },
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

    const validation = validateBody(createRentTransactionSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const validated = validation.data;

    const { data, error } = await supabase
      .from("rent_transactions")
      .insert(validated)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Emit rent.overdue event if the transaction status is overdue
    if (data && data.status === "overdue") {
      emitEvent(
        "rent.overdue",
        "revenue-engine",
        {
          transaction_id: data.id,
          lease_id: data.lease_id,
          amount_due: data.amount_due,
          period_month: data.period_month,
          period_year: data.period_year,
        },
        supabase
      ).catch((err) => logger.error({ err: err }, "[EventBus] rent.overdue emit failed:"));
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Rent transactions POST error:");
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 }
    );
  }
}
