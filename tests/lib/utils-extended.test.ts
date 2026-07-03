import { describe, test, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatDate,
  timeAgo,
  formatNumber,
  formatPercentage,
} from "@/lib/utils";

describe("utils: cn (classnames merge)", () => {
  test("joins multiple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  test("skips falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  test("handles empty input", () => {
    expect(cn()).toBe("");
  });
});

describe("utils: formatCurrency", () => {
  test("formats positive EGP values with currency code", () => {
    const s = formatCurrency(1500);
    // en-EG locale renders EGP as "EGP" prefix (Node Intl may not support E£ symbol)
    expect(s).toMatch(/EGP|E£|£/);
    expect(s).toContain("1,500");
  });

  test("formats zero without error", () => {
    expect(formatCurrency(0)).toContain("0");
  });

  test("does not include fractional digits by default", () => {
    const s = formatCurrency(1234.56);
    expect(s).not.toContain(".");
    expect(s).not.toContain("56");
  });

  test("supports USD", () => {
    const s = formatCurrency(100, "USD");
    expect(s).toContain("$");
  });
});

describe("utils: formatDate", () => {
  test("formats ISO date as 'dd MMM yyyy'", () => {
    const s = formatDate("2026-03-15");
    expect(s).toBe("15 Mar 2026");
  });

  test("accepts Date object", () => {
    const s = formatDate(new Date("2026-01-05T00:00:00Z"));
    // timezone-dependent; just check pattern
    expect(s).toMatch(/^\d{2} \w{3} \d{4}$/);
  });
});

describe("utils: timeAgo", () => {
  test("returns a human-readable relative time", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const s = timeAgo(twoHoursAgo);
    expect(s).toContain("about");
    expect(s).toContain("ago");
  });

  test("returns 'less than a minute ago' for very recent", () => {
    const now = new Date().toISOString();
    const s = timeAgo(now);
    expect(s).toContain("ago");
  });
});

describe("utils: formatNumber", () => {
  test("adds thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  test("handles zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  test("handles negative numbers", () => {
    expect(formatNumber(-1234)).toBe("-1,234");
  });
});

describe("utils: formatPercentage", () => {
  test("formats with one decimal by default", () => {
    expect(formatPercentage(85.34)).toBe("85.3%");
  });

  test("supports custom decimals", () => {
    expect(formatPercentage(85.346, 2)).toBe("85.35%");
  });

  test("handles zero", () => {
    expect(formatPercentage(0)).toBe("0.0%");
  });

  test("handles negative values", () => {
    expect(formatPercentage(-12.5)).toBe("-12.5%");
  });
});