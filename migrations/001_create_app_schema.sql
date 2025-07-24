-- Application Schema
-- This migration creates all application-specific tables
-- Better Auth tables (user, session, account, verification) are managed separately by Better Auth

-- Create custom types
DO $$ BEGIN
    CREATE TYPE "theme" AS ENUM('light', 'dark');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Brand Monitor Analyses
CREATE TABLE IF NOT EXISTS "brand_analyses" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" text NOT NULL,
    "url" text NOT NULL,
    "company_name" text,
    "industry" text,
    "analysis_data" jsonb,
    "competitors" jsonb,
    "prompts" jsonb,
    "credits_used" integer DEFAULT 10,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- User Profile
CREATE TABLE IF NOT EXISTS "user_profile" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" text NOT NULL UNIQUE,
    "display_name" text,
    "avatar_url" text,
    "bio" text,
    "phone" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- User Settings
CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" text NOT NULL UNIQUE,
    "theme" "theme" DEFAULT 'light',
    "email_notifications" boolean DEFAULT true,
    "marketing_emails" boolean DEFAULT false,
    "default_model" text DEFAULT 'gpt-3.5-turbo',
    "metadata" jsonb,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_brand_analyses_user_id" ON "brand_analyses"("user_id");