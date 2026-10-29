BEGIN;
ALTER TABLE production.members ADD COLUMN IF NOT EXISTS profile_details jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
