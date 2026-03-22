"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Loader2, Brain, Activity, DollarSign, Users, Wrench, Zap, Settings, Server } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface AuditEntry {
  id: string;
  user_email: string;
  action: string;
  category: string;
  resource_type: string | null;
  resource_id: string | null;
  description: string;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  ai_brain: Brain, ai_decision: Brain, automation: Activity,
  lease: DollarSign, rent: DollarSign, tenant: Users,
  maintenance: Wrench, energy: Zap, system: Server, settings: Settings,
};

const categoryColors: Record<string, string> = {
  ai_brain: "text-purple-400 bg-purple-400/10", ai_decision: "text-purple-400 bg-purple-400/10",
  automation: "text-cyan-400 bg-cyan-400/10", lease: "text-blue-400 bg-blue-400/10",
  rent: "text-green-400 bg-green-400/10", tenant: "text-indigo-400 bg-indigo-400/10",
  maintenance: "text-red-400 bg-red-400/10", energy: "text-amber-400 bg-amber-400/10",
  system: "text-gray-400 bg-gray-400/10", settings: "text-gray-400 bg-gray-400/10",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<{ total_entries: number; today_entries: number; by_category: Record<string, number>; ai_decisions: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [logRes, statsRes] = await Promise.all([
        fetch(`/api/v1/audit?limit=100${filter !== "all" ? `&category=${filter}` : ""}`),
        fetch("/api/v1/audit?type=stats"),
      ]);
      const logJson = await logRes.json();
      const statsJson = await statsRes.json();
      setEntries(logJson.data?.entries || []);
      setStats(statsJson.data || null);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-wedja-accent" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-wedja-accent" />
          <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">Audit Trail</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">Every AI decision, event, and action — logged and traceable</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent><p className="text-xs text-text-muted">Total</p><p className="text-2xl font-mono font-bold text-text-primary mt-1">{stats?.total_entries || 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-text-muted">Today</p><p className="text-2xl font-mono font-bold text-text-primary mt-1">{stats?.today_entries || 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-text-muted">AI Decisions</p><p className="text-2xl font-mono font-bold text-wedja-accent mt-1">{stats?.ai_decisions || 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-text-muted">Categories</p><p className="text-2xl font-mono font-bold text-text-primary mt-1">{Object.keys(stats?.by_category || {}).length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["all", "ai_brain", "ai_decision", "automation", "system", "lease", "rent", "tenant", "maintenance", "energy"].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={cn("px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors",
              filter === cat ? "wedja-gradient text-white" : "bg-wedja-card border border-wedja-border text-text-secondary hover:text-text-primary")}>
            {cat.replace("_", " ")} {cat !== "all" && stats?.by_category?.[cat] ? `(${stats.by_category[cat]})` : ""}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><h3 className="text-lg font-semibold text-text-primary">Audit Log ({entries.length})</h3></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-wedja-border max-h-[600px] overflow-y-auto">
            {entries.map(entry => {
              const Icon = categoryIcons[entry.category] || Server;
              const color = categoryColors[entry.category] || "text-gray-400 bg-gray-400/10";
              const isExp = expanded === entry.id;
              return (
                <div key={entry.id} className="px-4 py-3 hover:bg-wedja-bg/50 cursor-pointer transition-colors" onClick={() => setExpanded(isExp ? null : entry.id)}>
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default" className="text-[10px]">{entry.category.replace("_", " ")}</Badge>
                        <span className="text-xs text-text-muted">{entry.action}</span>
                        <span className="text-xs text-text-muted ml-auto shrink-0">{timeAgo(entry.created_at)}</span>
                      </div>
                      <p className="text-sm text-text-primary mt-1 line-clamp-2">{entry.description}</p>
                      <p className="text-xs text-text-muted mt-0.5">by {entry.user_email}</p>
                      {isExp && entry.new_data && (
                        <pre className="mt-3 p-3 rounded-lg bg-wedja-bg border border-wedja-border text-[11px] text-text-secondary font-mono whitespace-pre-wrap">
                          {JSON.stringify(entry.new_data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {entries.length === 0 && (
              <div className="py-12 text-center text-text-muted text-sm">No audit entries. Run a Brain Cycle to see entries.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
