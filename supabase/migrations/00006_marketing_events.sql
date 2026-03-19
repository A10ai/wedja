-- ============================================================
-- Marketing & Events Module
-- Events, campaigns, seasonal calendar, tenant promotions
-- ============================================================

-- ── Events ───────────────────────────────────────────────────

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('seasonal', 'holiday', 'promotion', 'entertainment', 'tenant_event', 'community', 'festival')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  zone_id UUID REFERENCES zones(id),
  target_audience TEXT CHECK (target_audience IN ('all', 'families', 'tourists', 'youth', 'women', 'corporate')),
  expected_footfall_boost_pct INT DEFAULT 0,
  actual_footfall_boost_pct INT,
  budget_egp NUMERIC(12,2),
  actual_cost_egp NUMERIC(12,2),
  revenue_impact_egp NUMERIC(12,2),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  organizer TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Campaigns ────────────────────────────────────────────────

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('social_media', 'email', 'sms', 'billboard', 'radio', 'influencer', 'partnership', 'loyalty', 'seasonal')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget_egp NUMERIC(12,2),
  spend_egp NUMERIC(12,2) DEFAULT 0,
  target_audience TEXT,
  channels TEXT[],
  kpi_target TEXT,
  kpi_actual TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  roi_pct NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seasonal Calendar ────────────────────────────────────────

CREATE TABLE seasonal_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('religious', 'national', 'international', 'tourist_season', 'school_holiday', 'shopping_event')),
  typical_start_month INT,
  typical_start_day INT,
  typical_end_month INT,
  typical_end_day INT,
  year_specific_start DATE,
  year_specific_end DATE,
  footfall_impact TEXT CHECK (footfall_impact IN ('very_high', 'high', 'moderate', 'low', 'negative')),
  revenue_impact TEXT CHECK (revenue_impact IN ('very_high', 'high', 'moderate', 'low', 'negative')),
  tourist_ratio_change TEXT,
  planning_notes TEXT,
  is_recurring BOOLEAN DEFAULT true
);

-- ── Tenant Promotions ────────────────────────────────────────

