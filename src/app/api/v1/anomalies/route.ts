import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import {
  runAnomalyDetection,
  getActiveAnomalies,
  getAnomalyHistory,
  getAnomalyStats,
  acknowledgeAnomaly,
  resolveAnomaly,
} from "@/lib/anomaly-engine";
import type { AnomalySeverity, AnomalyType } from "@/lib/anomaly-engine";
import {
  validateBody,
  validateQuery,
  formatZodErrors,
  anomaliesQuerySchema,
  anomalyActionSchema,
} from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const queryValidation = validateQuery(anomaliesQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const { type = "active", severity, anomaly_type: anomalyType, days = 30 } = queryValidation.data;

    switch (type) {
      case "active":
        return NextResponse.json(
          await getActiveAnomalies(
            supabase,
            PROPERTY_ID,
            severity ? (severity as "low" | "medium" | "high" | "critical") : undefined,
            anomalyType as "footfall_spike" | "footfall_drop" | "energy_spike" | "energy_drop" | "revenue_anomaly" | "rent_delay_pattern" | "queue_anomaly" | "parking_anomaly" | "security_pattern" | "maintenance_pattern" | "conversion_anomaly" | undefined
          )
        );

      case "history":
        return NextResponse.json(
          await getAnomalyHistory(supabase, PROPERTY_ID, days)
        );

      case "stats":
        return NextResponse.json(
          await getAnomalyStats(supabase, PROPERTY_ID)
        );

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, "Anomalies GET error:");
    return NextResponse.json(
      { error: "Failed to fetch anomaly data" },
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

    const validation = validateBody(anomalyActionSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodErrors(validation.error) },
        { status: 400 }
      );
    }
    const { action } = validation.data;

    switch (action) {
      case "run_detection": {
        const result = await runAnomalyDetection(supabase, PROPERTY_ID);
        return NextResponse.json(result);
      }

      case "acknowledge": {
        const { id, staff_id } = validation.data;
        if (!id) {
          return NextResponse.json(
            { error: "Missing anomaly ID" },
            { status: 400 }
          );
        }
        const success = await acknowledgeAnomaly(supabase, id, staff_id ?? undefined);
        return NextResponse.json({ success });
      }

      case "resolve": {
        const { id, staff_id, notes, false_alarm } = validation.data;
        if (!id) {
          return NextResponse.json(
            { error: "Missing anomaly ID" },
            { status: 400 }
          );
        }
        const success = await resolveAnomaly(
          supabase,
          id,
          staff_id ?? undefined,
          notes ?? undefined,
          false_alarm === true
        );
        return NextResponse.json({ success });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, "Anomalies POST error:");
    return NextResponse.json(
      { error: "Failed to process anomaly action" },
      { status: 500 }
    );
  }
}
