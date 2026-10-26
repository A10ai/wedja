/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCaptions,
  getCompetitorBenchmark,
  getSocialOverview,
  generateContentIdeas,
  getContentCalendar,
  getPostAnalytics,
  getSocialInsights,
} from "@/lib/social-engine";
import { createScriptedSupabase, type QueryCtx } from "./helpers/scripted-supabase";

const PROP = "a0000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-10-26T12:00:00Z"); // Monday; TZ is UTC in this environment

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}
function plus(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function post(over: Record<string, any> = {}) {
  return {
    id: "p",
    platform: "instagram",
    content_type: "image",
    caption: null,
    hashtags: [],
    status: "published",
    published_at: "2026-10-05T19:00:00Z",
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    reach: 0,
    impressions: 0,
    engagement_rate: 0,
    category: null,
    language: "en",
    ...over,
  };
}

// ── generateCaptions (pure) ──────────────────────────────────

describe("social-engine: generateCaptions", () => {
  test("default instagram gives 3 long-form options embedding the topic and base hashtags", () => {
    const r = generateCaptions("Autumn Collection");
    expect(r.map((o) => o.tone)).toEqual(["Informative & inviting", "Engaging & interactive", "Urgency-driven"]);
    for (const o of r) {
      expect(o.hashtags).toEqual(["#SenzoMall", "#Hurghada", "#Egypt", "#RedSea"]);
      expect(o.caption_en.startsWith("Autumn Collection") || o.caption_en.includes("Autumn Collection")).toBe(true);
      expect(o.caption_en.endsWith(o.hashtags.join(" "))).toBe(true);
      expect(o.caption_ar).toContain("Autumn Collection");
    }
  });

  test("keyword detection is case-insensitive and stacks themed hashtags in a fixed order", () => {
    const [o] = generateCaptions("RAMADAN Iftar SALE for Mother's Day and Eid");
    expect(o.hashtags).toEqual([
      "#SenzoMall", "#Hurghada",
      "#RamadanKareem", "#رمضان_كريم", "#Ramadan2026",
      "#EidMubarak", "#عيد_مبارك", "#EidAlFitr",
      "#FoodLovers", "#Iftar", "#إفطار",
      "#ShoppingSpree", "#Deals", "#عروض",
      "#MothersDay", "#عيد_الأم",
      "#Egypt", "#RedSea",
    ]);
  });

  test("x (twitter) options use trimmed hashtag sets", () => {
    const r = generateCaptions("Ramadan nights", "multi", "x");
    expect(r.map((o) => o.tone)).toEqual(["Concise & punchy", "Interactive", "News-style"]);
    expect(r[0].hashtags).toEqual(["#SenzoMall", "#Hurghada", "#RamadanKareem", "#رمضان_كريم"]);
    expect(r[1].hashtags).toHaveLength(3);
    expect(r[0].caption_en).toBe("Ramadan nights at Senzo Mall — don't miss out! #SenzoMall #Hurghada #RamadanKareem");
  });

  test("tiktok options all append #FYP to the full hashtag set", () => {
    const r = generateCaptions("Food fest", "multi", "tiktok");
    expect(r).toHaveLength(3);
    for (const o of r) {
      expect(o.hashtags.slice(0, 2)).toEqual(["#SenzoMall", "#Hurghada"]);
      expect(o.hashtags).toContain("#FoodLovers");
      expect(o.hashtags.at(-1)).toBe("#FYP");
    }
    expect(r[0].caption_en).toBe("POV: You're at Food fest in Senzo Mall and the vibes are immaculate");
  });

  test("facebook, linkedin and unknown platforms fall back to the long-form template", () => {
    const ig = generateCaptions("Topic", "multi", "instagram");
    expect(generateCaptions("Topic", "multi", "facebook")).toEqual(ig);
    expect(generateCaptions("Topic", "multi", "linkedin")).toEqual(ig);
    expect(generateCaptions("Topic", "multi", "myspace")).toEqual(ig);
  });

  test("empty topic still yields 3 options with only base hashtags", () => {
    const r = generateCaptions("");
    expect(r).toHaveLength(3);
    expect(r[0].hashtags).toHaveLength(4);
  });

  test("returned hashtag arrays are fresh per call (no shared mutable state)", () => {
    const a = generateCaptions("Eid");
    a[0].hashtags.push("#Mutated");
    expect(generateCaptions("Eid")[0].hashtags).not.toContain("#Mutated");
  });

  // BUG: social-engine.ts:761,768,775,783,790,797,806,813,820 — char_count is a hard-coded
  // constant (80/90/75/250/180/140...) rather than the caption's length.
  test.fails("char_count reflects the actual English caption length", () => {
    for (const platform of ["instagram", "x", "tiktok"]) {
      for (const o of generateCaptions("Black Friday deals", "multi", platform)) {
        expect(o.char_count).toBe(o.caption_en.length);
      }
    }
  });

  // BUG: social-engine.ts:728-736 — platformConfig.maxChars is computed but never enforced,
  // so captions for X (280 chars) can exceed the platform limit for long topics.
  test.fails("x captions never exceed the 280 character limit", () => {
    const topic = "Grand opening of the brand new family entertainment centre with rides, arcade, bowling, " +
      "a VR zone, birthday party rooms, a kids' soft play area, and a huge food hall with 25 new restaurants and cafes, open late every night";
    expect(topic.length).toBeGreaterThan(220);
    for (const o of generateCaptions(topic, "multi", "x")) {
      expect(o.caption_en.length).toBeLessThanOrEqual(280);
    }
  });

  // BUG: social-engine.ts:739-743 — keywords are matched as raw substrings, so "Ideal"
  // matches "deal" and adds shopping/deal hashtags to an unrelated post.
  test.fails("'Ideal' is not treated as a deals/shopping topic", () => {
    const [o] = generateCaptions("Ideal family weekend");
    expect(o.hashtags).not.toContain("#Deals");
  });
});

describe("social-engine: getCompetitorBenchmark", () => {
  test("is a planned placeholder that does not touch the database", async () => {
    const sb = createScriptedSupabase(() => []);
    const r = await getCompetitorBenchmark(sb);
    expect(r.status).toBe("planned");
    expect(sb._calls).toHaveLength(0);
  });
});

// ── Overview ─────────────────────────────────────────────────

describe("social-engine: getSocialOverview", () => {
  test("empty data → zero totals, sensible defaults and a non-empty IN() list", async () => {
    const sb = createScriptedSupabase(() => []);
    const r = await getSocialOverview(sb, PROP);
    expect(r).toEqual({
      platforms: [],
      total_followers: 0,
      total_reach_this_month: 0,
      total_engagement_this_month: 0,
      follower_growth_trend: [],
      best_platform: "instagram",
      best_content_type: "reel",
      best_posting_time: "7:00 PM",
    });
    const aq = sb._calls.find((c: QueryCtx) => c.table === "social_analytics");
    expect(aq.arg("in", "account_id")).toEqual(["none"]);
    expect(sb._calls.find((c: QueryCtx) => c.table === "social_posts").arg("gte", "published_at")).toBe("2026-10-01");
    expect(aq.arg("gte", "date")).toBe("2026-09-26");
  });

  test("builds per-platform stats, totals, growth trend and best platform/type/time", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "social_accounts") return [
        { id: "A1", platform: "instagram", followers: 10000 },
        { id: "A2", platform: "tiktok", followers: 4000 },
      ];
      if (ctx.table === "social_posts") return [
        post({ id: "t1", platform: "tiktok", content_type: "reel", engagement_rate: 9, reach: 3001, likes: 10, comments: 2, shares: 1, saves: 1, published_at: "2026-10-05T21:30:00Z" }),
        post({ id: "i1", platform: "instagram", content_type: "carousel", engagement_rate: 5, reach: 1000, likes: 5, published_at: "2026-10-06T12:00:00Z" }),
        post({ id: "i2", platform: "instagram", content_type: "image", engagement_rate: 1, reach: 2000, published_at: null }),
        post({ id: "f1", platform: "facebook", content_type: "image", engagement_rate: 2, reach: 500 }),
      ];
      if (ctx.table === "social_analytics") return [
        { account_id: "A1", date: "2026-09-27", followers_count: 9500 },
        { account_id: "A2", date: "2026-09-27", followers_count: 3900 },
        { account_id: "A1", date: "2026-10-25", followers_count: 10000 },
        { account_id: "GHOST", date: "2026-10-25", followers_count: 1 },
      ];
      return [];
    });
    const r = await getSocialOverview(sb, PROP);
    const ig = r.platforms.find((p) => p.account.platform === "instagram")!;
    const tt = r.platforms.find((p) => p.account.platform === "tiktok")!;
    expect(ig).toMatchObject({ posts_this_month: 2, avg_reach_per_post: 1500, follower_growth_30d: 500 });
    expect(ig.best_post!.id).toBe("i1");
    expect(tt.follower_growth_30d).toBe(0); // single data point → no growth
    expect(r.total_followers).toBe(14000);
    expect(r.total_reach_this_month).toBe(6501);
    expect(r.total_engagement_this_month).toBe(19);
    expect(r.follower_growth_trend).toHaveLength(3); // unknown account rows dropped
    expect(r.best_platform).toBe("tiktok");
    expect(r.best_content_type).toBe("reel");
    expect(r.best_posting_time).toBe("9:00 PM");
  });

  test.each([
    ["2026-10-05T00:15:00Z", "12:00 AM"],
    ["2026-10-05T11:00:00Z", "11:00 AM"],
    ["2026-10-05T12:00:00Z", "12:00 PM"],
    ["2026-10-05T23:59:00Z", "11:00 PM"],
  ])("best posting time for %s formats as %s", async (published_at, expected) => {
    const sb = createScriptedSupabase((ctx) => (ctx.table === "social_posts" ? [post({ published_at, engagement_rate: 3 })] : []));
    expect((await getSocialOverview(sb)).best_posting_time).toBe(expected);
  });
});

