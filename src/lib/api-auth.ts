import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

/**
 * Extract the access token from a Supabase auth cookie value.
 * The cookie may be a raw JWT or a JSON-encoded session object.
 */
function extractAccessToken(cookieValue: string): string | null {
  // Supabase SSR may encode the cookie as base64-<json>
  // The JSON contains { access_token, refresh_token, ... }
  let rawValue = cookieValue;

  // Strip base64 prefix if present
  if (rawValue.startsWith("base64-")) {
    try {
      rawValue = atob(rawValue.slice(7));
    } catch {
      // Not valid base64 — treat original as raw token
      rawValue = cookieValue;
    }
  }

  // Try parsing as JSON (supabase-js v2 cookie format)
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
  } catch {
    // Not JSON — treat as raw token
  }
  return rawValue;
}

/**
 * Require authentication for an API route.
 * Returns the authenticated user, or a 401 NextResponse if unauthorized.
 *
 * Usage:
 *   const auth = await requireAuth(req);
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireAuth(
  req: NextRequest
): Promise<NextResponse | User> {
  try {
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();

    // Find any cookie starting with "sb-" and containing "auth-token"
    const authCookie = allCookies.find(
      (c) => c.name.startsWith("sb-") && c.name.includes("auth-token")
    );

    if (!authCookie || !authCookie.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = extractAccessToken(authCookie.value);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Legacy authentication check (kept for backward compatibility).
 */
export async function authenticateRequest(req: NextRequest) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) {
    return { authenticated: false, error: "Unauthorized" };
  }
  return { authenticated: true, userId: result.id };
}