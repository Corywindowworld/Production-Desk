import {pathToFileURL} from 'node:url';
import {rootCertificates} from 'node:tls';
import postgres from 'postgres';
import {z} from 'zod';

const key=value=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase();
const nameWords=value=>key(value).replace(/[^a-z]+/g,' ').trim();
export async function correctSalesRepEmail(sql,{name,email,repairId}){
 name=z.string().trim().min(1).max(160).parse(name);
 email=z.string().trim().email().parse(email);
 repairId=z.string().regex(/^[a-z0-9-]{1,100}$/).parse(repairId);
 return sql.begin(async tx=>{
  await tx.unsafe('SELECT pg_advisory_xact_lock(820261028)');
  const marker='maintenance:sales-rep-email:'+repairId;
  if((await tx.unsafe('SELECT id FROM production.operations_config WHERE id=$1',[marker])).length)
   return {alreadyApplied:true,name,email};
  const words=nameWords(name),parts=words.split(' ');
  const matches=[...new Set([words,...(parts.length===2?[parts.toReversed().join(' ')]:[])])];
  const normalize="trim(regexp_replace(lower(payload::jsonb->>'salesRep'), '[^a-z]+', ' ', 'g'))";
  const contactNormalize="trim(regexp_replace(lower(payload::jsonb->>'name'), '[^a-z]+', ' ', 'g'))";
  const jobs=await tx.unsafe('SELECT id,payload,version FROM production.jobs WHERE '+normalize+'=ANY($1::text[]) FOR UPDATE',[matches]);
  const contacts=await tx.unsafe("SELECT id,payload FROM production.operations_config WHERE id LIKE 'sales-rep:%' AND "+contactNormalize+'=ANY($1::text[]) FOR UPDATE',[matches]);
  if(!jobs.length&&!contacts.length)throw Error('No matching sales representative found; no changes applied.');
  const parse=value=>typeof value==='string'?JSON.parse(value):value;
  const fallback=jobs.length?parse(jobs[0].payload):null;
  const targets=contacts.length?contacts:[{id:'sales-rep:'+key(fallback.salesRep),payload:{name:fallback.salesRep,phone:fallback.salesRepPhone||''}}];
  const at=new Date().toISOString();let updatedJobs=0;
  for(const row of jobs){
   const job=parse(row.payload);
   if(job.salesRepEmail===email)continue;
   job.salesRepEmail=email;
   job.history=[{at,by:'Production Desk maintenance',text:'Sales representative email corrected at administrator request'},...(job.history||[])];
   await tx.unsafe('UPDATE production.jobs SET payload=$1,version=version+1,updated=$2 WHERE id=$3',[JSON.stringify(job),at,row.id]);
   updatedJobs++;
  }
  for(const target of targets)await tx.unsafe('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated',[target.id,JSON.stringify({...parse(target.payload),email}),'maintenance',at]);
  const remaining=await tx.unsafe('SELECT id FROM production.jobs WHERE '+normalize+'=ANY($1::text[]) AND (payload::jsonb->>\'salesRepEmail\') IS DISTINCT FROM $2',[matches,email]);
  const saved=await tx.unsafe("SELECT id FROM production.operations_config WHERE id LIKE 'sales-rep:%' AND "+contactNormalize+"=ANY($1::text[]) AND (payload::jsonb->>'email') IS DISTINCT FROM $2",[matches,email]);
  if(remaining.length||saved.length)throw Error('Sales representative email verification failed; changes rolled back.');
  const result={name,email,matchedJobs:jobs.length,updatedJobs,verified:true};
  await tx.unsafe('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES($1,$2,$3,$4)',[marker,JSON.stringify(result),'maintenance',at]);
  return result;
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
 const ca=process.env.DATABASE_CA_CERT?.replace(/\\n/g,'\n').trim();
 const ssl=process.env.DATABASE_SSL==='disable'?false:ca?{rejectUnauthorized:true,ca:[...rootCertificates,ca]}:'verify-full';
 const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:10,ssl});
 try{console.log('Sales representative email correction: '+JSON.stringify(await correctSalesRepEmail(sql,{name:process.argv[2],email:process.argv[3],repairId:process.argv[4]})));}
 finally{await sql.end();}
}