CREATE TABLE tenant_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  tenant_id UUID REFERENCES tenants(id),
  title TEXT NOT NULL,
  promotion_type TEXT CHECK (promotion_type IN ('sale', 'discount', 'bogo', 'new_collection', 'seasonal', 'clearance', 'event_tie_in')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  discount_pct INT,
  footfall_impact_pct INT,
  revenue_impact_pct INT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_events_dates ON events(property_id, start_date, end_date);
CREATE INDEX idx_campaigns_dates ON campaigns(property_id, start_date, end_date);
CREATE INDEX idx_seasonal_type ON seasonal_calendar(property_id, type);
CREATE INDEX idx_tenant_promos ON tenant_promotions(tenant_id, start_date);

-- ============================================================
-- Seed Data — Senzo Mall, Hurghada
-- ============================================================

-- Property ID reference
-- a0000000-0000-0000-0000-000000000001

-- ── Seasonal Calendar (Recurring) ────────────────────────────

-- Eid Al-Fitr (moves yearly — Hijri calendar, 2026 approx late March / early April)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, year_specific_start, year_specific_end, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Eid Al-Fitr', 'religious', NULL, NULL, NULL, NULL, '2026-03-31', '2026-04-02', 'very_high', 'very_high', '+60% tourists', 'Peak shopping period. Extended hours until 1AM. All zones decorated. Families dominate daytime, youth at night. Plan entertainment and food court expansion. Hire extra security.', true);

-- Eid Al-Adha (moves yearly — 2026 approx early June)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, year_specific_start, year_specific_end, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Eid Al-Adha', 'religious', NULL, NULL, NULL, NULL, '2026-06-07', '2026-06-10', 'very_high', 'very_high', '+50% tourists', 'Second biggest shopping season. 4-day holiday. Heavy family traffic. Food court at max capacity. Coordinate with tenants for Eid sales.', true);

-- Ramadan (moves yearly — 2026 approx early March)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, year_specific_start, year_specific_end, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Ramadan', 'religious', NULL, NULL, NULL, NULL, '2026-02-28', '2026-03-30', 'moderate', 'high', '-20% tourists during day, +30% evening', 'Different traffic pattern. Very quiet before Iftar (sunset). Massive spike 7PM-1AM. Food court revenue doubles in evening. Adjust staffing. Ramadan decorations. Special Suhoor events late night.', true);

-- Christmas & New Year (fixed dates, massive tourist influx)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Christmas & New Year', 'international', 12, 20, 1, 5, 'very_high', 'very_high', '+80% tourists (European, Russian)', 'Peak tourist season in Hurghada. Russian, German, British tourists flood the mall. English and Russian signage critical. International brands perform well. Gift shopping surge. Entertainment zone at capacity. New Year countdown event.', true);

-- Russian Christmas (Jan 7 — huge Russian population in Hurghada)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Russian Christmas', 'international', 1, 7, 1, 8, 'high', 'high', '+40% Russian tourists', 'Russian tourists celebrate Orthodox Christmas. Hurghada has massive Russian community. Russian-speaking staff essential. Russian Christmas decorations. Special promotions in Russian.', true);

-- Easter / Sham El-Nessim (Egyptian national holiday, Monday after Coptic Easter)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, year_specific_start, year_specific_end, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Easter / Sham El-Nessim', 'national', 4, 10, 4, 15, '2026-04-13', '2026-04-14', 'high', 'high', '+25% domestic tourists', 'Egyptian national holiday. Families go out for picnics and outings. Food court extremely busy. Outdoor areas activated. Family entertainment programs essential.', true);

-- Summer Season (Jun-Aug, peak tourist season)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Summer Tourist Season', 'tourist_season', 6, 1, 8, 31, 'high', 'high', '+45% tourists (mixed nationalities)', 'Peak summer tourism in Hurghada. Families with children. Water park and beach crowd visits mall in evening. Entertainment zone key revenue driver. Extended hours. AC costs spike.', true);

-- Winter Season (Oct-Mar, European tourists)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Winter Tourist Season', 'tourist_season', 10, 1, 3, 31, 'high', 'high', '+55% European tourists escaping winter', 'European tourists (German, British, Eastern European) escape cold winters. Long-stay visitors. Regular mall-goers. International brands perform well. Multilingual signage essential.', true);

-- Back to School (September)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Back to School', 'school_holiday', 9, 1, 9, 20, 'moderate', 'moderate', 'Neutral — domestic families', 'Family shopping for school supplies, uniforms, bags. LC Waikiki, DeFacto, and kids brands see surge. Stationery and electronics spike. Coordinate school-themed promotions with tenants.', true);

-- Valentine''s Day
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Valentine''s Day', 'international', 2, 14, 2, 14, 'moderate', 'moderate', 'Neutral', 'Youth couples dominate evening footfall. Restaurants and cafes at capacity. Gift shopping surge (jewelry, perfume, fashion). Create romantic ambiance in common areas.', true);

-- Mother''s Day (Egypt: March 21)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Mother''s Day (Egypt)', 'national', 3, 21, 3, 21, 'moderate', 'moderate', 'Neutral', 'Gift shopping day. Families take mothers out for meals. Food court and restaurants very busy. Perfume, fashion, and gift stores see 30-40% revenue spike. Coordinate gift wrapping stations.', true);

-- Black Friday / White Friday (November)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'White Friday / Black Friday', 'shopping_event', 11, 20, 11, 30, 'high', 'very_high', 'Neutral', 'Biggest shopping event of the year. All tenants participate with 20-70% discounts. Massive footfall spike. Online and offline promotions. Coordinate unified marketing campaign. Extended hours.', true);

-- Spring Break (Mar-Apr, tourist influx)
INSERT INTO seasonal_calendar (property_id, name, type, typical_start_month, typical_start_day, typical_end_month, typical_end_day, footfall_impact, revenue_impact, tourist_ratio_change, planning_notes, is_recurring) VALUES
('a0000000-0000-0000-0000-000000000001', 'Spring Break', 'tourist_season', 3, 15, 4, 15, 'moderate', 'moderate', '+20% European tourists', 'European spring break brings families. Entertainment zone busy. Casual dining surge. Beach-to-mall traffic pattern.', true);

-- ── Events (Last 6 months + Upcoming) ───────────────────────

