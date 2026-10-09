-- Run after migrations 001-007. Additive: existing jobs, accounts and files are retained.
BEGIN;
CREATE TABLE IF NOT EXISTS production.operations_surveys (
 id text PRIMARY KEY, external_id text UNIQUE NOT NULL, installer_id text NOT NULL,
 completed_on text NOT NULL, ratings jsonb NOT NULL, entered_by text NOT NULL, created text NOT NULL
);
CREATE TABLE IF NOT EXISTS production.operations_config (
 id text PRIMARY KEY, payload jsonb NOT NULL, updated_by text NOT NULL, updated text NOT NULL
);
CREATE TABLE IF NOT EXISTS production.operations_email (
 id text PRIMARY KEY, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'pending', created text NOT NULL, updated text NOT NULL
);
ALTER TABLE production.operations_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE production.operations_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE production.operations_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON production.operations_surveys,production.operations_config,production.operations_email FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON production.operations_surveys,production.operations_config,production.operations_email FROM %I',r);
  END IF;
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS operations_surveys_period ON production.operations_surveys(completed_on);
CREATE INDEX IF NOT EXISTS operations_email_status ON production.operations_email(status,created);
COMMIT;
