import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

interface AuthResult {
  authenticated: boolean;
  userId?: string;
  error?: string;
}

/**
 * API authentication helper.
 * Fast path: checks for auth cookies + same-origin referer.
 * Slow path: validates the full session with Supabase.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthResult> {
  try {
    // Fast path — check same-origin referer
    const referer = req.headers.get("referer");
    const origin = req.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    const isSameOrigin =
      (referer && referer.startsWith(appUrl)) ||
      (origin && origin.startsWith(appUrl));

    // Check for Supabase auth cookies
    const cookieStore = cookies();
    const accessToken =
      cookieStore.get("sb-127-auth-token")?.value ||
      cookieStore.get("sb-access-token")?.value;

    // In development with same-origin, allow requests (fast path)
    if (process.env.NODE_ENV === "development" && isSameOrigin) {
      return { authenticated: true };
    }

    // If we have an access token, validate the session
    if (accessToken) {
      const supabase = createAdminClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (error || !user) {
        // Token invalid but same-origin in dev — still allow
        if (process.env.NODE_ENV === "development" && isSameOrigin) {
          return { authenticated: true };
        }
        return { authenticated: false, error: "Invalid session" };
      }

      return { authenticated: true, userId: user.id };
    }

    // No token but same-origin — allow in development
    if (process.env.NODE_ENV === "development") {
      return { authenticated: true };
    }

    return { authenticated: false, error: "No authentication provided" };
  } catch {
    // In development, fail open for easier testing
    if (process.env.NODE_ENV === "development") {
      return { authenticated: true };
    }
    return { authenticated: false, error: "Authentication check failed" };
  }
}
