import { describe, test, expect } from "vitest";
import {
  parseCSV,
  parsePeriodMonth,
  parsePeriodYear,
  parseAmount,
  normalizeForMatch,
  createTenantMatcher,
} from "@/lib/import-utils";

describe("import-utils: parseCSV", () => {
  test("normalises headers to snake_case lowercase", () => {
    expect(parseCSV("Brand Name,Period Month\nAdidas,3")).toEqual([
      { brand_name: "Adidas", period_month: "3" },
    ]);
  });

  test("handles CRLF line endings (Excel / JDE exports)", () => {
    const rows = parseCSV("name,category\r\nAdidas,fashion\r\nKFC,food\r\n");
    expect(rows).toEqual([
      { name: "Adidas", category: "fashion" },
      { name: "KFC", category: "food" },
    ]);
    expect(rows[0].category).not.toContain("\r");
  });

  test("strips a UTF-8 BOM from the first header", () => {
    expect(Object.keys(parseCSV("﻿name,category\nA,b")[0])).toEqual(["name", "category"]);
  });

  test("keeps commas inside quoted fields and unescapes doubled quotes", () => {
    expect(parseCSV('name,notes\n"Spinneys, Hypermarket","He said ""hi"""')).toEqual([
      { name: "Spinneys, Hypermarket", notes: 'He said "hi"' },
    ]);
  });

  test("skips blank lines and rows with the wrong column count", () => {
    expect(parseCSV("a,b\n1,2\n\n3\n4,5,6\n7,8")).toEqual([
      { a: "1", b: "2" },
      { a: "7", b: "8" },
    ]);
  });

  test("returns [] for header-only or empty input", () => {
    expect(parseCSV("a,b")).toEqual([]);
    expect(parseCSV("")).toEqual([]);
  });

  test("preserves empty fields", () => {
    expect(parseCSV("a,b,c\n1,,3")).toEqual([{ a: "1", b: "", c: "3" }]);
  });
});

describe("import-utils: period parsing", () => {
  test.each([
    ["1", 1],
    ["12", 12],
    [" 6 ", 6],
  ])("month %j → %j", (input, expected) => {
    expect(parsePeriodMonth(input)).toBe(expected);
  });

  test.each(["0", "13", "-1", "3.5", "march", "", undefined])("month %j is rejected", (input) => {
    expect(parsePeriodMonth(input)).toBeNull();
  });

  test("year accepts 2000–2100 only", () => {
    expect(parsePeriodYear("2026")).toBe(2026);
    expect(parsePeriodYear("26")).toBeNull();
    expect(parsePeriodYear("1999")).toBeNull();
    expect(parsePeriodYear("2101")).toBeNull();
    expect(parsePeriodYear("abc")).toBeNull();
    expect(parsePeriodYear(undefined)).toBeNull();
  });
});

describe("import-utils: parseAmount", () => {
  test("parses thousands separators", () => {
    expect(parseAmount("1,250,000.50")).toBe(1250000.5);
  });

  test("zero is a valid amount", () => {
    expect(parseAmount("0")).toBe(0);
  });

  test.each(["", "  ", "abc", "-100", "Infinity", "1e400", undefined])("%j is rejected", (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  test("never returns NaN", () => {
    for (const v of ["NaN", "12abc", "--1", "1.2.3"]) {
      expect(parseAmount(v)).toBeNull();
    }
  });
});

describe("import-utils: tenant matcher (JDE customer → tenant)", () => {
  const tenants = [
    { id: "t-adidas", brand_name: "Adidas", name: "Adidas Egypt" },
    { id: "t-hm", brand_name: "H&M", name: "H&M" },
    { id: "t-kfc", brand_name: "KFC", name: "Americana KFC" },
    { id: "t-lcw", brand_name: "LC Waikiki", name: "LC Waikiki" },
    { id: "t-spinneys", brand_name: "Spinneys", name: "Spinneys Hypermarket" },
    { id: "t-nobrand", brand_name: null, name: "Kidzo Park" },
  ];
  const find = createTenantMatcher(tenants);

  test("normalizeForMatch strips punctuation, spaces and case", () => {
    expect(normalizeForMatch("H & M (Senzo)")).toBe("hmsenzo");
  });

  test("exact normalised matches win", () => {
    expect(find("ADIDAS")?.id).toBe("t-adidas");
    expect(find("h&m")?.id).toBe("t-hm");
    expect(find("K.F.C.")?.id).toBe("t-kfc");
  });

  test("falls back to name when brand_name is null", () => {
    expect(find("Kidzo Park")?.id).toBe("t-nobrand");
  });

  test("JDE names containing a tenant key match", () => {
    expect(find("Spinneys Egypt for Trading SAE")?.id).toBe("t-spinneys");
    expect(find("LC Waikiki Retail")?.id).toBe("t-lcw");
  });

  test("short keys never match by substring (H&M vs 'Mohammed Ahmed')", () => {
    expect(find("Mohammed Ahmed Trading")).toBeNull();
    expect(find("Ashmawy Pharmacy")).toBeNull();
  });

  test("short keys never match by substring (KFC vs 'XKFCY Ltd')", () => {
    expect(find("Bakfco Supplies")).toBeNull();
  });

  test("unrelated customers do not match", () => {
    expect(find("Vodafone Egypt")).toBeNull();
    expect(find("")).toBeNull();
    expect(find("***")).toBeNull();
  });

  test("the longest matching key wins", () => {
    const m = createTenantMatcher([
      { id: "short", brand_name: "Adidas", name: null },
      { id: "long", brand_name: "Adidas Kids", name: null },
    ]);
    expect(m("Adidas Kids Senzo")?.id).toBe("long");
    expect(m("Adidas Originals")?.id).toBe("short");
  });

  test("shared 4-char prefix is the last resort", () => {
    expect(find("Spinney's Market")?.id).toBe("t-spinneys");
  });

  test("returns brand_name for reporting", () => {
    expect(find("adidas")).toEqual({ id: "t-adidas", brand_name: "Adidas" });
  });
});
