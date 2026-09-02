import {readFile} from 'node:fs/promises';
import {connect} from './database-client.mjs';
const path=process.argv[2];if(!path)throw new Error('Usage: npm run db:import -- /absolute/path/production-data.json');
const data=JSON.parse(await readFile(path,'utf8'));
if(data.format!=='production-desk-export-v1')throw new Error('Unrecognized export format');
if(data.attachments?.length)throw new Error('This importer requires the separate attachment migration to be completed first.');
const tables=['members','credentials','jobs','installer_reports','job_visits','notifications','account_audit'];
for(const table of tables)if(!Array.isArray(data.tables?.[table]))throw new Error('Missing table '+table);
for(const row of data.tables.jobs)if(JSON.parse(row.payload).attachments?.length)throw new Error('Job attachments need a separate storage migration');
for(const row of data.tables.job_visits)if(JSON.parse(row.payload).photos?.length)throw new Error('Visit photos need a separate storage migration');
const sql=connect();
try{await sql.begin(async tx=>{
 await tx`SELECT pg_advisory_xact_lock(820260902)`;
 // Use a fresh target. Never merge conflicting jobs/accounts or overwrite existing data.
 for(const table of tables){const count=await tx.unsafe(`SELECT count(*) AS n FROM production.${table}`);if(Number(count[0].n))throw new Error('Target table is not empty: '+table)}
 for(const table of tables){
  const columns=(await tx`SELECT column_name FROM information_schema.columns WHERE table_schema='production' AND table_name=${table}`).map(c=>c.column_name);
  for(const row of data.tables[table]){
   const keys=Object.keys(row);if(keys.some(key=>!columns.includes(key)))throw new Error('Unexpected column in '+table);
   if(!keys.length)throw new Error('Empty row in '+table);
   await tx.unsafe(`INSERT INTO production.${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>row[k]));
  }
  const count=await tx.unsafe(`SELECT count(*) AS n FROM production.${table}`);if(Number(count[0].n)!==data.tables[table].length)throw new Error('Count mismatch: '+table);
  console.log(table+': '+data.tables[table].length+' records');
 }
});console.log('Import committed. Sessions and push subscriptions were not migrated.');}finally{await sql.end()}
