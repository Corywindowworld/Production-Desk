BEGIN;
ALTER TABLE production.members ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark','gators'));
COMMIT;
