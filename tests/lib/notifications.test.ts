import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";

/* eslint-disable @typescript-eslint/no-explicit-any */

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: loggerMock, createLogger: () => loggerMock }));

import {
  createNotification,
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
} from "@/lib/notifications";

const only = (sb: any) => {
  expect(sb._calls).toHaveLength(1);
  expect(sb._calls[0].table).toBe("notifications");
  return sb._calls[0];
};

beforeEach(() => {
  Object.values(loggerMock).forEach((fn) => fn.mockClear());
});

describe("notifications: createNotification", () => {
  test("inserts with defaults (info/general/null link/null staff/unread)", async () => {
    const row = { id: "n1" };
    const sb = createMockSupabase({ notifications: row });
    const res = await createNotification(sb, { title: "T", message: "M" });
    const call = only(sb);
    expect(call.payloads[0]).toEqual({
      title: "T",
      message: "M",
      type: "info",
      category: "general",
      link: null,
      staff_id: null,
      read: false,
    });
    expect(res).toBe(row);
  });

  test("passes explicit type/category/link/staff_id through", async () => {
    const sb = createMockSupabase({ notifications: { id: "n" } });
    await createNotification(sb, {
      title: "T",
      message: "M",
      type: "critical",
      category: "revenue",
      link: "/dashboard/discrepancies",
      staff_id: "staff-1",
    });
    expect(only(sb).payloads[0]).toMatchObject({
      type: "critical",
      category: "revenue",
      link: "/dashboard/discrepancies",
      staff_id: "staff-1",
    });
  });

  test("always inserts read=false, even if caller smuggles read:true", async () => {
    const sb = createMockSupabase({ notifications: { id: "n" } });
    await createNotification(sb, { title: "T", message: "M", read: true } as any);
    expect(only(sb).payloads[0].read).toBe(false);
  });

  test("ignores unknown extra fields (only whitelisted columns are sent)", async () => {
    const sb = createMockSupabase({ notifications: { id: "n" } });
    await createNotification(sb, { title: "T", message: "M", id: "forged", created_at: "1970" } as any);
    const payload = only(sb).payloads[0];
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("created_at");
  });

  test("empty-string link / staff_id are normalised to null", async () => {
    const sb = createMockSupabase({ notifications: { id: "n" } });
    await createNotification(sb, { title: "T", message: "M", link: "", staff_id: "" });
    const p = only(sb).payloads[0];
    expect(p.link).toBeNull();
    expect(p.staff_id).toBeNull();
  });

  test("empty-string type/category fall back to defaults", async () => {
    const sb = createMockSupabase({ notifications: { id: "n" } });
    await createNotification(sb, { title: "T", message: "M", type: "", category: "" });
    const p = only(sb).payloads[0];
    expect(p.type).toBe("info");
    expect(p.category).toBe("general");
  });

  test("requests the inserted row back via select().single()", async () => {
    const sb = createMockSupabase({ notifications: { id: "n" } });
    await createNotification(sb, { title: "T", message: "M" });
    expect(only(sb).selects).toEqual([[]]);
  });

  test("on supabase error returns null and logs via logger.error with err", async () => {
    const err = { message: "null value in column staff_id violates not-null constraint" };
    const sb = createMockSupabase({ notifications: { id: "ignored" } }, { errors: { notifications: err } });
    const res = await createNotification(sb, { title: "T", message: "M" });
    expect(res).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toEqual({ err });
    expect(loggerMock.error.mock.calls[0][1]).toMatch(/create notification/i);
  });

  test("returns null (no throw, no log) when insert yields no row and no error", async () => {
    const sb = createMockSupabase({});
    await expect(createNotification(sb, { title: "T", message: "M" })).resolves.toBeNull();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});

describe("notifications: getNotifications", () => {
  test("default: select *, newest first, limit 20, no read filter", async () => {
    const sb = createMockSupabase({ notifications: [] });
    await getNotifications(sb);
    const c = only(sb);
    expect(c.selects[0]).toEqual(["*"]);
    expect(c.filters).toEqual(['order("created_at", {"ascending":false})', "limit(20)"]);
  });

  test("custom limit is honoured", async () => {
    const sb = createMockSupabase({ notifications: [] });
    await getNotifications(sb, { limit: 5 });
    expect(only(sb).filters).toContain("limit(5)");
  });

  test("limit 0 falls back to 20 (falsy default)", async () => {
    const sb = createMockSupabase({ notifications: [] });
    await getNotifications(sb, { limit: 0 });
    expect(only(sb).filters).toContain("limit(20)");
  });

  test("unreadOnly adds eq(read,false)", async () => {
    const sb = createMockSupabase({ notifications: [] });
    await getNotifications(sb, { unreadOnly: true });
    expect(only(sb).filters).toContain('eq("read", false)');
  });

  test("unreadOnly:false adds no read filter", async () => {
    const sb = createMockSupabase({ notifications: [] });
    await getNotifications(sb, { unreadOnly: false });
    expect(only(sb).filters.some((f: string) => f.startsWith("eq("))).toBe(false);
  });

  test("returns rows as-is", async () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const sb = createMockSupabase({ notifications: rows });
    expect(await getNotifications(sb)).toBe(rows);
  });

  test("null data returns []", async () => {
    const sb = createMockSupabase({});
    expect(await getNotifications(sb)).toEqual([]);
  });

  test("error returns [] even if data present, and logs", async () => {
    const err = { message: "RLS" };
    const sb = createMockSupabase({ notifications: [{ id: "leak" }] }, { errors: { notifications: err } });
    expect(await getNotifications(sb)).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledWith({ err }, expect.stringMatching(/fetch notifications/i));
  });
});

describe("notifications: markRead / markAllRead", () => {
  test("markRead updates read=true scoped to the given id", async () => {
    const sb = createMockSupabase();
    expect(await markRead(sb, "n-42")).toBe(true);
    const c = only(sb);
    expect(c.payloads[0]).toEqual({ read: true });
    expect(c.filters).toContain('eq("id", "n-42")');
  });

  test("markRead returns false on error", async () => {
    const sb = createMockSupabase({}, { errors: { notifications: { message: "x" } } });
    expect(await markRead(sb, "n-1")).toBe(false);
  });

  test("markRead with empty id still issues a scoped eq (never an unscoped update)", async () => {
    const sb = createMockSupabase();
    await markRead(sb, "");
    expect(only(sb).filters).toContain('eq("id", "")');
  });

  test("markAllRead marks the caller's own unread rows, then their read marks on unread broadcasts", async () => {
    const sb = createMockSupabase(
      {},
      {
        sequences: {
          notifications: [{ data: null }, { data: [{ id: "b1" }, { id: "b2" }, { id: "b3" }] }],
          notification_reads: [{ data: [{ notification_id: "b2" }] }, { data: null }],
        },
      }
    );
    expect(await markAllRead(sb, "staff-1")).toBe(true);
    expect(sb._calls.map((c: any) => c.table)).toEqual([
      "notifications",
      "notifications",
      "notification_reads",
      "notification_reads",
    ]);
    const own = sb._calls[0];
    expect(own.payloads[0]).toEqual({ read: true });
    expect(own.filters).toEqual(['update({"read":true})', 'eq("read", false)', 'eq("staff_id", "staff-1")']);
    const broadcasts = sb._calls[1];
    expect(broadcasts.filters).toContain('is("staff_id", null)');
    expect(broadcasts.filters).toContain('eq("read", false)');
    const marks = sb._calls[3];
    expect(marks.payloads[0]).toEqual([
      { notification_id: "b1", staff_id: "staff-1" },
      { notification_id: "b3", staff_id: "staff-1" },
    ]);
  });

  test("markAllRead with no unread broadcasts issues no read marks", async () => {
    const sb = createMockSupabase({}, { sequences: { notifications: [{ data: null }, { data: [] }] } });
    expect(await markAllRead(sb, "staff-1")).toBe(true);
    expect(sb._calls).toHaveLength(2);
  });

  test("markAllRead returns false on error", async () => {
    const sb = createMockSupabase({}, { errors: { notifications: { message: "x" } } });
    expect(await markAllRead(sb, "staff-1")).toBe(false);
  });

  test("markRead with a caller scopes the update to their row and records a read mark", async () => {
    const sb = createMockSupabase();
    expect(await markRead(sb, "n-42", "staff-1")).toBe(true);
    expect(sb._calls.map((c: any) => c.table)).toEqual(["notifications", "notification_reads"]);
    expect(sb._calls[0].filters).toEqual(['update({"read":true})', 'eq("id", "n-42")', 'eq("staff_id", "staff-1")']);
    expect(sb._calls[1].payloads[0]).toEqual({ notification_id: "n-42", staff_id: "staff-1" });
  });
});

describe("notifications: per-caller visibility", () => {
  test("getNotifications with staffId selects own rows plus broadcasts and applies personal read marks", async () => {
    const rows = [
      { id: "a", staff_id: "staff-1", read: false },
      { id: "b", staff_id: null, read: false },
      { id: "c", staff_id: null, read: false },
    ];
    const sb = createMockSupabase({ notifications: rows, notification_reads: [{ notification_id: "c" }] });
    const out = await getNotifications(sb, { staffId: "staff-1" });
    expect(sb._calls[0].filters).toContain('or("staff_id.eq.staff-1,staff_id.is.null")');
    expect(sb._calls[1].table).toBe("notification_reads");
    expect(sb._calls[1].filters).toEqual(['eq("staff_id", "staff-1")', 'in("notification_id", ["b","c"])']);
    expect(out.map((n) => [n.id, n.read])).toEqual([["a", false], ["b", false], ["c", true]]);
  });

  test("getNotifications unreadOnly with staffId drops broadcasts the caller has read", async () => {
    const rows = [
      { id: "b", staff_id: null, read: false },
      { id: "c", staff_id: null, read: false },
    ];
    const sb = createMockSupabase({ notifications: rows, notification_reads: [{ notification_id: "c" }] });
    const out = await getNotifications(sb, { staffId: "staff-1", unreadOnly: true });
    expect(sb._calls[0].filters).toContain('eq("read", false)');
    expect(out.map((n) => n.id)).toEqual(["b"]);
  });

  test("getUnreadCount with staffId counts own unread rows plus unread broadcasts not yet marked", async () => {
    const rows = [
      { id: "a", staff_id: "staff-1" },
      { id: "b", staff_id: null },
      { id: "c", staff_id: null },
    ];
    const sb = createMockSupabase({ notifications: rows, notification_reads: [{ notification_id: "c" }] });
    expect(await getUnreadCount(sb, "staff-1")).toBe(2);
    expect(sb._calls[0].filters).toContain('or("staff_id.eq.staff-1,staff_id.is.null")');
  });

  test("getUnreadCount with staffId returns 0 on error", async () => {
    const sb = createMockSupabase({ notifications: [{ id: "a", staff_id: null }] }, { errors: { notifications: { message: "x" } } });
    expect(await getUnreadCount(sb, "staff-1")).toBe(0);
  });
});

describe("notifications: getUnreadCount", () => {
  test("uses head count query filtered on read=false", async () => {
    const sb = createMockSupabase({}, { counts: { notifications: 7 } });
    expect(await getUnreadCount(sb)).toBe(7);
    const c = only(sb);
    expect(c.selects[0]).toEqual(["id", { count: "exact", head: true }]);
    expect(c.filters).toEqual(['eq("read", false)']);
  });

  test("null count returns 0", async () => {
    const sb = createMockSupabase();
    expect(await getUnreadCount(sb)).toBe(0);
  });

  test("error returns 0 even when a count is present", async () => {
    const sb = createMockSupabase({}, { counts: { notifications: 99 }, errors: { notifications: { message: "x" } } });
    expect(await getUnreadCount(sb)).toBe(0);
  });
});
