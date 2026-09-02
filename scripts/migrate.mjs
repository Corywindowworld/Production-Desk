import {readFile,readdir} from 'node:fs/promises';
import {connect} from './database-client.mjs';
const sql=connect();
try{
 await sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(820260902)`;
  await tx`CREATE SCHEMA IF NOT EXISTS production`;
  await tx`CREATE TABLE IF NOT EXISTS production.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`;
  await tx`REVOKE ALL ON SCHEMA production FROM PUBLIC`;
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
   if((await tx`SELECT name FROM production.schema_migrations WHERE name=${file}`).length)continue;
   await tx.unsafe(await readFile('supabase/migrations/'+file,'utf8'));
   await tx`INSERT INTO production.schema_migrations(name) VALUES (${file})`;
   console.log('Applied '+file);
  }
 });
}finally{await sql.end()}
