BEGIN;
ALTER TABLE production.members ADD COLUMN IF NOT EXISTS quality_score numeric;
ALTER TABLE production.members ADD COLUMN IF NOT EXISTS quality_updated_at text;
ALTER TABLE production.members ADD COLUMN IF NOT EXISTS quality_updated_by text;
COMMIT;
