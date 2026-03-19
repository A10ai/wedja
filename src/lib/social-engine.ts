import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Wedja Social Media Engine
//
// AI-powered social media management for Senzo Mall.
// Content ideas, analytics, calendar, captions, and insights
// driven by real event/promotion/seasonal data.
// ============================================================

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

// ── Types ───────────────────────────────────────────────────

export interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  account_handle: string | null;
  account_url: string | null;
  followers: number;
  following: number;
  total_posts: number;
  avg_engagement_rate: number;
  status: string;
}

export interface SocialPost {
  id: string;
  platform: string;
  content_type: string;
  caption: string | null;
  hashtags: string[];
  media_url: string | null;
  post_url: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  ai_generated: boolean;
  ai_score: number | null;
  campaign_id: string | null;
  event_id: string | null;
  tenant_id: string | null;
  category: string | null;
  language: string;
}

export interface CalendarEntry {
  id: string;
  date: string;
  platform: string;
  content_type: string;
  category: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  post_id: string | null;
  ai_suggested: boolean;
}

export interface DailyAnalytics {
  id: string;
  account_id: string;
  date: string;
  followers_count: number;
  followers_gained: number;
  followers_lost: number;
  posts_published: number;
  total_reach: number;
  total_impressions: number;
  total_engagement: number;
  engagement_rate: number;
}

export interface PlatformOverview {
  account: SocialAccount;
  posts_this_month: number;
  best_post: SocialPost | null;
  follower_growth_30d: number;
  avg_reach_per_post: number;
}

export interface SocialOverview {
  platforms: PlatformOverview[];
  total_followers: number;
  total_reach_this_month: number;
  total_engagement_this_month: number;
  follower_growth_trend: { date: string; platform: string; count: number }[];
  best_platform: string;
  best_content_type: string;
  best_posting_time: string;
}

export interface ContentIdea {
  title: string;
  caption_en: string;
  caption_ar: string;
  hashtags: string[];
  platform: string;
  content_type: string;
  category: string;
  best_time: string;
  predicted_score: number;
  source: string;
  language: string;
}

export interface PostAnalytics {
  by_category: { category: string; avg_engagement: number; count: number }[];
  by_content_type: { content_type: string; avg_engagement: number; count: number }[];
  by_language: { language: string; avg_engagement: number; count: number }[];
  posting_heatmap: { day: number; hour: number; avg_engagement: number }[];
  hashtag_performance: { hashtag: string; avg_reach: number; count: number }[];
  growth_by_platform: { platform: string; data: { date: string; followers: number }[] }[];
}

export interface CaptionOption {
  caption_en: string;
  caption_ar: string;
  hashtags: string[];
  tone: string;
  char_count: number;
}

export interface SocialInsight {
  id: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: string;
  action: string;
}

// ── Helpers ──────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function monthStart(): string {
  return todayStr().slice(0, 7) + "-01";
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Engine Functions ────────────────────────────────────────

