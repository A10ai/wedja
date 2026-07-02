import "server-only";
import { z } from "zod";

/**
 * Zod validation schemas for all Wedja API request bodies and query params.
 * Used to validate input before processing — reject early, reject loudly.
 *
 * Pattern:
 *   const validation = validateBody(createXxxSchema, body);
 *   if (!validation.success) {
 *     return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
 *   }
 *   const validated = validation.data;
 */

// ── Properties ──────────────────────────────────────────────────────────────

export const updatePropertySchema = z.object({
  id: z.string().uuid("Property id is required"),
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  total_area_sqm: z.number().min(0).optional(),
  floors: z.number().int().min(0).optional(),
  year_established: z.number().int().min(1900).max(2100).optional(),
  operating_hours: z.string().max(100).optional().nullable(),
  status: z.string().max(50).optional(),
  timezone: z.string().max(50).optional(),
  currency: z.string().length(3).optional(),
}).strict();

// ── Zones ───────────────────────────────────────────────────────────────────

export const createZoneSchema = z.object({
  property_id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").max(200),
  floor: z.number().int().min(-10).max(200),
  area_sqm: z.number().min(0).optional(),
  type: z.enum(["retail", "food", "entertainment", "service", "parking", "common"]),
  status: z.string().max(50).optional(),
}).strict();

// ── Units ───────────────────────────────────────────────────────────────────

export const createUnitSchema = z.object({
  zone_id: z.string().uuid("zone_id is required"),
  property_id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").max(200),
  unit_number: z.string().min(1, "unit_number is required").max(50),
  floor: z.number().int().min(-10).max(200).optional(),
  area_sqm: z.number().min(0).optional(),
  status: z.enum(["occupied", "vacant", "maintenance"]).optional(),
  frontage_m: z.number().min(0).optional(),
  coordinates_json: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

// ── Tenants ─────────────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  brand_name: z.string().max(200).optional().nullable(),
  category: z.enum(["fashion", "food", "electronics", "services", "entertainment", "grocery"]),
  brand_type: z.enum(["international", "local", "franchise"]).optional(),
  contact_name: z.string().max(200).optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  tax_id: z.string().max(100).optional().nullable(),
  status: z.string().max(50).optional(),
}).strict();

// ── Leases ───────────────────────────────────────────────────────────────────

export const createLeaseSchema = z.object({
  unit_id: z.string().uuid("unit_id is required"),
  tenant_id: z.string().uuid("tenant_id is required"),
  property_id: z.string().uuid().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  min_rent_monthly_egp: z.number().min(0).optional(),
  percentage_rate: z.number().min(0).max(100).optional(),
  security_deposit_egp: z.number().min(0).optional(),
  escalation_rate: z.number().optional(),
  status: z.enum(["active", "expired", "terminated", "pending"]).optional(),
  terms_json: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
}).strict();

// ── Rent Transactions ───────────────────────────────────────────────────────