// ── Content ideas ────────────────────────────────────────────

describe("social-engine: generateContentIdeas", () => {
  test("with no data on a Monday only the evergreen bilingual Ramadan idea is returned", async () => {
    const r = await generateContentIdeas(createScriptedSupabase(() => []), PROP);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("Bilingual Ramadan content — Arabic + English");
  });

  test.each([
    ["2026-10-27T12:00:00Z", false], // Tue
    ["2026-10-28T12:00:00Z", true], // Wed
    ["2026-10-30T12:00:00Z", true], // Fri
    ["2026-10-31T12:00:00Z", false], // Sat
  ])("weekend idea on %s is present=%s (Wed–Fri only)", async (iso, present) => {
    at(iso);
    const r = await generateContentIdeas(createScriptedSupabase(() => []));
    expect(r.some((i) => i.title.startsWith("Weekend is coming"))).toBe(present);
  });

  test("event ideas: countdown for 1–30 days out, live idea for active events", async () => {
    const longDesc = "x".repeat(150);
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "events"
        ? [
            { title: "Kids Fun Day", start_date: plus(5), status: "planned", description: longDesc },
            { title: "Today Thing", start_date: plus(0), status: "planned" },
            { title: "Far Gala", start_date: plus(31), status: "planned" },
            { title: "Jazz Night", start_date: plus(-1), status: "active", location: null },
          ]
        : []
    );
    const r = await generateContentIdeas(sb);
    const countdown = r.find((i) => i.title.startsWith("Kids Fun Day Countdown"))!;
    expect(countdown.title).toBe("Kids Fun Day Countdown — 5 days to go!");
    expect(countdown.hashtags).toContain("#KidsFunDay");
    expect(countdown.caption_en.endsWith("x".repeat(100) + "...")).toBe(true);
    expect(r.some((i) => i.title.includes("Today Thing"))).toBe(false);
    expect(r.some((i) => i.title.includes("Far Gala"))).toBe(false);
    const live = r.find((i) => i.title === "Live from Jazz Night!")!;
    expect(live.platform).toBe("tiktok");
    expect(live.caption_en).toContain("Join us at the mall");
  });

  test("promotion ideas use discount text or 'exclusive deals' and a Store fallback", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "tenant_promotions"
        ? [
            { title: "Autumn Sale", discount_pct: 30, tenants: { brand_name: "LC Waikiki" } },
            { title: "VIP Night", discount_pct: null, tenants: null },
          ]
        : []
    );
    const r = await generateContentIdeas(sb);
    const a = r.find((i) => i.title === "Feature LC Waikiki — Autumn Sale")!;
    expect(a.caption_en).toContain("30% off");
    expect(a.hashtags).toContain("#LCWaikiki");
    const b = r.find((i) => i.title === "Feature Store — VIP Night")!;
    expect(b.caption_en).toContain("exclusive deals");
  });

  test("seasonal ideas within 14 days and tourist-season welcome window [-30, 7]", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "seasonal_calendar"
        ? [
            { name: "White Friday 2026!", type: "shopping_event", year_specific_start: plus(14) },
            { name: "Too Far", type: "shopping_event", year_specific_start: plus(15) },
            { name: "Russian Winter", type: "tourist_season", year_specific_start: plus(-10) },
            { name: "German Easter", type: "tourist_season", year_specific_start: plus(8) },
            { name: "Typical", type: "national", typical_start_month: 11, typical_start_day: 2 },
            { name: "Undated", type: "tourist_season" },
          ]
        : []
    );
    const r = await generateContentIdeas(sb);
    const titles = r.map((i) => i.title);
    const wf = r.find((i) => i.title.startsWith("White Friday"))!;
    expect(wf.hashtags).toContain("#WhiteFriday"); // non-letters stripped
    expect(titles).toContain("Typical is 7 days away — prepare your content!");
    expect(titles.some((t) => t.startsWith("Too Far"))).toBe(false);
    expect(titles).toContain("Tourist welcome content — Russian Winter");
    expect(titles).not.toContain("Tourist welcome content — German Easter");
    expect(titles.some((t) => t.includes("Undated"))).toBe(false);
  });

  test("suggests the top-performing category (ignoring null categories and all-zero rates)", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "social_posts"
        ? [
            { category: "tenant_spotlight", engagement_rate: 6 },
            { category: "tenant_spotlight", engagement_rate: 4 },
            { category: "promotion", engagement_rate: 4.9 },
            { category: null, engagement_rate: 99 },
          ]
        : []
    );
    const r = await generateContentIdeas(sb);
    const idea = r.find((i) => i.title.startsWith("Create more"))!;
    expect(idea.title).toBe("Create more Tenant spotlight content");
    expect(idea.source).toBe("Analytics: tenant_spotlight posts avg 5.0% engagement");

    const zero = createScriptedSupabase((ctx) => (ctx.table === "social_posts" ? [{ category: "poll", engagement_rate: 0 }] : []));
    expect((await generateContentIdeas(zero)).some((i) => i.title.startsWith("Create more"))).toBe(false);
  });

  test("returns at most 10 ideas sorted by predicted score", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "tenant_promotions"
        ? Array.from({ length: 12 }, (_, i) => ({ title: `Promo ${i}`, discount_pct: 10, tenants: { brand_name: `B${i}` } }))
        : ctx.table === "events"
          ? [{ title: "Live", start_date: plus(0), status: "active" }]
          : []
    );
    const r = await generateContentIdeas(sb);
    expect(r).toHaveLength(10);
    expect(r[0].predicted_score).toBe(90);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].predicted_score).toBeGreaterThanOrEqual(r[i].predicted_score);
  });

  // BUG: social-engine.ts:412-418 — typical season dates are always resolved in the current
  // year, so on 28 Dec a season starting 5 Jan resolves to 5 Jan of *this* year (-357 days)
  // and the "N days away" idea is never produced across the year boundary.
  test.fails("a season starting early next January is suggested in late December", async () => {
    at("2026-12-28T12:00:00Z");
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "seasonal_calendar" ? [{ name: "New Year Sales", type: "shopping_event", typical_start_month: 1, typical_start_day: 5 }] : []
    );
    const r = await generateContentIdeas(sb);
    expect(r.map((i) => i.title)).toContain("New Year Sales is 8 days away — prepare your content!");
  });
});

