import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock "server-only" so importing validation.ts doesn't throw.
vi.mock("server-only", () => ({}));

import {
  validateBody,
  validateQuery,
  formatZodErrors,
  updatePropertySchema,
  createZoneSchema,
  createUnitSchema,
  createTenantSchema,
  createLeaseSchema,
  createRentTransactionSchema,
  percentageRentQuerySchema,
  revenueVerificationActionSchema,
  discrepanciesQuerySchema,
  updateDiscrepancySchema,
  anomaliesQuerySchema,
  anomalyActionSchema,
  footfallQuerySchema,
  manualFootfallSchema,
  heatmapQuerySchema,
  createCameraSchema,
  cctvQuerySchema,
  createMaintenanceSchema,
  updateMaintenanceStatusSchema,
  energyQuerySchema,
  contractsQuerySchema,
  financeQuerySchema,
  createExpenseSchema,
  reportsQuerySchema,
  auditQuerySchema,
  notificationsQuerySchema,
  notificationActionSchema,
  communicationsQuerySchema,
  createCommunicationSchema,
  marketingQuerySchema,
  createEventSchema,
  createCampaignSchema,
  createPromotionSchema,
  socialQuerySchema,
  createSocialPostSchema,
  createContentCalendarSchema,
  eventsQuerySchema,
  createEventDirectSchema,
  updateEventSchema,
  tenantAnalyticsQuerySchema,
  importTypeSchema,
  aiBrainActionSchema,
  aiInsightsQuerySchema,
  aiChatSchema,
  predictionsQuerySchema,
  predictionActionSchema,
  schedulerActionSchema,
  automationActionSchema,
  aiEventsQuerySchema,
  aiEventSchema,
  learningActionSchema,
} from "@/lib/validation";

// Zod v4 enforces RFC 4122 UUID format (version digit + variant digit).
// a0000000-0000-4000-8000-... is a valid v4 UUID.
const UUID = "a0000000-0000-4000-8000-000000000001";

