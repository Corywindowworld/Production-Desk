import {completionBatchFilename} from './completion-batch-name';
import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {laborReady} from './labor';
import {completionBatchPdf} from './completion-batch-pdf';
import {z} from 'zod';
const office=(m:Member)=>['admin','supervisor','office','production_assistant'].includes(m.role);
// No-payment service visits have their own immutable paperwork packet, not a labor sheet.
function approvedPackets(j:any){return [...(j?.operations?.laborSheets||[]).filter((s:any)=>s.status==='Approved'),...(j?.operations?.serviceNoLaborPackets||[]).filter((p:any)=>p.packetJob?.operations?.report?.approved&&p.packetJob?.operations?.report?.omitLabor&&p.packetJob?.operations?.report?.certificate?.type==='Service').map((p:any)=>({...p,omitLabor:true}))];}
const obj=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export async function batchSetup(db=database()){
 await db.transaction(async tx=>{await tx.prepare('SELECT pg_advisory_xact_lock(820261023)').run();
 for(const sql of `CREATE TABLE IF NOT EXISTS production.completion_batches(id text PRIMARY KEY,created text NOT NULL,created_by text NOT NULL,pdf_base64 text NOT NULL,sent_at text,sent_by text);
 CREATE TABLE IF NOT EXISTS production.completion_batch_items(batch_id text NOT NULL REFERENCES production.completion_batches(id),job_id text NOT NULL,labor_id text UNIQUE NOT NULL,PRIMARY KEY(batch_id,labor_id));
 ALTER TABLE production.completion_batches ENABLE ROW LEVEL SECURITY;
 ALTER TABLE production.completion_batch_items ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON production.completion_batches,production.completion_batch_items FROM PUBLIC,anon,authenticated;`.split(';').filter(s=>s.trim()))await tx.prepare(sql).run();});
}
export async function batchData(m:Member,id?:string,currentLayout=false){
 if(!office(m))throw new ApiError(403,'Office access required.');const db=database();await batchSetup(db);
 if(id){const r=await db.prepare('SELECT pdf_base64,created FROM production.completion_batches WHERE id=?').bind(id).first();if(!r)throw new ApiError(404,'Batch not found.');if(currentLayout){const selections=(await db.prepare('SELECT job_id,labor_id FROM production.completion_batch_items WHERE batch_id=?').bind(id).all()).results;const items=[];for(const selection of selections){const row=await db.prepare('SELECT payload FROM jobs WHERE id=?').bind(selection.job_id).first();const live=row?obj(row.payload):null,labor=approvedPackets(live).find((s:any)=>s.id===selection.labor_id);if(!labor)throw new ApiError(409,'This batch has archived paperwork that cannot be rebuilt. Download the original PDF.');items.push({job:labor.packetJob||live,labor});}if(items.length)r.pdf_base64=Buffer.from(await completionBatchPdf(id,items)).toString('base64');}return {...r,filename:completionBatchFilename(r.created)};}
 const rows=(await db.prepare('SELECT payload FROM jobs').all()).results,used=new Set((await db.prepare('SELECT labor_id FROM production.completion_batch_items').all()).results.map((r:any)=>r.labor_id));
 return {jobs:rows.map((r:any)=>obj(r.payload)).flatMap((j:any)=>{
 const approved=approvedPackets(j);
 const entries:any[]=approved.map((l:any)=>{const snap=l.packetJob||j;return {id:l.id,jobId:j.id,customer:snap.customer,number:snap.number,date:snap.operations.report.installed||l.approvedAt.slice(0,10),status:snap.operations.report.certificate?.type==='Service'?'Service':snap.operations.report.status,missing:[],batched:used.has(l.id),laborId:l.id};});
 const current=laborReady(j);if(j.operations?.report?.approved&&current.missing.length)entries.push({id:j.id,jobId:j.id,customer:j.customer,number:j.number,date:j.operations.report.installed||j.operations.report.reviewedAt?.slice(0,10)||'',status:j.operations.report.certificate?.type==='Service'?'Service':j.operations.report.status,missing:current.missing,batched:false,laborId:''});return entries;
 }),batches:(await db.prepare('SELECT id,created,created_by,sent_at,sent_by FROM production.completion_batches ORDER BY created DESC').all()).results};
}
export async function batchAction(m:Member,input:any){
 if(!office(m))throw new ApiError(403,'Office access required.');const db=database();await batchSetup(db);
 if(input.action==='sent'){
  const id=z.string().uuid().parse(input.id);await db.transaction(async tx=>{const row=await tx.prepare('SELECT id,sent_at FROM production.completion_batches WHERE id=? FOR UPDATE').bind(id).first();if(!row)throw new ApiError(404,'Batch not found.');if(row.sent_at)throw new ApiError(409,'Batch is already marked sent.');const at=new Date().toISOString();await tx.prepare('UPDATE production.completion_batches SET sent_at=?,sent_by=? WHERE id=?').bind(at,m.name,id).run();const items=(await tx.prepare('SELECT job_id FROM production.completion_batch_items WHERE batch_id=?').bind(id).all()).results;for(const item of items){const r=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(item.job_id).first();if(r){const j=obj(r.payload);j.history=[{at,by:m.name,text:`Completion Desk batch ${id} marked sent`},...(j.history||[])];await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,j.id).run();}}});return {ok:true};
 }
 const selections=z.array(z.object({jobId:z.string().uuid(),laborId:z.string().uuid()})).min(1).max(20).parse(input.items);if(new Set(selections.map(s=>s.laborId)).size!==selections.length)throw new ApiError(400,'Select each job once.');
 return db.transaction(async tx=>{
  await tx.prepare('SELECT pg_advisory_xact_lock(820261022)').run();const items=[];
  for(const selection of [...selections].sort((a,b)=>a.jobId.localeCompare(b.jobId))){
   const id=selection.jobId;
   const row=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(id).first();if(!row)throw new ApiError(404,'Job not found.');const live=obj(row.payload),labor=approvedPackets(live).find((s:any)=>s.id===selection.laborId);if(!labor)throw new ApiError(409,'Approved paperwork not found.');const job=labor.packetJob||live;const missing=[];if(!job.operations?.report?.approved||!job.operations.report.certificate)missing.push('Approved certificate');if(job.leadRenovationJob&&!job.operations.leadRenovation?.signatureDataUrl)missing.push('Lead Renovation sheet');
   if(missing.length)throw new ApiError(409,`${job.customer}: ${missing.join(', ')} missing.`);
   if(await tx.prepare('SELECT batch_id FROM production.completion_batch_items WHERE labor_id=?').bind(labor.id).first())throw new ApiError(409,'This labor sheet is already in a batch. Download the existing batch.');items.push({job,labor});
  }
  const id=crypto.randomUUID(),pdf=await completionBatchPdf(id,items),at=new Date().toISOString();
  await tx.prepare('INSERT INTO production.completion_batches(id,created,created_by,pdf_base64) VALUES(?,?,?,?)').bind(id,at,m.name,Buffer.from(pdf).toString('base64')).run();
  for(const {job,labor} of items)await tx.prepare('INSERT INTO production.completion_batch_items(batch_id,job_id,labor_id) VALUES(?,?,?)').bind(id,job.id,labor.id).run();
  return {id,filename:completionBatchFilename(at)};
 });
}