-- Senzo Summer Festival 2025 (completed)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, actual_footfall_boost_pct, budget_egp, actual_cost_egp, revenue_impact_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Senzo Summer Festival 2025', 'Three-week summer entertainment extravaganza with live performances, family activities, water games, and nightly entertainment. DJ sets, kids shows, and food festival.', 'entertainment', '2025-07-10', '2025-07-31', '16:00', '23:00', 'Entertainment Zone + Central Atrium', 'all', 35, 42, 450000, 420000, 1850000, 'completed', 'Senzo Events Team', 'Exceeded expectations. Entertainment zone footfall up 42%. Food court revenue doubled during event. DJ nights attracted youth segment. Recommend expanding to 4 weeks next year.');

-- Back to School Campaign 2025 (completed)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, actual_footfall_boost_pct, budget_egp, actual_cost_egp, revenue_impact_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Back to School Event 2025', 'Mall-wide back to school shopping event with discounts across fashion, stationery, and electronics. Interactive school supply stations and drawing competitions for kids.', 'promotion', '2025-09-01', '2025-09-15', '10:00', '22:00', 'Retail Wings A & B', 'families', 20, 18, 180000, 165000, 720000, 'completed', 'Senzo Marketing', 'Solid performance. LC Waikiki and DeFacto were top performers. Kids activity zone was a hit. Consider partnering with local schools next year.');

-- White Friday Sales Week 2025 (completed)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, actual_footfall_boost_pct, budget_egp, actual_cost_egp, revenue_impact_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'White Friday Sales Week 2025', 'Mall-wide mega sale event. 50-70% off at participating stores. Flash deals every hour. Extended hours until midnight. Social media campaign with influencer partnerships.', 'promotion', '2025-11-21', '2025-11-28', '10:00', '00:00', 'All Zones', 'all', 50, 58, 350000, 380000, 3200000, 'completed', 'Senzo Marketing + Tenants', 'Biggest single event of 2025. Footfall exceeded projections by 8%. Adidas and LC Waikiki reported record sales. Parking was a bottleneck — need overflow solution. Social media reach: 2.4M impressions.');

-- Winter Wonderland 2025 (completed)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, actual_footfall_boost_pct, budget_egp, actual_cost_egp, revenue_impact_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Winter Wonderland 2025', 'Christmas and New Year celebration. Snow machine in central atrium, Christmas market with local artisans, Santa meet-and-greet, New Year countdown event. Multilingual (Arabic, English, Russian, German).', 'holiday', '2025-12-20', '2026-01-05', '10:00', '01:00', 'Central Atrium + All Zones', 'all', 45, 52, 680000, 710000, 4100000, 'completed', 'Senzo Events + External Agency', 'Exceptional performance. Tourist footfall up 52%. Russian and European tourists drove premium brand sales. NYE countdown attracted 8,000 visitors. Snow machine was the highlight. Revenue impact: EGP 4.1M across all tenants.');

-- Ramadan Nights Market 2026 (active)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, actual_footfall_boost_pct, budget_egp, actual_cost_egp, revenue_impact_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Ramadan Nights Market 2026', 'Evening market after Iftar. Street food vendors, traditional crafts, Ramadan decorations, lantern workshops, and live oud music. Food court extended to outdoor area. Suhoor specials until 3AM.', 'seasonal', '2026-03-01', '2026-03-29', '19:00', '03:00', 'Food Court + Outdoor Plaza', 'families', 30, 28, 320000, NULL, NULL, 'active', 'Senzo Events Team', 'Running well. Evening footfall consistently up. Food court revenue doubled post-Iftar. Lantern workshop fully booked every night. Need more outdoor seating.');

-- Eid Al-Fitr Celebration 2026 (planned)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, budget_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Eid Al-Fitr Celebration 2026', 'Three-day Eid celebration. Kids entertainment, face painting, balloon artists, Eid fashion show, special Eid promotions across all stores. Extended hours until 1AM.', 'holiday', '2026-03-31', '2026-04-02', '10:00', '01:00', 'All Zones', 'families', 55, 520000, 'planned', 'Senzo Events Team', 'Biggest upcoming event. Coordinating with all tenants for Eid promotions. Entertainment team booked. Security plan in progress. Parking overflow arrangement with nearby lots.');

