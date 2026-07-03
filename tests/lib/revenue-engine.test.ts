import { describe, test, expect } from "vitest";
import {
  CATEGORY_MODELS,
  estimateRevenue,
  type RevenueEstimate,
} from "@/lib/revenue-engine";

describe("revenue-engine: CATEGORY_MODELS", () => {
  test("exports all six retail categories", () => {
    const keys = Object.keys(CATEGORY_MODELS);
    expect(keys).toContain("fashion");
    expect(keys).toContain("food");
    expect(keys).toContain("entertainment");
    expect(keys).toContain("grocery");
    expect(keys).toContain("services");
    expect(keys).toContain("electronics");
    expect(keys).toHaveLength(6);
  });

  test("each category has conversion [low,high] in (0,1]", () => {
    for (const [name, model] of Object.entries(CATEGORY_MODELS)) {
      const [low, high] = model.conversion;
      expect(low, `${name} conversion low`).toBeGreaterThan(0);
      expect(high, `${name} conversion high`).toBeGreaterThan(0);
      expect(low, `${name} conversion low<=high`).toBeLessThanOrEqual(high);
      expect(high, `${name} conversion high<=1`).toBeLessThanOrEqual(1);
    }
  });

  test("each category has avg_ticket [low,high] positive", () => {
    for (const [name, model] of Object.entries(CATEGORY_MODELS)) {
      const [low, high] = model.avg_ticket;
      expect(low, `${name} ticket low>0`).toBeGreaterThan(0);
      expect(high, `${name} ticket high>=low`).toBeGreaterThanOrEqual(low);
    }
  });

  test("food has higher conversion than fashion (industry benchmark)", () => {
    expect(CATEGORY_MODELS.food.conversion[0]).toBeGreaterThan(
      CATEGORY_MODELS.fashion.conversion[0]
    );
  });

  test("grocery has the highest low-bound conversion", () => {
    const groceryLow = CATEGORY_MODELS.grocery.conversion[0];
    for (const model of Object.values(CATEGORY_MODELS)) {
      expect(groceryLow).toBeGreaterThanOrEqual(model.conversion[0]);
    }
  });
});

