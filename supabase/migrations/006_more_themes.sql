BEGIN;
ALTER TABLE production.members DROP CONSTRAINT IF EXISTS members_theme_check;
ALTER TABLE production.members ADD CONSTRAINT members_theme_check CHECK (theme IN ('light','dark','gators','fsu','mexico','brazil','cuba','usa'));
COMMIT;