-- Easter Family Fun Day 2026 (planned)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, budget_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Easter Family Fun Day 2026', 'Sham El-Nessim celebration with egg painting, outdoor picnic area, family games, live music, and food festival. Traditional Egyptian food stalls.', 'holiday', '2026-04-13', '2026-04-14', '10:00', '23:00', 'Outdoor Plaza + Entertainment Zone', 'families', 25, 180000, 'planned', 'Senzo Events Team', 'Egyptian national holiday. Heavy family traffic expected. Coordinate with food court for outdoor seating expansion.');

-- Summer Festival 2026 (planned)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, budget_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Senzo Summer Festival 2026', 'Expanded summer festival based on 2025 success. Four weeks of entertainment, water activities, live concerts, kids programs, and late-night dining events.', 'entertainment', '2026-07-05', '2026-08-01', '16:00', '00:00', 'Entertainment Zone + Central Atrium + Outdoor', 'all', 40, 600000, 'planned', 'Senzo Events Team', 'Based on 2025 learnings. Extended to 4 weeks. Added outdoor concert stage. Budget increased for bigger acts.');

-- Eid Al-Adha 2026 (planned)
INSERT INTO events (property_id, title, description, event_type, start_date, end_date, start_time, end_time, location, target_audience, expected_footfall_boost_pct, budget_egp, status, organizer, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Eid Al-Adha Celebration 2026', 'Four-day Eid Al-Adha celebration. Cultural performances, kids activities, BBQ food festival in outdoor area, fashion shows, and tenant-wide Eid promotions.', 'holiday', '2026-06-07', '2026-06-10', '10:00', '01:00', 'All Zones', 'all', 50, 480000, 'planned', 'Senzo Events Team', 'Second major Eid of the year. Focus on food and family entertainment. Coordinate with Spinneys for Eid grocery promotions.');

-- ── Campaigns ─────────────────────────────────────────────────

-- Summer 2025 Social Media Campaign (completed)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, kpi_actual, status, roi_pct, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Summer 2025 Social Media Blitz', 'social_media', '2025-06-15', '2025-08-31', 180000, 172000, 'Tourists + Local families', ARRAY['instagram', 'facebook', 'tiktok', 'youtube'], 'Increase footfall 25% during summer, reach 1M impressions', 'Footfall up 28%, 1.8M impressions, 45K new followers', 'completed', 185.00, 'Best-performing campaign of the year. TikTok videos of Summer Festival went viral. Influencer partnerships drove tourist traffic. Russian-language content performed exceptionally.');

-- Winter Tourist Attraction Campaign (completed)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, kpi_actual, status, roi_pct, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Winter Tourist Attraction 2025', 'partnership', '2025-10-15', '2026-02-28', 280000, 265000, 'European and Russian tourists', ARRAY['hotel_partnerships', 'airport_billboards', 'tourist_guides', 'social_media'], 'Drive 30% tourist footfall increase Oct-Feb', 'Tourist footfall up 35%, hotel shuttle partnerships added 2,200 weekly visitors', 'completed', 220.00, 'Partnership with 12 Hurghada hotels for shuttle service. Airport billboard was high-impact. Russian and German language tourist guides distributed at hotels.');

-- White Friday Billboard + Radio Campaign (completed)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, kpi_actual, status, roi_pct, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'White Friday 2025 Mass Media', 'billboard', '2025-11-10', '2025-11-28', 150000, 148000, 'All Hurghada residents', ARRAY['billboards', 'radio', 'sms', 'social_media'], '50% footfall increase during White Friday week', '58% footfall increase, record daily visitors (23,400)', 'completed', 310.00, 'Billboards on Safaga Road and Airport Road. Radio spots on Nile FM and Mega FM. SMS blast to 85,000 subscribers. Highest ROI campaign ever.');

-- Senzo Loyalty Program (ongoing)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, kpi_actual, status, roi_pct, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Senzo Loyalty Program', 'loyalty', '2025-01-01', '2026-12-31', 400000, 185000, 'Regular visitors, families', ARRAY['app', 'sms', 'email', 'in_mall_screens'], 'Build database of 50,000 members, increase repeat visits 15%', '32,000 members, repeat visits up 12%', 'active', 145.00, 'Mobile app with points and rewards. Partnership with tenants for exclusive member discounts. Monthly member-only events. Growing steadily.');

