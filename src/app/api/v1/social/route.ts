import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSocialOverview,
  generateContentIdeas,
  getContentCalendar,
  getPostAnalytics,
  generateCaptions,
  getCompetitorBenchmark,
  getSocialInsights,
} from "@/lib/social-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "overview";

    switch (type) {
      case "overview":
        return NextResponse.json(
          await getSocialOverview(supabase, PROPERTY_ID)
        );

      case "calendar": {
        const start = searchParams.get("start") || undefined;
        const end = searchParams.get("end") || undefined;
        return NextResponse.json(
          await getContentCalendar(supabase, PROPERTY_ID, start, end)
        );
      }

      case "analytics": {
        const days = searchParams.get("days")
          ? parseInt(searchParams.get("days")!)
          : 60;
        return NextResponse.json(
          await getPostAnalytics(supabase, PROPERTY_ID, days)
        );
      }

      case "ideas":
        return NextResponse.json(
          await generateContentIdeas(supabase, PROPERTY_ID)
        );

      case "insights":
        return NextResponse.json(
          await getSocialInsights(supabase, PROPERTY_ID)
        );

      case "posts": {
        const status = searchParams.get("status") || undefined;
        const platform = searchParams.get("platform") || undefined;
        const limit = searchParams.get("limit")
          ? parseInt(searchParams.get("limit")!)
          : 20;

        let query = supabase
          .from("social_posts")
          .select("*")
          .eq("property_id", PROPERTY_ID)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(limit);

        if (status) query = query.eq("status", status);
        if (platform) query = query.eq("platform", platform);

        const { data, error } = await query;
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(data);
      }

      case "captions": {
        const topic = searchParams.get("topic") || "Senzo Mall";
        const language = searchParams.get("language") || "multi";
        const platform = searchParams.get("platform") || "instagram";
        return NextResponse.json(
          generateCaptions(topic, language, platform)
        );
      }

      case "competitors":
        return NextResponse.json(
          await getCompetitorBenchmark(supabase, PROPERTY_ID)
        );

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Social GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch social media data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();
    const entity = body.entity;

    if (entity === "post") {
      const { data, error } = await supabase
        .from("social_posts")
        .insert({
          property_id: PROPERTY_ID,
          account_id: body.account_id || null,
          platform: body.platform,
          content_type: body.content_type,
          caption: body.caption || null,
          hashtags: body.hashtags || [],
          media_url: body.media_url || null,
          status: body.status || "draft",
          scheduled_at: body.scheduled_at || null,
          ai_generated: body.ai_generated || false,
          ai_score: body.ai_score || null,
          campaign_id: body.campaign_id || null,
          event_id: body.event_id || null,
          tenant_id: body.tenant_id || null,
          category: body.category || null,
          language: body.language || "en",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (entity === "calendar") {
      const { data, error } = await supabase
        .from("content_calendar")
        .insert({
          property_id: PROPERTY_ID,
          date: body.date,
          platform: body.platform,
          content_type: body.content_type,
          category: body.category || null,
          title: body.title,
          description: body.description || null,
          status: body.status || "planned",
          assigned_to: body.assigned_to || null,
          post_id: body.post_id || null,
          ai_suggested: body.ai_suggested || false,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 201 });
    }

    return NextResponse.json(
      { error: "entity must be 'post' or 'calendar'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Social POST error:", error);
    return NextResponse.json(
      { error: "Failed to create social media entity" },
      { status: 500 }
    );
  }
}
