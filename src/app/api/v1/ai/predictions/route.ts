import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  forecastFootfall,
  forecastRevenue,
  getModelPerformance,
  trainFootfallModel,
  trainRevenueModel,
} from "@/lib/prediction-model";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "footfall";

    const supabase = createAdminClient();

    switch (type) {
      case "footfall": {
        const days = parseInt(searchParams.get("days") || "30");
        const result = await forecastFootfall(supabase, days);
        return NextResponse.json({ data: result });
      }

      case "revenue": {
        const months = parseInt(searchParams.get("months") || "6");
        const result = await forecastRevenue(supabase, months);
        return NextResponse.json({ data: result });
      }

      case "performance": {
        const result = await getModelPerformance(supabase);
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json(
          { error: "Invalid type. Use: footfall, revenue, or performance" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate predictions",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action !== "train") {
      return NextResponse.json(
        { error: "Invalid action. Use: train" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const start = Date.now();

    const [footfallModel, revenueModel] = await Promise.all([
      trainFootfallModel(supabase),
      trainRevenueModel(supabase),
    ]);

    const duration = Date.now() - start;

    return NextResponse.json({
      data: {
        message: "Both models retrained successfully",
        duration_ms: duration,
        footfall: {
          training_samples: footfallModel.training_samples,
          r_squared: footfallModel.r_squared,
          mae: footfallModel.accuracy_mae,
          mape: footfallModel.accuracy_mape,
          trend_slope: footfallModel.trend_slope,
        },
        revenue: {
          training_samples: revenueModel.training_samples,
          r_squared: revenueModel.r_squared,
          mae: revenueModel.accuracy_mae,
          mape: revenueModel.accuracy_mape,
          trend_slope: revenueModel.trend_slope,
        },
      },
    });
  } catch (error) {
    console.error("Predictions train error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to train models",
      },
      { status: 500 }
    );
  }
}
