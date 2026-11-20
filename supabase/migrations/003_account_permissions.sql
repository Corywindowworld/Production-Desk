BEGIN;
ALTER TABLE production.members ADD COLUMN IF NOT EXISTS can_score_all_installers integer NOT NULL DEFAULT 0 CHECK (can_score_all_installers IN (0,1));
COMMIT;
