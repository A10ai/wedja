import { test, expect } from "@playwright/test";

test("login page loads and shows login form", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Custis|Wedja/i);
  await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10_000 });
});

test("unauthenticated dashboard redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("404 page renders for unknown routes", async ({ page }) => {
  const response = await page.goto("/nonexistent-route-12345");
  expect(response?.status()).toBe(404);
});

test("API routes return 401 without auth", async ({ request }) => {
  const response = await request.get("/api/v1/dashboard/stats");
  expect(response.status()).toBe(401);
});

test("API routes return 401 without auth (tenants)", async ({ request }) => {
  const response = await request.get("/api/v1/tenants");
  expect(response.status()).toBe(401);
});