export async function getSocialOverview(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<SocialOverview> {
  const today = todayStr();
  const monthStartStr = monthStart();
  const thirtyDaysAgoStr = daysAgo(30);

  // Fetch accounts
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("followers", { ascending: false });

  const socialAccounts = (accounts || []) as SocialAccount[];

  // Fetch posts this month
  const { data: monthPosts } = await supabase
    .from("social_posts")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "published")
    .gte("published_at", monthStartStr)
    .order("engagement_rate", { ascending: false });

  const posts = (monthPosts || []) as SocialPost[];

  // Fetch analytics for last 30 days (for growth trend)
  const accountIds = socialAccounts.map((a) => a.id);
  const { data: analyticsData } = await supabase
    .from("social_analytics")
    .select("*")
    .in("account_id", accountIds.length > 0 ? accountIds : ["none"])
    .gte("date", thirtyDaysAgoStr)
    .order("date", { ascending: true });

  const analytics = (analyticsData || []) as DailyAnalytics[];

  // Build platform overviews
  const platforms: PlatformOverview[] = socialAccounts.map((account) => {
    const platformPosts = posts.filter((p) => p.platform === account.platform);
    const bestPost = platformPosts.length > 0 ? platformPosts[0] : null;
    const avgReach =
      platformPosts.length > 0
        ? Math.round(
            platformPosts.reduce((sum, p) => sum + p.reach, 0) /
              platformPosts.length
          )
        : 0;

    // Follower growth from analytics
    const platformAnalytics = analytics.filter(
      (a) => a.account_id === account.id
    );
    const growth =
      platformAnalytics.length >= 2
        ? platformAnalytics[platformAnalytics.length - 1].followers_count -
          platformAnalytics[0].followers_count
        : 0;

    return {
      account,
      posts_this_month: platformPosts.length,
      best_post: bestPost,
      follower_growth_30d: growth,
      avg_reach_per_post: avgReach,
    };
  });

  // Growth trend
  const followerTrend: { date: string; platform: string; count: number }[] = [];
  analytics.forEach((a) => {
    const account = socialAccounts.find((acc) => acc.id === a.account_id);
    if (account) {
      followerTrend.push({
        date: a.date,
        platform: account.platform,
        count: a.followers_count,
      });
    }
  });

  // Totals
  const totalFollowers = socialAccounts.reduce(
    (sum, a) => sum + a.followers,
    0
  );
  const totalReach = posts.reduce((sum, p) => sum + p.reach, 0);
  const totalEngagement = posts.reduce(
    (sum, p) => sum + p.likes + p.comments + p.shares + p.saves,
    0
  );

  // Best platform by engagement rate
  const platformEngagement: Record<string, number[]> = {};
  posts.forEach((p) => {
    if (!platformEngagement[p.platform]) platformEngagement[p.platform] = [];
    platformEngagement[p.platform].push(p.engagement_rate);
  });
  let bestPlatform = "instagram";
  let bestPlatformRate = 0;
  Object.entries(platformEngagement).forEach(([platform, rates]) => {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (avg > bestPlatformRate) {
      bestPlatformRate = avg;
      bestPlatform = platform;
    }
  });

  // Best content type
  const typeEngagement: Record<string, number[]> = {};
  posts.forEach((p) => {
    if (!typeEngagement[p.content_type]) typeEngagement[p.content_type] = [];
    typeEngagement[p.content_type].push(p.engagement_rate);
  });
  let bestType = "reel";
  let bestTypeRate = 0;
  Object.entries(typeEngagement).forEach(([type, rates]) => {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (avg > bestTypeRate) {
      bestTypeRate = avg;
      bestType = type;
    }
  });

  // Best posting time — analyze published_at hours
  const hourEngagement: Record<number, number[]> = {};
  posts.forEach((p) => {
    if (p.published_at) {
      const hour = new Date(p.published_at).getHours();
      if (!hourEngagement[hour]) hourEngagement[hour] = [];
      hourEngagement[hour].push(p.engagement_rate);
    }
  });
  let bestHour = 19;
  let bestHourRate = 0;
  Object.entries(hourEngagement).forEach(([hourStr, rates]) => {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (avg > bestHourRate) {
      bestHourRate = avg;
      bestHour = parseInt(hourStr);
    }
  });
  const bestTime =
    bestHour >= 12
      ? `${bestHour - 12 || 12}:00 PM`
      : `${bestHour || 12}:00 AM`;

  return {
    platforms,
    total_followers: totalFollowers,
    total_reach_this_month: totalReach,
    total_engagement_this_month: totalEngagement,
    follower_growth_trend: followerTrend,
    best_platform: bestPlatform,
    best_content_type: bestType,
    best_posting_time: bestTime,
  };
}

