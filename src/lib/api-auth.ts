import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

/**
 * Decode a base64url (or plain base64) string to UTF-8 text.
 * @supabase/ssr encodes session cookies as `base64-<base64url>`, which uses
 * `-`/`_` and no padding — plain `atob` rejects those characters.
 */
function decodeBase64Url(value: string): string {
  let b64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  while (b64.length % 4 !== 0) b64 += "=";
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Extract the access token from a Supabase auth cookie value.
 * The cookie may be a raw JWT or a JSON-encoded session object.
 */
export function extractAccessToken(cookieValue: string): string | null {
  // Supabase SSR may encode the cookie as base64-<json>
  // The JSON contains { access_token, refresh_token, ... }
  let rawValue = cookieValue;

  // Strip base64 prefix if present
  if (rawValue.startsWith("base64-")) {
    try {
      rawValue = decodeBase64Url(rawValue.slice(7));
    } catch {
      // Not valid base64 — the cookie is unusable
      return null;
    }
  }

  // Try parsing as JSON (supabase-js v2 cookie format)
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      // Legacy array format: [access_token, refresh_token, ...]
      return parsed[0];
    }
    return null;
  } catch {
    // Not JSON — treat as raw token
  }
  return rawValue || null;
}

/**
 * Find the Supabase auth cookie and return its full value, reassembling
 * chunked cookies (`sb-<ref>-auth-token.0`, `.1`, ...) that @supabase/ssr
 * creates when the session exceeds the per-cookie size limit.
 */
export function readAuthCookieValue(
  cookies: { name: string; value: string }[]
): string | null {
  const authCookies = cookies.filter(
    (c) =>
      (c.name.startsWith("sb-") || c.name.startsWith("sb.")) &&
      /-auth-token(\.\d+)?$/.test(c.name)
  );
  if (authCookies.length === 0) return null;

  const whole = authCookies.find((c) => /-auth-token$/.test(c.name));
  if (whole?.value) return whole.value;

  const chunks = authCookies
    .map((c) => ({ index: Number(c.name.slice(c.name.lastIndexOf(".") + 1)), value: c.value }))
    .sort((a, b) => a.index - b.index);
  // Chunks must be contiguous from .0, otherwise the value is incomplete
  if (chunks.some((c, i) => c.index !== i)) return null;
  const joined = chunks.map((c) => c.value).join("");
  return joined || null;
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

    const cookieValue = readAuthCookieValue(allCookies);
    if (!cookieValue) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = extractAccessToken(cookieValue);
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