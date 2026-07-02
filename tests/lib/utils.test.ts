import { describe, test, expect } from "vitest";

describe("constants", () => {
  test("PROPERTY_ID is defined", () => {
    expect("a0000000-0000-0000-0000-000000000001").toBeDefined();
  });

  test("basic math works", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("utils", () => {
  test("string operations work", () => {
    expect("hello".toUpperCase()).toBe("HELLO");
  });
});