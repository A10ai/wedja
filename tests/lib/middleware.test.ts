import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getSession, createServerClient } = vi.hoisted(() => {
  const getSession = vi.fn();
  return { getSession, createServerClient: vi.fn(() => ({ auth: { getSession } })) };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { middleware, config } from "@/middleware";

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost:3000${path}`);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

const AUTH = { "sb-ref-auth-token": "base64-xyz" };

beforeEach(() => {
  getSession.mockReset();
  createServerClient.mockClear();
});

describe("middleware", () => {
  test("matcher covers dashboard and login only", () => {
    expect(config.matcher).toEqual(["/dashboard", "/dashboard/:path*", "/login"]);
  });

  test("redirects anonymous dashboard requests to login with redirect param", async () => {
    const res = await middleware(request("/dashboard/revenue"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("redirect")).toBe("/dashboard/revenue");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("lets anonymous users view the login page without hitting Supabase", async () => {
    const res = await middleware(request("/login"));
    expect(res.headers.get("location")).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("accepts chunked session cookies as a session signal", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
    const res = await middleware(request("/dashboard", { "sb-ref-auth-token.0": "a" }));
    expect(res.headers.get("location")).toBeNull();
    expect(createServerClient).toHaveBeenCalled();
  });

  test("redirects to login when the cookie holds an expired session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const res = await middleware(request("/dashboard", AUTH));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  test("treats a Supabase outage as logged out instead of throwing", async () => {
    getSession.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await middleware(request("/dashboard/tenants", AUTH));
    expect(new URL(res.headers.get("location")!).searchParams.get("redirect")).toBe("/dashboard/tenants");
  });

  test("passes through an authenticated dashboard request", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
    const res = await middleware(request("/dashboard", AUTH));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  test("bounces logged-in users from /login to /dashboard", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
    const res = await middleware(request("/login", AUTH));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  test("ignores look-alike cookies that are not Supabase auth cookies", async () => {
    const res = await middleware(request("/dashboard", { "my-auth-token": "x", "sbx-auth": "y" }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});
