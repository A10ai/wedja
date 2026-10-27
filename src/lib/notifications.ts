import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ============================================================
// Wedja Notifications
//
// A notification is either targeted (staff_id set) or a broadcast to every
// active staff member (staff_id NULL — every system alert is one). Targeted
// rows keep their read flag on the row; broadcasts keep one read mark per
// person in notification_reads, so "mark all read" only affects the caller
// (migration 00018).
// ============================================================

export interface Notification {
  id: string;
  staff_id: string | null;
  title: string;
  message: string;
  type: string;
  category: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** Upper bound on broadcast rows considered when counting / marking unread. */
const BROADCAST_SCAN_LIMIT = 500;

export async function createNotification(
  supabase: SupabaseClient,
  notification: {
    title: string;
    message: string;
    type?: string;
    category?: string;
    link?: string;
    staff_id?: string;
  }
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      title: notification.title,
      message: notification.message,
      type: notification.type || "info",
      category: notification.category || "general",
      link: notification.link || null,
      staff_id: notification.staff_id || null,
      read: false,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error }, "Failed to create notification:");
    return null;
  }

  return data;
}

/** Filter string selecting the caller's own rows plus broadcasts. */
function visibleTo(staffId: string): string {
  return `staff_id.eq.${staffId},staff_id.is.null`;
}

/** Ids among `broadcastIds` that `staffId` has already marked read. */
async function readBroadcastIds(
  supabase: SupabaseClient,
  staffId: string,
  broadcastIds: string[]
): Promise<Set<string>> {
  if (broadcastIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("staff_id", staffId)
    .in("notification_id", broadcastIds);
  if (error) {
    logger.error({ err: error }, "Failed to fetch notification read marks:");
    return new Set();
  }
  return new Set((data || []).map((r: { notification_id: string }) => r.notification_id));
}

export async function getNotifications(
  supabase: SupabaseClient,
  options?: { limit?: number; unreadOnly?: boolean; staffId?: string }
): Promise<Notification[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit || 20);

  if (options?.staffId) {
    query = query.or(visibleTo(options.staffId));
  }
  if (options?.unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ err: error }, "Failed to fetch notifications:");
    return [];
  }

  const rows: Notification[] = data || [];
  if (!options?.staffId) return rows;

  // Broadcasts carry per-person read state.
  const readIds = await readBroadcastIds(
    supabase,
    options.staffId,
    rows.filter((n) => n.staff_id === null).map((n) => n.id)
  );
  const merged = rows.map((n) =>
    n.staff_id === null && readIds.has(n.id) ? { ...n, read: true } : n
  );
  return options.unreadOnly ? merged.filter((n) => !n.read) : merged;
}

export async function markRead(
  supabase: SupabaseClient,
  notificationId: string,
  staffId?: string
): Promise<boolean> {
  let query = supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);
  // With a caller, only their own targeted row is updated; a broadcast gets
  // a personal read mark instead so it stays unread for everyone else.
  if (staffId) query = query.eq("staff_id", staffId);
  const { error } = await query;
  if (error) return false;
  if (!staffId) return true;

  const { error: markError } = await supabase
    .from("notification_reads")
    .upsert({ notification_id: notificationId, staff_id: staffId }, { onConflict: "notification_id,staff_id", ignoreDuplicates: true });
  return !markError;
}

export async function markAllRead(supabase: SupabaseClient, staffId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false)
    .eq("staff_id", staffId);
  if (error) return false;

  const { data: broadcasts, error: listError } = await supabase
    .from("notifications")
    .select("id")
    .is("staff_id", null)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(BROADCAST_SCAN_LIMIT);
  if (listError) return false;

  const ids = (broadcasts || []).map((n: { id: string }) => n.id);
  if (ids.length === 0) return true;
  const already = await readBroadcastIds(supabase, staffId, ids);
  const marks = ids.filter((id) => !already.has(id)).map((id) => ({ notification_id: id, staff_id: staffId }));
  if (marks.length === 0) return true;

  const { error: markError } = await supabase
    .from("notification_reads")
    .upsert(marks, { onConflict: "notification_id,staff_id", ignoreDuplicates: true });
  return !markError;
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  staffId?: string
): Promise<number> {
  if (!staffId) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    if (error) return 0;
    return count || 0;
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, staff_id")
    .or(visibleTo(staffId))
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(BROADCAST_SCAN_LIMIT);
  if (error) return 0;

  const rows: Array<{ id: string; staff_id: string | null }> = data || [];
  const readIds = await readBroadcastIds(
    supabase,
    staffId,
    rows.filter((n) => n.staff_id === null).map((n) => n.id)
  );
  return rows.filter((n) => n.staff_id !== null || !readIds.has(n.id)).length;
}
