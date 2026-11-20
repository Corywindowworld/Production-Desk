BEGIN;
CREATE TABLE IF NOT EXISTS production.customer_records(job_id text PRIMARY KEY REFERENCES production.jobs(id),payload text NOT NULL,version integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS production.customer_events(id text PRIMARY KEY,job_id text NOT NULL REFERENCES production.jobs(id),actor_name text NOT NULL,created text NOT NULL,kind text NOT NULL,note text NOT NULL);
CREATE INDEX IF NOT EXISTS customer_events_job_created ON production.customer_events(job_id,created);
ALTER TABLE production.customer_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE production.customer_events ENABLE ROW LEVEL SECURITY;
COMMIT;
