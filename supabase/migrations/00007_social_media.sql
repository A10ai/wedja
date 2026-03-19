-- ============================================================
-- Social Media Module
-- Social accounts, posts, content calendar, analytics
-- ============================================================

-- ── Social Accounts ────────────────────────────────────────────

CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'x', 'youtube', 'snapchat', 'linkedin')),
  account_name TEXT NOT NULL,
  account_handle TEXT,
  account_url TEXT,
  followers INT DEFAULT 0,
  following INT DEFAULT 0,
  total_posts INT DEFAULT 0,
  avg_engagement_rate NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disconnected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Social Posts ───────────────────────────────────────────────

CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  account_id UUID REFERENCES social_accounts(id),
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'reel', 'story', 'carousel', 'text', 'poll', 'live')),
  caption TEXT,
  hashtags TEXT[],
  media_url TEXT,
  post_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed', 'archived')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  -- Engagement metrics
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  saves INT DEFAULT 0,
  reach INT DEFAULT 0,
  impressions INT DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0,
  -- AI fields
  ai_generated BOOLEAN DEFAULT false,
  ai_score NUMERIC(5,2),
  campaign_id UUID REFERENCES campaigns(id),
  event_id UUID REFERENCES events(id),
  tenant_id UUID REFERENCES tenants(id),
  category TEXT CHECK (category IN ('promotion', 'event', 'tenant_spotlight', 'lifestyle', 'behind_scenes', 'announcement', 'seasonal', 'user_generated', 'poll', 'educational')),
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'ar', 'ru', 'de', 'multi')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Content Calendar ──────────────────────────────────────────

CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'content_ready', 'approved', 'scheduled', 'published')),
  assigned_to UUID REFERENCES staff(id),
  post_id UUID REFERENCES social_posts(id),
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Social Analytics ──────────────────────────────────────────

