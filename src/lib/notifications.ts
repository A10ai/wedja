import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Custis Notifications
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
    console.error("Failed to create notification:", error);
    return null;
  }

  return data;
}

export async function getNotifications(
  supabase: SupabaseClient,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<Notification[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit || 20);

  if (options?.unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch notifications:", error);
    return [];
  }

  return data || [];
}

export async function markRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  return !error;
}

export async function markAllRead(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  return !error;
}

export async function getUnreadCount(
  supabase: SupabaseClient
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  if (error) return 0;
  return count || 0;
}