// ── Calendar ─────────────────────────────────────────────────

describe("social-engine: getContentCalendar", () => {
  test("defaults to [today, today+30] and returns [] when no rows", async () => {
    const sb = createScriptedSupabase(() => null);
    expect(await getContentCalendar(sb)).toEqual([]);
    expect(sb._calls[0].arg("gte", "date")).toBe("2026-10-26");
    expect(sb._calls[0].arg("lte", "date")).toBe("2026-11-25");
  });

  test("honours an explicit range across a year boundary", async () => {
    const rows = [{ id: "c1", date: "2026-12-31" }];
    const sb = createScriptedSupabase(() => rows);
    expect(await getContentCalendar(sb, PROP, "2026-12-20", "2027-01-10")).toEqual(rows);
    expect(sb._calls[0].arg("gte", "date")).toBe("2026-12-20");
    expect(sb._calls[0].arg("lte", "date")).toBe("2027-01-10");
  });
});

// ── Post analytics ───────────────────────────────────────────

describe("social-engine: getPostAnalytics", () => {
  test("empty data → empty breakdowns; default window is 60 days", async () => {
    const sb = createScriptedSupabase(() => []);
    const r = await getPostAnalytics(sb, PROP);
    expect(r).toEqual({ by_category: [], by_content_type: [], by_language: [], posting_heatmap: [], hashtag_performance: [], growth_by_platform: [] });
    expect(sb._calls[0].arg("gte", "published_at")).toBe("2026-08-27");
  });

  test("groups by category/type/language with 2-dp averages, heatmap and hashtag reach", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "social_posts") return [
        post({ category: "event", content_type: "reel", language: "multi", engagement_rate: 5, reach: 1000, hashtags: ["#A", "#B"], published_at: "2026-10-23T19:10:00Z" }),
        post({ category: "event", content_type: "reel", language: "multi", engagement_rate: 2.333, reach: 500, hashtags: ["#A"], published_at: "2026-10-23T19:50:00Z" }),
        post({ category: null, content_type: "image", language: "en", engagement_rate: 1, reach: 3000, hashtags: null, published_at: null }),
      ];
      if (ctx.table === "social_accounts") return [{ id: "A1", platform: "instagram" }, { id: "A2", platform: "x" }];
      if (ctx.table === "social_analytics") return [
        { account_id: "A1", date: "2026-10-01", followers_count: 100 },
        { account_id: "A1", date: "2026-10-02", followers_count: 110 },
      ];
      return [];
    });
    const r = await getPostAnalytics(sb, PROP, 30);
    expect(r.by_category).toEqual([
      { category: "event", avg_engagement: 3.67, count: 2 },
      { category: "uncategorized", avg_engagement: 1, count: 1 },
    ]);
    expect(r.by_content_type[0]).toEqual({ content_type: "reel", avg_engagement: 3.67, count: 2 });
    expect(r.by_language.map((l) => l.language)).toEqual(["multi", "en"]);
    expect(r.posting_heatmap).toEqual([{ day: 5, hour: 19, avg_engagement: 3.67 }]);
    expect(r.hashtag_performance).toEqual([
      { hashtag: "#B", avg_reach: 1000, count: 1 },
      { hashtag: "#A", avg_reach: 750, count: 2 },
    ]);
    expect(r.growth_by_platform).toEqual([
      { platform: "instagram", data: [{ date: "2026-10-01", followers: 100 }, { date: "2026-10-02", followers: 110 }] },
      { platform: "x", data: [] },
    ]);
  });

  test("hashtag performance is capped at 20 entries", async () => {
    const tags = Array.from({ length: 25 }, (_, i) => `#t${i}`);
    const sb = createScriptedSupabase((ctx) => (ctx.table === "social_posts" ? [post({ hashtags: tags, reach: 10 })] : []));
    expect((await getPostAnalytics(sb)).hashtag_performance).toHaveLength(20);
  });
});

