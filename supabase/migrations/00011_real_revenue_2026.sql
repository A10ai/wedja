-- ============================================================
-- Migration 00011: Load REAL 2026 revenue data from Senzo Mall JDE
-- Replaces all simulated rent_transactions with actual monthly
-- rent amounts extracted from the JDE budget/revenue PDF.
-- ============================================================

DO $$
DECLARE
  v_prop UUID := 'a0000000-0000-0000-0000-000000000001';

  -- Zone IDs
  z_fashion_core UUID := 'b0000000-0000-0000-0000-000000000001';
  z_right_wing   UUID := 'b0000000-0000-0000-0000-000000000002';
  z_food_left    UUID := 'b0000000-0000-0000-0000-000000000003';
  z_kids         UUID := 'b0000000-0000-0000-0000-000000000004';
  z_anchor       UUID := 'b0000000-0000-0000-0000-000000000005';
  z_services     UUID := 'b0000000-0000-0000-0000-000000000006';

  v_tenant_id  UUID;
  v_unit_id    UUID;
  v_lease_id   UUID;
  v_rec        RECORD;
  v_month      INT;
  v_amount     NUMERIC;
  v_status     TEXT;
  v_pay_date   DATE;
  v_unit_seq   INT := 300; -- start above existing unit numbering

BEGIN

  -- ================================================================
  -- STEP 1: Delete ALL existing rent_transactions
  -- ================================================================
  DELETE FROM rent_transactions;

  RAISE NOTICE 'Deleted all existing rent_transactions';

  -- ================================================================
  -- STEP 2: Create temp table with real monthly rent data
  -- Each row: tenant name, unit_number, 12 monthly amounts (EGP)
  -- ================================================================

  CREATE TEMP TABLE _real_rent (
    idx          SERIAL,
    tenant_name  TEXT,
    unit_ref     TEXT,
    m01 NUMERIC, m02 NUMERIC, m03 NUMERIC, m04 NUMERIC,
    m05 NUMERIC, m06 NUMERIC, m07 NUMERIC, m08 NUMERIC,
    m09 NUMERIC, m10 NUMERIC, m11 NUMERIC, m12 NUMERIC,
    category     TEXT DEFAULT 'fashion',
    brand_type   TEXT DEFAULT 'local',
    zone_id      UUID,
    area_sqm     NUMERIC DEFAULT 72
  ) ON COMMIT DROP;

  -- ── Main Tenants ──────────────────────────────────────────
  INSERT INTO _real_rent (tenant_name, unit_ref, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, category, brand_type, zone_id, area_sqm) VALUES
    ('Dare', '10C/11C', 76999, 80849, 80849, 80849, 80849, 80849, 80849, 80849, 80849, 80849, 80849, 80849, 'fashion', 'local', z_fashion_core, 96),
    ('Ravin', '13B/14B/15B', 117700, 117700, 117700, 117700, 117700, 117700, 121820, 125939, 125939, 125939, 125939, 125939, 'fashion', 'local', z_right_wing, 440),
    ('Colin''s', '13B/14B', 178304, 166248, 265296, 293395, 228438, 245441, 263228, 256911, 212207, 264276, 287596, 228961, 'fashion', 'local', z_right_wing, 443),
    ('Dally Dress', '16B-19B', 96268, 96268, 96268, 96268, 96268, 96268, 96268, 96268, 96268, 96268, 101081, 101081, 'fashion', 'local', z_fashion_core, 216),
    ('Premoda', '20B-22B', 81265, 81265, 81265, 81265, 81265, 81265, 81265, 81265, 81265, 81265, 85329, 85329, 'fashion', 'local', z_fashion_core, 216),
    ('OR', '33B,5', 135769, 135769, 135769, 183288, 183288, 183288, 183288, 183288, 183288, 183288, 183288, 183288, 'fashion', 'local', z_right_wing, 388),
    ('Town Team', '17A/18A', 243425, 243425, 260465, 260465, 260465, 260465, 260465, 260465, 260465, 260465, 260465, 260465, 'fashion', 'local', z_fashion_core, 650),
    ('Concrete', '31A', 129000, 129000, 141900, 141900, 141900, 141900, 141900, 141900, 141900, 141900, 141900, 141900, 'fashion', 'local', z_right_wing, 172),
    ('Surf Shop', '38A', 110938, 110938, 110938, 110938, 110938, 110938, 110938, 122032, 122032, 122032, 122032, 122032, 'fashion', 'local', z_fashion_core, 108),
    ('Defacto', 'E9', 231525, 231525, 231525, 231525, 231525, 231525, 231525, 231525, 231525, 243101, 243101, 243101, 'fashion', 'international', z_fashion_core, 1586),
    ('LC Waikiki', 'E10', 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 1175796, 'fashion', 'international', z_fashion_core, 1719),
    ('Spinneys', 'H.M', 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 1650000, 'grocery', 'international', z_anchor, 5327),
    ('Converse', '31B', 31745, 31745, 31745, 34284, 34284, 34284, 34284, 34284, 34284, 34284, 34284, 34284, 'fashion', 'international', z_fashion_core, 72);

  -- ── Medium Tenants ────────────────────────────────────────
  INSERT INTO _real_rent (tenant_name, unit_ref, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, category, brand_type, zone_id, area_sqm) VALUES
    ('Adidas', 'E5,E6', 164000, 164000, 180400, 180400, 180400, 180400, 180400, 180400, 180400, 180400, 180400, 180400, 'fashion', 'international', z_fashion_core, 222),
    ('Puma', 'E7', 67100, 67100, 67100, 67100, 67100, 67100, 67100, 67100, 67100, 67100, 67100, 67100, 'fashion', 'international', z_fashion_core, 160),
    ('Levi''s', 'E8', 58080, 58080, 58080, 58080, 58080, 58080, 58080, 58080, 58080, 63888, 63888, 63888, 'fashion', 'international', z_fashion_core, 100),
    ('Timberland', '32B,2', 132660, 132660, 132660, 132660, 132660, 132660, 132660, 132660, 132660, 132660, 132660, 132660, 'fashion', 'international', z_fashion_core, 103),
    ('Geox', '1C,2', 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 58080, 'fashion', 'international', z_fashion_core, 90),
    ('Kazary', '34A/35A', 126385, 126385, 126385, 139024, 139024, 139024, 139024, 139024, 139024, 139024, 139024, 139024, 'fashion', 'local', z_right_wing, 217),
    ('Palladium', '28B', 115200, 115200, 115200, 115200, 115200, 115200, 115200, 115200, 126720, 126720, 126720, 126720, 'fashion', 'local', z_fashion_core, 72),
    ('Ozone', 'OPEN D', 52243, 52243, 52243, 52243, 52243, 52243, 52243, 52243, 129600, 129600, 129600, 129600, 'fashion', 'local', z_right_wing, 328),
    ('Shoe Room', '2C', 65340, 65340, 65340, 65340, 65340, 65340, 65340, 65340, 65340, 65340, 71874, 71874, 'fashion', 'local', z_fashion_core, 96),
    ('Hechter Paris', 'OPEN D', 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 60500, 60500, 'fashion', 'local', z_right_wing, 122),
    ('McDonald''s', 'OPEN B', 220000, 220000, 220000, 220000, 220000, 220000, 220000, 220000, 220000, 220000, 242000, 242000, 'food', 'international', z_food_left, 374),
    ('KFC', 'E2', 220320, 220320, 242352, 242352, 242352, 242352, 242352, 242352, 242352, 242352, 242352, 242352, 'food', 'international', z_food_left, 360),
    ('Pizza Hut', 'E12', 118800, 118800, 118800, 118800, 118800, 118800, 118800, 118800, 118800, 118800, 130680, 130680, 'food', 'international', z_food_left, 200),
    ('Bianco', 'E15', 94377, 94377, 94377, 94377, 94377, 94377, 100984, 100984, 100984, 100984, 100984, 100984, 'food', 'local', z_food_left, 440),
    ('Chili''s', 'E16', 55440, 55440, 55440, 55440, 55440, 55440, 55440, 55440, 55440, 55440, 60984, 60984, 'food', 'international', z_food_left, 450),
    ('Cordoba', 'E17', 47628, 47628, 47628, 47628, 47628, 47628, 47628, 47628, 47628, 47628, 47628, 47628, 'food', 'local', z_food_left, 483),
    ('Cold Stone', 'E14', 166320, 166320, 166320, 166320, 166320, 166320, 166320, 182952, 182952, 182952, 182952, 182952, 'food', 'international', z_food_left, 105),
    ('Brioche Doree', 'E13', 93600, 93600, 93600, 93600, 93600, 93600, 93600, 93600, 93600, 93600, 93600, 93600, 'food', 'international', z_food_left, 213),
    ('Lavender', 'E18', 72000, 72000, 72000, 72000, 72000, 72000, 72000, 72000, 72000, 72000, 72000, 72000, 'food', 'local', z_food_left, 60),
    ('Jacobs Cafe 1', 'E22,2', 57600, 63360, 63360, 63360, 63360, 63360, 63360, 63360, 63360, 63360, 63360, 63360, 'food', 'local', z_food_left, 105),
    ('Jacobs Cafe 2', '13C', 32000, 35200, 35200, 35200, 35200, 35200, 35200, 35200, 35200, 35200, 35200, 35200, 'food', 'local', z_food_left, 50);

  -- ── Smaller Tenants ───────────────────────────────────────
  INSERT INTO _real_rent (tenant_name, unit_ref, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, category, brand_type, zone_id, area_sqm) VALUES
    ('Vanilla', '20A', 42336, 42336, 42336, 42336, 42336, 42336, 42336, 42336, 42336, 42336, 42336, 45300, 'fashion', 'local', z_right_wing, 144),
    ('My Secret', '15C', 33733, 33733, 99000, 99000, 99000, 99000, 99000, 99000, 99000, 99000, 99000, 99000, 'fashion', 'local', z_right_wing, 96),
    ('Clue', '24B', 38333, 38333, 38333, 42166, 42166, 42166, 42166, 42166, 42166, 42166, 42166, 42166, 'fashion', 'local', z_fashion_core, 72),
    ('Venti', '33B,2', 65243, 65243, 65243, 65243, 65243, 65243, 71767, 71767, 71767, 71767, 71767, 71767, 'fashion', 'local', z_right_wing, 140),
    ('Shock', '30A', 121968, 121968, 121968, 121968, 121968, 121968, 121968, 121968, 121968, 134165, 134165, 134165, 'fashion', 'local', z_fashion_core, 72),
    ('Active', '1A', 35841, 35841, 64800, 64800, 64800, 64800, 64800, 64800, 64800, 64800, 64800, 64800, 'fashion', 'local', z_fashion_core, 120),
    ('Dona Dony', '2A', 179025, 179025, 179025, 179025, 179025, 179025, 179025, 179025, 179025, 179025, 179025, 196928, 'fashion', 'local', z_right_wing, 128),
    ('Embrator', '33B,1', 59861, 49141, 47399, 74292, 65850, 92782, 128639, 103323, 67962, 54544, 57518, 62276, 'fashion', 'local', z_right_wing, 40),
    ('Foot Print', '7A/8A', 172800, 172800, 172800, 172800, 190080, 190080, 190080, 190080, 190080, 190080, 190080, 190080, 'fashion', 'local', z_fashion_core, 122),
    ('Floyd', '9A/10A', 57499, 57499, 129600, 129600, 129600, 129600, 129600, 129600, 129600, 129600, 129600, 129600, 'fashion', 'local', z_right_wing, 144),
    ('Quik Silver', '32A', 79200, 79200, 79200, 79200, 79200, 79200, 79200, 79200, 87120, 87120, 87120, 87120, 'fashion', 'international', z_fashion_core, 73),
    ('MS Designs', '14C', 132440, 132440, 132440, 132440, 145684, 145684, 145684, 145684, 145684, 145684, 145684, 145684, 'fashion', 'local', z_right_wing, 72),
    ('Fortune', '12C', 85990, 85990, 85990, 85990, 85990, 85990, 85990, 85990, 94589, 94589, 94589, 94589, 'services', 'local', z_services, 72),
    ('Arabian Oud', '36A/37A', 174367, 217958, 217958, 217958, 217958, 217958, 217958, 217958, 217958, 217958, 217958, 217958, 'services', 'local', z_services, 72),
    ('Maa Al-thahab', 'E21', 47300, 47300, 47300, 47300, 47300, 47300, 47300, 47300, 47300, 52030, 52030, 52030, 'services', 'local', z_services, 40),
    ('Lotfy', '9C', 25071, 25071, 25071, 25071, 25071, 25071, 25071, 25071, 25071, 31338, 31338, 31338, 'fashion', 'local', z_fashion_core, 50),
    ('MINISO', '33B,3', 109324, 109324, 109324, 120256, 120256, 120256, 120256, 120256, 120256, 120256, 120256, 120256, 'services', 'international', z_fashion_core, 200),
    ('Vodafone', '23A', 83160, 83160, 83160, 83160, 83160, 83160, 83160, 83160, 91476, 91476, 91476, 91476, 'electronics', 'local', z_services, 72),
    ('WE', '21A', 108000, 108000, 108000, 108000, 118800, 118800, 118800, 118800, 118800, 118800, 118800, 118800, 'electronics', 'local', z_services, 72),
    ('Duty Free', 'E3', 43049, 43049, 43049, 43049, 43049, 43049, 43049, 43049, 43049, 43049, 53811, 53811, 'services', 'local', z_services, 301),
    ('Orange', '28A/29A', 31625, 31625, 31625, 39531, 39531, 39531, 39531, 39531, 39531, 39531, 39531, 39531, 'electronics', 'international', z_services, 55),
    ('Switch Plus', '33A', 79200, 79200, 79200, 79200, 87120, 87120, 87120, 87120, 87120, 87120, 87120, 87120, 'electronics', 'local', z_services, 72),
    ('MI Company', 'CS1', 46969, 46969, 46969, 46969, 46969, 46969, 46969, 46969, 46969, 51666, 51666, 51666, 'electronics', 'international', z_services, 40),
    ('Eye Fashion', '6A', 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 'services', 'local', z_services, 72),
    ('Joly Optics', 'E20', 144257, 144257, 144257, 144257, 144257, 144257, 144257, 144257, 144257, 154355, 154355, 154355, 'services', 'local', z_services, 72),
    ('Kams', '19B2', 120000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 'fashion', 'local', z_fashion_core, 216),
    ('Carrot', '23B', 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 'fashion', 'local', z_right_wing, 72),
    ('Pharmacy', '30B', 78000, 78000, 78000, 78000, 78000, 78000, 78000, 78000, 78000, 85800, 85800, 85800, 'services', 'local', z_services, 139),
    ('EG Diamond', '25B-27B', 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 'services', 'local', z_services, 72),
    ('Pixi', 'E1', 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 'fashion', 'local', z_right_wing, 216),
    ('Daniel Hechter', '25A/26A', 111888, 111888, 111888, 111888, 111888, 117482, 117482, 117482, 117482, 117482, 117482, 117482, 'fashion', 'local', z_right_wing, 122),
    ('Boba Spot', '39A', 60080, 60080, 66088, 66088, 66088, 66088, 66088, 66088, 66088, 66088, 66088, 66088, 'food', 'local', z_food_left, 20),
    ('CAT', 'E4', 87846, 87846, 87846, 165000, 165000, 165000, 165000, 165000, 165000, 165000, 165000, 165000, 'fashion', 'local', z_fashion_core, 72),
    ('Madar Optics', 'OPEN C', 48000, 48000, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 52800, 'services', 'local', z_services, 72),
    ('El Danyel', 'OPEN C', 29144, 29144, 29144, 29144, 29144, 29144, 29144, 29144, 36430, 36430, 36430, 36430, 'fashion', 'local', z_right_wing, 72),
    ('Dream Telecom', '16C,2', 68400, 68400, 68400, 68400, 75240, 75240, 75240, 75240, 75240, 75240, 75240, 75240, 'electronics', 'local', z_services, 60),
    ('Emile', '3A', 36500, 38325, 38325, 38325, 38325, 38325, 38325, 38325, 38325, 38325, 38325, 38325, 'fashion', 'local', z_right_wing, 72),
    ('Comfort', '4A', 27751, 27751, 27751, 27751, 27751, 27751, 27751, 27751, 30526, 30526, 30526, 30526, 'fashion', 'local', z_right_wing, 72),
    ('Carina', '4-5C', 61618, 61618, 61618, 61618, 61618, 61618, 61618, 61618, 67779, 67779, 67779, 67779, 'fashion', 'local', z_right_wing, 144),
    ('Mitara', '33B,4', 31907, 31907, 31907, 31907, 31907, 31907, 31907, 31907, 31907, 31907, 31907, 31907, 'fashion', 'local', z_right_wing, 72),
    ('Oxygen', 'OPEN D', 502006, 0, 0, 619856, 626452, 723476, 899257, 1085425, 558987, 482517, 507021, 543503, 'fashion', 'local', z_right_wing, 72);

  -- ── Kiosk Tenants - Spinneys Area (A) ────────────────────
  INSERT INTO _real_rent (tenant_name, unit_ref, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, category, brand_type, zone_id, area_sqm) VALUES
    ('El Awny Center', 'A6', 275000, 275000, 275000, 275000, 275000, 275000, 275000, 275000, 275000, 275000, 275000, 275000, 'services', 'local', z_anchor, 30),
    ('Cigar Shop', 'A8', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Alla Elsead Gold', 'A10', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Tony Silver', 'A11', 93500, 93500, 93500, 93500, 93500, 93500, 93500, 93500, 93500, 93500, 93500, 93500, 'services', 'local', z_anchor, 15),
    ('Rayaheen', 'A12', 48090, 48090, 48090, 52149, 52149, 52149, 52149, 52149, 52149, 52149, 52149, 52149, 'services', 'local', z_anchor, 15),
    ('Karma Art', 'A13', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Mohamed Hafez', 'A36-38', 65000, 65000, 65000, 65000, 65000, 65000, 65000, 65000, 65000, 65000, 65000, 65000, 'services', 'local', z_anchor, 30),
    ('Hand Made', 'A17', 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 55000, 'services', 'local', z_anchor, 10),
    ('Smile', 'A18', 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 'services', 'local', z_anchor, 8),
    ('Amir Store', 'A19', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Nubian Store', 'A20', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Tony Stainless', 'A21', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Marina', 'A22', 38500, 38500, 38500, 38500, 38500, 38500, 38500, 38500, 38500, 38500, 38500, 38500, 'services', 'local', z_anchor, 10),
    ('I Love Egypt', 'A24', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Tony Gallery', 'A25', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('El Awny Group 1', 'A26', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Gift Shop', 'A27', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Amir Waheeb', 'A28', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Crocodile', 'A29', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('El Awny Group 2', 'A30', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 15),
    ('Beauty Salon', 'A32', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 20),
    ('La Rock Spa', 'A33', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'services', 'local', z_anchor, 25),
    ('Wood U Like', 'A-14', 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 'services', 'local', z_anchor, 15),
    ('Logo', 'A-15', 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 'services', 'local', z_anchor, 15),
    ('Shahriar', 'A-16', 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 'services', 'local', z_anchor, 15),
    ('Flor D''or', 'A-35', 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 'services', 'local', z_anchor, 15);

  -- ── Small Kiosks B Area ───────────────────────────────────
  INSERT INTO _real_rent (tenant_name, unit_ref, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, category, brand_type, zone_id, area_sqm) VALUES
    ('Best Driver', 'B-15', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'services', 'local', z_fashion_core, 8),
    ('Boost Mobile', 'B-16', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'electronics', 'local', z_fashion_core, 8),
    ('Candy Shop', 'B-20', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'food', 'local', z_fashion_core, 8),
    ('Bubblzz', 'B-21', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'food', 'local', z_fashion_core, 8),
    ('Cigar Shop 2', 'B-25', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'services', 'local', z_fashion_core, 8),
    ('Movenpick', 'B-26', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'food', 'international', z_fashion_core, 8),
    ('Nefertari 1', 'B-27', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'services', 'local', z_fashion_core, 8),
    ('Nefertari 2', 'B-28', 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 'services', 'local', z_fashion_core, 8),
    ('Handmade Silver', 'B13+14', 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 'services', 'local', z_fashion_core, 16);

  -- ── KO Kiosks ─────────────────────────────────────────────
  INSERT INTO _real_rent (tenant_name, unit_ref, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, category, brand_type, zone_id, area_sqm) VALUES
    ('Etisalat', 'KO1', 82500, 82500, 82500, 82500, 82500, 82500, 82500, 82500, 82500, 82500, 82500, 82500, 'electronics', 'international', z_services, 12),
    ('EG Silver', 'KO2', 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 'services', 'local', z_services, 8),
    ('AF Accessories', 'KO3', 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 'fashion', 'local', z_services, 8),
    ('Platinum', 'KO4', 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 'services', 'local', z_services, 8),
    ('Phone Doctor', 'KO5', 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 'electronics', 'local', z_services, 6),
    ('Nefertiti', 'KO6', 88000, 88000, 88000, 88000, 88000, 88000, 88000, 88000, 88000, 88000, 88000, 88000, 'services', 'local', z_services, 10),
    ('Hard Rock', 'KO9', 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 'services', 'international', z_services, 10),
    ('Mr Konafa', 'KO10', 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 'food', 'local', z_food_left, 10),
    ('Houda Hegab', 'KO11', 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 77000, 'fashion', 'local', z_fashion_core, 10),
    ('Bashmila', 'KO12', 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 66000, 'fashion', 'local', z_fashion_core, 10),
    ('Desire', 'KO13', 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 'fashion', 'local', z_fashion_core, 8),
    ('Gofality Makeup', 'KO14', 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 'services', 'local', z_services, 8),
    ('London Bus', 'KO15', 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 49500, 'food', 'local', z_food_left, 8),
    ('WE Care', 'KO17', 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 60500, 'electronics', 'local', z_services, 8),
    ('Hamasat', 'KO19', 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 'fashion', 'local', z_fashion_core, 8),
    ('Nano Park', 'KO21', 71500, 71500, 71500, 71500, 71500, 71500, 71500, 71500, 71500, 71500, 71500, 71500, 'entertainment', 'local', z_kids, 150),
    ('Corn Cube', 'KO22', 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 35000, 'food', 'local', z_food_left, 8),
    ('ATM', 'KO23', 33275, 33275, 33275, 33275, 33275, 33275, 33275, 33275, 33275, 33275, 33275, 33275, 'services', 'local', z_services, 4),
    ('Relay Networks', 'KO24', 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 'electronics', 'local', z_services, 6),
    ('Kiosk KO25', 'KO25', 37500, 37500, 37500, 37500, 37500, 37500, 37500, 37500, 37500, 37500, 37500, 37500, 'services', 'local', z_services, 6),
    ('Kiosk KO26', 'KO26', 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 44000, 'services', 'local', z_services, 6),
    ('Kiosk KO27', 'KO27', 30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000, 'services', 'local', z_services, 6),
    ('Kiosk KO28', 'KO28', 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 40000, 'services', 'local', z_services, 6),
    ('Bus', 'KO29', 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 'services', 'local', z_services, 6),
    ('Kiosk KO30', 'KO30', 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 'services', 'local', z_services, 6);

  RAISE NOTICE 'Loaded % tenant rent records into temp table', (SELECT count(*) FROM _real_rent);

  -- ================================================================
  -- STEP 3: For each tenant, find or create records, then insert
  --         12 months of rent_transactions with real amounts
  -- ================================================================

  FOR v_rec IN SELECT * FROM _real_rent ORDER BY idx
  LOOP

    -- ── Try to find existing tenant by name (fuzzy match) ──
    SELECT t.id INTO v_tenant_id
    FROM tenants t
    WHERE t.name ILIKE v_rec.tenant_name
       OR t.name ILIKE '%' || v_rec.tenant_name || '%'
       OR v_rec.tenant_name ILIKE '%' || t.name || '%'
    ORDER BY
      -- Prefer exact match, then closest partial
      CASE WHEN LOWER(t.name) = LOWER(v_rec.tenant_name) THEN 0
           WHEN t.name ILIKE v_rec.tenant_name THEN 1
           ELSE 2
      END,
      length(t.name)  -- shorter name = more specific match
    LIMIT 1;

    -- ── If tenant found, get their lease ──
    IF v_tenant_id IS NOT NULL THEN
      SELECT l.id INTO v_lease_id
      FROM leases l
      WHERE l.tenant_id = v_tenant_id
        AND l.status = 'active'
      ORDER BY l.start_date DESC
      LIMIT 1;
    ELSE
      v_lease_id := NULL;
    END IF;

    -- ── If tenant or lease not found, create them ──
    IF v_tenant_id IS NULL OR v_lease_id IS NULL THEN

      -- Create tenant if needed
      IF v_tenant_id IS NULL THEN
        v_tenant_id := uuid_generate_v4();
        INSERT INTO tenants (id, name, brand_name, category, brand_type, status)
        VALUES (
          v_tenant_id,
          v_rec.tenant_name,
          v_rec.tenant_name,
          v_rec.category,
          v_rec.brand_type,
          'active'
        );
      END IF;

      -- Create unit
      v_unit_seq := v_unit_seq + 1;
      v_unit_id := uuid_generate_v4();
      INSERT INTO units (id, zone_id, property_id, name, unit_number, floor, area_sqm, status, frontage_m)
      VALUES (
        v_unit_id,
        v_rec.zone_id,
        v_prop,
        v_rec.tenant_name,
        v_rec.unit_ref,
        CASE WHEN v_rec.zone_id IN (z_anchor, z_fashion_core) THEN 0 ELSE 1 END,
        v_rec.area_sqm,
        'occupied',
        GREATEST(2.0, LEAST(20.0, SQRT(v_rec.area_sqm) * 1.0))
      );

      -- Create lease
      v_lease_id := uuid_generate_v4();
      INSERT INTO leases (id, unit_id, tenant_id, property_id, start_date, end_date,
                          min_rent_monthly_egp, percentage_rate, security_deposit_egp,
                          escalation_rate, status)
      VALUES (
        v_lease_id,
        v_unit_id,
        v_tenant_id,
        v_prop,
        '2025-01-01'::DATE,
        '2027-12-31'::DATE,
        v_rec.m01,  -- use January rent as the base min rent
        10.00,
        v_rec.m01 * 3,
        7.00,
        'active'
      );

      RAISE NOTICE 'Created new tenant + unit + lease for: %', v_rec.tenant_name;
    END IF;

    -- ── Insert 12 months of rent_transactions for 2026 ──
    FOR v_month IN 1..12 LOOP

      -- Get the amount for this month
      v_amount := CASE v_month
        WHEN 1  THEN v_rec.m01
        WHEN 2  THEN v_rec.m02
        WHEN 3  THEN v_rec.m03
        WHEN 4  THEN v_rec.m04
        WHEN 5  THEN v_rec.m05
        WHEN 6  THEN v_rec.m06
        WHEN 7  THEN v_rec.m07
        WHEN 8  THEN v_rec.m08
        WHEN 9  THEN v_rec.m09
        WHEN 10 THEN v_rec.m10
        WHEN 11 THEN v_rec.m11
        WHEN 12 THEN v_rec.m12
      END;

      -- Skip months with zero amount (e.g., Oxygen Feb/Mar)
      IF v_amount IS NULL OR v_amount = 0 THEN
        CONTINUE;
      END IF;

      -- Determine payment status: paid for Jan-Mar (months 1-3), overdue for future
      IF v_month <= 3 THEN
        v_status := 'paid';
        v_pay_date := make_date(2026, v_month, 1 + floor(random() * 7)::INT);
      ELSE
        v_status := 'overdue';
        v_pay_date := NULL;
      END IF;

      INSERT INTO rent_transactions (
        lease_id,
        period_month,
        period_year,
        min_rent_due,
        percentage_rent_due,
        amount_due,
        amount_paid,
        payment_date,
        payment_method,
        status,
        source
      ) VALUES (
        v_lease_id,
        v_month,
        2026,
        v_amount,
        0,
        v_amount,
        CASE WHEN v_status = 'paid' THEN v_amount ELSE 0 END,
        v_pay_date,
        CASE WHEN v_status = 'paid' THEN 'bank_transfer' ELSE NULL END,
        v_status,
        'jde_import'
      );

    END LOOP;

  END LOOP;

  RAISE NOTICE 'Successfully loaded real 2026 revenue data for all tenants';
  RAISE NOTICE 'Total rent_transactions: %', (SELECT count(*) FROM rent_transactions);
  RAISE NOTICE 'Total tenants with data: %', (SELECT count(DISTINCT t.name) FROM tenants t
    JOIN leases l ON l.tenant_id = t.id
    JOIN rent_transactions rt ON rt.lease_id = l.id
    WHERE rt.period_year = 2026);

END $$;
