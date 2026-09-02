-- Private schema: never expose this schema through the Supabase Data API.
CREATE SCHEMA IF NOT EXISTS production;
CREATE TABLE production.jobs(id text PRIMARY KEY,payload text NOT NULL CHECK(jsonb_typeof(payload::jsonb)='object'),version integer NOT NULL DEFAULT 1,updated text NOT NULL);
CREATE TABLE production.members(id text PRIMARY KEY,email text NOT NULL UNIQUE,user_id text UNIQUE,name text NOT NULL,role text NOT NULL CHECK(role IN ('admin','office','production_assistant','supervisor','installer')),supervisor_id text,installer_code text,phone text NOT NULL DEFAULT '',invitation_status text NOT NULL DEFAULT 'not_sent',can_edit_jobs integer NOT NULL DEFAULT 0 CHECK(can_edit_jobs IN (0,1)),active integer NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE production.credentials(member_id text PRIMARY KEY,password_hash text,previous_hash text,must_change integer NOT NULL DEFAULT 1,temporary_expires bigint,generation integer NOT NULL DEFAULT 1);
CREATE TABLE production.sessions(token_hash text PRIMARY KEY,member_id text NOT NULL,generation integer NOT NULL,restricted integer NOT NULL,expires bigint NOT NULL);
CREATE TABLE production.login_limits(key text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL);
CREATE TABLE production.account_audit(id text PRIMARY KEY,actor_id text NOT NULL,member_id text NOT NULL,action text NOT NULL,created text NOT NULL);
CREATE TABLE production.installer_reports(id text PRIMARY KEY,job_id text NOT NULL,installer_id text NOT NULL,supervisor_id text NOT NULL,payload text NOT NULL,created text NOT NULL);
CREATE TABLE production.notifications(id text PRIMARY KEY,recipient_id text NOT NULL,job_id text NOT NULL,message text NOT NULL,created text NOT NULL,read_at text,push_status text NOT NULL DEFAULT 'pending');
CREATE TABLE production.push_subscriptions(endpoint text PRIMARY KEY,member_id text NOT NULL,payload text NOT NULL);
CREATE TABLE production.job_visits(id text PRIMARY KEY,job_id text NOT NULL,supervisor_id text NOT NULL,payload text NOT NULL,created text NOT NULL);
CREATE TABLE production.attachment_uploads(key text PRIMARY KEY,staging_key text UNIQUE NOT NULL,job_id text NOT NULL,kind text NOT NULL,member_id text NOT NULL,name text NOT NULL,expires bigint NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),content_type text,sha256 text,size_bytes integer);
CREATE INDEX ON production.sessions(member_id);
CREATE INDEX ON production.sessions(expires);
CREATE INDEX ON production.installer_reports(job_id,created);
CREATE INDEX ON production.job_visits(job_id,created);
CREATE INDEX ON production.notifications(recipient_id,created);
CREATE INDEX ON production.push_subscriptions(member_id);
CREATE INDEX ON production.jobs((payload::jsonb->>'installerId'));
CREATE INDEX ON production.jobs((payload::jsonb->>'install'));
-- Only a server-side database role may access this schema. No public clients.
REVOKE ALL ON SCHEMA production FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA production FROM PUBLIC;
DO $$ DECLARE t record; r text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='production' LOOP
  EXECUTE format('ALTER TABLE production.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA production FROM %I',r);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA production FROM %I',r);
  END IF;
 END LOOP;
END $$;
