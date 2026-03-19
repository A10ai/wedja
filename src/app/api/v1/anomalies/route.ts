import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runAnomalyDetection,
  getActiveAnomalies,
  getAnomalyHistory,
  getAnomalyStats,
  acknowledgeAnomaly,
  resolveAnomaly,
} from "@/lib/anomaly-engine";
import type { AnomalySeverity, AnomalyType } from "@/lib/anomaly-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "active";
    const severity = searchParams.get("severity") as AnomalySeverity | null;
    const anomalyType = searchParams.get("anomaly_type") as AnomalyType | null;
    const days = parseInt(searchParams.get("days") || "30");

    switch (type) {
      case "active":
        return NextResponse.json(
          await getActiveAnomalies(
            supabase,
            PROPERTY_ID,
            severity || undefined,
            anomalyType || undefined
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
    console.error("Anomalies GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch anomaly data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "run_detection": {
        const result = await runAnomalyDetection(supabase, PROPERTY_ID);
        return NextResponse.json(result);
      }

      case "acknowledge": {
        const { id, staff_id } = body;
        if (!id) {
          return NextResponse.json(
            { error: "Missing anomaly ID" },
            { status: 400 }
          );
        }
        const success = await acknowledgeAnomaly(supabase, id, staff_id);
        return NextResponse.json({ success });
      }

      case "resolve": {
        const { id, staff_id, notes, false_alarm } = body;
        if (!id) {
          return NextResponse.json(
            { error: "Missing anomaly ID" },
            { status: 400 }
          );
        }
        const success = await resolveAnomaly(
          supabase,
          id,
          staff_id,
          notes,
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
    console.error("Anomalies POST error:", error);
    return NextResponse.json(
      { error: "Failed to process anomaly action" },
      { status: 500 }
    );
  }
}
