import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAutomations,
  runAutomation,
  runAllAutomations,
  toggleAutomation,
  getAutomationLog,
} from "@/lib/automations-engine";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

// Running all seven automations can take a while.
export const maxDuration = 300;

// GET: List all automations with status and recent log
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [automations, log] = await Promise.all([
      getAutomations(supabase),
      getAutomationLog(supabase, 100),
    ]);

    return NextResponse.json({
      data: {
        automations,
        log,
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
  // Read the body without touching the database so the auth check below
  // still runs first; toggling automations is owner-only.
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    automation_id?: string;
    enabled?: boolean;
  } | null;
  const action = body?.action;

  const auth = await requireAuth(request, action === "toggle" ? { roles: ["owner"] } : {});
  if (auth instanceof NextResponse) return auth;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { automation_id, enabled } = body;
    const supabase = createAdminClient();

    switch (action) {
      case "run_all": {
        const result = await runAllAutomations(supabase, "manual");
        return NextResponse.json({
          data: {
            message: `All automations complete — ${result.total_actions} actions taken`,
            total_actions: result.total_actions,
            results: result.results,
            automations: await getAutomations(supabase),
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
        const results = await runAutomation(automation_id, supabase, "manual");
        return NextResponse.json({
          data: {
            automation_id,
            actions: results.length,
            results,
            automations: await getAutomations(supabase),
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
        const updated = await toggleAutomation(supabase, automation_id, enabled, {
          updatedBy: auth.id,
        });
        if (!updated) {
          return NextResponse.json(
            { error: "Automation not found" },
            { status: 404 }
          );
        }
        await logAudit(supabase, {
          user_id: auth.id,
          user_email: auth.email ?? undefined,
          action: enabled ? "automation_enabled" : "automation_disabled",
          category: "automations",
          resource_type: "automation",
          resource_id: automation_id,
          description: `${updated.name} ${enabled ? "enabled" : "disabled"}`,
          new_data: { enabled },
        });
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
