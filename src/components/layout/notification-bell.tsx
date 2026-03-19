"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markRead = async (id: string) => {
    await fetch("/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    setLoading(true);
    await fetch("/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    setLoading(false);
  };

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const typeColors: Record<string, string> = {
    critical: "bg-red-500",
    warning: "bg-amber-500",
    success: "bg-emerald-500",
    info: "bg-blue-500",
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        className="relative p-2 rounded-lg hover:bg-custis-border/50 text-text-secondary transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-custis-gold text-white text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-custis-card border border-custis-border rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-custis-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-custis-gold hover:text-custis-gold-hover flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCheck size={12} />
                )}
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="py-8 text-center text-text-muted text-sm">
                No notifications yet
              </div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "px-4 py-3 border-b border-custis-border/50 hover:bg-custis-border/20 transition-colors cursor-pointer",
                  !n.read && "bg-custis-gold-muted/20"
                )}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                  if (n.link) window.location.href = n.link;
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      n.read
                        ? "bg-custis-border"
                        : typeColors[n.type] || "bg-custis-gold"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm truncate",
                        n.read
                          ? "text-text-muted"
                          : "text-text-primary font-medium"
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[11px] text-text-muted mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n.id);
                      }}
                      className="p-1 rounded hover:bg-custis-border/50 text-text-muted hover:text-text-primary shrink-0"
                      aria-label="Mark as read"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