describe("revenue-engine: estimateRevenue", () => {
  test("returns a RevenueEstimate with all required fields", () => {
    const result = estimateRevenue(1000, "fashion");
    expect(result).toHaveProperty("low_egp");
    expect(result).toHaveProperty("mid_egp");
    expect(result).toHaveProperty("high_egp");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("methodology");
    expect(typeof result.confidence).toBe("number");
  });

  test("low <= mid <= high for fashion category", () => {
    const r = estimateRevenue(5000, "fashion", 30);
    expect(r.low_egp).toBeLessThanOrEqual(r.mid_egp);
    expect(r.mid_egp).toBeLessThanOrEqual(r.high_egp);
  });

  test("mid estimate equals footfall * geomMeanConv * geomMeanTicket (rounded)", () => {
    const footfall = 10000;
    const [convLow, convHigh] = CATEGORY_MODELS.fashion.conversion;
    const [tickLow, tickHigh] = CATEGORY_MODELS.fashion.avg_ticket;
    const convMid = Math.sqrt(convLow * convHigh);
    const tickMid = Math.sqrt(tickLow * tickHigh);
    const expected = Math.round(footfall * convMid * tickMid);

    const r = estimateRevenue(footfall, "fashion", 30);
    expect(r.mid_egp).toBe(expected);
  });

  test("low estimate equals footfall * convLow * tickLow", () => {
    const footfall = 2000;
    const [convLow] = CATEGORY_MODELS.food.conversion;
    const [tickLow] = CATEGORY_MODELS.food.avg_ticket;
    const expected = Math.round(footfall * convLow * tickLow);
    expect(estimateRevenue(footfall, "food", 30).low_egp).toBe(expected);
  });

  test("high estimate equals footfall * convHigh * tickHigh", () => {
    const footfall = 2000;
    const [, convHigh] = CATEGORY_MODELS.food.conversion;
    const [, tickHigh] = CATEGORY_MODELS.food.avg_ticket;
    const expected = Math.round(footfall * convHigh * tickHigh);
    expect(estimateRevenue(footfall, "food", 30).high_egp).toBe(expected);
  });

  test("falls back to services model for unknown category", () => {
    const r = estimateRevenue(1000, "nonexistent_category", 30);
    const services = estimateRevenue(1000, "services", 30);
    expect(r.low_egp).toBe(services.low_egp);
    expect(r.mid_egp).toBe(services.mid_egp);
    expect(r.methodology).toContain("fallback");
  });

  test("methodology string includes footfall, model version, and category info", () => {
    const r = estimateRevenue(12345, "grocery", 30);
    expect(r.methodology).toContain("grocery");
    expect(r.methodology).toContain("12,345 visitors");
    expect(r.methodology).toContain("Model version");
  });

  test("confidence is in range [0,1] and capped at 0.98", () => {
    // Best case: known category, many days, high footfall
    const r = estimateRevenue(100000, "grocery", 30);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(0.98);
  });

  test("confidence increases with footfall volume", () => {
    const lowFootfall = estimateRevenue(100, "fashion", 30).confidence;
    const highFootfall = estimateRevenue(10000, "fashion", 30).confidence;
    expect(highFootfall).toBeGreaterThan(lowFootfall);
  });

  test("confidence increases with data coverage (days)", () => {
    const week = estimateRevenue(2000, "fashion", 7).confidence;
    const month = estimateRevenue(2000, "fashion", 30).confidence;
    expect(month).toBeGreaterThan(week);
  });

  test("zero footfall produces zero estimates", () => {
    const r = estimateRevenue(0, "fashion", 30);
    expect(r.low_egp).toBe(0);
    expect(r.mid_egp).toBe(0);
    expect(r.high_egp).toBe(0);
  });

  test("uses learned conversion rate when source is 'learned'", () => {
    const learned = { rate: 0.5, confidence: 80, source: "learned" as const };
    const r = estimateRevenue(10000, "fashion", 30, learned);
    const tickMid = Math.sqrt(
      CATEGORY_MODELS.fashion.avg_ticket[0] * CATEGORY_MODELS.fashion.avg_ticket[1]
    );
    const expectedMid = Math.round(10000 * 0.5 * tickMid);
    expect(r.mid_egp).toBe(expectedMid);
    expect(r.methodology).toContain("Learned conversion");
    expect(r.methodology).toContain("AI learned");
  });

  test("does NOT use learned rate when source is 'default'", () => {
    const defaultRate = { rate: 0.99, confidence: 10, source: "default" as const };
    const r = estimateRevenue(10000, "fashion", 30, defaultRate);
    // mid should NOT use 0.99 — should use geometric mean of category bounds
    const [convLow, convHigh] = CATEGORY_MODELS.fashion.conversion;
    const expectedMid = Math.round(
      10000 * Math.sqrt(convLow * convHigh) * Math.sqrt(300 * 800)
    );
    expect(r.mid_egp).toBe(expectedMid);
    expect(r.methodology).toContain("category default");
  });

  test("learned rate boosts confidence vs default", () => {
    const learned = { rate: 0.3, confidence: 80, source: "learned" as const };
    const rLearned = estimateRevenue(2000, "fashion", 30, learned);
    const rDefault = estimateRevenue(2000, "fashion", 30);
    expect(rLearned.confidence).toBeGreaterThan(rDefault.confidence);
  });

  test("low/high estimates ignore learned rate (use category bounds)", () => {
    const learned = { rate: 0.5, confidence: 80, source: "learned" as const };
    const r = estimateRevenue(10000, "fashion", 30, learned);
    const [convLow, convHigh] = CATEGORY_MODELS.fashion.conversion;
    const [tickLow, tickHigh] = CATEGORY_MODELS.fashion.avg_ticket;
    expect(r.low_egp).toBe(Math.round(10000 * convLow * tickLow));
    expect(r.high_egp).toBe(Math.round(10000 * convHigh * tickHigh));
  });
});