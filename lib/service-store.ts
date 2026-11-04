import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {setupServiceDatabase} from './service-schema';
import {storedObject} from './stored-data';
import {readProfileDetails} from './account-profile';
import {certificateInputSchema,certificateSnapshot,certificateEmailHtml} from './job-certificate';
import {jobCertificatePdfBase64} from './job-certificate-pdf';
import {z} from 'zod';
export const serviceManager=(m:Member)=>['admin','supervisor','service_manager'].includes(m.role);
const check=(ok:unknown,message:string,status=400)=>{if(!ok)throw new ApiError(status,message)};
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Enter a valid date.');
const photo=z.object({key:z.string().max(250),name:z.string().max(255),kind:z.literal('photos')});
const draftSchema=z.object({outcome:z.enum(['Complete','Incomplete','Customer Reset','Service Reset']),notes:z.string().trim().max(4000),reason:z.string().trim().max(2000).default(''),attachments:z.array(photo).max(40).default([]),certificate:certificateInputSchema.nullable().optional()});
const jobView=(j:any)=>({id:j.id,number:j.number,customer:j.customer,address:j.address,city:j.city,state:j.state,zip:j.zip,phone:j.phone,phone2:j.phone2,phone3:j.phone3,email:j.customerEmail||j.email||'',customerEmail:j.customerEmail||j.email||'',amount:0,stage:'SVC'});
export async function serviceData(m:Member,params:URLSearchParams){
 check(serviceManager(m)||m.role==='service_tech','Service access required.',403);
 const db=database();await setupServiceDatabase(db);
 const from=day.parse(params.get('from')),to=day.parse(params.get('to')||from);
 check(from<=to&&Date.parse(to)-Date.parse(from)<=32*86400000,'Select a date range of up to 32 days.');
 const rows=(await db.prepare('SELECT v.*,j.payload AS job_payload FROM production.service_visits v JOIN jobs j ON j.id=v.job_id WHERE v.scheduled_on>=? AND v.scheduled_on<=?'+(m.role==='service_tech'?' AND v.tech_id=?':'')+' ORDER BY v.scheduled_on,v.updated').bind(from,to,...(m.role==='service_tech'?[m.id]:[])).all()).results;
 const team=(await db.prepare("SELECT id,name FROM members WHERE role='service_tech' AND active=1 ORDER BY name").all()).results;
 const visits=rows.map((row:any)=>({...storedObject(row.payload),id:row.id,version:row.version,status:row.status,date:row.scheduled_on,techId:row.tech_id,job:jobView(storedObject(row.job_payload))}));
 const query=(params.get('q')||'').trim().slice(0,100);
 let jobs:any[]=[];
 if(serviceManager(m)&&query.length>=2){
 const candidates=(await db.prepare("SELECT payload FROM jobs WHERE concat_ws(' ',payload::jsonb->>'number',payload::jsonb->>'customer',payload::jsonb->>'address') ILIKE ? ORDER BY updated DESC LIMIT 25").bind('%'+query.replace(/[%_\\]/g,'\\$&')+'%').all()).results;
 jobs=candidates.map((r:any)=>storedObject(r.payload)).filter((j:any)=>['Closed','Complete','COMP','SVC'].includes(j.stage)&&j.amount!==null&&j.amount!==undefined&&Number(j.amount)===0).map(jobView);
 }
 const profile=readProfileDetails((await db.prepare('SELECT profile_details FROM members WHERE id=?').bind(m.id).first())?.profile_details);
 const alerts=(await db.prepare("SELECT id,message,created,job_id FROM notifications WHERE recipient_id=? ORDER BY created DESC LIMIT 40").bind(m.id).all()).results;
 return {me:{id:m.id,name:m.name,role:m.role},canSchedule:serviceManager(m),visits,team,jobs,profile,alerts};
}
export async function serviceAction(m:Member,input:any){
 check(serviceManager(m)||m.role==='service_tech','Service access required.',403);
 const db=database();await setupServiceDatabase(db);const at=new Date().toISOString();
 let emailId:string|undefined;const pushIds:string[]=[];
 const result=await db.transaction(async tx=>{
 if(input.action==='schedule'){
  check(serviceManager(m),'Service scheduling permission required.',403);
  const v=z.object({jobId:z.string().uuid(),techId:z.string().min(1),date:day,period:z.enum(['AM','PM']),stopNumber:z.number().int().min(1).max(30),instructions:z.string().trim().min(1).max(4000),sourceId:z.string().uuid().optional()}).parse(input.data);
  const row=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(v.jobId).first();check(row,'Customer account not found.',404);
  const j=storedObject(row.payload);check(['Closed','Complete','COMP','SVC'].includes(j.stage)&&j.amount!==null&&j.amount!==undefined&&Number(j.amount)===0,'Service work requires a completed, paid-in-full account.');
  const tech=await tx.prepare("SELECT id,name FROM members WHERE id=? AND role='service_tech' AND active=1").bind(v.techId).first();check(tech,'Select an active service technician.');
  if(v.sourceId){const source=await tx.prepare('SELECT * FROM production.service_visits WHERE id=? FOR UPDATE').bind(v.sourceId).first();check(source?.job_id===j.id&&['Incomplete','Customer Reset','Service Reset'].includes(source.status),'Only an incomplete or reset service visit can be scheduled for a return.');const old=storedObject(source.payload);check(!old.followupId,'This service visit already has a return appointment.',409);}
  const id=crypto.randomUUID(),payload={...v,id,techName:tech.name,createdAt:at,createdBy:m.name,history:[{at,by:m.name,text:'Service scheduled'}]};
  await tx.prepare("INSERT INTO production.service_visits(id,job_id,tech_id,scheduled_on,payload,updated) VALUES(?,?,?,?,?,?)").bind(id,j.id,v.techId,v.date,JSON.stringify(payload),at).run();
  if(v.sourceId){const source=await tx.prepare('SELECT payload FROM production.service_visits WHERE id=?').bind(v.sourceId).first();const old=storedObject(source.payload);old.followupId=id;await tx.prepare('UPDATE production.service_visits SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(old),at,v.sourceId).run();}
  j.history=[{at,by:m.name,text:'Service scheduled for '+v.date+' '+v.period+' with '+tech.name},...(j.history||[])];
  await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,j.id).run();
  await tx.prepare("INSERT INTO notifications(id,recipient_id,job_id,message,created,push_status) VALUES(?,?,?,?,?,'pending')").bind((pushIds.push(crypto.randomUUID()),pushIds[pushIds.length-1]),v.techId,j.id,'Service scheduled: '+j.customer+' · '+v.date+' '+v.period,at).run();
  return {id};
 }
 check(['draft','result'].includes(input.action),'Unknown service action.');
 const row=await tx.prepare('SELECT * FROM production.service_visits WHERE id=? FOR UPDATE').bind(String(input.visitId||'')).first();check(row,'Service visit not found.',404);
 check(serviceManager(m)||row.tech_id===m.id,'This service visit is not assigned to you.',403);
 check(row.status==='Scheduled','This visit already has a result. Schedule a return visit for additional work.',409);
 check(input.version===row.version,'This service visit changed. Refresh and review the latest version.',409);
 const v=draftSchema.parse(input.data),visit=storedObject(row.payload);
 for(const a of v.attachments){
  const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();
  check(file?.job_id===row.job_id&&file?.member_id===m.id&&file?.kind==='photos'&&a.key.startsWith('jobs/'+row.job_id+'/photos/'),'An uploaded service photo is missing.');
 }
 if(input.action==='draft'){visit.draft={...v,savedAt:at,savedBy:m.id};}
 else{
  const reset=['Customer Reset','Service Reset'].includes(v.outcome);
  check(v.notes||reset,'Describe the work performed.');
  check(v.outcome==='Complete'||v.reason,'Enter the reason for incomplete work or the reset.');
  if(!reset){check(v.attachments.length>0,'Add at least one service photo.');if(v.outcome==='Complete'||v.certificate)check(v.certificate?.type==='Service','Complete the customer service sign-off first.');}
  const jobRow=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(row.job_id).first();check(jobRow,'Customer account not found.',404);const j=storedObject(jobRow.payload);
  const tech=await tx.prepare('SELECT name,profile_details,installer_code FROM members WHERE id=?').bind(row.tech_id).first();
  const certificate=reset||!v.certificate?null:certificateSnapshot({...j,amount:0,installerId:row.tech_id,crew:tech.name},m,{...v.certificate,type:'Service',explanation:[v.outcome,v.reason,v.notes,v.certificate?.explanation].filter(Boolean).join(' · '),paymentAmount:0,paymentMethod:''},tech,at);
  visit.result={...v,certificate,submittedAt:at,submittedBy:m.name};delete visit.draft;
  visit.history=[{at,by:m.name,text:v.outcome},...(visit.history||[])];
  j.operations=j.operations||{};j.operations.serviceVisitResults=[{visitId:row.id,date:row.scheduled_on,techName:visit.techName,...visit.result},...(j.operations.serviceVisitResults||[])];
  j.history=[{at,by:m.name,text:'Service '+v.outcome+': '+(v.reason||v.notes)},...(j.history||[])];
  j.attachments=[...(j.attachments||[]),...v.attachments.filter(a=>!(j.attachments||[]).some((b:any)=>a.key===b.key))];
  await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,j.id).run();
  const recipients=(await tx.prepare("SELECT id FROM members WHERE role IN ('admin','service_manager') AND active=1").all()).results;
  for(const recipient of recipients)await tx.prepare("INSERT INTO notifications(id,recipient_id,job_id,message,created,push_status) VALUES(?,?,?,?,?,'pending')").bind((pushIds.push(crypto.randomUUID()),pushIds[pushIds.length-1]),recipient.id,j.id,'Service '+v.outcome+': '+j.customer+' #'+j.number+' · '+(v.reason||v.notes).slice(0,250),at).run();
  if(certificate){
   emailId=crypto.randomUUID();visit.result.certificateEmailId=emailId;
   const pdfBase64=await jobCertificatePdfBase64(certificate);
   await tx.prepare("INSERT INTO production.operations_email(id,recipient,subject,body,status,created,updated) VALUES(?,?,?,?,?,?,?)").bind(emailId,certificate.customerEmail,'Window World Service '+v.outcome+' · '+j.customer+' #'+j.number,JSON.stringify({kind:'job-certificate',certificate,html:certificateEmailHtml(certificate),text:'Your signed Window World service certificate is attached.',filename:'Window-World-Service-'+j.number+'.pdf',pdfBase64}),'pending',at,at).run();
  }
 }
 await tx.prepare('UPDATE production.service_visits SET payload=?,status=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(visit),input.action==='draft'?'Scheduled':v.outcome,at,row.id).run();
 return {id:row.id,version:Number(row.version)+1};
 });
 return {...result,emailId,pushIds};
}
