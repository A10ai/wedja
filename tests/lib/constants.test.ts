import { describe, test, expect } from "vitest";
import {
  APP_NAME,
  APP_TAGLINE,
  DEFAULT_PROPERTY,
  DEFAULT_CURRENCY,
  SIDEBAR_NAV,
  type NavItem,
  type NavGroup,
} from "@/lib/constants";

describe("constants: app metadata", () => {
  test("APP_NAME is a non-empty string", () => {
    expect(APP_NAME).toBeTruthy();
    expect(typeof APP_NAME).toBe("string");
  });

  test("APP_TAGLINE is the expected marketing phrase", () => {
    expect(APP_TAGLINE).toBe("The AI that runs your property");
  });

  test("DEFAULT_PROPERTY references Senzo Mall Hurghada", () => {
    expect(DEFAULT_PROPERTY).toContain("Senzo");
    expect(DEFAULT_PROPERTY).toContain("Hurghada");
  });

  test("DEFAULT_CURRENCY is EGP", () => {
    expect(DEFAULT_CURRENCY).toBe("EGP");
  });
});

describe("constants: SIDEBAR_NAV structure", () => {
  test("is an array of NavGroup objects", () => {
    expect(Array.isArray(SIDEBAR_NAV)).toBe(true);
    expect(SIDEBAR_NAV.length).toBeGreaterThan(0);
    for (const group of SIDEBAR_NAV) {
      expect(group).toHaveProperty("label");
      expect(group).toHaveProperty("items");
      expect(Array.isArray(group.items)).toBe(true);
    }
  });

  test("every NavItem has label, href, and icon", () => {
    for (const group of SIDEBAR_NAV) {
      for (const item of group.items) {
        expect(item.label).toBeTruthy();
        expect(item.href).toMatch(/^\//);
        expect(item.icon).toBeDefined();
      }
    }
  });

  test("all hrefs are unique", () => {
    const hrefs = SIDEBAR_NAV.flatMap((g) => g.items.map((i) => i.href));
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  test("contains the expected top-level groups", () => {
    const labels = SIDEBAR_NAV.map((g) => g.label);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Revenue");
    expect(labels).toContain("Operations");
    expect(labels).toContain("Business");
  });

  test("Revenue group contains Revenue, Discrepancies, Tenant Analytics", () => {
    const revenueGroup = SIDEBAR_NAV.find((g) => g.label === "Revenue");
    expect(revenueGroup).toBeDefined();
    const hrefs = revenueGroup!.items.map((i) => i.href);
    expect(hrefs).toContain("/dashboard/revenue");
    expect(hrefs).toContain("/dashboard/discrepancies");
    expect(hrefs).toContain("/dashboard/tenant-analytics");
  });

  test("Operations group includes Energy and Maintenance items", () => {
    const ops = SIDEBAR_NAV.find((g) => g.label === "Operations");
    const hrefs = ops!.items.map((i) => i.href);
    expect(hrefs).toContain("/dashboard/energy");
    expect(hrefs).toContain("/dashboard/maintenance");
  });

  test("NavItem and NavGroup types are exported (compile-time check)", () => {
    const item: NavItem = { label: "x", href: "/x", icon: APP_NAME as any };
    const group: NavGroup = { label: "g", items: [item] };
    expect(group.items).toHaveLength(1);
  });
});