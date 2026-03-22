import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAutomations,
  runAutomation,
  runAllAutomations,
  toggleAutomation,
  getAutomationLog,
} from "@/lib/automations-engine";

// GET: List all automations with status and recent log
export async function GET() {
  try {
    const automations = getAutomations();
    const log = getAutomationLog();

    return NextResponse.json({
      data: {
        automations,
        log: log.slice(0, 100),
        total_enabled: automations.filter((a) => a.enabled).length,
        total_actions: automations.reduce((sum, a) => sum + a.actions_taken, 0),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Run automations or toggle state
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, automation_id, enabled } = body as {
      action?: string;
      automation_id?: string;
      enabled?: boolean;
    };

    const supabase = createAdminClient();

    switch (action) {
      case "run_all": {
        const result = await runAllAutomations(supabase);
        return NextResponse.json({
          data: {
            message: `All automations complete — ${result.total_actions} actions taken`,
            total_actions: result.total_actions,
            results: result.results,
            automations: getAutomations(),
          },
        });
      }

      case "run_one": {
        if (!automation_id) {
          return NextResponse.json(
            { error: "automation_id is required" },
            { status: 400 }
          );
        }
        const results = await runAutomation(automation_id, supabase);
        return NextResponse.json({
          data: {
            automation_id,
            actions: results.length,
            results,
            automations: getAutomations(),
          },
        });
      }

      case "toggle": {
        if (!automation_id || typeof enabled !== "boolean") {
          return NextResponse.json(
            { error: "automation_id and enabled (boolean) are required" },
            { status: 400 }
          );
        }
        const updated = toggleAutomation(automation_id, enabled);
        if (!updated) {
          return NextResponse.json(
            { error: "Automation not found" },
            { status: 404 }
          );
        }
        return NextResponse.json({ data: { automation: updated } });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
