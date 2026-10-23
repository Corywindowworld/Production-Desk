BEGIN;
CREATE TABLE IF NOT EXISTS production.installer_locations (
 member_id text PRIMARY KEY REFERENCES production.members(id) ON DELETE CASCADE,
 session_hash text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy double precision NOT NULL CHECK(accuracy >= 0),
 observed_at bigint NOT NULL,
 updated_at bigint NOT NULL,
 sharing boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS production.location_devices (
 token_hash text PRIMARY KEY,
 member_id text NOT NULL REFERENCES production.members(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES production.sessions(token_hash) ON DELETE CASCADE,
 expires bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS production.location_shares (
 token_hash text PRIMARY KEY,
 member_id text NOT NULL REFERENCES production.members(id) ON DELETE CASCADE,
 job_id text NOT NULL REFERENCES production.jobs(id) ON DELETE CASCADE,
 expires bigint NOT NULL,
 revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS location_shares_member ON production.location_shares(member_id);
ALTER TABLE production.installer_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE production.location_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE production.location_shares ENABLE ROW LEVEL SECURITY;
COMMIT;