CREATE TABLE social_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES social_accounts(id),
  date DATE NOT NULL,
  followers_count INT,
  followers_gained INT DEFAULT 0,
  followers_lost INT DEFAULT 0,
  posts_published INT DEFAULT 0,
  total_reach INT DEFAULT 0,
  total_impressions INT DEFAULT 0,
  total_engagement INT DEFAULT 0,
  engagement_rate NUMERIC(5,2),
  top_post_id UUID REFERENCES social_posts(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX idx_posts_platform ON social_posts(platform, status, scheduled_at);
CREATE INDEX idx_posts_published ON social_posts(published_at DESC);
CREATE INDEX idx_calendar_date ON content_calendar(property_id, date);
CREATE INDEX idx_analytics_date ON social_analytics(account_id, date DESC);

-- ============================================================
-- Seed Data — Senzo Mall Social Media
-- ============================================================

-- Property ID: a0000000-0000-0000-0000-000000000001

-- ── Social Accounts ───────────────────────────────────────────

INSERT INTO social_accounts (id, property_id, platform, account_name, account_handle, account_url, followers, following, total_posts, avg_engagement_rate, status) VALUES
('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'instagram', 'Senzo Mall', '@senzomall', 'https://instagram.com/senzomall', 45000, 1200, 1840, 3.20, 'active'),
('b1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'facebook', 'Senzo Mall Hurghada', NULL, 'https://facebook.com/senzomallhurghada', 120000, 0, 3200, 1.80, 'active'),
('b1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'tiktok', 'Senzo Mall', '@senzomall', 'https://tiktok.com/@senzomall', 18000, 350, 420, 5.50, 'active'),
('b1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'x', 'Senzo Mall', '@SenzoMall', 'https://x.com/SenzoMall', 8500, 680, 2100, 1.20, 'active');

-- ── Social Posts (60 posts, last 60 days) ─────────────────────

-- Helper: today is approx 2026-03-19, so last 60 days = 2026-01-18 to 2026-03-19

-- Instagram posts (18 posts)
INSERT INTO social_posts (property_id, account_id, platform, content_type, caption, hashtags, post_url, status, published_at, likes, comments, shares, saves, reach, impressions, engagement_rate, ai_generated, ai_score, category, language) VALUES
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'reel', 'Welcome to Senzo Mall — Hurghada''s #1 shopping destination! New stores, new vibes, new you. مرحبا بكم في سنزو مول', ARRAY['#SenzoMall', '#Hurghada', '#Shopping', '#Egypt', '#RedSea', '#سنزو_مول'], 'https://instagram.com/p/reel001', 'published', '2026-01-20 18:00:00+02', 3200, 185, 420, 890, 45000, 62000, 4.80, false, NULL, 'lifestyle', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'carousel', 'Adidas Spring Collection just dropped! 🔥 First look at the new arrivals. مجموعة أديداس الربيعية وصلت', ARRAY['#Adidas', '#SpringCollection', '#SenzoMall', '#NewArrivals', '#أديداس'], 'https://instagram.com/p/carousel001', 'published', '2026-01-25 14:00:00+02', 2100, 95, 180, 620, 32000, 45000, 3.90, false, NULL, 'tenant_spotlight', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'image', 'Valentine''s Day is around the corner! Find the perfect gift at Senzo Mall. عيد الحب قرب، اختار هديتك من سنزو مول', ARRAY['#ValentinesDay', '#GiftIdeas', '#SenzoMall', '#Hurghada', '#عيد_الحب'], 'https://instagram.com/p/img001', 'published', '2026-02-07 12:00:00+02', 1850, 72, 95, 430, 28000, 38000, 3.20, true, 78.50, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'reel', 'Behind the scenes: Getting ready for Ramadan at Senzo Mall! Lanterns, lights, and magic ✨ كواليس تحضيرات رمضان', ARRAY['#Ramadan', '#BehindTheScenes', '#SenzoMall', '#RamadanKareem', '#رمضان_كريم'], 'https://instagram.com/p/reel002', 'published', '2026-02-25 19:00:00+02', 4500, 320, 680, 1200, 58000, 82000, 6.20, false, NULL, 'behind_scenes', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'carousel', 'Ramadan Nights Market is HERE! Street food, lantern workshops, live oud music every night after Iftar. سوق ليالي رمضان', ARRAY['#RamadanNights', '#SenzoMall', '#Iftar', '#Hurghada', '#سوق_رمضان'], 'https://instagram.com/p/carousel002', 'published', '2026-03-02 20:00:00+02', 3800, 210, 450, 980, 52000, 71000, 5.10, false, NULL, 'event', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'story', 'Iftar at Senzo — which restaurant are you choosing tonight? Poll time!', ARRAY['#Iftar', '#SenzoMall', '#Ramadan'], 'https://instagram.com/stories/poll001', 'published', '2026-03-05 18:30:00+02', 890, 45, 12, 65, 18000, 22000, 2.80, true, 65.00, 'poll', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'image', 'Spinneys Ramadan specials — everything you need for your Iftar table! عروض سبينيز لرمضان', ARRAY['#Spinneys', '#Ramadan', '#SenzoMall', '#IftarPrep', '#سبينيز'], 'https://instagram.com/p/img002', 'published', '2026-03-08 15:00:00+02', 1600, 88, 120, 350, 25000, 35000, 3.40, false, NULL, 'promotion', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'reel', 'POV: You''re walking through Senzo Mall during Ramadan Nights 🌙 Vibes are unmatched', ARRAY['#RamadanVibes', '#SenzoMall', '#POV', '#Hurghada', '#ليالي_رمضان'], 'https://instagram.com/p/reel003', 'published', '2026-03-10 21:00:00+02', 5200, 380, 720, 1500, 65000, 95000, 7.10, false, NULL, 'lifestyle', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'image', 'LC Waikiki Eid Collection preview! Get ready for Eid with the latest styles. تشكيلة إل سي وايكيكي للعيد', ARRAY['#LCWaikiki', '#EidCollection', '#SenzoMall', '#EidFashion', '#عيد_الفطر'], 'https://instagram.com/p/img003', 'published', '2026-03-12 16:00:00+02', 2400, 130, 200, 680, 35000, 48000, 4.00, true, 82.00, 'tenant_spotlight', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'carousel', '10 reasons to love Senzo Mall this Ramadan — swipe to see them all! ١٠ أسباب تحب سنزو مول في رمضان', ARRAY['#SenzoMall', '#Ramadan2026', '#Hurghada', '#رمضان'], 'https://instagram.com/p/carousel003', 'published', '2026-03-14 19:30:00+02', 2800, 165, 310, 750, 40000, 55000, 4.50, true, 85.00, 'lifestyle', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'reel', 'Lantern workshop at Ramadan Nights Market — make your own فانوس! 🏮', ARRAY['#Fanoos', '#RamadanCrafts', '#SenzoMall', '#فانوس_رمضان'], 'https://instagram.com/p/reel004', 'published', '2026-03-16 20:30:00+02', 3900, 245, 510, 1100, 50000, 72000, 5.80, false, NULL, 'event', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'image', 'Mother''s Day is March 21! Shop the best gifts for the best moms. عيد الأم ٢١ مارس!', ARRAY['#MothersDay', '#SenzoMall', '#Gifts', '#عيد_الأم', '#هدايا'], 'https://instagram.com/p/img004', 'published', '2026-03-17 13:00:00+02', 2100, 110, 180, 520, 30000, 42000, 3.80, true, 76.00, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'image', 'Weekend plans? Senzo Mall has you covered. Open till midnight! خطط الويكند؟ سنزو مول الحل', ARRAY['#Weekend', '#SenzoMall', '#Hurghada', '#ويكند'], 'https://instagram.com/p/img005', 'published', '2026-02-13 17:00:00+02', 1400, 55, 80, 290, 22000, 30000, 2.90, false, NULL, 'lifestyle', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'reel', 'Aldo Valentine''s collection — treat yourself or someone special 💝', ARRAY['#Aldo', '#Valentines', '#SenzoMall', '#Shoes', '#الدو'], 'https://instagram.com/p/reel005', 'published', '2026-02-10 15:00:00+02', 2900, 140, 280, 750, 38000, 52000, 4.60, false, NULL, 'tenant_spotlight', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'story', 'Quick tour of the new Ramadan decorations! Which corner is your fave?', ARRAY['#RamadanDecor', '#SenzoMall'], 'https://instagram.com/stories/story001', 'published', '2026-03-01 20:00:00+02', 650, 30, 8, 45, 15000, 18000, 2.20, false, NULL, 'behind_scenes', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'carousel', 'Food Court Guide: Top 5 Iftar spots at Senzo Mall 🍽️ دليل الإفطار في سنزو مول', ARRAY['#Iftar', '#FoodCourt', '#SenzoMall', '#RamadanFood', '#إفطار'], 'https://instagram.com/p/carousel004', 'published', '2026-03-06 17:00:00+02', 3100, 190, 380, 900, 42000, 58000, 5.00, true, 88.00, 'lifestyle', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'image', 'Did you know? Senzo Mall has over 200 stores across 170,000 sqm. هل تعلم؟', ARRAY['#SenzoMall', '#DidYouKnow', '#Hurghada', '#هل_تعلم'], 'https://instagram.com/p/img006', 'published', '2026-01-30 14:00:00+02', 1200, 48, 65, 210, 20000, 27000, 2.60, true, 60.00, 'educational', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'video', 'Your favourite Suhoor spot at Senzo Mall — open until 3AM during Ramadan! سحور سنزو مول', ARRAY['#Suhoor', '#SenzoMall', '#Ramadan', '#LateNight', '#سحور'], 'https://instagram.com/p/vid001', 'published', '2026-03-18 23:00:00+02', 2600, 155, 290, 680, 36000, 50000, 4.30, false, NULL, 'event', 'multi');

-- Facebook posts (15 posts)
INSERT INTO social_posts (property_id, account_id, platform, content_type, caption, hashtags, post_url, status, published_at, likes, comments, shares, saves, reach, impressions, engagement_rate, ai_generated, ai_score, category, language) VALUES
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'Senzo Mall — your one-stop destination in Hurghada! New year, new stores, new experiences. سنزو مول — وجهتك الأولى في الغردقة', ARRAY['#SenzoMall', '#Hurghada'], 'https://facebook.com/post/fb001', 'published', '2026-01-22 12:00:00+02', 4200, 380, 1200, 0, 85000, 120000, 2.10, false, NULL, 'lifestyle', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'video', 'Winter Tourist Season is in full swing! Welcome to Hurghada, welcome to Senzo Mall. Willkommen! Добро пожаловать!', ARRAY['#Tourism', '#Hurghada', '#SenzoMall'], 'https://facebook.com/post/fb002', 'published', '2026-01-28 15:00:00+02', 5800, 520, 1800, 0, 110000, 155000, 2.40, false, NULL, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'Valentine''s Day Gift Guide at Senzo Mall! From perfumes to fashion, find it all under one roof. دليل هدايا عيد الحب', ARRAY['#ValentinesDay', '#SenzoMall', '#GiftGuide'], 'https://facebook.com/post/fb003', 'published', '2026-02-08 10:00:00+02', 3500, 280, 950, 0, 72000, 98000, 1.90, true, 72.00, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'carousel', 'Ramadan Kareem! Senzo Mall wishes you and your family a blessed month. رمضان كريم!', ARRAY['#RamadanKareem', '#SenzoMall'], 'https://facebook.com/post/fb004', 'published', '2026-02-28 18:00:00+02', 8200, 680, 2400, 0, 145000, 195000, 2.80, false, NULL, 'seasonal', 'ar'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'video', 'Ramadan Nights Market at Senzo Mall! Every night after Iftar. Street food, crafts, music, and more. سوق ليالي رمضان', ARRAY['#RamadanNights', '#SenzoMall', '#Hurghada'], 'https://facebook.com/post/fb005', 'published', '2026-03-03 19:00:00+02', 6500, 480, 1900, 0, 125000, 170000, 2.50, false, NULL, 'event', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'Spinneys Ramadan deals — stock up for Iftar and Suhoor! عروض سبينيز الرمضانية', ARRAY['#Spinneys', '#Ramadan', '#Deals'], 'https://facebook.com/post/fb006', 'published', '2026-03-05 14:00:00+02', 3200, 220, 800, 0, 65000, 88000, 1.80, false, NULL, 'promotion', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'text', 'What''s your favourite Iftar spot at Senzo Mall? Tell us in the comments! 🍽️ إيه أحلى مكان إفطار في سنزو مول؟', ARRAY['#Iftar', '#SenzoMall'], 'https://facebook.com/post/fb007', 'published', '2026-03-07 17:30:00+02', 2800, 890, 320, 0, 58000, 75000, 2.30, true, 70.00, 'poll', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'video', 'Live from Ramadan Nights Market! The atmosphere is incredible tonight. بث مباشر من سوق ليالي رمضان', ARRAY['#RamadanNights', '#Live', '#SenzoMall'], 'https://facebook.com/post/fb008', 'published', '2026-03-09 20:30:00+02', 4100, 350, 1100, 0, 95000, 130000, 2.20, false, NULL, 'event', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'McDonald''s Family Meal Deal — perfect for your Iftar gathering! عرض ماكدونالدز العائلي', ARRAY['#McDonalds', '#FamilyDeal', '#SenzoMall', '#Iftar'], 'https://facebook.com/post/fb009', 'published', '2026-03-11 16:00:00+02', 3800, 260, 750, 0, 70000, 95000, 2.00, false, NULL, 'promotion', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'carousel', 'Eid Al-Fitr is coming! Start your Eid shopping at Senzo Mall. Exclusive deals across all stores. عروض العيد', ARRAY['#EidAlFitr', '#SenzoMall', '#EidShopping', '#عيد_الفطر'], 'https://facebook.com/post/fb010', 'published', '2026-03-15 13:00:00+02', 5500, 420, 1600, 0, 105000, 145000, 2.50, true, 80.00, 'promotion', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'Mother''s Day March 21 — spoil the queen of your life at Senzo Mall! عيد الأم ٢١ مارس', ARRAY['#MothersDay', '#SenzoMall', '#عيد_الأم'], 'https://facebook.com/post/fb011', 'published', '2026-03-17 11:00:00+02', 4800, 350, 1300, 0, 90000, 125000, 2.30, true, 75.00, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'Kidzo Indoor Park — the ultimate family destination! Perfect for Ramadan weekends. كيدزو', ARRAY['#Kidzo', '#SenzoMall', '#FamilyFun'], 'https://facebook.com/post/fb012', 'published', '2026-02-15 14:00:00+02', 3100, 195, 680, 0, 60000, 82000, 1.80, false, NULL, 'tenant_spotlight', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'video', 'DeFacto new arrivals — spring fashion at unbeatable prices! ديفاكتو ربيع ٢٠٢٦', ARRAY['#DeFacto', '#SpringFashion', '#SenzoMall'], 'https://facebook.com/post/fb013', 'published', '2026-02-20 15:00:00+02', 2800, 180, 550, 0, 52000, 72000, 1.70, false, NULL, 'tenant_spotlight', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'text', 'Parking tip: Use the south entrance for fastest access to the food court! نصيحة: استخدم المدخل الجنوبي', ARRAY['#SenzoMall', '#Tips'], 'https://facebook.com/post/fb014', 'published', '2026-02-03 10:00:00+02', 1800, 120, 280, 0, 38000, 50000, 1.50, true, 55.00, 'educational', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'image', 'Weekend at Senzo Mall! Live entertainment, great food, amazing deals. ويكند سنزو', ARRAY['#Weekend', '#SenzoMall', '#Hurghada'], 'https://facebook.com/post/fb015', 'published', '2026-03-13 17:00:00+02', 2500, 180, 520, 0, 48000, 65000, 1.70, false, NULL, 'lifestyle', 'multi');

-- TikTok posts (15 posts — higher engagement)
INSERT INTO social_posts (property_id, account_id, platform, content_type, caption, hashtags, post_url, status, published_at, likes, comments, shares, saves, reach, impressions, engagement_rate, ai_generated, ai_score, category, language) VALUES
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'When you walk into Senzo Mall and the AC hits different 😮‍💨 #relatable', ARRAY['#SenzoMall', '#Hurghada', '#MallVibes', '#Egypt'], 'https://tiktok.com/@senzomall/video/tt001', 'published', '2026-01-19 19:00:00+02', 8500, 420, 1200, 2100, 85000, 120000, 7.20, false, NULL, 'lifestyle', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'POV: Shopping spree at Adidas Senzo Mall 🛍️', ARRAY['#Adidas', '#SenzoMall', '#ShoppingSpree', '#Haul'], 'https://tiktok.com/@senzomall/video/tt002', 'published', '2026-01-26 20:00:00+02', 6200, 310, 850, 1500, 72000, 98000, 6.10, false, NULL, 'tenant_spotlight', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Valentine''s Day gift ideas under 500 EGP at Senzo Mall 💝 هدايا عيد الحب', ARRAY['#ValentinesDay', '#GiftIdeas', '#SenzoMall', '#Budget'], 'https://tiktok.com/@senzomall/video/tt003', 'published', '2026-02-09 18:00:00+02', 12000, 680, 2200, 3500, 110000, 155000, 8.50, true, 90.00, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'The food court at Senzo Mall hits different during Ramadan 🌙🍽️ فود كورت سنزو في رمضان', ARRAY['#Ramadan', '#FoodCourt', '#SenzoMall', '#Iftar'], 'https://tiktok.com/@senzomall/video/tt004', 'published', '2026-03-04 20:00:00+02', 15000, 920, 3100, 4200, 140000, 195000, 9.20, false, NULL, 'lifestyle', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Making a فانوس at Senzo Mall''s Ramadan Nights Market! 🏮 Tutorial', ARRAY['#Fanoos', '#DIY', '#Ramadan', '#SenzoMall'], 'https://tiktok.com/@senzomall/video/tt005', 'published', '2026-03-08 21:00:00+02', 18500, 1100, 4500, 5800, 180000, 250000, 10.20, false, NULL, 'event', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Senzo Mall Ramadan vibes — the whole market in 60 seconds 🎵', ARRAY['#RamadanVibes', '#SenzoMall', '#NightMarket'], 'https://tiktok.com/@senzomall/video/tt006', 'published', '2026-03-12 21:30:00+02', 11000, 580, 2000, 3200, 120000, 165000, 7.80, false, NULL, 'event', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Rate my outfit from LC Waikiki 1-10? 👗 New Eid collection', ARRAY['#LCWaikiki', '#Eid', '#OOTD', '#SenzoMall'], 'https://tiktok.com/@senzomall/video/tt007', 'published', '2026-03-15 19:00:00+02', 9800, 1500, 1800, 2800, 105000, 145000, 8.90, false, NULL, 'tenant_spotlight', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'video', 'Kidzo Park vlog — my kids'' honest reaction! 🎢', ARRAY['#Kidzo', '#FamilyFun', '#SenzoMall', '#KidsOfTikTok'], 'https://tiktok.com/@senzomall/video/tt008', 'published', '2026-02-16 17:00:00+02', 7200, 390, 950, 1800, 78000, 108000, 6.40, false, NULL, 'tenant_spotlight', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Things you didn''t know about Senzo Mall 🤯 Part 1', ARRAY['#DidYouKnow', '#SenzoMall', '#Hurghada', '#Facts'], 'https://tiktok.com/@senzomall/video/tt009', 'published', '2026-02-01 19:00:00+02', 5400, 280, 700, 1200, 62000, 85000, 5.80, true, 72.00, 'educational', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'live', 'LIVE: Oud music night at Ramadan Nights Market 🎶', ARRAY['#Live', '#OudMusic', '#Ramadan', '#SenzoMall'], 'https://tiktok.com/@senzomall/video/tt010', 'published', '2026-03-10 21:00:00+02', 3200, 1800, 450, 800, 42000, 55000, 8.50, false, NULL, 'event', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Senzo Mall escalator race challenge 🏃‍♂️ (don''t try this at home)', ARRAY['#Challenge', '#SenzoMall', '#Fun', '#Hurghada'], 'https://tiktok.com/@senzomall/video/tt011', 'published', '2026-02-22 20:00:00+02', 22000, 1400, 5200, 3800, 210000, 290000, 11.50, false, NULL, 'lifestyle', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Mother''s Day surprise shopping at Senzo Mall 🥹💐 عيد الأم', ARRAY['#MothersDay', '#Surprise', '#SenzoMall', '#عيد_الأم'], 'https://tiktok.com/@senzomall/video/tt012', 'published', '2026-03-17 18:00:00+02', 14000, 850, 3200, 4100, 135000, 185000, 9.00, true, 88.00, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'What 100 EGP gets you at Senzo Mall food court 🍕🍔🧆', ARRAY['#100EGP', '#FoodChallenge', '#SenzoMall', '#FoodCourt'], 'https://tiktok.com/@senzomall/video/tt013', 'published', '2026-02-12 19:00:00+02', 16500, 1200, 3800, 4500, 155000, 215000, 9.80, false, NULL, 'lifestyle', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Timberland winter boots unboxing at Senzo Mall 📦', ARRAY['#Timberland', '#Unboxing', '#SenzoMall', '#Boots'], 'https://tiktok.com/@senzomall/video/tt014', 'published', '2026-01-24 18:00:00+02', 4800, 210, 620, 1100, 55000, 75000, 5.50, false, NULL, 'tenant_spotlight', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Senzo Mall morning vs night — which vibe do you prefer? 🌅🌙', ARRAY['#SenzoMall', '#DayVsNight', '#Hurghada'], 'https://tiktok.com/@senzomall/video/tt015', 'published', '2026-03-18 20:00:00+02', 7800, 480, 1300, 2200, 88000, 122000, 7.10, false, NULL, 'lifestyle', 'en');

-- X posts (12 posts)
INSERT INTO social_posts (property_id, account_id, platform, content_type, caption, hashtags, post_url, status, published_at, likes, comments, shares, saves, reach, impressions, engagement_rate, ai_generated, ai_score, category, language) VALUES
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'New year, new stores at Senzo Mall! Stay tuned for exciting announcements 🎉 #SenzoMall #Hurghada', ARRAY['#SenzoMall', '#Hurghada', '#NewStores'], 'https://x.com/SenzoMall/status/x001', 'published', '2026-01-21 10:00:00+02', 180, 25, 45, 0, 12000, 18000, 1.40, false, NULL, 'announcement', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'This Friday: Live entertainment at Senzo Mall starting 7 PM. Free entry! 🎵 #FridayVibes', ARRAY['#FridayVibes', '#SenzoMall', '#LiveMusic'], 'https://x.com/SenzoMall/status/x002', 'published', '2026-01-30 09:00:00+02', 120, 18, 32, 0, 9500, 14000, 1.20, false, NULL, 'event', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'image', 'Valentine''s Day countdown! 3 days to go. Find the perfect gift at Senzo Mall 💝', ARRAY['#ValentinesDay', '#SenzoMall', '#Countdown'], 'https://x.com/SenzoMall/status/x003', 'published', '2026-02-11 11:00:00+02', 210, 32, 55, 0, 14000, 20000, 1.50, true, 65.00, 'seasonal', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Ramadan Kareem to all our visitors and tenants! Extended evening hours during Ramadan 🌙 #RamadanKareem', ARRAY['#RamadanKareem', '#SenzoMall'], 'https://x.com/SenzoMall/status/x004', 'published', '2026-02-28 17:00:00+02', 350, 45, 120, 0, 22000, 30000, 1.80, false, NULL, 'announcement', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Ramadan Nights Market starts tonight! Join us after Iftar for food, crafts, and entertainment. Open until 3 AM!', ARRAY['#RamadanNights', '#SenzoMall', '#Hurghada'], 'https://x.com/SenzoMall/status/x005', 'published', '2026-03-01 18:00:00+02', 280, 38, 85, 0, 18000, 25000, 1.60, false, NULL, 'event', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Parking update: Extended free parking during Ramadan! First 3 hours free. #SenzoMall #Parking', ARRAY['#SenzoMall', '#Parking', '#Ramadan'], 'https://x.com/SenzoMall/status/x006', 'published', '2026-03-03 10:00:00+02', 420, 55, 180, 0, 28000, 38000, 2.20, false, NULL, 'announcement', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'image', 'Tonight''s Ramadan Nights vibe 📸 Join us! #RamadanNights #SenzoMall', ARRAY['#RamadanNights', '#SenzoMall'], 'https://x.com/SenzoMall/status/x007', 'published', '2026-03-07 20:00:00+02', 190, 22, 48, 0, 13000, 18000, 1.30, false, NULL, 'event', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Eid Al-Fitr countdown: 12 days! Get your Eid outfits sorted at Senzo Mall. New collections arriving daily.', ARRAY['#EidAlFitr', '#SenzoMall', '#EidFashion'], 'https://x.com/SenzoMall/status/x008', 'published', '2026-03-19 09:00:00+02', 250, 30, 70, 0, 16000, 22000, 1.50, true, 68.00, 'promotion', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Pro tip: Visit Senzo Mall after 8 PM during Ramadan for the best atmosphere. The night market is magical 🌙', ARRAY['#SenzoMall', '#ProTip', '#Ramadan'], 'https://x.com/SenzoMall/status/x009', 'published', '2026-03-10 19:00:00+02', 160, 20, 35, 0, 11000, 15000, 1.20, true, 58.00, 'educational', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Mother''s Day is March 21! Tweet us your favourite mom moment for a chance to win a Senzo Mall gift card 🎁', ARRAY['#MothersDay', '#SenzoMall', '#Giveaway'], 'https://x.com/SenzoMall/status/x010', 'published', '2026-03-16 10:00:00+02', 520, 180, 250, 0, 35000, 48000, 2.80, true, 82.00, 'seasonal', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Adidas Spring Collection now available at Senzo Mall! First 50 customers get a free gym bag 🏋️', ARRAY['#Adidas', '#SenzoMall', '#Spring'], 'https://x.com/SenzoMall/status/x011', 'published', '2026-03-14 12:00:00+02', 280, 42, 90, 0, 19000, 26000, 1.60, false, NULL, 'tenant_spotlight', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'KFC or McDonald''s for Iftar? The eternal debate. Both are at Senzo Mall 😏 #TeamKFC or #TeamMcDonalds?', ARRAY['#KFC', '#McDonalds', '#Iftar', '#SenzoMall'], 'https://x.com/SenzoMall/status/x012', 'published', '2026-03-06 17:00:00+02', 380, 250, 120, 0, 25000, 34000, 2.10, false, NULL, 'poll', 'en');

-- Scheduled and draft posts
INSERT INTO social_posts (property_id, account_id, platform, content_type, caption, hashtags, status, scheduled_at, ai_generated, ai_score, category, language) VALUES
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'reel', 'Eid Al-Fitr 2026 — countdown to the biggest celebration of the year! العد التنازلي لعيد الفطر', ARRAY['#EidAlFitr', '#SenzoMall', '#عيد_الفطر'], 'scheduled', '2026-03-25 19:00:00+02', true, 85.00, 'seasonal', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'facebook', 'carousel', 'Eid shopping guide — your complete Eid wardrobe sorted at Senzo Mall! دليل تسوق العيد', ARRAY['#EidShopping', '#SenzoMall', '#EidFashion'], 'scheduled', '2026-03-26 14:00:00+02', true, 80.00, 'promotion', 'multi'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'tiktok', 'reel', 'Eid outfit haul from Senzo Mall — EGP 2000 budget challenge! 🛍️', ARRAY['#EidHaul', '#SenzoMall', '#BudgetFashion'], 'scheduled', '2026-03-27 20:00:00+02', false, NULL, 'lifestyle', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'instagram', 'carousel', 'Last-minute Eid gifts — Senzo Mall has you covered!', ARRAY['#EidGifts', '#SenzoMall', '#LastMinute'], 'draft', NULL, true, 78.00, 'promotion', 'en'),
('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'x', 'text', 'Eid Mubarak from Senzo Mall! Wishing everyone a joyful Eid. عيد مبارك', ARRAY['#EidMubarak', '#SenzoMall'], 'draft', NULL, false, NULL, 'announcement', 'multi');

-- ── Content Calendar (30 entries, next 30 days) ───────────────

INSERT INTO content_calendar (property_id, date, platform, content_type, category, title, description, status, ai_suggested) VALUES
('a0000000-0000-0000-0000-000000000001', '2026-03-20', 'instagram', 'image', 'seasonal', 'Mother''s Day Eve Reminder', 'Post reminder for last-minute Mother''s Day gifts — feature top gift picks from tenants', 'content_ready', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-20', 'tiktok', 'reel', 'lifestyle', 'Mother''s Day Gift Reveal', 'Surprise gift reveal for moms — emotional reaction video at Senzo Mall', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-21', 'instagram', 'carousel', 'seasonal', 'Happy Mother''s Day!', 'Celebrate mothers — feature family photos at Senzo Mall, Ramadan + Mother''s Day combo', 'content_ready', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-21', 'facebook', 'image', 'seasonal', 'Mother''s Day Celebration', 'Mother''s Day greeting post with special offers from beauty and fashion tenants', 'approved', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-22', 'instagram', 'reel', 'event', 'Ramadan Nights Week 4', 'Week 4 highlights from Ramadan Nights Market — best food stalls and crafts', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-22', 'x', 'text', 'announcement', 'Weekend Hours Reminder', 'Ramadan weekend hours — open until 3AM Friday and Saturday', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-23', 'tiktok', 'reel', 'lifestyle', 'Ramadan Late Night Shopping', 'Late night shopping vibes at Senzo Mall during Ramadan — 1AM and still busy', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-24', 'instagram', 'image', 'promotion', 'Eid Shopping Early Bird', 'Start your Eid shopping early — preview of Eid collections arriving at stores', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-24', 'facebook', 'carousel', 'promotion', 'Eid Fashion Preview', 'Preview new Eid collections from LC Waikiki, DeFacto, Adidas', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-25', 'instagram', 'reel', 'seasonal', 'Eid Countdown — 6 Days!', 'Eid countdown reel — excitement building, stores preparing', 'content_ready', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-25', 'tiktok', 'reel', 'seasonal', 'Eid Countdown TikTok', 'Fun countdown to Eid — what to expect at Senzo Mall during Eid week', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-26', 'facebook', 'video', 'event', 'Ramadan Nights Finale Preview', 'Preview of the final weekend of Ramadan Nights Market — special acts booked', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-27', 'instagram', 'carousel', 'promotion', 'Last Week of Ramadan Deals', 'Round-up of all ongoing Ramadan promotions — last chance before Eid', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-27', 'x', 'text', 'promotion', 'Last Week Ramadan Deals', 'Thread of all current deals at Senzo Mall — last week of Ramadan', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-28', 'tiktok', 'reel', 'event', 'Ramadan Nights Grand Finale', 'Grand finale of Ramadan Nights Market — fireworks and live music', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-28', 'instagram', 'story', 'behind_scenes', 'Eid Prep Behind the Scenes', 'Decorations going up, stores stocking Eid collections, staff preparing', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-29', 'instagram', 'image', 'announcement', 'Last Day of Ramadan', 'Farewell Ramadan — thank you for an amazing month at Senzo Mall', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-29', 'facebook', 'image', 'announcement', 'Ramadan Farewell', 'Thank you for spending Ramadan with us — Eid Mubarak!', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-30', 'instagram', 'reel', 'seasonal', 'Eid Eve Excitement', 'The night before Eid — last minute shopping rush at Senzo Mall', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-30', 'tiktok', 'reel', 'seasonal', 'Eid Eve Rush', 'The chaos of last-minute Eid shopping — relatable content', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-03-31', 'instagram', 'carousel', 'seasonal', 'Eid Mubarak!', 'Eid Mubarak greeting — beautiful visuals, bilingual AR/EN', 'content_ready', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-31', 'facebook', 'image', 'seasonal', 'Eid Mubarak!', 'Eid Al-Fitr greeting from Senzo Mall — bilingual', 'content_ready', false),
('a0000000-0000-0000-0000-000000000001', '2026-03-31', 'tiktok', 'reel', 'event', 'Eid Day 1 at Senzo Mall', 'First day of Eid celebrations at Senzo Mall — entertainment, kids, fashion', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-04-01', 'instagram', 'reel', 'event', 'Eid Day 2 — Fashion Show', 'Eid fashion show at Senzo Mall central atrium', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-04-02', 'instagram', 'carousel', 'event', 'Eid Day 3 — Family Fun', 'Final day of Eid celebrations — family activities recap', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-04-05', 'instagram', 'image', 'lifestyle', 'Post-Eid Weekend Vibes', 'Back to normal — but Senzo Mall is always special', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-04-08', 'tiktok', 'reel', 'tenant_spotlight', 'Tenant Spotlight: Spinneys', 'Tour of Spinneys — your grocery destination at Senzo Mall', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-04-10', 'instagram', 'carousel', 'lifestyle', 'Spring at Senzo Mall', 'Spring vibes at the mall — new season, new looks, new energy', 'planned', true),
('a0000000-0000-0000-0000-000000000001', '2026-04-13', 'instagram', 'reel', 'event', 'Easter / Sham El-Nessim', 'Easter celebrations at Senzo Mall — family activities and food festival', 'planned', false),
('a0000000-0000-0000-0000-000000000001', '2026-04-15', 'facebook', 'video', 'educational', 'Mall Directory Guide', 'Complete guide to finding everything at Senzo Mall — new visitor friendly', 'planned', true);

-- ── Social Analytics (60 days per account) ────────────────────

-- Instagram analytics (60 days)
INSERT INTO social_analytics (account_id, date, followers_count, followers_gained, followers_lost, posts_published, total_reach, total_impressions, total_engagement, engagement_rate) VALUES
('b1000000-0000-0000-0000-000000000001', '2026-01-18', 43200, 85, 12, 1, 28000, 38000, 1050, 2.80),
('b1000000-0000-0000-0000-000000000001', '2026-01-19', 43270, 82, 12, 0, 18000, 24000, 620, 2.60),
('b1000000-0000-0000-0000-000000000001', '2026-01-20', 43380, 125, 15, 1, 45000, 62000, 4200, 4.80),
('b1000000-0000-0000-0000-000000000001', '2026-01-21', 43440, 72, 12, 0, 22000, 30000, 780, 2.50),
('b1000000-0000-0000-0000-000000000001', '2026-01-22', 43500, 70, 10, 0, 20000, 27000, 650, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-01-23', 43560, 68, 8, 0, 19000, 26000, 600, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-01-24', 43620, 72, 12, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-01-25', 43720, 112, 12, 1, 32000, 45000, 2400, 3.90),
('b1000000-0000-0000-0000-000000000001', '2026-01-26', 43780, 70, 10, 0, 21000, 28000, 680, 2.50),
('b1000000-0000-0000-0000-000000000001', '2026-01-27', 43840, 68, 8, 0, 19000, 25000, 590, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-01-28', 43900, 70, 10, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-01-29', 43960, 68, 8, 0, 19000, 26000, 600, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-01-30', 44020, 72, 12, 1, 20000, 27000, 1200, 2.60),
('b1000000-0000-0000-0000-000000000001', '2026-01-31', 44080, 68, 8, 0, 18000, 24000, 560, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-01', 44140, 70, 10, 0, 19000, 25000, 590, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-02', 44200, 68, 8, 0, 18000, 24000, 550, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-03', 44260, 70, 10, 0, 19000, 25000, 580, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-04', 44320, 68, 8, 0, 18000, 24000, 540, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-05', 44380, 72, 12, 0, 20000, 27000, 620, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-06', 44440, 68, 8, 0, 18000, 24000, 540, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-07', 44520, 92, 12, 1, 28000, 38000, 1850, 3.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-08', 44580, 70, 10, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-09', 44640, 68, 8, 0, 19000, 25000, 590, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-10', 44720, 92, 12, 1, 38000, 52000, 2900, 4.60),
('b1000000-0000-0000-0000-000000000001', '2026-02-11', 44780, 70, 10, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-12', 44840, 68, 8, 0, 19000, 25000, 580, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-13', 44910, 82, 12, 1, 22000, 30000, 1400, 2.90),
('b1000000-0000-0000-0000-000000000001', '2026-02-14', 44980, 80, 10, 0, 25000, 34000, 850, 2.60),
('b1000000-0000-0000-0000-000000000001', '2026-02-15', 45050, 78, 8, 0, 22000, 30000, 720, 2.50),
('b1000000-0000-0000-0000-000000000001', '2026-02-16', 45120, 78, 8, 0, 21000, 28000, 680, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-17', 45180, 72, 12, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-18', 45240, 68, 8, 0, 19000, 25000, 580, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-19', 45300, 70, 10, 0, 19000, 26000, 600, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-20', 45360, 68, 8, 0, 18000, 24000, 540, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-21', 45420, 72, 12, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-22', 45480, 68, 8, 0, 19000, 25000, 580, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-23', 45540, 70, 10, 0, 19000, 26000, 600, 2.30),
('b1000000-0000-0000-0000-000000000001', '2026-02-24', 45600, 68, 8, 0, 18000, 24000, 540, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-25', 45700, 115, 15, 1, 58000, 82000, 4500, 6.20),
('b1000000-0000-0000-0000-000000000001', '2026-02-26', 45780, 90, 10, 0, 28000, 38000, 950, 2.70),
('b1000000-0000-0000-0000-000000000001', '2026-02-27', 45840, 68, 8, 0, 22000, 30000, 700, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-02-28', 45900, 72, 12, 0, 24000, 32000, 780, 2.60),
('b1000000-0000-0000-0000-000000000001', '2026-03-01', 45980, 95, 15, 1, 15000, 18000, 650, 2.20),
('b1000000-0000-0000-0000-000000000001', '2026-03-02', 46080, 115, 15, 1, 52000, 71000, 3800, 5.10),
('b1000000-0000-0000-0000-000000000001', '2026-03-03', 46150, 78, 8, 0, 25000, 34000, 820, 2.60),
('b1000000-0000-0000-0000-000000000001', '2026-03-04', 46220, 78, 8, 0, 22000, 30000, 700, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-03-05', 46290, 82, 12, 1, 18000, 22000, 890, 2.80),
('b1000000-0000-0000-0000-000000000001', '2026-03-06', 46380, 102, 12, 1, 42000, 58000, 3100, 5.00),
('b1000000-0000-0000-0000-000000000001', '2026-03-07', 46440, 68, 8, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-03-08', 46520, 92, 12, 1, 25000, 35000, 1600, 3.40),
('b1000000-0000-0000-0000-000000000001', '2026-03-09', 46580, 68, 8, 0, 20000, 27000, 640, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-03-10', 46700, 135, 15, 1, 65000, 95000, 5200, 7.10),
('b1000000-0000-0000-0000-000000000001', '2026-03-11', 46780, 90, 10, 0, 28000, 38000, 920, 2.60),
('b1000000-0000-0000-0000-000000000001', '2026-03-12', 46870, 102, 12, 1, 35000, 48000, 2400, 4.00),
('b1000000-0000-0000-0000-000000000001', '2026-03-13', 46940, 78, 8, 0, 22000, 30000, 700, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-03-14', 47040, 112, 12, 1, 40000, 55000, 2800, 4.50),
('b1000000-0000-0000-0000-000000000001', '2026-03-15', 47110, 78, 8, 0, 22000, 30000, 700, 2.40),
('b1000000-0000-0000-0000-000000000001', '2026-03-16', 47210, 115, 15, 1, 50000, 72000, 3900, 5.80),
('b1000000-0000-0000-0000-000000000001', '2026-03-17', 47310, 112, 12, 1, 30000, 42000, 2100, 3.80),
('b1000000-0000-0000-0000-000000000001', '2026-03-18', 47420, 125, 15, 1, 36000, 50000, 2600, 4.30);

-- Facebook analytics (60 days — sample every few days for brevity, full pattern)
INSERT INTO social_analytics (account_id, date, followers_count, followers_gained, followers_lost, posts_published, total_reach, total_impressions, total_engagement, engagement_rate) VALUES
('b1000000-0000-0000-0000-000000000002', '2026-01-18', 117500, 120, 25, 0, 45000, 60000, 1200, 1.60),
('b1000000-0000-0000-0000-000000000002', '2026-01-19', 117590, 115, 25, 0, 42000, 55000, 1100, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-20', 117680, 115, 25, 0, 43000, 57000, 1120, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-21', 117770, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-22', 117880, 135, 25, 1, 85000, 120000, 4200, 2.10),
('b1000000-0000-0000-0000-000000000002', '2026-01-23', 117970, 115, 25, 0, 44000, 58000, 1140, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-24', 118060, 115, 25, 0, 43000, 56000, 1100, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-25', 118150, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-26', 118240, 115, 25, 0, 43000, 57000, 1120, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-27', 118330, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-01-28', 118450, 145, 25, 1, 110000, 155000, 5800, 2.40),
('b1000000-0000-0000-0000-000000000002', '2026-01-29', 118540, 115, 25, 0, 45000, 60000, 1200, 1.60),
('b1000000-0000-0000-0000-000000000002', '2026-01-30', 118630, 115, 25, 0, 43000, 57000, 1100, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-01', 118810, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-03', 118990, 115, 25, 1, 38000, 50000, 1800, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-05', 119170, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-08', 119440, 115, 25, 1, 72000, 98000, 3500, 1.90),
('b1000000-0000-0000-0000-000000000002', '2026-02-10', 119620, 115, 25, 0, 44000, 58000, 1150, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-13', 119890, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-15', 120070, 130, 25, 1, 60000, 82000, 3100, 1.80),
('b1000000-0000-0000-0000-000000000002', '2026-02-17', 120250, 115, 25, 0, 42000, 55000, 1080, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-20', 120520, 125, 25, 1, 52000, 72000, 2800, 1.70),
('b1000000-0000-0000-0000-000000000002', '2026-02-22', 120700, 115, 25, 0, 43000, 57000, 1120, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-25', 120970, 115, 25, 0, 44000, 58000, 1140, 1.50),
('b1000000-0000-0000-0000-000000000002', '2026-02-28', 121300, 180, 25, 1, 145000, 195000, 8200, 2.80),
('b1000000-0000-0000-0000-000000000002', '2026-03-01', 121500, 225, 25, 0, 65000, 88000, 2200, 1.80),
('b1000000-0000-0000-0000-000000000002', '2026-03-03', 121750, 150, 25, 1, 125000, 170000, 6500, 2.50),
('b1000000-0000-0000-0000-000000000002', '2026-03-05', 122000, 150, 25, 1, 65000, 88000, 3200, 1.80),
('b1000000-0000-0000-0000-000000000002', '2026-03-07', 122250, 150, 25, 1, 58000, 75000, 2800, 2.30),
('b1000000-0000-0000-0000-000000000002', '2026-03-09', 122500, 150, 25, 1, 95000, 130000, 4100, 2.20),
('b1000000-0000-0000-0000-000000000002', '2026-03-11', 122750, 150, 25, 1, 70000, 95000, 3800, 2.00),
('b1000000-0000-0000-0000-000000000002', '2026-03-13', 123000, 150, 25, 1, 48000, 65000, 2500, 1.70),
('b1000000-0000-0000-0000-000000000002', '2026-03-15', 123300, 175, 25, 1, 105000, 145000, 5500, 2.50),
('b1000000-0000-0000-0000-000000000002', '2026-03-17', 123550, 175, 25, 1, 90000, 125000, 4800, 2.30),
('b1000000-0000-0000-0000-000000000002', '2026-03-18', 123700, 175, 25, 0, 50000, 68000, 1600, 1.60);

-- TikTok analytics (60 days)
INSERT INTO social_analytics (account_id, date, followers_count, followers_gained, followers_lost, posts_published, total_reach, total_impressions, total_engagement, engagement_rate) VALUES
('b1000000-0000-0000-0000-000000000003', '2026-01-18', 14200, 45, 5, 0, 25000, 35000, 1200, 4.80),
('b1000000-0000-0000-0000-000000000003', '2026-01-19', 14280, 85, 5, 1, 85000, 120000, 8500, 7.20),
('b1000000-0000-0000-0000-000000000003', '2026-01-20', 14350, 75, 5, 0, 35000, 48000, 1800, 5.20),
('b1000000-0000-0000-0000-000000000003', '2026-01-22', 14490, 75, 5, 0, 32000, 44000, 1600, 5.00),
('b1000000-0000-0000-0000-000000000003', '2026-01-24', 14630, 75, 5, 1, 55000, 75000, 4800, 5.50),
('b1000000-0000-0000-0000-000000000003', '2026-01-26', 14800, 95, 5, 1, 72000, 98000, 6200, 6.10),
('b1000000-0000-0000-0000-000000000003', '2026-01-28', 14940, 75, 5, 0, 35000, 48000, 1800, 5.20),
('b1000000-0000-0000-0000-000000000003', '2026-01-30', 15080, 75, 5, 0, 32000, 44000, 1600, 5.00),
('b1000000-0000-0000-0000-000000000003', '2026-02-01', 15220, 75, 5, 1, 62000, 85000, 5400, 5.80),
('b1000000-0000-0000-0000-000000000003', '2026-02-05', 15500, 75, 5, 0, 35000, 48000, 1800, 5.20),
('b1000000-0000-0000-0000-000000000003', '2026-02-09', 15800, 110, 5, 1, 110000, 155000, 12000, 8.50),
('b1000000-0000-0000-0000-000000000003', '2026-02-12', 16100, 120, 5, 1, 155000, 215000, 16500, 9.80),
('b1000000-0000-0000-0000-000000000003', '2026-02-16', 16400, 85, 5, 1, 78000, 108000, 7200, 6.40),
('b1000000-0000-0000-0000-000000000003', '2026-02-20', 16700, 75, 5, 0, 35000, 48000, 1800, 5.20),
('b1000000-0000-0000-0000-000000000003', '2026-02-22', 16900, 150, 5, 1, 210000, 290000, 22000, 11.50),
('b1000000-0000-0000-0000-000000000003', '2026-02-25', 17100, 75, 5, 0, 38000, 52000, 2000, 5.40),
('b1000000-0000-0000-0000-000000000003', '2026-02-28', 17300, 75, 5, 0, 35000, 48000, 1800, 5.20),
('b1000000-0000-0000-0000-000000000003', '2026-03-01', 17400, 75, 5, 0, 32000, 44000, 1600, 5.00),
('b1000000-0000-0000-0000-000000000003', '2026-03-04', 17600, 120, 5, 1, 140000, 195000, 15000, 9.20),
('b1000000-0000-0000-0000-000000000003', '2026-03-06', 17750, 75, 5, 0, 35000, 48000, 1800, 5.20),
('b1000000-0000-0000-0000-000000000003', '2026-03-08', 17950, 130, 5, 1, 180000, 250000, 18500, 10.20),
('b1000000-0000-0000-0000-000000000003', '2026-03-10', 18150, 125, 5, 1, 42000, 55000, 3200, 8.50),
('b1000000-0000-0000-0000-000000000003', '2026-03-12', 18350, 110, 5, 1, 120000, 165000, 11000, 7.80),
('b1000000-0000-0000-0000-000000000003', '2026-03-15', 18600, 140, 5, 1, 105000, 145000, 9800, 8.90),
('b1000000-0000-0000-0000-000000000003', '2026-03-17', 18850, 135, 5, 1, 135000, 185000, 14000, 9.00),
('b1000000-0000-0000-0000-000000000003', '2026-03-18', 19000, 160, 10, 1, 88000, 122000, 7800, 7.10);

-- X analytics (60 days)
INSERT INTO social_analytics (account_id, date, followers_count, followers_gained, followers_lost, posts_published, total_reach, total_impressions, total_engagement, engagement_rate) VALUES
('b1000000-0000-0000-0000-000000000004', '2026-01-18', 8050, 15, 3, 0, 5000, 7000, 80, 1.00),
('b1000000-0000-0000-0000-000000000004', '2026-01-21', 8085, 20, 3, 1, 12000, 18000, 180, 1.40),
('b1000000-0000-0000-0000-000000000004', '2026-01-25', 8125, 15, 3, 0, 5500, 7500, 85, 1.00),
('b1000000-0000-0000-0000-000000000004', '2026-01-30', 8170, 20, 3, 1, 9500, 14000, 120, 1.20),
('b1000000-0000-0000-0000-000000000004', '2026-02-03', 8210, 15, 3, 0, 5500, 7500, 85, 1.00),
('b1000000-0000-0000-0000-000000000004', '2026-02-08', 8250, 15, 3, 0, 5500, 7500, 85, 1.00),
('b1000000-0000-0000-0000-000000000004', '2026-02-11', 8290, 22, 3, 1, 14000, 20000, 210, 1.50),
('b1000000-0000-0000-0000-000000000004', '2026-02-15', 8330, 15, 3, 0, 5500, 7500, 85, 1.00),
('b1000000-0000-0000-0000-000000000004', '2026-02-20', 8370, 15, 3, 0, 5500, 7500, 85, 1.00),
('b1000000-0000-0000-0000-000000000004', '2026-02-25', 8410, 15, 3, 0, 6000, 8000, 90, 1.10),
('b1000000-0000-0000-0000-000000000004', '2026-02-28', 8455, 30, 3, 1, 22000, 30000, 350, 1.80),
('b1000000-0000-0000-0000-000000000004', '2026-03-01', 8490, 38, 3, 1, 18000, 25000, 280, 1.60),
('b1000000-0000-0000-0000-000000000004', '2026-03-03', 8530, 45, 5, 1, 28000, 38000, 420, 2.20),
('b1000000-0000-0000-0000-000000000004', '2026-03-06', 8575, 25, 3, 1, 25000, 34000, 380, 2.10),
('b1000000-0000-0000-0000-000000000004', '2026-03-07', 8600, 28, 3, 1, 13000, 18000, 190, 1.30),
('b1000000-0000-0000-0000-000000000004', '2026-03-10', 8650, 25, 3, 1, 11000, 15000, 160, 1.20),
('b1000000-0000-0000-0000-000000000004', '2026-03-14', 8700, 28, 3, 1, 19000, 26000, 280, 1.60),
('b1000000-0000-0000-0000-000000000004', '2026-03-16', 8750, 55, 5, 1, 35000, 48000, 520, 2.80),
('b1000000-0000-0000-0000-000000000004', '2026-03-18', 8800, 28, 3, 0, 8000, 11000, 120, 1.10),
('b1000000-0000-0000-0000-000000000004', '2026-03-19', 8830, 35, 5, 1, 16000, 22000, 250, 1.50);
