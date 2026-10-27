import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScheduledJob, type ScheduledJob } from "@/lib/automations-engine";
import { logger } from "@/lib/logger";

// ============================================================
// Vercel Cron entry point (see vercel.json).
//
//   GET /api/v1/ai/cron?job=cycle        "7 3 * * *"  daily 03:07 UTC floor
//                                        — AI Brain + ops checks; the hourly
//                                        cadence comes from the GitHub Actions
//                                        workflow brain-cycle-cron.yml
//   GET /api/v1/ai/cron?job=automations  "15 4 * * *" daily 04:15 UTC
//                                        = 06:15 Cairo (EET, UTC+2, winter)
//                                        / 07:15 Cairo (EEST, UTC+3, summer DST)
//                                        — automations + ML retrain, done
//                                        before the mall opens at 10:00.
// Vercel cron schedules are always UTC (vercel.json cannot hold comments,
// so the schedule notes live here). Hourly crons need a Pro plan; on Hobby
// each cron may run at most once a day.
//
// Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the
// CRON_SECRET env var is set on the project. Anything else gets 401.
// Each job is idempotent: a lock row in system_settings stops overlapping
// runs, and the scheduler switch / interval are honoured.
// ============================================================

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOBS: ScheduledJob[] = ["cycle", "automations"];

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") as ScheduledJob | null;
  if (!job || !JOBS.includes(job)) {
    return NextResponse.json(
      { error: `job must be one of: ${JOBS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const outcome = await runScheduledJob(createAdminClient(), job, { trigger: "cron" });
    logger.info({ job, status: outcome.status, reason: outcome.reason }, "Cron job finished");
    return NextResponse.json({ data: outcome });
  } catch (err) {
    logger.error({ err, job }, "Cron job failed");
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
