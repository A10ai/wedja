import { describe, test, expect } from "vitest";
import { createMockSupabase } from "./helpers/supabase-mock";
import {
  trainFootfallModel,
  trainRevenueModel,
  forecastFootfall,
  forecastRevenue,
  getModelPerformance,
} from "@/lib/prediction-model";

const PROP = "a0000000-0000-0000-0000-000000000001";

describe("prediction-model: trainFootfallModel", () => {
  test("throws when no footfall data available", async () => {
    const sb = createMockSupabase({ footfall_daily: [] });
    await expect(trainFootfallModel(sb, PROP)).rejects.toThrow(/No footfall data/);
  });

  test("returns TrainedModel with required fields", async () => {
    const sb = createMockSupabase({
      footfall_daily: [
        { date: "2026-01-01", total_in: 1000, zone_id: "z1" },
        { date: "2026-01-02", total_in: 1100, zone_id: "z1" },
        { date: "2026-01-03", total_in: 1200, zone_id: "z1" },
        { date: "2026-01-04", total_in: 1050, zone_id: "z1" },
        { date: "2026-01-05", total_in: 1300, zone_id: "z1" },
        { date: "2026-01-06", total_in: 1400, zone_id: "z1" },
        { date: "2026-01-07", total_in: 1500, zone_id: "z1" },
        { date: "2026-01-08", total_in: 1250, zone_id: "z1" },
      ],
    });
    const m = await trainFootfallModel(sb, PROP);
    expect(m.model_type).toBe("footfall");
    expect(m).toHaveProperty("trend_slope");
    expect(m).toHaveProperty("trend_intercept");
    expect(m).toHaveProperty("dow_coefficients");
    expect(m).toHaveProperty("residual_std");
    expect(m).toHaveProperty("training_samples");
    expect(m).toHaveProperty("accuracy_mae");
    expect(m).toHaveProperty("accuracy_mape");
    expect(m).toHaveProperty("r_squared");
    expect(m.training_samples).toBe(8);
    expect(m.dow_coefficients).toHaveLength(7);
  });

  test("r_squared is in [0,1]", async () => {
    const sb = createMockSupabase({
      footfall_daily: Array.from({ length: 14 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        total_in: 1000 + i * 50,
        zone_id: "z1",
      })),
    });
    const m = await trainFootfallModel(sb, PROP);
    expect(m.r_squared).toBeGreaterThanOrEqual(0);
    expect(m.r_squared).toBeLessThanOrEqual(1);
  });
});

describe("prediction-model: trainRevenueModel", () => {
  test("throws when no revenue data available", async () => {
    const sb = createMockSupabase({ rent_transactions: [] });
    await expect(trainRevenueModel(sb, PROP)).rejects.toThrow(/No revenue data/);
  });

  test("throws when fewer than 3 months of data", async () => {
    const sb = createMockSupabase({
      rent_transactions: [
        { period_month: 1, period_year: 2026, amount_paid: 100000, status: "paid", lease_id: "l1" },
      ],
    });
    await expect(trainRevenueModel(sb, PROP)).rejects.toThrow(/Insufficient monthly data/);
  });

  test("returns TrainedModel with 12 monthly coefficients", async () => {
    const sb = createMockSupabase({
      rent_transactions: [
        { period_month: 1, period_year: 2026, amount_paid: 100000, status: "paid", lease_id: "l1" },
        { period_month: 2, period_year: 2026, amount_paid: 110000, status: "paid", lease_id: "l1" },
        { period_month: 3, period_year: 2026, amount_paid: 120000, status: "paid", lease_id: "l1" },
        { period_month: 4, period_year: 2026, amount_paid: 130000, status: "paid", lease_id: "l1" },
      ],
    });
    const m = await trainRevenueModel(sb, PROP);
    expect(m.model_type).toBe("revenue");
    expect(m.dow_coefficients).toHaveLength(12); // 12 monthly seasonality
    expect(m.training_samples).toBe(4);
  });
});

describe("prediction-model: forecastFootfall", () => {
  test("returns ForecastResult with predictions array of length=days", async () => {
    const sb = createMockSupabase({
      footfall_daily: Array.from({ length: 14 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        total_in: 1000 + i * 30,
        zone_id: "z1",
      })),
    });
    const r = await forecastFootfall(sb, 5, PROP);
    expect(r).toHaveProperty("model");
    expect(r).toHaveProperty("predictions");
    expect(r.predictions).toHaveLength(5);
    for (const p of r.predictions) {
      expect(p).toHaveProperty("date");
      expect(p).toHaveProperty("predicted_value");
      expect(p).toHaveProperty("confidence_low");
      expect(p).toHaveProperty("confidence_high");
      expect(p).toHaveProperty("factors");
      expect(p.confidence_low).toBeLessThanOrEqual(p.predicted_value);
      expect(p.predicted_value).toBeLessThanOrEqual(p.confidence_high);
    }
  });
});

describe("prediction-model: forecastRevenue", () => {
  test("returns ForecastResult with predictions for N months", async () => {
    const sb = createMockSupabase({
      rent_transactions: [
        { period_month: 1, period_year: 2026, amount_paid: 100000, status: "paid", lease_id: "l1" },
        { period_month: 2, period_year: 2026, amount_paid: 110000, status: "paid", lease_id: "l1" },
        { period_month: 3, period_year: 2026, amount_paid: 120000, status: "paid", lease_id: "l1" },
        { period_month: 4, period_year: 2026, amount_paid: 130000, status: "paid", lease_id: "l1" },
      ],
    });
    const r = await forecastRevenue(sb, 3, PROP);
    expect(r.predictions).toHaveLength(3);
    for (const p of r.predictions) {
      expect(p.confidence_low).toBeLessThanOrEqual(p.predicted_value);
      expect(p.predicted_value).toBeLessThanOrEqual(p.confidence_high);
    }
  });
});

describe("prediction-model: getModelPerformance", () => {
  test("returns ModelPerformance with footfall and revenue backtest results", async () => {
    const sb = createMockSupabase({
      footfall_daily: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        total_in: 1000 + i * 10,
        zone_id: "z1",
      })),
      rent_transactions: Array.from({ length: 6 }, (_, i) => ({
        period_month: i + 1,
        period_year: 2026,
        amount_paid: 100000 + i * 5000,
        status: "paid",
        lease_id: "l1",
      })),
    });
    const r = await getModelPerformance(sb, PROP);
    expect(r).toHaveProperty("footfall");
    expect(r).toHaveProperty("revenue");
    expect(r.footfall).toHaveProperty("mae");
    expect(r.footfall).toHaveProperty("r_squared");
    expect(r.revenue).toHaveProperty("mae");
  });
});