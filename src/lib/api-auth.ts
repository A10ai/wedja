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

export type StaffRole = "owner" | "manager" | "security" | "maintenance" | "viewer";

export interface StaffMember {
  id: string;
  property_id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export type AuthUser = User & { staff: StaffMember };

/** Roles allowed to change data when a route doesn't say otherwise. */
export const WRITE_ROLES: StaffRole[] = ["owner", "manager"];
export const ALL_ROLES: StaffRole[] = ["owner", "manager", "security", "maintenance", "viewer"];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface RequireAuthOptions {
  /**
   * Roles allowed to call this handler. Defaults to every active staff
   * member for reads and to owner/manager for any other method.
   */
  roles?: StaffRole[];
}

/**
 * Require an authenticated, active staff member for an API route.
 * Returns the user with their staff record, or a 401/403 NextResponse.
 *
 * Usage:
 *   const auth = await requireAuth(req);
 *   if (auth instanceof NextResponse) return auth;
 *   auth.staff.role // "owner" | "manager" | ...
 */
export async function requireAuth(
  req: NextRequest,
  options: RequireAuthOptions = {}
): Promise<NextResponse | AuthUser> {
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

    // A valid Supabase session is not enough: the user must be an active
    // staff member. Match on auth_user_id, falling back to email for staff
    // rows that were created before accounts were linked.
    const staffColumns = "id, property_id, name, email, role, status";
    let { data: staff } = await supabase
      .from("staff")
      .select(staffColumns)
      .eq("auth_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!staff && user.email) {
      ({ data: staff } = await supabase
        .from("staff")
        .select(staffColumns)
        .ilike("email", user.email)
        .eq("status", "active")
        .maybeSingle());
    }

    if (!staff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowed =
      options.roles ?? (READ_METHODS.has(req.method.toUpperCase()) ? ALL_ROLES : WRITE_ROLES);
    if (!allowed.includes(staff.role as StaffRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const member: StaffMember = {
      id: staff.id,
      property_id: staff.property_id,
      name: staff.name,
      email: staff.email,
      role: staff.role as StaffRole,
    };
    return Object.assign(user, { staff: member });
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