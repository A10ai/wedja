// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { runScheduledJob, createAdminClient } = vi.hoisted(() => ({
  runScheduledJob: vi.fn(),
  createAdminClient: vi.fn(() => ({ fake: true })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/automations-engine", () => ({ runScheduledJob }));

import { GET, maxDuration } from "@/app/api/v1/ai/cron/route";

const SECRET = "s3cret-s3cret-s3cret-0123";
const req = (job: string | null, auth?: string) =>
  new NextRequest(`http://localhost/api/v1/ai/cron${job ? `?job=${job}` : ""}`, {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  runScheduledJob.mockResolvedValue({ job: "cycle", status: "ran", results: {} });
});

describe("GET /api/v1/ai/cron", () => {
  test("exports maxDuration for long jobs", () => {
    expect(maxDuration).toBe(300);
  });

  test.each([
    ["no header", undefined],
    ["wrong secret", "Bearer nope"],
    ["missing Bearer prefix", SECRET],
    ["secret with extra suffix", `Bearer ${SECRET}x`],
  ])("401 with %s (before touching the database)", async (_n, auth) => {
    const res = await GET(req("cycle", auth));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(runScheduledJob).not.toHaveBeenCalled();
  });

  test("401 when CRON_SECRET is unset or too short, even if the header matches", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("cycle", "Bearer undefined"))).status).toBe(401);
    process.env.CRON_SECRET = "short";
    expect((await GET(req("cycle", "Bearer short"))).status).toBe(401);
  });

  test("400 for a missing or unknown job", async () => {
    expect((await GET(req(null, `Bearer ${SECRET}`))).status).toBe(400);
    expect((await GET(req("drop_tables", `Bearer ${SECRET}`))).status).toBe(400);
    expect(runScheduledJob).not.toHaveBeenCalled();
  });

  test.each(["cycle", "automations"])("runs the %s job as a cron trigger", async (job) => {
    const res = await GET(req(job, `Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(runScheduledJob).toHaveBeenCalledWith({ fake: true }, job, { trigger: "cron" });
    expect((await res.json()).data.status).toBe("ran");
  });

  test("500 when the job throws", async () => {
    runScheduledJob.mockRejectedValue(new Error("x"));
    const res = await GET(req("cycle", `Bearer ${SECRET}`));
    expect(res.status).toBe(500);
  });
});
