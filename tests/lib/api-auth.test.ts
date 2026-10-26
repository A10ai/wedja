import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const cookieJar: { name: string; value: string }[] = [];
const getUser = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: () => cookieJar }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { getUser } }),
}));

import {
  extractAccessToken,
  readAuthCookieValue,
  requireAuth,
  authenticateRequest,
} from "@/lib/api-auth";

const COOKIE = "sb-abcdefgh-auth-token";
const req = () => new NextRequest("http://localhost/api/v1/tenants");

/** Encode a session the way @supabase/ssr 0.9 does: `base64-` + base64url. */
function ssrEncode(session: object): string {
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

/** A session whose base64url encoding is guaranteed to contain - or _. */
const session = {
  access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig_-?>>?",
  refresh_token: "r".repeat(40) + "?>?>~~",
  user: { id: "user-1", email: "owner@senzo.example" },
};

beforeEach(() => {
  cookieJar.length = 0;
  getUser.mockReset();
});

describe("api-auth: extractAccessToken", () => {
  test("returns a raw JWT unchanged", () => {
    expect(extractAccessToken("eyJ.abc.def")).toBe("eyJ.abc.def");
  });

  test("reads access_token from a JSON session", () => {
    expect(extractAccessToken(JSON.stringify(session))).toBe(session.access_token);
  });

  test("decodes @supabase/ssr base64url cookies (with - and _)", () => {
    const encoded = ssrEncode(session);
    expect(encoded).toMatch(/[-_]/);
    expect(extractAccessToken(encoded)).toBe(session.access_token);
  });

  test("decodes standard padded base64 cookies too", () => {
    const encoded = "base64-" + Buffer.from(JSON.stringify({ access_token: "tok" })).toString("base64");
    expect(extractAccessToken(encoded)).toBe("tok");
  });

  test("handles non-ASCII (UTF-8) session content", () => {
    const encoded = ssrEncode({ access_token: "tok", user: { name: "محمد" } });
    expect(extractAccessToken(encoded)).toBe("tok");
  });

  test("supports the legacy array session format", () => {
    expect(extractAccessToken(JSON.stringify(["acc", "ref"]))).toBe("acc");
  });

  test("returns null for JSON without an access token", () => {
    expect(extractAccessToken(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(extractAccessToken("null")).toBeNull();
  });

  test("returns null for an undecodable base64 cookie instead of sending it as a token", () => {
    expect(extractAccessToken("base64-***not base64***")).toBeNull();
  });

  test("returns null for an empty value", () => {
    expect(extractAccessToken("")).toBeNull();
  });
});

describe("api-auth: readAuthCookieValue", () => {
  test("returns null when no supabase auth cookie exists", () => {
    expect(readAuthCookieValue([{ name: "theme", value: "dark" }])).toBeNull();
  });

  test("returns a single unchunked cookie", () => {
    expect(readAuthCookieValue([{ name: COOKIE, value: "v" }])).toBe("v");
  });

  test("ignores the PKCE code-verifier cookie", () => {
    expect(
      readAuthCookieValue([{ name: `${COOKIE}-code-verifier`, value: "verifier" }])
    ).toBeNull();
    expect(
      readAuthCookieValue([
        { name: `${COOKIE}-code-verifier`, value: "verifier" },
        { name: COOKIE, value: "real" },
      ])
    ).toBe("real");
  });

  test("reassembles chunked cookies in index order", () => {
    expect(
      readAuthCookieValue([
        { name: `${COOKIE}.2`, value: "C" },
        { name: `${COOKIE}.0`, value: "A" },
        { name: `${COOKIE}.1`, value: "B" },
      ])
    ).toBe("ABC");
  });

  test("sorts chunk indexes numerically (.10 after .9)", () => {
    const chunks = Array.from({ length: 11 }, (_, i) => ({ name: `${COOKIE}.${i}`, value: String.fromCharCode(65 + i) }));
    expect(readAuthCookieValue(chunks.reverse())).toBe("ABCDEFGHIJK");
  });

  test("rejects an incomplete chunk set", () => {
    expect(
      readAuthCookieValue([
        { name: `${COOKIE}.0`, value: "A" },
        { name: `${COOKIE}.2`, value: "C" },
      ])
    ).toBeNull();
  });

  test("accepts the sb. prefix variant", () => {
    expect(readAuthCookieValue([{ name: "sb.ref-auth-token", value: "x" }])).toBe("x");
  });

  test("chunked base64url session round-trips to the access token", () => {
    const encoded = ssrEncode({ ...session, padding: "p".repeat(5000) });
    const half = Math.floor(encoded.length / 2);
    const value = readAuthCookieValue([
      { name: `${COOKIE}.0`, value: encoded.slice(0, half) },
      { name: `${COOKIE}.1`, value: encoded.slice(half) },
    ]);
    expect(extractAccessToken(value!)).toBe(session.access_token);
  });
});

describe("api-auth: requireAuth", () => {
  test("401 without any cookie and never calls Supabase", async () => {
    const res = await requireAuth(req());
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  test("returns the user for a valid ssr-encoded cookie", async () => {
    cookieJar.push({ name: COOKIE, value: ssrEncode(session) });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const res = await requireAuth(req());
    expect(res).toEqual({ id: "user-1" });
    expect(getUser).toHaveBeenCalledWith(session.access_token);
  });

  test("returns the user for a chunked session cookie", async () => {
    const encoded = ssrEncode(session);
    cookieJar.push({ name: `${COOKIE}.1`, value: encoded.slice(20) });
    cookieJar.push({ name: `${COOKIE}.0`, value: encoded.slice(0, 20) });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const res = await requireAuth(req());
    expect(res).toEqual({ id: "user-1" });
    expect(getUser).toHaveBeenCalledWith(session.access_token);
  });

  test("401 when Supabase rejects the token", async () => {
    cookieJar.push({ name: COOKIE, value: "bad.jwt" });
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } });
    const res = await requireAuth(req());
    expect((res as NextResponse).status).toBe(401);
  });

  test("401 (not 500) when Supabase throws", async () => {
    cookieJar.push({ name: COOKIE, value: "jwt" });
    getUser.mockRejectedValue(new Error("network down"));
    const res = await requireAuth(req());
    expect((res as NextResponse).status).toBe(401);
  });

  test("401 when the cookie decodes to a session without a token", async () => {
    cookieJar.push({ name: COOKIE, value: ssrEncode({ refresh_token: "only" }) });
    const res = await requireAuth(req());
    expect((res as NextResponse).status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  test("authenticateRequest maps to the legacy shape", async () => {
    expect(await authenticateRequest(req())).toEqual({ authenticated: false, error: "Unauthorized" });
    cookieJar.push({ name: COOKIE, value: "jwt" });
    getUser.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    expect(await authenticateRequest(req())).toEqual({ authenticated: true, userId: "u9" });
  });
});
