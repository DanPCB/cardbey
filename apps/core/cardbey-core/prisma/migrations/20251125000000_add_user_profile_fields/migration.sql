-- Add user profile fields for public profiles
-- Migration: add_user_profile_fields

-- Add new columns to User table
ALTER TABLE "User" ADD COLUMN "fullName" TEXT;
ALTER TABLE "User" ADD COLUMN "handle" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "accountType" TEXT;
ALTER TABLE "User" ADD COLUMN "tagline" TEXT;

-- Create unique index on handle
CREATE UNIQUE INDEX IF NOT EXISTS "User_handle_key" ON "User"("handle");

-- Create index on handle for faster lookups
CREATE INDEX IF NOT EXISTS "User_handle_idx" ON "User"("handle");

-- Generate handles for existing users
-- This will be done in a post-migration script

