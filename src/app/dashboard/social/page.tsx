"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Share2,
  Loader2,
  Sparkles,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Clock,
  Calendar,
  BarChart3,
  Lightbulb,
  Send,
  Save,
  Hash,
  Globe,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, formatDate } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  account_handle: string | null;
  followers: number;
  avg_engagement_rate: number;
  status: string;
}

interface SocialPost {
  id: string;
  platform: string;
  content_type: string;
  caption: string | null;
  hashtags: string[];
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
  category: string | null;
  language: string;
}

interface PlatformOverview {
  account: SocialAccount;
  posts_this_month: number;
  best_post: SocialPost | null;
  follower_growth_30d: number;
  avg_reach_per_post: number;
}

interface SocialOverview {
  platforms: PlatformOverview[];
  total_followers: number;
  total_reach_this_month: number;
  total_engagement_this_month: number;
  follower_growth_trend: { date: string; platform: string; count: number }[];
  best_platform: string;
  best_content_type: string;
  best_posting_time: string;
}

interface ContentIdea {
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

interface CalendarEntry {
  id: string;
  date: string;
  platform: string;
  content_type: string;
  category: string | null;
  title: string;
  description: string | null;
  status: string;
  ai_suggested: boolean;
}

interface PostAnalytics {
  by_category: { category: string; avg_engagement: number; count: number }[];
  by_content_type: { content_type: string; avg_engagement: number; count: number }[];
  by_language: { language: string; avg_engagement: number; count: number }[];
  posting_heatmap: { day: number; hour: number; avg_engagement: number }[];
  hashtag_performance: { hashtag: string; avg_reach: number; count: number }[];
  growth_by_platform: { platform: string; data: { date: string; followers: number }[] }[];
}

interface SocialInsight {
  id: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: string;
  action: string;
}

interface CaptionOption {
  caption_en: string;
  caption_ar: string;
  hashtags: string[];
  tone: string;
  char_count: number;
}

type TabKey = "overview" | "ideas" | "calendar" | "posts" | "analytics" | "insights" | "create";

// ── Helpers ─────────────────────────────────────────────────

function platformIcon(platform: string): string {
  switch (platform) {
    case "instagram": return "IG";
    case "facebook": return "FB";
    case "tiktok": return "TT";
    case "x": return "X";
    case "youtube": return "YT";
    case "snapchat": return "SC";
    case "linkedin": return "LI";
    default: return "?";
  }
}

function platformColor(platform: string): string {
  switch (platform) {
    case "instagram": return "bg-gradient-to-br from-pink-500 to-purple-600 text-white";
    case "facebook": return "bg-blue-600 text-white";
    case "tiktok": return "bg-black text-white";
    case "x": return "bg-black text-white";
    case "youtube": return "bg-red-600 text-white";
    case "snapchat": return "bg-yellow-400 text-black";
    case "linkedin": return "bg-blue-700 text-white";
    default: return "bg-gray-500 text-white";
  }
}

function platformBorderColor(platform: string): string {
  switch (platform) {
    case "instagram": return "border-pink-500/30";
    case "facebook": return "border-blue-600/30";
    case "tiktok": return "border-cyan-400/30";
    case "x": return "border-gray-400/30";
    default: return "border-wedja-border";
  }
}

function statusBadge(status: string): { variant: "success" | "warning" | "info" | "default" | "error" | "gold"; label: string } {
  switch (status) {
    case "published": return { variant: "success", label: "Published" };
    case "scheduled": return { variant: "info", label: "Scheduled" };
    case "draft": return { variant: "default", label: "Draft" };
    case "failed": return { variant: "error", label: "Failed" };
    case "planned": return { variant: "default", label: "Planned" };
    case "content_ready": return { variant: "warning", label: "Content Ready" };
    case "approved": return { variant: "info", label: "Approved" };
    default: return { variant: "default", label: status };
  }
}

function categoryLabel(cat: string | null): string {
  if (!cat) return "General";
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function contentTypeLabel(ct: string): string {
  return ct.charAt(0).toUpperCase() + ct.slice(1);
}

const CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 5000,
  tiktok: 300,
  x: 280,
  youtube: 5000,
  linkedin: 3000,
};

// ── Main Component ──────────────────────────────────────────

export default function SocialMediaPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);

  // Data state
  const [overview, setOverview] = useState<SocialOverview | null>(null);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [analytics, setAnalytics] = useState<PostAnalytics | null>(null);
  const [insights, setInsights] = useState<SocialInsight[]>([]);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);

  // Create post form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formPlatform, setFormPlatform] = useState("instagram");
  const [formContentType, setFormContentType] = useState("image");
  const [formCaption, setFormCaption] = useState("");
  const [formHashtags, setFormHashtags] = useState("");
  const [formCategory, setFormCategory] = useState("lifestyle");
  const [formLanguage, setFormLanguage] = useState("multi");
  const [formScheduleDate, setFormScheduleDate] = useState("");
  const [formScheduleTime, setFormScheduleTime] = useState("");
  const [generatedCaptions, setGeneratedCaptions] = useState<CaptionOption[]>([]);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ideasLoading, setIdeasLoading] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/social?type=overview");
      if (res.ok) setOverview(await res.json());
    } catch (e) {
      console.error("Failed to fetch overview:", e);
    }
  }, []);

  const fetchIdeas = useCallback(async () => {
    setIdeasLoading(true);
    try {
      const res = await fetch("/api/v1/social?type=ideas");
      if (res.ok) setIdeas(await res.json());
    } catch (e) {
      console.error("Failed to fetch ideas:", e);
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  const fetchCalendar = useCallback(async () => {
    const start = new Date();
    start.setDate(start.getDate() + calendarWeekOffset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    try {
      const res = await fetch(
        `/api/v1/social?type=calendar&start=${start.toISOString().split("T")[0]}&end=${end.toISOString().split("T")[0]}`
      );
      if (res.ok) setCalendar(await res.json());
    } catch (e) {
      console.error("Failed to fetch calendar:", e);
    }
  }, [calendarWeekOffset]);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/social?type=posts&limit=30");
      if (res.ok) setPosts(await res.json());
    } catch (e) {
      console.error("Failed to fetch posts:", e);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/social?type=analytics&days=60");
      if (res.ok) setAnalytics(await res.json());
    } catch (e) {
      console.error("Failed to fetch analytics:", e);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/social?type=insights");
      if (res.ok) setInsights(await res.json());
    } catch (e) {
      console.error("Failed to fetch insights:", e);
    }
  }, []);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchPosts()]);
      setLoading(false);
    }
    loadAll();
  }, [fetchOverview, fetchPosts]);

  useEffect(() => {
    if (activeTab === "ideas" && ideas.length === 0) fetchIdeas();
    if (activeTab === "calendar") fetchCalendar();
    if (activeTab === "analytics" && !analytics) fetchAnalytics();
    if (activeTab === "insights" && insights.length === 0) fetchInsights();
  }, [activeTab, ideas.length, analytics, insights.length, fetchIdeas, fetchCalendar, fetchAnalytics, fetchInsights]);

  useEffect(() => {
    if (activeTab === "calendar") fetchCalendar();
  }, [calendarWeekOffset, activeTab, fetchCalendar]);

  // ── Create Post ───────────────────────────────────────────

  const handleGenerateCaptions = async () => {
    setGeneratingCaptions(true);
    try {
      const topic = formCaption || formCategory;
      const res = await fetch(
        `/api/v1/social?type=captions&topic=${encodeURIComponent(topic)}&language=${formLanguage}&platform=${formPlatform}`
      );
      if (res.ok) setGeneratedCaptions(await res.json());
    } catch (e) {
      console.error("Failed to generate captions:", e);
    } finally {
      setGeneratingCaptions(false);
    }
  };

  const handleSubmitPost = async (status: "draft" | "scheduled" | "published") => {
    setSubmitting(true);
    try {
      const scheduledAt =
        status === "scheduled" && formScheduleDate && formScheduleTime
          ? `${formScheduleDate}T${formScheduleTime}:00+02:00`
          : null;

      const res = await fetch("/api/v1/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "post",
          platform: formPlatform,
          content_type: formContentType,
          caption: formCaption,
          hashtags: formHashtags
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean),
          status,
          scheduled_at: scheduledAt,
          ai_generated: generatedCaptions.length > 0,
          category: formCategory,
          language: formLanguage,
        }),
      });

      if (res.ok) {
        setShowCreateForm(false);
        setFormCaption("");
        setFormHashtags("");
        setGeneratedCaptions([]);
        fetchPosts();
      }
    } catch (e) {
      console.error("Failed to create post:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const prefillFromIdea = (idea: ContentIdea) => {
    setFormPlatform(idea.platform);
    setFormContentType(idea.content_type);
    setFormCaption(idea.caption_en);
    setFormHashtags(idea.hashtags.join(", "));
    setFormCategory(idea.category);
    setFormLanguage(idea.language);
    setShowCreateForm(true);
    setActiveTab("create");
  };

  // ── Calendar Helpers ──────────────────────────────────────

  function getWeekDays(): Date[] {
    const today = new Date();
    today.setDate(today.getDate() + calendarWeekOffset * 7);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }

  function getCalendarEntriesForDate(date: Date): CalendarEntry[] {
    const dateStr = date.toISOString().split("T")[0];
    return calendar.filter((c) => c.date === dateStr);
  }

  // ── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-wedja-accent" />
      </div>
    );
  }

  // ── Tabs ──────────────────────────────────────────────────

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <Share2 size={15} /> },
    { key: "ideas", label: "AI Ideas", icon: <Sparkles size={15} /> },
    { key: "calendar", label: "Calendar", icon: <Calendar size={15} /> },
    { key: "posts", label: "Posts", icon: <Send size={15} /> },
    { key: "analytics", label: "Analytics", icon: <BarChart3 size={15} /> },
    { key: "insights", label: "Insights", icon: <Lightbulb size={15} /> },
    { key: "create", label: "Create", icon: <Plus size={15} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Share2 className="text-wedja-accent" size={24} />
            Social Media Manager
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            AI-powered content management for Senzo Mall
          </p>
        </div>
        <Button onClick={() => { setShowCreateForm(true); setActiveTab("create"); }}>
          <Plus size={16} />
          Create Post
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === "create") setShowCreateForm(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "bg-wedja-accent-muted text-wedja-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-wedja-border/30"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ───────────────────────────────── */}
      {activeTab === "overview" && overview && (
        <div className="space-y-6">
          {/* Platform Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {overview.platforms.map((p) => (
              <Card key={p.account.id} className={`border-l-4 ${platformBorderColor(p.account.platform)}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${platformColor(p.account.platform)}`}>
                      {platformIcon(p.account.platform)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {p.account.account_name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {p.account.account_handle || p.account.platform}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-text-muted">Followers</p>
                      <p className="text-lg font-bold text-text-primary font-mono">
                        {formatNumber(p.account.followers)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Engagement</p>
                      <p className="text-lg font-bold text-wedja-accent font-mono">
                        {p.account.avg_engagement_rate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Posts/Mo</p>
                      <p className="text-sm font-semibold text-text-primary">
                        {p.posts_this_month}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Growth (30d)</p>
                      <p className="text-sm font-semibold text-emerald-500 flex items-center gap-0.5">
                        <TrendingUp size={12} />+{formatNumber(p.follower_growth_30d)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-text-muted mb-1">Total Followers</p>
                <p className="text-2xl font-bold text-text-primary font-mono">
                  {formatNumber(overview.total_followers)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-text-muted mb-1">Reach This Month</p>
                <p className="text-2xl font-bold text-text-primary font-mono">
                  {formatNumber(overview.total_reach_this_month)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-text-muted mb-1">Best Platform</p>
                <p className="text-lg font-bold text-wedja-accent capitalize">
                  {overview.best_platform}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-text-muted mb-1">Best Time</p>
                <p className="text-lg font-bold text-wedja-accent flex items-center justify-center gap-1">
                  <Clock size={16} />
                  {overview.best_posting_time}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Follower Growth Chart (text-based) */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">Follower Growth (30 Days)</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overview.platforms.map((p) => {
                  const maxFollowers = Math.max(
                    ...overview.platforms.map((pl) => pl.account.followers)
                  );
                  const pct = (p.account.followers / maxFollowers) * 100;
                  return (
                    <div key={p.account.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${platformColor(p.account.platform)}`}>
                            {platformIcon(p.account.platform)}
                          </span>
                          <span className="text-text-primary font-medium capitalize">
                            {p.account.platform}
                          </span>
                        </span>
                        <span className="text-text-secondary font-mono text-xs">
                          {formatNumber(p.account.followers)}
                          <span className="text-emerald-500 ml-2">+{formatNumber(p.follower_growth_30d)}</span>
                        </span>
                      </div>
                      <div className="w-full h-2 bg-wedja-border/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-wedja-accent rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: AI Content Ideas ───────────────────────── */}
      {activeTab === "ideas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Sparkles className="text-wedja-accent" size={20} />
              AI Content Ideas
            </h2>
            <Button onClick={fetchIdeas} disabled={ideasLoading} size="sm">
              {ideasLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate Ideas
            </Button>
          </div>

          {ideasLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-wedja-accent" />
              <span className="ml-2 text-text-secondary text-sm">Analyzing events, promotions, and trends...</span>
            </div>
          ) : (
            <div className="grid gap-3">
              {ideas.map((idea, i) => (
                <Card key={i}>
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${platformColor(idea.platform)}`}>
                            {platformIcon(idea.platform)}
                          </span>
                          <Badge variant="gold">{contentTypeLabel(idea.content_type)}</Badge>
                          <Badge>{categoryLabel(idea.category)}</Badge>
                          {idea.predicted_score >= 80 && (
                            <Badge variant="success">
                              <Zap size={10} />
                              {idea.predicted_score}
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-text-primary mb-1">
                          {idea.title}
                        </h3>
                        <p className="text-xs text-text-secondary line-clamp-2 mb-1">
                          {idea.caption_en}
                        </p>
                        <p className="text-xs text-text-muted" dir="rtl">
                          {idea.caption_ar.slice(0, 80)}...
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            Best: {idea.best_time}
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash size={10} />
                            {idea.hashtags.length} tags
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe size={10} />
                            {idea.language === "multi" ? "AR/EN" : idea.language.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-muted mt-1 italic">
                          Source: {idea.source}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => prefillFromIdea(idea)}
                        className="shrink-0"
                      >
                        <Plus size={14} />
                        Create Post
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {ideas.length === 0 && !ideasLoading && (
                <p className="text-sm text-text-muted text-center py-8">
                  Click &quot;Generate Ideas&quot; to get AI-powered content suggestions based on upcoming events, promotions, and trends.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Content Calendar ───────────────────────── */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Calendar className="text-wedja-accent" size={20} />
              Content Calendar
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCalendarWeekOffset((w) => w - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCalendarWeekOffset(0)}
              >
                This Week
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCalendarWeekOffset((w) => w + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {getWeekDays().map((date) => {
              const entries = getCalendarEntriesForDate(date);
              const isToday =
                date.toISOString().split("T")[0] ===
                new Date().toISOString().split("T")[0];
              const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

              return (
                <Card
                  key={date.toISOString()}
                  className={isToday ? "ring-1 ring-wedja-accent" : ""}
                >
                  <div className={`px-3 py-2 border-b border-wedja-border ${isToday ? "bg-wedja-accent-muted" : ""}`}>
                    <p className="text-xs font-medium text-text-muted">
                      {dayNames[date.getDay()]}
                    </p>
                    <p className={`text-sm font-bold ${isToday ? "text-wedja-accent" : "text-text-primary"}`}>
                      {date.getDate()} {date.toLocaleString("en", { month: "short" })}
                    </p>
                  </div>
                  <CardContent className="p-2 space-y-1.5 min-h-[80px]">
                    {entries.map((entry) => {
                      const sb = statusBadge(entry.status);
                      return (
                        <div
                          key={entry.id}
                          className="p-2 rounded-lg bg-wedja-border/20 hover:bg-wedja-border/40 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold ${platformColor(entry.platform)}`}>
                              {platformIcon(entry.platform)}
                            </span>
                            <Badge variant={sb.variant} className="text-[10px] px-1.5 py-0">
                              {sb.label}
                            </Badge>
                            {entry.ai_suggested && (
                              <Sparkles size={10} className="text-wedja-accent" />
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-text-primary line-clamp-2">
                            {entry.title}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            {contentTypeLabel(entry.content_type)}
                          </p>
                        </div>
                      );
                    })}
                    {entries.length === 0 && (
                      <p className="text-[10px] text-text-muted text-center py-3">
                        No content
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Recent Posts ────────────────────────────── */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Send className="text-wedja-accent" size={20} />
            Recent Posts
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => {
              const sb = statusBadge(post.status);
              return (
                <Card key={post.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold ${platformColor(post.platform)}`}>
                          {platformIcon(post.platform)}
                        </span>
                        <Badge>{contentTypeLabel(post.content_type)}</Badge>
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                      </div>
                      {post.ai_generated && (
                        <Sparkles size={12} className="text-wedja-accent" />
                      )}
                    </div>

                    <p className="text-sm text-text-primary line-clamp-3 mb-3">
                      {post.caption || "No caption"}
                    </p>

                    {post.status === "published" && (
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <Heart size={12} className="mx-auto text-red-400 mb-0.5" />
                          <p className="text-xs font-semibold text-text-primary font-mono">
                            {formatNumber(post.likes)}
                          </p>
                        </div>
                        <div>
                          <MessageCircle size={12} className="mx-auto text-blue-400 mb-0.5" />
                          <p className="text-xs font-semibold text-text-primary font-mono">
                            {formatNumber(post.comments)}
                          </p>
                        </div>
                        <div>
                          <Repeat2 size={12} className="mx-auto text-green-400 mb-0.5" />
                          <p className="text-xs font-semibold text-text-primary font-mono">
                            {formatNumber(post.shares)}
                          </p>
                        </div>
                        <div>
                          <Bookmark size={12} className="mx-auto text-amber-400 mb-0.5" />
                          <p className="text-xs font-semibold text-text-primary font-mono">
                            {formatNumber(post.saves)}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-wedja-border">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Eye size={11} />
                        <span className="font-mono">{formatNumber(post.reach)}</span>
                        reach
                      </div>
                      <div className="text-xs text-text-muted">
                        {post.engagement_rate > 0 && (
                          <span className="text-wedja-accent font-semibold">
                            {post.engagement_rate}% eng.
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] text-text-muted mt-1">
                      {post.published_at
                        ? formatDate(post.published_at)
                        : post.scheduled_at
                        ? `Scheduled: ${formatDate(post.scheduled_at)}`
                        : "Draft"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Analytics ──────────────────────────────── */}
      {activeTab === "analytics" && analytics && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <BarChart3 className="text-wedja-accent" size={20} />
            Analytics (Last 60 Days)
          </h2>

          {/* Content Type Performance */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Content Type Performance
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.by_content_type.map((ct) => {
                  const maxEng = Math.max(
                    ...analytics.by_content_type.map((c) => c.avg_engagement)
                  );
                  const pct = (ct.avg_engagement / maxEng) * 100;
                  return (
                    <div key={ct.content_type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-primary font-medium capitalize">
                          {ct.content_type}
                        </span>
                        <span className="text-text-secondary font-mono text-xs">
                          {ct.avg_engagement}% avg
                          <span className="text-text-muted ml-2">({ct.count} posts)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 bg-wedja-border/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-wedja-accent rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Category Performance */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Category Performance
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.by_category.map((cat) => {
                  const maxEng = Math.max(
                    ...analytics.by_category.map((c) => c.avg_engagement)
                  );
                  const pct = (cat.avg_engagement / maxEng) * 100;
                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-primary font-medium">
                          {categoryLabel(cat.category)}
                        </span>
                        <span className="text-text-secondary font-mono text-xs">
                          {cat.avg_engagement}% avg
                          <span className="text-text-muted ml-2">({cat.count} posts)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 bg-wedja-border/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Language Performance */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Language Performance
              </h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {analytics.by_language.map((lang) => (
                  <div key={lang.language} className="text-center p-3 rounded-lg bg-wedja-border/20">
                    <p className="text-lg font-bold text-wedja-accent font-mono">
                      {lang.avg_engagement}%
                    </p>
                    <p className="text-xs text-text-secondary mt-1 uppercase font-medium">
                      {lang.language === "multi"
                        ? "Bilingual (AR/EN)"
                        : lang.language === "ar"
                        ? "Arabic"
                        : lang.language === "en"
                        ? "English"
                        : lang.language}
                    </p>
                    <p className="text-[10px] text-text-muted">{lang.count} posts</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Posting Heatmap */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Best Posting Times (Engagement Heatmap)
              </h3>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-[500px]">
                  <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1">
                    {/* Header row */}
                    <div className="text-[10px] text-text-muted" />
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="text-[10px] text-text-muted text-center font-medium">
                        {d}
                      </div>
                    ))}
                    {/* Hours */}
                    {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((hour) => (
                      <>
                        <div key={`label-${hour}`} className="text-[10px] text-text-muted text-right pr-1">
                          {hour > 12 ? `${hour - 12}PM` : hour === 12 ? "12PM" : `${hour}AM`}
                        </div>
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const entry = analytics.posting_heatmap.find(
                            (h) => h.day === day && h.hour === hour
                          );
                          const maxEng = Math.max(
                            ...analytics.posting_heatmap.map((h) => h.avg_engagement),
                            1
                          );
                          const intensity = entry
                            ? Math.round((entry.avg_engagement / maxEng) * 100)
                            : 0;
                          return (
                            <div
                              key={`${day}-${hour}`}
                              className="aspect-square rounded-sm flex items-center justify-center"
                              style={{
                                backgroundColor:
                                  intensity > 0
                                    ? `rgba(245, 158, 11, ${intensity / 100})`
                                    : "rgba(255,255,255,0.03)",
                              }}
                              title={
                                entry
                                  ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]} ${hour}:00 — ${entry.avg_engagement}% eng.`
                                  : "No data"
                              }
                            >
                              {entry && (
                                <span className="text-[8px] font-mono text-text-primary">
                                  {entry.avg_engagement.toFixed(0)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Hashtags */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Top Hashtags by Reach
              </h3>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {analytics.hashtag_performance.slice(0, 15).map((h) => (
                  <span
                    key={h.hashtag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-wedja-accent-muted text-wedja-accent font-medium"
                  >
                    {h.hashtag}
                    <span className="text-text-muted ml-1">
                      {h.avg_reach > 1000 ? `${Math.round(h.avg_reach / 1000)}K` : h.avg_reach} reach
                    </span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Platform Growth */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">
                Platform Growth (60 Days)
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.growth_by_platform.map((pg) => {
                  const data = pg.data;
                  if (data.length < 2) return null;
                  const start = data[0].followers;
                  const end = data[data.length - 1].followers;
                  const growth = end - start;
                  const growthPct =
                    start > 0
                      ? Math.round((growth / start) * 10000) / 100
                      : 0;
                  return (
                    <div key={pg.platform} className="flex items-center gap-4">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${platformColor(pg.platform)}`}>
                        {platformIcon(pg.platform)}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-text-primary capitalize">
                            {pg.platform}
                          </span>
                          <span className="text-xs text-text-secondary font-mono">
                            {formatNumber(start)} → {formatNumber(end)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-emerald-500">
                            +{formatNumber(growth)}
                          </span>
                          <span className="text-xs text-text-muted">
                            ({growthPct}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: AI Insights ────────────────────────────── */}
      {activeTab === "insights" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Lightbulb className="text-wedja-accent" size={20} />
            AI Insights
          </h2>

          <div className="grid gap-4">
            {insights.map((insight) => (
              <Card key={insight.id}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                        insight.impact === "high"
                          ? "bg-amber-500"
                          : insight.impact === "medium"
                          ? "bg-blue-500"
                          : "bg-gray-400"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-text-primary">
                          {insight.title}
                        </h3>
                        <Badge
                          variant={
                            insight.impact === "high"
                              ? "warning"
                              : insight.impact === "medium"
                              ? "info"
                              : "default"
                          }
                        >
                          {insight.impact} impact
                        </Badge>
                      </div>
                      <p className="text-sm text-text-secondary mb-2">
                        {insight.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-wedja-accent-muted text-wedja-accent font-medium">
                          Action: {insight.action}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {insights.length === 0 && (
              <p className="text-sm text-text-muted text-center py-8">
                Loading insights...
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Create Post ────────────────────────────── */}
      {activeTab === "create" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Plus className="text-wedja-accent" size={20} />
              Create Post
            </h2>
            {showCreateForm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateForm(false)}
              >
                <X size={14} />
                Cancel
              </Button>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Form */}
            <Card>
              <CardContent className="py-4 space-y-4">
                {/* Platform */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-secondary">
                    Platform
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["instagram", "facebook", "tiktok", "x"].map((p) => (
                      <button
                        key={p}
                        onClick={() => setFormPlatform(p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          formPlatform === p
                            ? platformColor(p)
                            : "bg-wedja-border/30 text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {platformIcon(p)}
                        <span className="capitalize">{p}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content Type */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-secondary">
                    Content Type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["image", "video", "reel", "story", "carousel", "text"].map(
                      (ct) => (
                        <button
                          key={ct}
                          onClick={() => setFormContentType(ct)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            formContentType === ct
                              ? "bg-wedja-accent text-white"
                              : "bg-wedja-border/30 text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {contentTypeLabel(ct)}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-secondary">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
                  >
                    {[
                      "promotion",
                      "event",
                      "tenant_spotlight",
                      "lifestyle",
                      "behind_scenes",
                      "announcement",
                      "seasonal",
                      "user_generated",
                      "poll",
                      "educational",
                    ].map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabel(cat)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Language */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-secondary">
                    Language
                  </label>
                  <div className="flex gap-2">
                    {[
                      { val: "en", label: "English" },
                      { val: "ar", label: "Arabic" },
                      { val: "multi", label: "Both (AR/EN)" },
                      { val: "ru", label: "Russian" },
                    ].map((lang) => (
                      <button
                        key={lang.val}
                        onClick={() => setFormLanguage(lang.val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          formLanguage === lang.val
                            ? "bg-wedja-accent text-white"
                            : "bg-wedja-border/30 text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Caption */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-text-secondary">
                      Caption
                    </label>
                    <span className={`text-xs font-mono ${formCaption.length > (CHAR_LIMITS[formPlatform] || 2200) ? "text-red-500" : "text-text-muted"}`}>
                      {formCaption.length} / {CHAR_LIMITS[formPlatform] || 2200}
                    </span>
                  </div>
                  <textarea
                    value={formCaption}
                    onChange={(e) => setFormCaption(e.target.value)}
                    rows={5}
                    placeholder="Write your caption..."
                    className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-wedja-accent resize-none"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateCaptions}
                    disabled={generatingCaptions}
                  >
                    {generatingCaptions ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    AI Generate Caption
                  </Button>
                </div>

                {/* Generated Captions */}
                {generatedCaptions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text-secondary">
                      AI Suggestions — click to use:
                    </p>
                    {generatedCaptions.map((cap, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setFormCaption(cap.caption_en);
                          setFormHashtags(cap.hashtags.join(", "));
                        }}
                        className="w-full text-left p-3 rounded-lg bg-wedja-border/20 hover:bg-wedja-border/40 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="gold" className="text-[10px]">
                            {cap.tone}
                          </Badge>
                          <span className="text-[10px] text-text-muted font-mono">
                            ~{cap.char_count} chars
                          </span>
                        </div>
                        <p className="text-xs text-text-primary line-clamp-2">
                          {cap.caption_en}
                        </p>
                        <p className="text-xs text-text-muted mt-1" dir="rtl">
                          {cap.caption_ar.slice(0, 60)}...
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Hashtags */}
                <Input
                  label="Hashtags (comma-separated)"
                  value={formHashtags}
                  onChange={(e) => setFormHashtags(e.target.value)}
                  placeholder="#SenzoMall, #Hurghada, #Shopping"
                />

                {/* Schedule */}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Schedule Date"
                    type="date"
                    value={formScheduleDate}
                    onChange={(e) => setFormScheduleDate(e.target.value)}
                  />
                  <Input
                    label="Schedule Time"
                    type="time"
                    value={formScheduleTime}
                    onChange={(e) => setFormScheduleTime(e.target.value)}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => handleSubmitPost("draft")}
                    variant="secondary"
                    disabled={submitting || !formCaption}
                  >
                    <Save size={14} />
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => handleSubmitPost("scheduled")}
                    variant="secondary"
                    disabled={submitting || !formCaption || !formScheduleDate}
                  >
                    <Clock size={14} />
                    Schedule
                  </Button>
                  <Button
                    onClick={() => handleSubmitPost("published")}
                    disabled={submitting || !formCaption}
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Publish
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">
                  Preview
                </h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${platformColor(formPlatform)}`}>
                      {platformIcon(formPlatform)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Senzo Mall
                      </p>
                      <p className="text-xs text-text-muted capitalize">
                        {formPlatform} &middot; {contentTypeLabel(formContentType)}
                      </p>
                    </div>
                  </div>

                  {/* Simulated post content */}
                  <div className="rounded-lg bg-wedja-border/20 aspect-video flex items-center justify-center">
                    <span className="text-text-muted text-sm">
                      [{contentTypeLabel(formContentType)} media]
                    </span>
                  </div>

                  <div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {formCaption || "Your caption will appear here..."}
                    </p>
                    {formHashtags && (
                      <p className="text-sm text-blue-400 mt-1">
                        {formHashtags}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-text-muted">
                    <Heart size={18} />
                    <MessageCircle size={18} />
                    <Repeat2 size={18} />
                    <Bookmark size={18} className="ml-auto" />
                  </div>

                  <div className="text-xs text-text-muted space-y-1">
                    <p>Category: {categoryLabel(formCategory)}</p>
                    <p>Language: {formLanguage === "multi" ? "Bilingual (AR/EN)" : formLanguage.toUpperCase()}</p>
                    {formScheduleDate && (
                      <p>
                        Scheduled: {formScheduleDate} {formScheduleTime || ""}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