-- Eid 2026 Billboard + Radio Campaign (active)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, kpi_actual, status, roi_pct, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Eid Al-Fitr 2026 Campaign', 'billboard', '2026-03-15', '2026-04-05', 220000, 95000, 'All audiences', ARRAY['billboards', 'radio', 'social_media', 'sms', 'influencers'], 'Drive 50% footfall increase during Eid week', NULL, 'active', NULL, 'Billboards live on Safaga Road. Radio spots started. Influencer content being produced. SMS blast scheduled for March 28. Ramadan tie-in messaging.');

-- Ramadan 2026 Digital Campaign (active)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, kpi_actual, status, roi_pct, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Ramadan 2026 Digital Push', 'social_media', '2026-02-25', '2026-03-30', 120000, 78000, 'Families, food lovers', ARRAY['instagram', 'facebook', 'tiktok', 'food_bloggers'], 'Increase evening footfall 25% during Ramadan', 'Evening footfall up 22% so far', 'active', NULL, 'Focusing on food content — Iftar specials, Suhoor spots, Ramadan lantern workshops. Food blogger partnerships performing well. TikTok Ramadan content getting strong engagement.');

-- Summer 2026 Campaign (draft)
INSERT INTO campaigns (property_id, name, campaign_type, start_date, end_date, budget_egp, spend_egp, target_audience, channels, kpi_target, status, notes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Summer 2026 Multi-Channel Campaign', 'seasonal', '2026-06-01', '2026-08-31', 350000, 0, 'Tourists + Local families + Youth', ARRAY['social_media', 'influencers', 'hotel_partnerships', 'airport', 'radio'], 'Increase summer footfall 30%, reach 3M impressions', 'draft', 'Planning phase. Based on Summer 2025 learnings. Increased budget. Adding YouTube content creators and hotel partnerships from Winter campaign success.');

-- ── Tenant Promotions ─────────────────────────────────────────

-- Get tenant IDs from the existing seed data
-- Using subqueries to reference tenant IDs by brand name

INSERT INTO tenant_promotions (property_id, tenant_id, title, promotion_type, start_date, end_date, discount_pct, footfall_impact_pct, revenue_impact_pct, status) VALUES
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'Adidas' LIMIT 1), 'Adidas End of Season Sale', 'sale', '2025-09-01', '2025-09-30', 30, 25, 15, 'completed'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'Adidas' LIMIT 1), 'Adidas Spring Collection Launch', 'new_collection', '2026-03-15', '2026-04-15', NULL, 12, 20, 'active'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'LC Waikiki' LIMIT 1), 'LC Waikiki Back to School', 'seasonal', '2025-08-25', '2025-09-20', 20, 30, 18, 'completed'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'LC Waikiki' LIMIT 1), 'LC Waikiki Eid Collection', 'seasonal', '2026-03-20', '2026-04-05', 15, 20, 22, 'active'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'Spinneys' LIMIT 1), 'Spinneys Ramadan Food Festival', 'event_tie_in', '2026-02-28', '2026-03-30', 10, 35, 28, 'active'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'McDonald''s' LIMIT 1), 'McDonald''s Family Meal Deal', 'discount', '2026-03-01', '2026-04-30', NULL, 15, 10, 'active'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'DeFacto' LIMIT 1), 'DeFacto White Friday Mega Sale', 'clearance', '2025-11-21', '2025-11-28', 50, 45, 35, 'completed'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'DeFacto' LIMIT 1), 'DeFacto Summer Clearance', 'clearance', '2026-06-15', '2026-07-15', 40, NULL, NULL, 'planned'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'Aldo' LIMIT 1), 'Aldo Valentine''s Day Collection', 'seasonal', '2026-02-07', '2026-02-21', 15, 18, 22, 'completed'),
('a0000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE brand_name = 'Timberland' LIMIT 1), 'Timberland Winter Collection', 'new_collection', '2025-10-01', '2025-12-31', NULL, 10, 15, 'completed');
