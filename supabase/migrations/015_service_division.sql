
ALTER TABLE production.members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE production.members ADD CONSTRAINT members_role_check CHECK(role IN ('admin','office','production_assistant','supervisor','installer','warehouse','service_tech','service_manager'));
CREATE TABLE IF NOT EXISTS production.service_visits(
 id text PRIMARY KEY, job_id text NOT NULL REFERENCES production.jobs(id), tech_id text NOT NULL REFERENCES production.members(id),
 scheduled_on text NOT NULL, status text NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Complete','Incomplete','Customer Reset','Service Reset')),
 payload text NOT NULL, version integer NOT NULL DEFAULT 1, updated text NOT NULL
);
CREATE INDEX IF NOT EXISTS service_visits_date ON production.service_visits(scheduled_on,tech_id);
CREATE INDEX IF NOT EXISTS service_visits_job ON production.service_visits(job_id);
ALTER TABLE production.service_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON production.service_visits FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON production.service_visits FROM %I',r); END IF; END LOOP; END $$;
