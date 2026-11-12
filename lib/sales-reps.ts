import {createHash} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {storedObject} from './stored-data';
import {formatPhone} from './phone';

const clean=(name:string)=>name.trim().replace(/\s+/g,' ');
const key=(name:string)=>clean(name).toLocaleLowerCase();
const revision=(rep:any)=>createHash('sha256').update(JSON.stringify([rep.id,rep.name,rep.phone,rep.email])).digest('hex');
const authorize=(m:Member)=>{if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');};
const inputSchema=z.object({originalId:z.string().max(160).optional(),revision:z.string().length(64).optional(),name:z.string().trim().min(1).max(160),phone:z.string().trim().max(50).default(''),email:z.union([z.string().trim().email().max(254),z.literal('')]).default('')}).strict();

async function directory(db:any){
 const rows=(await db.prepare('SELECT j.id,j.payload,j.version,c.payload AS record FROM jobs j LEFT JOIN customer_records c ON c.job_id=j.id ORDER BY j.updated DESC,j.id').all()).results;
 const byId=new Map<string,any>();
 for(const row of rows){
  const j=storedObject(row.payload),record=row.record?storedObject(row.record):{},name=clean(j.salesRep||record.salesRep||'');
  if(!name)continue;
  const id=key(name),old=byId.get(id);
  byId.set(id,{id,name:old?.name||name,phone:old?.phone||j.salesRepPhone||record.salesRepPhone||'',email:old?.email||j.salesRepEmail||'',jobs:(old?.jobs||0)+1});
 }
 const saved=(await db.prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'sales-rep:%'").all()).results;
 for(const row of saved){
  const rep=storedObject(row.payload);if(!rep.name)continue;
  const name=clean(rep.name),id=key(name),old=byId.get(id);
  byId.set(id,{id,name,phone:rep.phone??old?.phone??'',email:rep.email??old?.email??'',jobs:old?.jobs||0});
 }
 return {rows,reps:[...byId.values()].map(rep=>({...rep,revision:revision(rep)})).sort((a,b)=>a.name.localeCompare(b.name))};
}

export async function salesRepData(m:Member){authorize(m);return {salesReps:(await directory(database())).reps};}
export async function saveSalesRep(m:Member,input:unknown){
 authorize(m);const value=inputSchema.parse(input),name=clean(value.name),id=key(name),at=new Date().toISOString();
 return database().transaction(async(tx:any)=>{
  await tx.prepare('SELECT pg_advisory_xact_lock(820261029)').first();
  const {rows,reps}=await directory(tx),old=value.originalId?reps.find(rep=>rep.id===value.originalId):null;
  if(value.originalId&&!old)throw new ApiError(409,'This sales rep changed. Refresh the directory and try again.');
  if(old&&value.revision!==old.revision)throw new ApiError(409,'This sales rep changed. Refresh the directory before saving.');
  if(reps.some(rep=>rep.id===id&&rep.id!==old?.id))throw new ApiError(409,'A sales rep with this name already exists. Edit their existing entry.');
  const contact={name,phone:formatPhone(value.phone),email:value.email};let updatedJobs=0;
  if(old){
   for(const row of rows){
    const previous=storedObject(row.payload),record=row.record?storedObject(row.record):{};
    if(key(previous.salesRep||record.salesRep||'')!==old.id)continue;
    const locked=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(row.id).first();
    if(!locked)continue;
    const recordRow=await tx.prepare('SELECT payload FROM customer_records WHERE job_id=? FOR UPDATE').bind(row.id).first();
    const currentRecord=recordRow?storedObject(recordRow.payload):{};
    const job=storedObject(locked.payload);
    // Check again after waiting for any concurrent job update.
    if(key(job.salesRep||currentRecord.salesRep||'')!==old.id)continue;
    job.salesRep=contact.name;job.salesRepPhone=contact.phone;job.salesRepEmail=contact.email;
    job.history=[{at,by:m.name,text:'Sales representative contact updated in Accounts'},...(job.history||[])];
    await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job),at,row.id).run();
    if(recordRow){currentRecord.salesRep=contact.name;currentRecord.salesRepPhone=contact.phone;await tx.prepare('UPDATE customer_records SET payload=?,version=version+1 WHERE job_id=?').bind(JSON.stringify(currentRecord),row.id).run();}
    updatedJobs++;
   }
  }
  await tx.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind('sales-rep:'+id,JSON.stringify(contact),m.id,at).run();
  if(old&&old.id!==id)await tx.prepare('DELETE FROM production.operations_config WHERE id=?').bind('sales-rep:'+old.id).run();
  return {ok:true,updatedJobs,salesRep:{id,...contact,jobs:updatedJobs,revision:revision({id,...contact})}};
 });
}