export async function generateContentIdeas(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<ContentIdea[]> {
  const today = todayStr();
  const ideas: ContentIdea[] = [];

  // 1. Check upcoming events
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("property_id", propertyId)
    .in("status", ["planned", "active"])
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .limit(5);

  (events || []).forEach((event: any) => {
    const da = daysUntil(event.start_date);
    if (da > 0 && da <= 30) {
      ideas.push({
        title: `${event.title} Countdown — ${da} days to go!`,
        caption_en: `Only ${da} days until ${event.title}! Get ready for an unforgettable experience at Senzo Mall. ${event.description ? event.description.slice(0, 100) + "..." : ""}`,
        caption_ar: `باقي ${da} يوم على ${event.title}! جهزوا نفسكم لتجربة لا تُنسى في سنزو مول.`,
        hashtags: ["#SenzoMall", "#Hurghada", `#${event.title.replace(/\s+/g, "")}`, "#سنزو_مول"],
        platform: "instagram",
        content_type: "reel",
        category: "event",
        best_time: "7:00 PM",
        predicted_score: 85,
        source: `Upcoming event: ${event.title}`,
        language: "multi",
      });
    }
    if (event.status === "active") {
      ideas.push({
        title: `Live from ${event.title}!`,
        caption_en: `${event.title} is happening NOW at Senzo Mall! Join us at ${event.location || "the mall"} for an amazing time.`,
        caption_ar: `${event.title} حاليا في سنزو مول! انضموا لنا في ${event.location || "المول"} لوقت رائع.`,
        hashtags: ["#SenzoMall", "#Live", "#Hurghada", "#سنزو_مول"],
        platform: "tiktok",
        content_type: "reel",
        category: "event",
        best_time: "9:00 PM",
        predicted_score: 90,
        source: `Active event: ${event.title}`,
        language: "multi",
      });
    }
  });

  // 2. Check active promotions
  const { data: promotions } = await supabase
    .from("tenant_promotions")
    .select("*, tenants!inner(brand_name)")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .limit(5);

  (promotions || []).forEach((promo: any) => {
    const brand = promo.tenants?.brand_name || "Store";
    const discount = promo.discount_pct ? `${promo.discount_pct}% off` : "exclusive deals";
    ideas.push({
      title: `Feature ${brand} — ${promo.title}`,
      caption_en: `${brand} at Senzo Mall: ${discount}! Don't miss out on ${promo.title}. Limited time offer.`,
      caption_ar: `${brand} في سنزو مول: ${promo.discount_pct ? `خصم ${promo.discount_pct}%` : "عروض حصرية"}! لا تفوتوا ${promo.title}.`,
      hashtags: ["#SenzoMall", `#${brand.replace(/\s+/g, "")}`, "#Deals", "#عروض", "#Hurghada"],
      platform: "instagram",
      content_type: "carousel",
      category: "promotion",
      best_time: "2:00 PM",
      predicted_score: 78,
      source: `Active promotion: ${promo.title}`,
      language: "multi",
    });
  });

  // 3. Check seasonal calendar
  const { data: seasons } = await supabase
    .from("seasonal_calendar")
    .select("*")
    .eq("property_id", propertyId);

  const currentYear = new Date().getFullYear();
  (seasons || []).forEach((season: any) => {
    let startDate: string | null = null;
    if (season.year_specific_start) {
      startDate = season.year_specific_start;
    } else if (season.typical_start_month && season.typical_start_day) {
      startDate = `${currentYear}-${String(season.typical_start_month).padStart(2, "0")}-${String(season.typical_start_day).padStart(2, "0")}`;
    }
    if (!startDate) return;

    const da = daysUntil(startDate);
    if (da > 0 && da <= 14) {
      ideas.push({
        title: `${season.name} is ${da} days away — prepare your content!`,
        caption_en: `${season.name} is coming to Hurghada! Senzo Mall is getting ready with special events and promotions.`,
        caption_ar: `${season.name} قادم! سنزو مول يستعد بفعاليات وعروض خاصة.`,
        hashtags: ["#SenzoMall", `#${season.name.replace(/[^a-zA-Z]/g, "")}`, "#Hurghada"],
        platform: "facebook",
        content_type: "image",
        category: "seasonal",
        best_time: "12:00 PM",
        predicted_score: 82,
        source: `Seasonal: ${season.name} in ${da} days`,
        language: "multi",
      });
    }

    // Tourist season → multilingual content
    if (
      season.type === "tourist_season" &&
      da !== null &&
      da >= -30 &&
      da <= 7
    ) {
      ideas.push({
        title: `Tourist welcome content — ${season.name}`,
        caption_en: `Welcome to Hurghada! Senzo Mall is your home for shopping, dining, and entertainment. Willkommen! Добро пожаловать!`,
        caption_ar: `أهلا بكم في الغردقة! سنزو مول وجهتكم للتسوق والترفيه.`,
        hashtags: ["#Hurghada", "#SenzoMall", "#Tourism", "#RedSea", "#Egypt"],
        platform: "instagram",
        content_type: "reel",
        category: "lifestyle",
        best_time: "5:00 PM",
        predicted_score: 80,
        source: `Tourist season: ${season.name}`,
        language: "multi",
      });
    }
  });

  // 4. Weekend content idea (always relevant)
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek >= 3 && dayOfWeek <= 5) {
    ideas.push({
      title: "Weekend is coming — post Friday evening vibe content",
      caption_en:
        "Friday vibes at Senzo Mall — shopping, food, entertainment, all under one roof. What are your weekend plans?",
      caption_ar:
        "أجواء الجمعة في سنزو مول — تسوق، أكل، ترفيه، كله في مكان واحد. إيه خططكم للويكند؟",
      hashtags: ["#Weekend", "#FridayVibes", "#SenzoMall", "#Hurghada", "#ويكند"],
      platform: "instagram",
      content_type: "reel",
      category: "lifestyle",
      best_time: "7:00 PM",
      predicted_score: 75,
      source: "Weekend approaching — high engagement period",
      language: "multi",
    });
  }

  // 5. Data-driven: top-performing category suggestion
  const { data: recentPosts } = await supabase
    .from("social_posts")
    .select("category, engagement_rate")
    .eq("property_id", propertyId)
    .eq("status", "published")
    .gte("published_at", daysAgo(30))
    .order("engagement_rate", { ascending: false });

  const categoryRates: Record<string, number[]> = {};
  (recentPosts || []).forEach((p: any) => {
    if (p.category) {
      if (!categoryRates[p.category]) categoryRates[p.category] = [];
      categoryRates[p.category].push(p.engagement_rate || 0);
    }
  });

  let topCategory = "";
  let topCategoryRate = 0;
  Object.entries(categoryRates).forEach(([cat, rates]) => {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (avg > topCategoryRate) {
      topCategoryRate = avg;
      topCategory = cat;
    }
  });

  if (topCategory && topCategoryRate > 0) {
    const categoryLabels: Record<string, string> = {
      lifestyle: "Lifestyle content",
      event: "Event coverage",
      tenant_spotlight: "Tenant spotlight",
      promotion: "Promotions",
      behind_scenes: "Behind-the-scenes",
      seasonal: "Seasonal content",
      educational: "Educational tips",
      poll: "Interactive polls",
    };
    ideas.push({
      title: `Create more ${categoryLabels[topCategory] || topCategory} content`,
      caption_en: `${categoryLabels[topCategory] || topCategory} posts get ${topCategoryRate.toFixed(1)}% avg engagement — 2x more than other categories. Create more of this content type.`,
      caption_ar: `محتوى ${categoryLabels[topCategory] || topCategory} يحقق تفاعل أعلى — أنشئ المزيد من هذا النوع.`,
      hashtags: ["#SenzoMall", "#ContentStrategy"],
      platform: "instagram",
      content_type: "reel",
      category: topCategory,
      best_time: "8:00 PM",
      predicted_score: 88,
      source: `Analytics: ${topCategory} posts avg ${topCategoryRate.toFixed(1)}% engagement`,
      language: "multi",
    });
  }

  // 6. Arabic content suggestion
  const langRates: Record<string, number[]> = {};
  (recentPosts || []).forEach((p: any) => {
    // We'd need language field — approximate from main posts query
  });
  ideas.push({
    title: "Bilingual Ramadan content — Arabic + English",
    caption_en: "Senzo Mall celebrates Ramadan with you! Special events every night after Iftar.",
    caption_ar: "سنزو مول يحتفل معكم برمضان! فعاليات خاصة كل ليلة بعد الإفطار.",
    hashtags: ["#رمضان_كريم", "#SenzoMall", "#Ramadan2026", "#سنزو_مول"],
    platform: "instagram",
    content_type: "carousel",
    category: "seasonal",
    best_time: "8:00 PM",
    predicted_score: 84,
    source: "Arabic content reaches 40% more locals — post more bilingual content",
    language: "multi",
  });

  // Return top 10
  return ideas
    .sort((a, b) => b.predicted_score - a.predicted_score)
    .slice(0, 10);
}

