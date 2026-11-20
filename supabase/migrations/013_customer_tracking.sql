BEGIN;
ALTER TABLE production.location_shares ADD COLUMN IF NOT EXISTS arrival_at bigint;
ALTER TABLE production.location_shares ADD COLUMN IF NOT EXISTS stop_number integer;
COMMIT;
