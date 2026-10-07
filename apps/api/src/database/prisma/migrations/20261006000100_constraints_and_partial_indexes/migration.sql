-- Constraint yang tidak dapat dinyatakan di Prisma schema (ERD v1.6).

-- ERD Section 9 / 22.1: UNIQUE parsial registrations.
-- Hanya registrasi aktif (pending/confirmed, belum soft-deleted) yang memblokir pendaftaran ulang.
-- Registrasi expired tidak di-soft-delete dan tidak memblokir registrasi baru.
CREATE UNIQUE INDEX "idx_registrations_event_buyer_active"
  ON "registrations" ("event_id", "buyer_user_id")
  WHERE "deleted_at" IS NULL AND "registration_status" <> 'expired';

-- ERD Section 4: events
ALTER TABLE "events"
  ADD CONSTRAINT "chk_events_capacity_min" CHECK ("capacity" >= 1);

-- ERD Section 9: registrations
ALTER TABLE "registrations"
  ADD CONSTRAINT "chk_registrations_total_pax_min" CHECK ("total_pax" >= 1),
  ADD CONSTRAINT "chk_registrations_total_payment_min" CHECK ("total_payment" >= 0);

-- ERD Section 12: event_prices (early bird wajib punya periode)
ALTER TABLE "event_prices"
  ADD CONSTRAINT "chk_event_prices_price_min" CHECK ("price" >= 0),
  ADD CONSTRAINT "chk_event_prices_early_bird_period" CHECK (
    "price_type" <> 'early_bird' OR ("start_date" IS NOT NULL AND "end_date" IS NOT NULL)
  );

-- ERD Section 13: event_pricing_rules
ALTER TABLE "event_pricing_rules"
  ADD CONSTRAINT "chk_event_pricing_rules_minimum_quantity_min" CHECK ("minimum_quantity" >= 2),
  ADD CONSTRAINT "chk_event_pricing_rules_discount_value_min" CHECK ("discount_value" >= 1),
  ADD CONSTRAINT "chk_event_pricing_rules_percentage_max" CHECK (
    "discount_type" <> 'percentage' OR "discount_value" <= 100
  );

-- ERD Section 14: addons
ALTER TABLE "addons"
  ADD CONSTRAINT "chk_addons_price_min" CHECK ("price" >= 0),
  ADD CONSTRAINT "chk_addons_available_quantity_min" CHECK ("available_quantity" >= 0),
  ADD CONSTRAINT "chk_addons_max_purchase_quantity_min" CHECK ("max_purchase_quantity" >= 1);

-- ERD Section 15: registration_addons
ALTER TABLE "registration_addons"
  ADD CONSTRAINT "chk_registration_addons_quantity_min" CHECK ("quantity" >= 1);

-- ERD Section 16: discount_codes
ALTER TABLE "discount_codes"
  ADD CONSTRAINT "chk_discount_codes_discount_value_min" CHECK ("discount_value" >= 1),
  ADD CONSTRAINT "chk_discount_codes_quota_min" CHECK ("quota" >= 1),
  ADD CONSTRAINT "chk_discount_codes_percentage_max" CHECK (
    "discount_type" <> 'percentage' OR "discount_value" <= 100
  ),
  ADD CONSTRAINT "chk_discount_codes_used_count_range" CHECK (
    "used_count" >= 0 AND "used_count" <= "quota"
  );

-- ERD Section 18: feedback (rating opsional, 1-5)
ALTER TABLE "feedback"
  ADD CONSTRAINT "chk_feedback_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));