// ── Insights ─────────────────────────────────────────────────

describe("social-engine: getSocialInsights", () => {
  test("no data → no insights", async () => {
    expect(await getSocialInsights(createScriptedSupabase(() => []))).toEqual([]);
  });

  test("produces all insight kinds, ordered high → medium → low impact", async () => {
    const sb = createScriptedSupabase((ctx) => {
      if (ctx.table === "social_posts") return [
        post({ category: "event", content_type: "reel", language: "multi", engagement_rate: 8, reach: 5000, hashtags: ["#SenzoMall"], published_at: "2026-10-23T19:00:00Z" }),
        post({ category: "tenant_spotlight", content_type: "image", language: "en", engagement_rate: 2, reach: 1000, hashtags: ["#Deals"], published_at: "2026-10-20T10:00:00Z" }),
      ];
      if (ctx.table === "social_accounts") return [
        { id: "A1", platform: "instagram", followers: 1000, avg_engagement_rate: 3.1 },
        { id: "A2", platform: "tiktok", followers: 500, avg_engagement_rate: 6.4 },
      ];
      return [];
    });
    const r = await getSocialInsights(sb, PROP);
    expect(r.map((i) => i.id)).toEqual([
      "content-type-insight", "language-insight", "platform-insight", "event-content-insight",
      "timing-insight", "category-insight", "saves-insight",
      "hashtag-insight",
    ]);
    const by = Object.fromEntries(r.map((i) => [i.id, i]));
    expect(by["content-type-insight"].title).toBe("Reels outperform other formats");
    expect(by["content-type-insight"].description).toContain("4x more than image posts");
    expect(by["language-insight"].title).toBe("Bilingual content reaches 300% more audience");
    expect(by["timing-insight"].title).toBe("Best posting time: Friday 7:00 PM");
    expect(by["platform-insight"].title).toBe("tiktok delivers the best ROI");
    expect(by["hashtag-insight"].title).toBe("Top hashtag: #SenzoMall");
  });

  test("content-type insight requires >1.5x gap; event insight requires >3% engagement", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "social_posts"
        ? [
            post({ category: "event", content_type: "reel", engagement_rate: 3 }),
            post({ category: "poll", content_type: "image", engagement_rate: 2.5 }),
          ]
        : []
    );
    const ids = (await getSocialInsights(sb)).map((i) => i.id);
    expect(ids).not.toContain("content-type-insight");
    expect(ids).not.toContain("event-content-insight");
    expect(ids).toContain("category-insight");
  });

  // BUG: social-engine.ts:852-856 — when the worst content type has 0% engagement the
  // multiplier divides by zero and the description reads "Infinityx more than ...".
  test.fails("content-type insight never reports an Infinity/NaN multiplier", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "social_posts"
        ? [post({ content_type: "reel", engagement_rate: 4 }), post({ content_type: "story", engagement_rate: 0 })]
        : []
    );
    const r = await getSocialInsights(sb);
    const ct = r.find((i) => i.id === "content-type-insight");
    expect(ct).toBeDefined();
    expect(ct!.description).not.toMatch(/Infinity|NaN/);
  });

  // BUG: social-engine.ts:867-872 — same divide-by-zero for the bilingual boost when
  // English-only posts average 0% engagement ("reaches Infinity% more audience").
  test.fails("language insight never reports an Infinity/NaN boost", async () => {
    const sb = createScriptedSupabase((ctx) =>
      ctx.table === "social_posts"
        ? [post({ language: "multi", engagement_rate: 4 }), post({ language: "en", engagement_rate: 0 })]
        : []
    );
    const r = await getSocialInsights(sb);
    const li = r.find((i) => i.id === "language-insight");
    expect(li).toBeDefined();
    expect(li!.title).not.toMatch(/Infinity|NaN/);
  });
});
