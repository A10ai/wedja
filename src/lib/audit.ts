/**
 * Wedja Audit Trail
 * Logs every AI decision, human action, and system event.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntry {
  user_id?: string;
  user_email?: string;
  action: string;
  category: string;
  resource_type?: string;
  resource_id?: string;
  description: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function logAudit(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      user_id: entry.user_id || "system",
      user_email: entry.user_email || "system@wedja.ai",
      action: entry.action,
      category: entry.category,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      description: entry.description,
      old_data: entry.old_data || null,
      new_data: entry.new_data || null,
      metadata: entry.metadata || {},
    });
  } catch {
    // Non-critical
  }
}

export async function getAuditLog(
  supabase: SupabaseClient,
  options?: { category?: string; limit?: number; offset?: number }
): Promise<{ entries: unknown[]; total: number }> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.category) query = query.eq("category", options.category);

  const { data, count } = await query;
  return { entries: data || [], total: count || 0 };
}

export async function getAuditStats(supabase: SupabaseClient) {
  const today = new Date().toISOString().split("T")[0];

  const [totalRes, todayRes, catRes] = await Promise.all([
    supabase.from("audit_log").select("id", { count: "exact", head: true }),
    supabase.from("audit_log").select("id", { count: "exact", head: true }).gte("created_at", today),
    supabase.from("audit_log").select("category"),
  ]);

  const byCategory: Record<string, number> = {};
  (catRes.data || []).forEach((r: { category: string }) => {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  });

  return {
    total_entries: totalRes.count || 0,
    today_entries: todayRes.count || 0,
    by_category: byCategory,
    ai_decisions: (byCategory["ai_brain"] || 0) + (byCategory["ai_decision"] || 0),
  };
}