describe("validation: validateBody / validateQuery helpers", () => {
  test("validateBody returns success:true with parsed data for valid input", () => {
    const r = validateBody(createZoneSchema, {
      name: "Zone A",
      floor: 1,
      type: "retail",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Zone A");
  });

  test("validateBody returns success:false with ZodError for invalid input", () => {
    const r = validateBody(createZoneSchema, { name: "", floor: 1, type: "retail" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBeDefined();
      expect(r.error.issues.length).toBeGreaterThan(0);
    }
  });

  test("validateQuery converts URLSearchParams and validates", () => {
    const params = new URLSearchParams();
    params.set("type", "overview");
    params.set("month", "6");
    params.set("year", "2026");
    const r = validateQuery(percentageRentQuerySchema, params);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe("overview");
      expect(r.data.month).toBe(6);
      expect(r.data.year).toBe(2026);
    }
  });

  test("validateQuery fails for unknown key when strict()", () => {
    const params = new URLSearchParams();
    params.set("bogus", "x");
    const r = validateQuery(percentageRentQuerySchema, params);
    expect(r.success).toBe(false);
  });

  test("formatZodErrors returns 'path: message' joined by '; '", () => {
    const r = validateBody(createZoneSchema, { name: "", floor: 1, type: "retail" });
    if (!r.success) {
      const s = formatZodErrors(r.error);
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
      expect(s).toContain(":");
    }
  });
});

describe("validation: property schemas", () => {
  test("updatePropertySchema requires a uuid id", () => {
    expect(
      validateBody(updatePropertySchema, { id: UUID, name: "Senzo" }).success
    ).toBe(true);
    expect(validateBody(updatePropertySchema, { id: "not-uuid", name: "X" }).success).toBe(false);
  });

  test("updatePropertySchema rejects unknown keys (strict)", () => {
    expect(
      validateBody(updatePropertySchema, { id: UUID, bogus: 1 }).success
    ).toBe(false);
  });
});

describe("validation: zone & unit schemas", () => {
  test("createZoneSchema accepts valid retail zone", () => {
    expect(
      validateBody(createZoneSchema, { name: "Food Court", floor: 2, type: "food" }).success
    ).toBe(true);
  });

  test("createZoneSchema rejects invalid zone type", () => {
    expect(
      validateBody(createZoneSchema, { name: "X", floor: 1, type: "factory" }).success
    ).toBe(false);
  });

  test("createUnitSchema requires zone_id uuid and unit_number", () => {
    expect(
      validateBody(createUnitSchema, {
        zone_id: UUID,
        name: "Unit 1",
        unit_number: "U-001",
      }).success
    ).toBe(true);
    expect(
      validateBody(createUnitSchema, { name: "Unit 1", unit_number: "U-001" }).success
    ).toBe(false);
  });
});

describe("validation: tenant & lease schemas", () => {
  test("createTenantSchema requires category enum", () => {
    expect(
      validateBody(createTenantSchema, { name: "Adidas", category: "fashion" }).success
    ).toBe(true);
    expect(
      validateBody(createTenantSchema, { name: "X", category: "bogus" }).success
    ).toBe(false);
  });

  test("createLeaseSchema validates date format YYYY-MM-DD", () => {
    expect(
      validateBody(createLeaseSchema, {
        unit_id: UUID,
        tenant_id: UUID,
        start_date: "2026-01-01",
        end_date: "2027-01-01",
      }).success
    ).toBe(true);
    expect(
      validateBody(createLeaseSchema, {
        unit_id: UUID,
        tenant_id: UUID,
        start_date: "01/01/2026",
        end_date: "2027-01-01",
      }).success
    ).toBe(false);
  });
});

describe("validation: rent transactions", () => {
  test("createRentTransactionSchema requires lease_id, amount_due, valid month/year", () => {
    expect(
      validateBody(createRentTransactionSchema, {
        lease_id: UUID,
        period_month: 6,
        period_year: 2026,
        amount_due: 50000,
      }).success
    ).toBe(true);
  });

  test("rejects month > 12", () => {
    expect(
      validateBody(createRentTransactionSchema, {
        lease_id: UUID,
        period_month: 13,
        period_year: 2026,
        amount_due: 1,
      }).success
    ).toBe(false);
  });
});

describe("validation: query schemas with coerce", () => {
  test("percentageRentQuerySchema coerces string month to number", () => {
    const r = validateBody(percentageRentQuerySchema, { month: "3", year: "2026" });
    expect(r.success).toBe(true);
  });

  test("discrepanciesQuerySchema accepts status enum", () => {
    expect(
      validateBody(discrepanciesQuerySchema, { status: "flagged" }).success
    ).toBe(true);
    expect(
      validateBody(discrepanciesQuerySchema, { status: "bogus" }).success
    ).toBe(false);
  });

  test("updateDiscrepancySchema requires id and status", () => {
    expect(
      validateBody(updateDiscrepancySchema, { id: UUID, status: "resolved" }).success
    ).toBe(true);
    expect(
      validateBody(updateDiscrepancySchema, { id: UUID, status: "bogus" }).success
    ).toBe(false);
  });

  test("anomaliesQuerySchema accepts days in 1..365", () => {
    expect(validateBody(anomaliesQuerySchema, { days: 30 }).success).toBe(true);
    expect(validateBody(anomaliesQuerySchema, { days: 0 }).success).toBe(false);
    expect(validateBody(anomaliesQuerySchema, { days: 400 }).success).toBe(false);
  });

  test("anomalyActionSchema requires action enum", () => {
    expect(
      validateBody(anomalyActionSchema, { action: "run_detection" }).success
    ).toBe(true);
    expect(
      validateBody(anomalyActionSchema, { action: "bogus" }).success
    ).toBe(false);
  });
});

describe("validation: footfall & heatmap", () => {
  test("footfallQuerySchema accepts valid type and date", () => {
    expect(
      validateBody(footfallQuerySchema, { type: "overview", date: "2026-03-15" }).success
    ).toBe(true);
  });

  test("manualFootfallSchema requires unit_id OR zone_id (refine)", () => {
    expect(
      validateBody(manualFootfallSchema, { unit_id: UUID, count_in: 100 }).success
    ).toBe(true);
    expect(
      validateBody(manualFootfallSchema, { zone_id: UUID, count_in: 100 }).success
    ).toBe(true);
    expect(validateBody(manualFootfallSchema, { count_in: 100 }).success).toBe(false);
  });

  test("heatmapQuerySchema accepts type=live", () => {
    expect(validateBody(heatmapQuerySchema, { type: "live" }).success).toBe(true);
  });
});

describe("validation: cameras & cctv", () => {
  test("createCameraSchema requires name", () => {
    expect(
      validateBody(createCameraSchema, { name: "Cam 1", angle_type: "entrance" }).success
    ).toBe(true);
    expect(validateBody(createCameraSchema, { angle_type: "entrance" }).success).toBe(false);
  });

  test("cctvQuerySchema hours limited to 1..720", () => {
    expect(validateBody(cctvQuerySchema, { hours: 24 }).success).toBe(true);
    expect(validateBody(cctvQuerySchema, { hours: 0 }).success).toBe(false);
    expect(validateBody(cctvQuerySchema, { hours: 1000 }).success).toBe(false);
  });
});

describe("validation: maintenance", () => {
  test("createMaintenanceSchema requires title", () => {
    expect(
      validateBody(createMaintenanceSchema, {
        title: "Broken AC",
        category: "hvac",
        priority: "high",
      }).success
    ).toBe(true);
    expect(validateBody(createMaintenanceSchema, { category: "hvac" }).success).toBe(false);
  });

  test("updateMaintenanceStatusSchema requires action=update_status", () => {
    expect(
      validateBody(updateMaintenanceStatusSchema, {
        action: "update_status",
        id: UUID,
        status: "completed",
      }).success
    ).toBe(true);
  });
});

describe("validation: energy, contracts, finance", () => {
  test("energyQuerySchema accepts type", () => {
    expect(validateBody(energyQuerySchema, { type: "overview" }).success).toBe(true);
  });

  test("contractsQuerySchema within_days 1..3650", () => {
    expect(validateBody(contractsQuerySchema, { within_days: 180 }).success).toBe(true);
    expect(validateBody(contractsQuerySchema, { within_days: 0 }).success).toBe(false);
  });

  test("financeQuerySchema accepts type=overview", () => {
    expect(validateBody(financeQuerySchema, { type: "overview" }).success).toBe(true);
  });

  test("createExpenseSchema requires category, description, amount_egp", () => {
    expect(
      validateBody(createExpenseSchema, {
        category: "Utilities",
        description: "Electricity",
        amount_egp: 5000,
      }).success
    ).toBe(true);
    expect(
      validateBody(createExpenseSchema, { category: "X", description: "Y" }).success
    ).toBe(false);
  });
});

describe("validation: reports, audit, notifications", () => {
  test("reportsQuerySchema accepts valid type", () => {
    expect(
      validateBody(reportsQuerySchema, { type: "revenue_verification" }).success
    ).toBe(true);
  });

  test("auditQuerySchema limit 1..500", () => {
    expect(validateBody(auditQuerySchema, { limit: 50 }).success).toBe(true);
    expect(validateBody(auditQuerySchema, { limit: 0 }).success).toBe(false);
    expect(validateBody(auditQuerySchema, { limit: 600 }).success).toBe(false);
  });

  test("notificationsQuerySchema accepts unread=true", () => {
    expect(validateBody(notificationsQuerySchema, { unread: "true" }).success).toBe(true);
  });

  test("notificationActionSchema accepts action=mark_read with id", () => {
    expect(
      validateBody(notificationActionSchema, { action: "mark_read", id: UUID }).success
    ).toBe(true);
  });
});

describe("validation: communications & marketing", () => {
  test("createCommunicationSchema requires tenant_id, subject, body", () => {
    expect(
      validateBody(createCommunicationSchema, {
        tenant_id: UUID,
        subject: "Rent Due",
        body: "Please pay",
      }).success
    ).toBe(true);
  });

  test("marketingQuerySchema accepts type", () => {
    expect(validateBody(marketingQuerySchema, { type: "overview" }).success).toBe(true);
  });

  test("createEventSchema requires entity=event and key fields", () => {
    expect(
      validateBody(createEventSchema, {
        entity: "event",
        title: "Summer Sale",
        event_type: "sale",
        start_date: "2026-06-01",
        end_date: "2026-06-07",
      }).success
    ).toBe(true);
    expect(
      validateBody(createEventSchema, {
        title: "X",
        event_type: "sale",
        start_date: "2026-06-01",
        end_date: "2026-06-07",
      }).success
    ).toBe(false);
  });

  test("createCampaignSchema requires entity=campaign", () => {
    expect(
      validateBody(createCampaignSchema, {
        entity: "campaign",
        name: "Summer",
        campaign_type: "digital",
        start_date: "2026-06-01",
        end_date: "2026-06-30",
      }).success
    ).toBe(true);
  });

  test("createPromotionSchema requires entity=promotion and tenant_id", () => {
    expect(
      validateBody(createPromotionSchema, {
        entity: "promotion",
        tenant_id: UUID,
        title: "20% Off",
        start_date: "2026-06-01",
        end_date: "2026-06-07",
      }).success
    ).toBe(true);
  });
});

describe("validation: social & events", () => {
  test("createSocialPostSchema requires entity=post, platform, content_type", () => {
    expect(
      validateBody(createSocialPostSchema, {
        entity: "post",
        platform: "instagram",
        content_type: "image",
      }).success
    ).toBe(true);
  });

  test("createContentCalendarSchema requires date in YYYY-MM-DD", () => {
    expect(
      validateBody(createContentCalendarSchema, {
        entity: "calendar",
        date: "2026-06-01",
        platform: "instagram",
        content_type: "image",
        title: "Post",
      }).success
    ).toBe(true);
    expect(
      validateBody(createContentCalendarSchema, {
        entity: "calendar",
        date: "06/01/2026",
        platform: "instagram",
        content_type: "image",
        title: "Post",
      }).success
    ).toBe(false);
  });

  test("eventsQuerySchema accepts upcoming=true", () => {
    expect(validateBody(eventsQuerySchema, { upcoming: "true" }).success).toBe(true);
  });

  test("createEventDirectSchema requires title and dates", () => {
    expect(
      validateBody(createEventDirectSchema, {
        title: "Eid Festival",
        event_type: "festival",
        start_date: "2026-06-01",
        end_date: "2026-06-07",
      }).success
    ).toBe(true);
  });

  test("updateEventSchema requires id", () => {
    expect(
      validateBody(updateEventSchema, { id: UUID, title: "Updated" }).success
    ).toBe(true);
    expect(validateBody(updateEventSchema, { title: "Updated" }).success).toBe(false);
  });
});

describe("validation: tenant analytics, import, AI", () => {
  test("tenantAnalyticsQuerySchema accepts type=scorecard", () => {
    expect(
      validateBody(tenantAnalyticsQuerySchema, { type: "scorecard" }).success
    ).toBe(true);
  });

  test("importTypeSchema requires type enum", () => {
    expect(validateBody(importTypeSchema, { type: "tenants" }).success).toBe(true);
    expect(validateBody(importTypeSchema, { type: "bogus" }).success).toBe(false);
  });

  test("aiBrainActionSchema requires action enum", () => {
    expect(validateBody(aiBrainActionSchema, { action: "run_cycle" }).success).toBe(true);
  });

  test("aiChatSchema requires non-empty message", () => {
    expect(validateBody(aiChatSchema, { message: "hello" }).success).toBe(true);
    expect(validateBody(aiChatSchema, { message: "" }).success).toBe(false);
  });

  test("predictionsQuerySchema accepts type and days", () => {
    expect(validateBody(predictionsQuerySchema, { type: "footfall", days: 30 }).success).toBe(true);
  });

  test("predictionActionSchema requires action=train", () => {
    expect(validateBody(predictionActionSchema, { action: "train" }).success).toBe(true);
    expect(
      validateBody(predictionActionSchema, { action: "bogus" }).success
    ).toBe(false);
  });

  test("schedulerActionSchema interval 5..60", () => {
    expect(
      validateBody(schedulerActionSchema, { action: "set_interval", interval_minutes: 15 }).success
    ).toBe(true);
    expect(
      validateBody(schedulerActionSchema, { action: "set_interval", interval_minutes: 1 }).success
    ).toBe(false);
  });

  test("automationActionSchema requires action enum", () => {
    expect(validateBody(automationActionSchema, { action: "run_all" }).success).toBe(true);
  });

  test("aiEventsQuerySchema limit 1..500", () => {
    expect(validateBody(aiEventsQuerySchema, { limit: 50 }).success).toBe(true);
  });

  test("aiEventSchema requires type and source_system", () => {
    expect(
      validateBody(aiEventSchema, { type: "alert", source_system: "anomaly-engine" }).success
    ).toBe(true);
  });

  test("learningActionSchema requires action enum", () => {
    expect(validateBody(learningActionSchema, { action: "run_cycle" }).success).toBe(true);
  });

  test("revenueVerificationActionSchema requires action=run_verification + month + year", () => {
    expect(
      validateBody(revenueVerificationActionSchema, {
        action: "run_verification",
        month: 6,
        year: 2026,
      }).success
    ).toBe(true);
    expect(
      validateBody(revenueVerificationActionSchema, { action: "run_verification" }).success
    ).toBe(false);
  });
});