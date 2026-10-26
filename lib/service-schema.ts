import type {Database} from '@/db/adapter';
export const serviceSchemaSQL=`
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK(role IN ('admin','office','production_assistant','supervisor','installer','warehouse','service_tech','service_manager'));
CREATE TABLE IF NOT EXISTS production.service_visits(
 id text PRIMARY KEY, job_id text NOT NULL REFERENCES jobs(id), tech_id text NOT NULL REFERENCES members(id),
 scheduled_on text NOT NULL, status text NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Complete','Incomplete','Customer Reset','Service Reset')),
 payload text NOT NULL, version integer NOT NULL DEFAULT 1, updated text NOT NULL
);
CREATE INDEX IF NOT EXISTS service_visits_date ON production.service_visits(scheduled_on,tech_id);
CREATE INDEX IF NOT EXISTS service_visits_job ON production.service_visits(job_id);
ALTER TABLE production.service_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON production.service_visits FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON production.service_visits FROM %I',r); END IF; END LOOP; END $$;
`;
let ready:Promise<void>|undefined;
export function setupServiceDatabase(db:Database){
 if(!ready)ready=db.transaction(async tx=>{await tx.prepare('SELECT pg_advisory_xact_lock(820260902)').first();const boundary=serviceSchemaSQL.indexOf('DO $');for(const statement of serviceSchemaSQL.slice(0,boundary).split(';').map(s=>s.trim()).filter(Boolean))await tx.prepare(statement).run();await tx.prepare(serviceSchemaSQL.slice(boundary)).run()}).then(()=>{}).catch(e=>{ready=undefined;throw e});
 return ready;
}