export const createRentTransactionSchema = z.object({
  lease_id: z.string().uuid("lease_id is required"),
  period_month: z.number().int().min(1).max(12),
  period_year: z.number().int().min(2000).max(2100),
  min_rent_due: z.number().min(0).optional(),
  percentage_rent_due: z.number().min(0).optional(),
  amount_due: z.number().min(0),
  amount_paid: z.number().min(0).optional(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  payment_method: z.string().max(50).optional().nullable(),
  status: z.enum(["paid", "partial", "overdue", "waived"]).optional(),
  source: z.string().max(100).optional().nullable(),
}).strict();

// ── Percentage Rent (query) ──────────────────────────────────────────────────

export const percentageRentQuerySchema = z.object({
  type: z.enum(["overview", "trend", "inflation", "optimization", "composition"]).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
}).strict();

// ── Revenue Verification ─────────────────────────────────────────────────────

export const revenueVerificationQuerySchema = z.object({
  type: z.enum(["summary", "full", "tenant"]).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  tenant_id: z.string().uuid().optional(),
}).strict();

export const revenueVerificationActionSchema = z.object({
  action: z.literal("run_verification"),
  month: z.number().int().min(1).max(12, "month is required (1-12)"),
  year: z.number().int().min(2000).max(2100, "year is required"),
}).strict();

// ── Discrepancies ────────────────────────────────────────────────────────────

export const discrepanciesQuerySchema = z.object({
  status: z.enum(["flagged", "investigating", "resolved", "dismissed"]).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
}).strict();

export const updateDiscrepancySchema = z.object({
  id: z.string().uuid("id is required"),
  status: z.enum(["flagged", "investigating", "resolved", "dismissed"], "status is required"),
  resolution_notes: z.string().max(5000).optional().nullable(),
}).strict();

// ── Anomalies ───────────────────────────────────────────────────────────────

export const anomaliesQuerySchema = z.object({
  type: z.enum(["active", "history", "stats"]).optional(),
  severity: z.string().max(50).optional(),
  anomaly_type: z.string().max(100).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
}).strict();

export const anomalyActionSchema = z.object({
  action: z.enum(["run_detection", "acknowledge", "resolve"]),
  id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  false_alarm: z.boolean().optional(),
}).strict();

// ── Footfall ────────────────────────────────────────────────────────────────

export const footfallQuerySchema = z.object({
  type: z.enum(["overview", "by_zone", "by_unit", "hourly", "trend", "heatmap", "peaks"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zone_id: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
}).strict();

export const manualFootfallSchema = z.object({
  unit_id: z.string().uuid().optional(),
  zone_id: z.string().uuid().optional(),
  count_in: z.number().int().min(0, "count_in is required"),
  count_out: z.number().int().min(0).optional(),
  timestamp: z.string().datetime().optional(),
}).strict().refine(
  (data) => data.unit_id || data.zone_id,
  { message: "Either unit_id or zone_id is required" }
);

// ── Heatmap ──────────────────────────────────────────────────────────────────

export const heatmapQuerySchema = z.object({
  type: z.enum(["live", "zone_deep_dive", "flow", "feed"]).optional(),
  zone_id: z.string().uuid().optional(),
}).strict();

// ── Cameras ──────────────────────────────────────────────────────────────────

export const createCameraSchema = z.object({
  name: z.string().min(1, "Camera name is required").max(200),
  rtsp_url: z.string().max(500).optional().nullable(),
  zone_id: z.string().uuid().optional(),
  location_description: z.string().max(500).optional().nullable(),
  angle_type: z.enum(["entrance", "overhead", "corridor"]).optional(),
  resolution: z.string().max(50).optional(),
}).strict();

export const updateCameraSchema = z.object({
  id: z.string().uuid("Camera id is required"),
  name: z.string().min(1).max(200).optional(),
  rtsp_url: z.string().max(500).optional().nullable(),
  zone_id: z.string().uuid().optional().nullable(),
  location_description: z.string().max(500).optional().nullable(),
  angle_type: z.enum(["entrance", "overhead", "corridor"]).optional(),
  resolution: z.string().max(50).optional(),
  status: z.enum(["active", "offline", "maintenance"]).optional(),
}).strict();

// ── CCTV ────────────────────────────────────────────────────────────────────

export const cctvQuerySchema = z.object({
  type: z.enum([
    "overview", "people_count", "flow", "dwell", "queues",
    "occupancy", "dead_zones", "demographics", "parking",
    "security", "conversion",
  ]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hours: z.coerce.number().int().min(1).max(720).optional(),
  status: z.string().max(50).optional(),
}).strict();

// ── Maintenance ─────────────────────────────────────────────────────────────

export const maintenanceQuerySchema = z.object({
  status: z.string().max(50).optional(),
  priority: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
}).strict();

export const createMaintenanceSchema = z.object({
  zone_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(["hvac", "electrical", "plumbing", "elevator", "escalator", "cleaning", "structural", "other"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent", "emergency"]).optional(),
  reported_by: z.string().uuid().optional().nullable(),
  estimated_cost_egp: z.number().min(0).optional().nullable(),
}).strict();

export const updateMaintenanceStatusSchema = z.object({
  action: z.literal("update_status"),
  id: z.string().uuid("id is required"),
  status: z.enum(["open", "assigned", "in_progress", "on_hold", "completed", "cancelled"]),
}).strict();

// ── Energy ──────────────────────────────────────────────────────────────────

export const energyQuerySchema = z.object({
  type: z.enum(["overview", "by_zone", "hourly", "trend", "vs_footfall", "recommendations"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

// ── Contracts ────────────────────────────────────────────────────────────────

export const contractsQuerySchema = z.object({
  type: z.enum(["overview", "expiring", "performance", "escalations", "rent_vs_sales", "alerts", "portfolio"]).optional(),
  within_days: z.coerce.number().int().min(1).max(3650).optional(),
}).strict();

// ── Finance ──────────────────────────────────────────────────────────────────

export const financeQuerySchema = z.object({
  type: z.enum(["overview", "expenses", "cashflow", "budget", "pnl", "recent"]).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
}).strict();

export const createExpenseSchema = z.object({
  category: z.string().min(1, "category is required").max(100),
  description: z.string().min(1, "description is required").max(1000),
  amount_egp: z.number().min(0, "amount_egp is required"),
  vendor: z.string().max(200).optional().nullable(),
  invoice_reference: z.string().max(200).optional().nullable(),
  is_recurring: z.boolean().optional(),
  recurring_frequency: z.string().max(50).optional().nullable(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().max(50).optional(),
}).strict();

// ── Reports ─────────────────────────────────────────────────────────────────

export const reportsQuerySchema = z.object({
  type: z.enum(["revenue_verification", "tenant_performance", "footfall_analysis", "rent_collection", "maintenance"]).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
}).strict();

// ── Audit ────────────────────────────────────────────────────────────────────

export const auditQuerySchema = z.object({
  type: z.enum(["log", "stats"]).optional(),
  category: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict();

// ── Notifications ────────────────────────────────────────────────────────────

export const notificationsQuerySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  count: z.enum(["true", "false"]).optional(),
}).strict();

export const notificationActionSchema = z.object({
  action: z.enum(["mark_read", "mark_all_read", "create"]).optional(),
  id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional().nullable(),
  title: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  type: z.string().max(50).optional(),
  category: z.string().max(100).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
}).strict();

// ── Communications ────────────────────────────────────────────────────────────

export const communicationsQuerySchema = z.object({
  type: z.enum(["overview", "overdue", "renewals", "templates", "history"]).optional(),
}).strict();

export const createCommunicationSchema = z.object({
  tenant_id: z.string().uuid("tenant_id is required"),
  type: z.string().max(50).optional(),
  channel: z.string().max(50).optional(),
  subject: z.string().min(1, "subject is required").max(200),
  body: z.string().min(1, "body is required").max(10000),
}).strict();

// ── Marketing ────────────────────────────────────────────────────────────────

export const marketingQuerySchema = z.object({
  type: z.enum(["overview", "calendar", "performance", "campaigns", "correlation", "alerts", "promotions"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.string().max(50).optional(),
}).strict();

export const createEventSchema = z.object({
  entity: z.literal("event"),
  property_id: z.string().uuid().optional(),
  title: z.string().min(1, "title is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  event_type: z.string().min(1, "event_type is required").max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  start_time: z.string().max(20).optional().nullable(),
  end_time: z.string().max(20).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  zone_id: z.string().uuid().optional().nullable(),
  target_audience: z.string().max(100).optional(),
  expected_footfall_boost_pct: z.number().optional(),
  budget_egp: z.number().min(0).optional().nullable(),
  status: z.string().max(50).optional(),
  organizer: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
}).strict();

export const createCampaignSchema = z.object({
  entity: z.literal("campaign"),
  property_id: z.string().uuid().optional(),
  name: z.string().min(1, "name is required").max(200),
  campaign_type: z.string().min(1, "campaign_type is required").max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  budget_egp: z.number().min(0).optional().nullable(),
  target_audience: z.string().max(100).optional().nullable(),
  channels: z.array(z.string()).optional(),
  kpi_target: z.string().max(200).optional().nullable(),
  status: z.string().max(50).optional(),
  notes: z.string().max(5000).optional().nullable(),
}).strict();

export const createPromotionSchema = z.object({
  entity: z.literal("promotion"),
  property_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid("tenant_id is required"),
  title: z.string().min(1, "title is required").max(200),
  promotion_type: z.string().max(100).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  discount_pct: z.number().min(0).max(100).optional().nullable(),
  status: z.string().max(50).optional(),
}).strict();

// ── Social ───────────────────────────────────────────────────────────────────

export const socialQuerySchema = z.object({
  type: z.enum(["overview", "calendar", "analytics", "ideas", "insights", "posts", "captions", "competitors"]).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  status: z.string().max(50).optional(),
  platform: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  topic: z.string().max(200).optional(),
  language: z.string().max(20).optional(),
}).strict();

export const createSocialPostSchema = z.object({
  entity: z.literal("post"),
  property_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional().nullable(),
  platform: z.string().min(1, "platform is required").max(50),
  content_type: z.string().min(1, "content_type is required").max(100),
  caption: z.string().max(5000).optional().nullable(),
  hashtags: z.array(z.string()).optional(),
  media_url: z.string().max(1000).optional().nullable(),
  status: z.string().max(50).optional(),
  scheduled_at: z.string().datetime().optional().nullable(),
  ai_generated: z.boolean().optional(),
  ai_score: z.number().min(0).max(1).optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  tenant_id: z.string().uuid().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  language: z.string().max(10).optional(),
}).strict();

export const createContentCalendarSchema = z.object({
  entity: z.literal("calendar"),
  property_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  platform: z.string().min(1, "platform is required").max(50),
  content_type: z.string().min(1, "content_type is required").max(100),
  category: z.string().max(100).optional().nullable(),
  title: z.string().min(1, "title is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  status: z.string().max(50).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  post_id: z.string().uuid().optional().nullable(),
  ai_suggested: z.boolean().optional(),
}).strict();

// ── Events ───────────────────────────────────────────────────────────────────

export const eventsQuerySchema = z.object({
  status: z.string().max(50).optional(),
  type: z.string().max(100).optional(),
  upcoming: z.enum(["true", "false"]).optional(),
}).strict();

export const createEventDirectSchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  event_type: z.string().min(1, "event_type is required").max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  start_time: z.string().max(20).optional().nullable(),
  end_time: z.string().max(20).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  zone_id: z.string().uuid().optional().nullable(),
  target_audience: z.string().max(100).optional(),
  expected_footfall_boost_pct: z.number().optional(),
  budget_egp: z.number().min(0).optional().nullable(),
  status: z.string().max(50).optional(),
  organizer: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
}).strict();

export const updateEventSchema = z.object({
  id: z.string().uuid("Event id is required"),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  event_type: z.string().max(100).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().max(20).optional().nullable(),
  end_time: z.string().max(20).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  zone_id: z.string().uuid().optional().nullable(),
  target_audience: z.string().max(100).optional(),
  expected_footfall_boost_pct: z.number().optional(),
  actual_footfall_boost_pct: z.number().optional(),
  budget_egp: z.number().min(0).optional().nullable(),
  actual_cost_egp: z.number().min(0).optional().nullable(),
  revenue_impact_egp: z.number().optional().nullable(),
  status: z.string().max(50).optional(),
  organizer: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
}).strict();

// ── Tenant Analytics ─────────────────────────────────────────────────────────

export const tenantAnalyticsQuerySchema = z.object({
  type: z.enum(["scorecard", "rankings", "benchmarks", "sqm_value", "tenant_mix", "percentage_rates", "replacement"]).optional(),
  tenant_id: z.string().uuid().optional(),
}).strict();

// ── Import ──────────────────────────────────────────────────────────────────

export const importTypeSchema = z.object({
  type: z.enum(["tenants", "leases", "sales", "rent", "expenses", "jde_revenue"]),
}).strict();

// ── AI Brain ─────────────────────────────────────────────────────────────────

export const aiBrainActionSchema = z.object({
  action: z.enum(["run_cycle", "update_config", "approve", "reject"]),
  mode: z.enum(["supervised", "autonomous"]).optional(),
  enabled: z.boolean().optional(),
  interval_minutes: z.number().int().min(1).max(1440).optional(),
  decision_id: z.string().uuid().optional().nullable(),
}).strict();

// ── AI Chat ──────────────────────────────────────────────────────────────────

export const aiInsightsQuerySchema = z.object({
  severity: z.enum(["info", "opportunity", "warning", "critical"]).optional(),
  type: z.string().max(100).optional(),
}).strict();

export const aiChatSchema = z.object({
  message: z.string().min(1, "Message is required").max(10000),
  context: z.string().max(10000).optional(),
}).strict();

// ── AI Predictions ──────────────────────────────────────────────────────────

export const predictionsQuerySchema = z.object({
  type: z.enum(["footfall", "revenue", "performance"]).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  months: z.coerce.number().int().min(1).max(60).optional(),
}).strict();

export const predictionActionSchema = z.object({
  action: z.literal("train"),
}).strict();

// ── AI Scheduler ────────────────────────────────────────────────────────────

export const schedulerActionSchema = z.object({
  action: z.enum(["start", "stop", "run_now", "set_interval"]),
  interval_minutes: z.number().int().min(5).max(60).optional(),
}).strict();

// ── AI Automations ──────────────────────────────────────────────────────────

export const automationActionSchema = z.object({
  action: z.enum(["run_all", "run_one", "toggle"]),
  automation_id: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
}).strict();

// ── AI Events ───────────────────────────────────────────────────────────────

export const aiEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  type: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
}).strict();

export const aiEventSchema = z.object({
  type: z.string().min(1, "type is required"),
  source_system: z.string().min(1, "source_system is required").max(100),
  payload: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ── AI Learning ──────────────────────────────────────────────────────────────

export const learningActionSchema = z.object({
  action: z.enum(["run_cycle", "feedback", "dismiss_pattern"]),
  decision_id: z.string().uuid().optional(),
  feedback_type: z.string().max(50).optional(),
  corrected_value: z.unknown().optional(),
  reason: z.string().max(2000).optional().nullable(),
  staff_id: z.string().uuid().optional().nullable(),
  pattern_id: z.string().uuid().optional(),
}).strict();

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate a request body against a Zod schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate query/search params against a Zod schema.
 * Converts URLSearchParams to a plain object first.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateQuery<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  const result = schema.safeParse(obj);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod errors into a user-friendly string.
 */
export function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}