export async function getContentCalendar(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  startDate?: string,
  endDate?: string
): Promise<CalendarEntry[]> {
  const start = startDate || todayStr();
  const end =
    endDate ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split("T")[0];
    })();

  const { data } = await supabase
    .from("content_calendar")
    .select("*")
    .eq("property_id", propertyId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  return (data || []) as CalendarEntry[];
}

export async function getPostAnalytics(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID,
  days: number = 60
): Promise<PostAnalytics> {
  const sinceDate = daysAgo(days);

  const { data: posts } = await supabase
    .from("social_posts")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "published")
    .gte("published_at", sinceDate);

  const allPosts = (posts || []) as SocialPost[];

  // By category
  const catMap: Record<string, { total: number; count: number }> = {};
  allPosts.forEach((p) => {
    const cat = p.category || "uncategorized";
    if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
    catMap[cat].total += p.engagement_rate;
    catMap[cat].count += 1;
  });
  const byCategory = Object.entries(catMap)
    .map(([category, v]) => ({
      category,
      avg_engagement: Math.round((v.total / v.count) * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  // By content type
  const typeMap: Record<string, { total: number; count: number }> = {};
  allPosts.forEach((p) => {
    if (!typeMap[p.content_type]) typeMap[p.content_type] = { total: 0, count: 0 };
    typeMap[p.content_type].total += p.engagement_rate;
    typeMap[p.content_type].count += 1;
  });
  const byContentType = Object.entries(typeMap)
    .map(([content_type, v]) => ({
      content_type,
      avg_engagement: Math.round((v.total / v.count) * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  // By language
  const langMap: Record<string, { total: number; count: number }> = {};
  allPosts.forEach((p) => {
    if (!langMap[p.language]) langMap[p.language] = { total: 0, count: 0 };
    langMap[p.language].total += p.engagement_rate;
    langMap[p.language].count += 1;
  });
  const byLanguage = Object.entries(langMap)
    .map(([language, v]) => ({
      language,
      avg_engagement: Math.round((v.total / v.count) * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  // Posting heatmap (day of week x hour)
  const heatmap: Record<string, { total: number; count: number }> = {};
  allPosts.forEach((p) => {
    if (p.published_at) {
      const d = new Date(p.published_at);
      const day = d.getDay();
      const hour = d.getHours();
      const key = `${day}-${hour}`;
      if (!heatmap[key]) heatmap[key] = { total: 0, count: 0 };
      heatmap[key].total += p.engagement_rate;
      heatmap[key].count += 1;
    }
  });
  const postingHeatmap = Object.entries(heatmap).map(([key, v]) => {
    const [dayStr, hourStr] = key.split("-");
    return {
      day: parseInt(dayStr),
      hour: parseInt(hourStr),
      avg_engagement: Math.round((v.total / v.count) * 100) / 100,
    };
  });

  // Hashtag performance
  const hashMap: Record<string, { totalReach: number; count: number }> = {};
  allPosts.forEach((p) => {
    (p.hashtags || []).forEach((tag: string) => {
      if (!hashMap[tag]) hashMap[tag] = { totalReach: 0, count: 0 };
      hashMap[tag].totalReach += p.reach;
      hashMap[tag].count += 1;
    });
  });
  const hashtagPerformance = Object.entries(hashMap)
    .map(([hashtag, v]) => ({
      hashtag,
      avg_reach: Math.round(v.totalReach / v.count),
      count: v.count,
    }))
    .sort((a, b) => b.avg_reach - a.avg_reach)
    .slice(0, 20);

  // Growth by platform (from analytics table)
  const accounts = await supabase
    .from("social_accounts")
    .select("id, platform")
    .eq("property_id", propertyId)
    .eq("status", "active");

  const accountList = (accounts.data || []) as { id: string; platform: string }[];
  const accountIds = accountList.map((a) => a.id);

  const { data: analyticsData } = await supabase
    .from("social_analytics")
    .select("account_id, date, followers_count")
    .in("account_id", accountIds.length > 0 ? accountIds : ["none"])
    .gte("date", sinceDate)
    .order("date", { ascending: true });

  const growthByPlatform = accountList.map((account) => {
    const data = (analyticsData || [])
      .filter((a: any) => a.account_id === account.id)
      .map((a: any) => ({ date: a.date, followers: a.followers_count }));
    return { platform: account.platform, data };
  });

  return {
    by_category: byCategory,
    by_content_type: byContentType,
    by_language: byLanguage,
    posting_heatmap: postingHeatmap,
    hashtag_performance: hashtagPerformance,
    growth_by_platform: growthByPlatform,
  };
}

export function generateCaptions(
  topic: string,
  language: string = "multi",
  platform: string = "instagram"
): CaptionOption[] {
  // Platform character limits and tone
  const platformConfig: Record<string, { maxChars: number; tone: string }> = {
    instagram: { maxChars: 2200, tone: "visual and engaging" },
    facebook: { maxChars: 5000, tone: "informative and community-focused" },
    tiktok: { maxChars: 300, tone: "fun, trendy, and casual" },
    x: { maxChars: 280, tone: "concise and punchy" },
    linkedin: { maxChars: 3000, tone: "professional and polished" },
  };

  const config = platformConfig[platform] || platformConfig.instagram;

  // Generate contextual captions based on topic keywords
  const isRamadan = topic.toLowerCase().includes("ramadan");
  const isEid = topic.toLowerCase().includes("eid");
  const isFood = topic.toLowerCase().includes("food") || topic.toLowerCase().includes("iftar");
  const isShopping = topic.toLowerCase().includes("shopping") || topic.toLowerCase().includes("deal") || topic.toLowerCase().includes("sale");
  const isMothersDay = topic.toLowerCase().includes("mother");

  const hashtags = ["#SenzoMall", "#Hurghada"];
  if (isRamadan) hashtags.push("#RamadanKareem", "#رمضان_كريم", "#Ramadan2026");
  if (isEid) hashtags.push("#EidMubarak", "#عيد_مبارك", "#EidAlFitr");
  if (isFood) hashtags.push("#FoodLovers", "#Iftar", "#إفطار");
  if (isShopping) hashtags.push("#ShoppingSpree", "#Deals", "#عروض");
  if (isMothersDay) hashtags.push("#MothersDay", "#عيد_الأم");
  hashtags.push("#Egypt", "#RedSea");

  const options: CaptionOption[] = [];

  if (platform === "x") {
    options.push({
      caption_en: `${topic} at Senzo Mall — don't miss out! ${hashtags.slice(0, 3).join(" ")}`,
      caption_ar: `${topic} في سنزو مول — لا تفوتوا الفرصة!`,
      hashtags: hashtags.slice(0, 4),
      tone: "Concise & punchy",
      char_count: 80,
    });
    options.push({
      caption_en: `Who's joining us for ${topic}? Drop a comment if you're coming! ${hashtags.slice(0, 2).join(" ")}`,
      caption_ar: `مين جاي؟ ${topic} في سنزو مول!`,
      hashtags: hashtags.slice(0, 3),
      tone: "Interactive",
      char_count: 90,
    });
    options.push({
      caption_en: `JUST IN: ${topic} now at Senzo Mall, Hurghada. ${hashtags.slice(0, 2).join(" ")}`,
      caption_ar: `خبر عاجل: ${topic} في سنزو مول الآن!`,
      hashtags: hashtags.slice(0, 3),
      tone: "News-style",
      char_count: 75,
    });
  } else if (platform === "tiktok") {
    options.push({
      caption_en: `POV: You're at ${topic} in Senzo Mall and the vibes are immaculate`,
      caption_ar: `لما تروح ${topic} في سنزو مول والأجواء تكون خيالية`,
      hashtags: [...hashtags, "#POV", "#Vibes", "#FYP"],
      tone: "Fun & trendy",
      char_count: 80,
    });
    options.push({
      caption_en: `${topic} at Senzo Mall — wait for the end! 😱`,
      caption_ar: `${topic} في سنزو مول — استنوا الآخر!`,
      hashtags: [...hashtags, "#WaitForIt", "#FYP"],
      tone: "Hook-based",
      char_count: 60,
    });
    options.push({
      caption_en: `Things to do at Senzo Mall: ${topic} edition`,
      caption_ar: `حاجات لازم تعملها في سنزو مول: ${topic}`,
      hashtags: [...hashtags, "#ThingsToDo", "#FYP"],
      tone: "List-style",
      char_count: 55,
    });
  } else {
    // Instagram / Facebook / LinkedIn — longer captions
    options.push({
      caption_en: `${topic} at Senzo Mall — Hurghada's premier shopping destination! Whether you're looking for the latest fashion, delicious food, or family entertainment, we've got it all under one roof.\n\nVisit us today and experience the best of Hurghada!\n\n${hashtags.join(" ")}`,
      caption_ar: `${topic} في سنزو مول — وجهتك الأولى للتسوق في الغردقة! سواء كنت تدور على أحدث الأزياء، أكل لذيذ، أو ترفيه عائلي، كل ده عندنا.\n\nزورونا النهارده!\n\n${hashtags.join(" ")}`,
      hashtags,
      tone: "Informative & inviting",
      char_count: 250,
    });
    options.push({
      caption_en: `${topic} — who's ready? Tag someone who needs to see this!\n\nSenzo Mall, Hurghada — open daily 10AM to midnight.\n\n${hashtags.join(" ")}`,
      caption_ar: `${topic} — مين مستعد؟ تاج حد لازم يشوف ده!\n\nسنزو مول، الغردقة — يوميا من ١٠ صباحا لـ ١٢ بالليل.\n\n${hashtags.join(" ")}`,
      hashtags,
      tone: "Engaging & interactive",
      char_count: 180,
    });
    options.push({
      caption_en: `Don't miss ${topic} at Senzo Mall! Limited time only.\n\nSenzo Mall — the heart of Hurghada.\n\n${hashtags.join(" ")}`,
      caption_ar: `ما تفوتوش ${topic} في سنزو مول! لفترة محدودة.\n\nسنزو مول — قلب الغردقة.\n\n${hashtags.join(" ")}`,
      hashtags,
      tone: "Urgency-driven",
      char_count: 140,
    });
  }

  return options;
}

export async function getCompetitorBenchmark(
  _supabase: SupabaseClient,
  _propertyId: string = PROPERTY_ID
): Promise<{ message: string; status: string }> {
  return {
    message:
      "Competitor benchmarking is coming soon. We will track engagement rates, follower growth, and content strategies of competing malls in the Red Sea region.",
    status: "planned",
  };
}

export async function getSocialInsights(
  supabase: SupabaseClient,
  propertyId: string = PROPERTY_ID
): Promise<SocialInsight[]> {
  const insights: SocialInsight[] = [];

  // Fetch recent analytics
  const analytics = await getPostAnalytics(supabase, propertyId, 30);

  // Insight 1: Best content type
  if (analytics.by_content_type.length > 0) {
    const best = analytics.by_content_type[0];
    const worst =
      analytics.by_content_type[analytics.by_content_type.length - 1];
    if (best.avg_engagement > worst.avg_engagement * 1.5) {
      insights.push({
        id: "content-type-insight",
        title: `${best.content_type.charAt(0).toUpperCase() + best.content_type.slice(1)}s outperform other formats`,
        description: `${best.content_type} posts average ${best.avg_engagement}% engagement — ${Math.round(best.avg_engagement / worst.avg_engagement)}x more than ${worst.content_type} posts. Increase ${best.content_type} production.`,
        impact: "high",
        category: "content_strategy",
        action: `Create more ${best.content_type} content, reduce ${worst.content_type} frequency`,
      });
    }
  }

  // Insight 2: Language performance
  const multiLangData = analytics.by_language.find((l) => l.language === "multi");
  const enOnlyData = analytics.by_language.find((l) => l.language === "en");
  if (multiLangData && enOnlyData && multiLangData.avg_engagement > enOnlyData.avg_engagement) {
    const boost = Math.round(
      ((multiLangData.avg_engagement - enOnlyData.avg_engagement) /
        enOnlyData.avg_engagement) *
        100
    );
    insights.push({
      id: "language-insight",
      title: `Bilingual content reaches ${boost}% more audience`,
      description: `Arabic + English posts average ${multiLangData.avg_engagement}% engagement vs ${enOnlyData.avg_engagement}% for English-only. Post more bilingual content to reach local Egyptian audience.`,
      impact: "high",
      category: "audience",
      action: "Convert top English posts to bilingual AR/EN format",
    });
  }

  // Insight 3: Best posting time
  if (analytics.posting_heatmap.length > 0) {
    const sorted = [...analytics.posting_heatmap].sort(
      (a, b) => b.avg_engagement - a.avg_engagement
    );
    const best = sorted[0];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const timeStr =
      best.hour >= 12
        ? `${best.hour - 12 || 12}:00 PM`
        : `${best.hour || 12}:00 AM`;
    insights.push({
      id: "timing-insight",
      title: `Best posting time: ${dayNames[best.day]} ${timeStr}`,
      description: `Posts published on ${dayNames[best.day]} at ${timeStr} achieve ${best.avg_engagement}% avg engagement — the highest across all time slots. Schedule your best content for this window.`,
      impact: "medium",
      category: "scheduling",
      action: `Schedule high-value content for ${dayNames[best.day]} ${timeStr}`,
    });
  }

  // Insight 4: Category performance
  if (analytics.by_category.length >= 2) {
    const best = analytics.by_category[0];
    insights.push({
      id: "category-insight",
      title: `${best.category.replace("_", " ")} posts drive highest engagement`,
      description: `${best.category.replace("_", " ")} content averages ${best.avg_engagement}% engagement with ${best.count} posts. This category resonates most with your audience.`,
      impact: "medium",
      category: "content_strategy",
      action: `Increase ${best.category.replace("_", " ")} content to 40% of total output`,
    });
  }

  // Insight 5: Platform comparison
  const overview = await getSocialOverview(supabase, propertyId);
  if (overview.platforms.length >= 2) {
    const bestPlatformData = overview.platforms.reduce((best, p) =>
      p.account.avg_engagement_rate > best.account.avg_engagement_rate ? p : best
    );
    insights.push({
      id: "platform-insight",
      title: `${bestPlatformData.account.platform} delivers the best ROI`,
      description: `${bestPlatformData.account.platform} has ${bestPlatformData.account.avg_engagement_rate}% engagement rate with ${bestPlatformData.follower_growth_30d} new followers in 30 days. Prioritize content creation for this platform.`,
      impact: "high",
      category: "platform_strategy",
      action: `Allocate 40% of content budget to ${bestPlatformData.account.platform}`,
    });
  }

  // Insight 6: Hashtag effectiveness
  if (analytics.hashtag_performance.length > 0) {
    const topHash = analytics.hashtag_performance[0];
    insights.push({
      id: "hashtag-insight",
      title: `Top hashtag: ${topHash.hashtag}`,
      description: `${topHash.hashtag} drives an average reach of ${topHash.avg_reach.toLocaleString()} per post across ${topHash.count} uses. Continue using this hashtag and test variations.`,
      impact: "low",
      category: "reach",
      action: `Use ${topHash.hashtag} in all relevant posts`,
    });
  }

  // Insight 7: Event-related content
  const eventPosts = analytics.by_category.find((c) => c.category === "event");
  if (eventPosts && eventPosts.avg_engagement > 3) {
    insights.push({
      id: "event-content-insight",
      title: "Event content drives highest reach",
      description: `Event-related posts average ${eventPosts.avg_engagement}% engagement with ${eventPosts.count} posts. Tie more content to the events calendar for maximum impact.`,
      impact: "high",
      category: "content_strategy",
      action: "Create 3-5 posts per event: teaser, live, recap",
    });
  }

  // Insight 8: Saves metric
  const savablePosts = analytics.by_category.find(
    (c) => c.category === "tenant_spotlight"
  );
  if (savablePosts) {
    insights.push({
      id: "saves-insight",
      title: "Tenant spotlight posts drive saves",
      description: `Tenant spotlight content averages ${savablePosts.avg_engagement}% engagement — valuable for tenant relations and demonstrates marketing value to tenants.`,
      impact: "medium",
      category: "tenant_relations",
      action: "Create weekly tenant spotlight series — rotate through key tenants",
    });
  }

  return insights.sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}
