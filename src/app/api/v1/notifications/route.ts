import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotifications,
  createNotification,
  markRead,
  markAllRead,
  getUnreadCount,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const countOnly = searchParams.get("count") === "true";

    if (countOnly) {
      const count = await getUnreadCount(supabase);
      return NextResponse.json({ count });
    }

    const notifications = await getNotifications(supabase, {
      limit: 20,
      unreadOnly,
    });

    const unreadCount = await getUnreadCount(supabase);

    return NextResponse.json({ notifications, unread_count: unreadCount });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    // Mark read
    if (body.action === "mark_read" && body.id) {
      const success = await markRead(supabase, body.id);
      return NextResponse.json({ success });
    }

    // Mark all read
    if (body.action === "mark_all_read") {
      const success = await markAllRead(supabase);
      return NextResponse.json({ success });
    }

    // Create notification
    if (body.title && body.message) {
      const notification = await createNotification(supabase, body);
      if (!notification) {
        return NextResponse.json(
          { error: "Failed to create notification" },
          { status: 500 }
        );
      }
      return NextResponse.json(notification, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Notifications POST error:", error);
    return NextResponse.json(
      { error: "Failed to process notification action" },
      { status: 500 }
    );
  }
}
