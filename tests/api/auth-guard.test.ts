// @vitest-environment node
/**
 * Contract test: every API route handler (except login) must reject
 * unauthenticated requests with 401 BEFORE touching the database.
 */
import { describe, test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("database accessed before auth check");
  },
}));

const API_DIR = path.resolve(__dirname, "../../src/app/api");

function findRoutes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return findRoutes(full);
    return e.name === "route.ts" ? [full] : [];
  });
}

const routes = Object.fromEntries(
  findRoutes(API_DIR).map((f) => [f, () => import(f) as Promise<Record<string, unknown>>])
);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const PUBLIC_ROUTES = ["/api/v1/auth/login"];

function routePath(file: string) {
  return "/api" + path.relative(API_DIR, path.dirname(file)).split(path.sep).map((p) => "/" + p).join("");
}

describe("API auth guard", () => {
  test("discovers all API routes", () => {
    expect(Object.keys(routes).length).toBeGreaterThanOrEqual(38);
  });

  for (const [file, load] of Object.entries(routes)) {
    const path = routePath(file);
    if (PUBLIC_ROUTES.includes(path)) continue;

    test(`${path} rejects anonymous requests on every method`, async () => {
      const mod = await load();
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length, `${path} exports no handlers`).toBeGreaterThan(0);

      for (const method of handlers) {
        const req = new NextRequest(`http://localhost${path}?id=x`, {
          method,
          ...(method === "GET" || method === "DELETE"
            ? {}
            : { body: JSON.stringify({}), headers: { "content-type": "application/json" } }),
        });
        const handler = mod[method] as (r: NextRequest, ctx?: unknown) => Promise<Response>;
        const res = await handler(req, { params: {} });
        expect(res.status, `${method} ${path}`).toBe(401);
        expect(await res.json(), `${method} ${path}`).toEqual({ error: "Unauthorized" });
      }
    });
  }
});
