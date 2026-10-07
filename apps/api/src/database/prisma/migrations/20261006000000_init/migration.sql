-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'participant');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('google', 'email_otp', 'whatsapp_otp', 'auto_created');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('draft', 'published', 'completed');

-- CreateEnum
CREATE TYPE "active_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('pending', 'confirmed', 'expired');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending_payment', 'paid', 'expired');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('qris', 'bank_transfer');

-- CreateEnum
CREATE TYPE "price_type" AS ENUM ('normal', 'early_bird');

-- CreateEnum
CREATE TYPE "pricing_rule_type" AS ENUM ('bundle');

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('percentage', 'fixed_amount');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('not_checked', 'present');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('registration_confirmation', 'event_reminder', 'post_event', 'admin_new_registration', 'admin_payment_success', 'admin_event_almost_full');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('whatsapp', 'in_app');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'participant',
    "auth_provider" "auth_provider" NOT NULL,
    "password_hash" VARCHAR(255),
    "profile_picture" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID,
    "instructor_id" UUID NOT NULL,
    "event_name" VARCHAR(150) NOT NULL,
    "activity_type" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "poster_url" VARCHAR(500) NOT NULL,
    "date" DATE,
    "start_time" TIME(0),
    "end_time" TIME(0),
    "location" VARCHAR(500) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "completed_at" TIMESTAMPTZ(6),
    "post_event_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "profile_picture" VARCHAR(500),
    "bio" TEXT,
    "contact_information" VARCHAR(500),
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_specialization_mapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instructor_id" UUID NOT NULL,
    "specialization_id" UUID NOT NULL,

    CONSTRAINT "instructor_specialization_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "activity_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "instructor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "total_pax" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "total_payment" INTEGER NOT NULL,
    "discount_code_id" UUID,
    "payment_status" "payment_status" NOT NULL DEFAULT 'pending_payment',
    "registration_status" "registration_status" NOT NULL DEFAULT 'pending',
    "payment_deadline" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "is_buyer" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "payment_method" "payment_method" NOT NULL,
    "transaction_id" VARCHAR(255),
    "amount" INTEGER NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'pending_payment',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "price_type" "price_type" NOT NULL,
    "price" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_pricing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "rule_type" "pricing_rule_type" NOT NULL,
    "minimum_quantity" INTEGER NOT NULL,
    "discount_type" "discount_type" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "price" INTEGER NOT NULL,
    "available_quantity" INTEGER NOT NULL,
    "max_purchase_quantity" INTEGER NOT NULL,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "registration_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "discount_type" "discount_type" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "quota" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expiry_date" DATE NOT NULL,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL DEFAULT 'not_checked',
    "checked_at" TIMESTAMPTZ(6),

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "suggestion" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "registration_id" UUID,
    "type" "notification_type" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(6),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_users_phone_number" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_users_auth_provider" ON "users"("auth_provider");

-- CreateIndex
CREATE INDEX "idx_users_deleted_at" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_events_status" ON "events"("status");

-- CreateIndex
CREATE INDEX "idx_events_date" ON "events"("date");

-- CreateIndex
CREATE INDEX "idx_events_instructor_id" ON "events"("instructor_id");

-- CreateIndex
CREATE INDEX "idx_events_template_id" ON "events"("template_id");

-- CreateIndex
CREATE INDEX "idx_events_deleted_at" ON "events"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_instructors_status" ON "instructors"("status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_specializations_name" ON "specializations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "idx_instructor_specialization_mapping_pair" ON "instructor_specialization_mapping"("instructor_id", "specialization_id");

-- CreateIndex
CREATE INDEX "idx_registrations_event_id" ON "registrations"("event_id");

-- CreateIndex
CREATE INDEX "idx_registrations_buyer_user_id" ON "registrations"("buyer_user_id");

-- CreateIndex
CREATE INDEX "idx_registrations_payment_status" ON "registrations"("payment_status");

-- CreateIndex
CREATE INDEX "idx_registrations_registration_status" ON "registrations"("registration_status");

-- CreateIndex
CREATE INDEX "idx_registrations_payment_deadline" ON "registrations"("payment_deadline");

-- CreateIndex
CREATE INDEX "idx_registrations_discount_code_id" ON "registrations"("discount_code_id");

-- CreateIndex
CREATE INDEX "idx_registrations_deleted_at" ON "registrations"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_participants_registration_id" ON "participants"("registration_id");

-- CreateIndex
CREATE INDEX "idx_participants_user_id" ON "participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_payments_registration_id" ON "payments"("registration_id");

-- CreateIndex
CREATE INDEX "idx_payments_transaction_id" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_payments_status" ON "payments"("status");

-- CreateIndex
CREATE INDEX "idx_event_prices_event_id" ON "event_prices"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_prices_price_type" ON "event_prices"("price_type");

-- CreateIndex
CREATE INDEX "idx_event_prices_status" ON "event_prices"("status");

-- CreateIndex
CREATE INDEX "idx_event_pricing_rules_event_id" ON "event_pricing_rules"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_pricing_rules_status" ON "event_pricing_rules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_event_pricing_rules_event_id_rule_type_minimum_quantity" ON "event_pricing_rules"("event_id", "rule_type", "minimum_quantity");

-- CreateIndex
CREATE INDEX "idx_addons_event_id" ON "addons"("event_id");

-- CreateIndex
CREATE INDEX "idx_addons_status" ON "addons"("status");

-- CreateIndex
CREATE INDEX "idx_registration_addons_registration_id" ON "registration_addons"("registration_id");

-- CreateIndex
CREATE INDEX "idx_registration_addons_addon_id" ON "registration_addons"("addon_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_registration_addons_registration_id_addon_id" ON "registration_addons"("registration_id", "addon_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_discount_codes_code" ON "discount_codes"("code");

-- CreateIndex
CREATE INDEX "idx_discount_codes_status" ON "discount_codes"("status");

-- CreateIndex
CREATE INDEX "idx_discount_codes_expiry_date" ON "discount_codes"("expiry_date");

-- CreateIndex
CREATE INDEX "idx_attendance_event_id" ON "attendance"("event_id");

-- CreateIndex
CREATE INDEX "idx_attendance_status" ON "attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_attendance_event_id_participant_id" ON "attendance"("event_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_feedback_token" ON "feedback"("token");

-- CreateIndex
CREATE INDEX "idx_feedback_event_id" ON "feedback"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_feedback_event_id_participant_id" ON "feedback"("event_id", "participant_id");

-- CreateIndex
CREATE INDEX "idx_notifications_user_id" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_notifications_event_id" ON "notifications"("event_id");

-- CreateIndex
CREATE INDEX "idx_notifications_registration_id" ON "notifications"("registration_id");

-- CreateIndex
CREATE INDEX "idx_notifications_type" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "idx_notifications_channel" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "idx_notifications_status" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "idx_notifications_is_read" ON "notifications"("is_read");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "event_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_specialization_mapping" ADD CONSTRAINT "instructor_specialization_mapping_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_specialization_mapping" ADD CONSTRAINT "instructor_specialization_mapping_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_prices" ADD CONSTRAINT "event_prices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_pricing_rules" ADD CONSTRAINT "event_pricing_rules_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addons" ADD CONSTRAINT "addons_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_addons" ADD CONSTRAINT "registration_addons_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_addons" ADD CONSTRAINT "registration_addons_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

