import {database} from '@/db/raw';
import {ApiError,Member,hasJobEditPermission} from '@/lib/access';
import {fieldsSchema,scheduleSchema,receiveSchema,receiveItemsSchema,allowedMaterials,requestSchema,surveySchema,configSchema,localDay,dayDifference,bonusMetrics,bonusPeriod} from './operations';
import {env} from './server-env';
import {reportSchema,reportError,installerJob} from './installer-workflow';
import {deliverPush} from './push';
import {incompleteSince} from './job-workflow';
import {z} from 'zod';
export const reviewer=(m:Member)=>['admin','supervisor'].includes(m.role);
function withCustomerRecord(j:any,r:any){const record=r?JSON.parse(r):{};const permitNumber=j.permitNumber||record.permitNumber||'';const permitReceived=j.permitReceived??(['received','issued','approved'].includes(String(record.permitStatus||'').toLowerCase())&&!!permitNumber);return {...j,amount:typeof j.amount==='number'&&Number.isFinite(j.amount)?j.amount:null,incompleteSince:j.incompleteSince||incompleteSince(j)||'',salesRep:j.salesRep||record.salesRep||'',salesRepPhone:j.salesRepPhone||record.salesRepPhone||'',bay:j.bay||record.warehouseBay||'',customerEmail:j.customerEmail||record.email||'',permitNumber,permitReceived}}
const assert=(yes:unknown,message:string,status=403)=>{if(!yes)throw new ApiError(status,message)};
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const p=schema.safeParse(value);if(!p.success)throw new ApiError(400,p.error.issues[0]?.message||'Check the form.');return p.data};
export function installerVisible(m:Member,j:any,today=localDay()) {return j.installerId===m.id||j.operations?.services?.some((s:any)=>s.installerId===m.id&&s.date>=today)}
export function publicJob(m:Member,j:any){
 if(m.role!=='installer')return j;
 return {...installerJob(j),install:j.installerId===m.id?j.install:'',canReport:j.installerId===m.id,salesRep:j.salesRep,salesRepPhone:j.salesRepPhone,salesRepEmail:j.salesRepEmail,received:j.received,bay:j.bay,city:j.city,state:j.state,zip:j.zip,materials:j.materials||[],product:j.product,windowCount:j.windowCount||0,slidingDoors:j.slidingDoors||0,entryDoorCount:j.entryDoorCount||0,screenCount:j.screenCount||0,buildingDepartment:j.buildingDepartment||'',brand:j.brand||'',materialType:j.materialType||'',permitReceived:!!j.permitReceived,permitNumber:j.permitNumber||'',instructions:j.instructions,scheduleInstructions:j.scheduleInstructions||'',reorder:j.reorder||'',attachments:(j.attachments||[]).filter((a:any)=>a.kind!=='visit'),operations:{salesKeys:j.operations?.salesKeys,report:j.operations?.report,services:(j.operations?.services||[]).filter((s:any)=>s.installerId===m.id)}};
}
export async function operationsData(m:Member){
 const db=database(),today=localDay();
 const rows=await db.prepare('SELECT j.payload,j.version,c.payload AS record FROM jobs j LEFT JOIN customer_records c ON c.job_id=j.id ORDER BY j.updated DESC').all();
 const all=rows.results.map((r:any)=>({...withCustomerRecord(JSON.parse(r.payload),r.record),version:r.version}));
 const jobs=all.filter((j:any)=>m.role!=='installer'||installerVisible(m,j)).map((j:any)=>publicJob(m,j));
 const team=m.role==='installer'?[]:(await db.prepare('SELECT id,name,role FROM members WHERE active=1 ORDER BY name').all()).results;
 let surveys:any[]=[],config:any=null,metrics:any=null,crewColors:any={};
 if(m.role!=='installer'){
  surveys=(await db.prepare('SELECT * FROM production.operations_surveys ORDER BY completed_on DESC').all()).results;
  config=(await db.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(bonusPeriod(today).end).first())?.payload;
  metrics=bonusMetrics(all,surveys,config,today);
  crewColors=(await db.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(`crew-colors:${m.id}`).first())?.payload||{};
  if(!reviewer(m)){delete metrics.estimate;config=null;}
 }
 const bonusConfigs=m.role==='admin'?(await db.prepare("SELECT payload FROM production.operations_config WHERE id NOT LIKE 'crew-colors:%' ORDER BY id DESC").all()).results.map((r:any)=>r.payload):[];
 return {bonusConfigs,me:m,jobs,team,today,metrics,surveys:m.role==='installer'?[]:surveys,config:reviewer(m)?config:null,crewColors,canEdit:hasJobEditPermission(m),canReview:reviewer(m)};
}
// All job changes lock the row and compare versions inside one transaction. Side effects are queued with the change.
export async function operation(m:Member,input:any){
 const db=database(),at=new Date().toISOString(),today=localDay(),push:string[]=[],emails:string[]=[];
 const action=String(input.action||'');
 if(action==='configure'){
  assert(m.role==='admin','Administrator access required.');const c=parse(configSchema,input.data);
  await db.prepare('INSERT INTO production.operations_config (id,payload,updated_by,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind(c.period,JSON.stringify(c),m.id,at).run();return;
 }
 if(action==='survey'){
  assert(reviewer(m),'Field supervisor or administrator access required.');const s=parse(surveySchema,input.data);assert(s.completedOn<=today,'Survey date cannot be in the future.',400);
  assert(await db.prepare("SELECT id FROM members WHERE id=? AND role='installer'").bind(s.installerId).first(),'Select an installer.',400);
  const r=await db.prepare('INSERT INTO production.operations_surveys (id,external_id,installer_id,completed_on,ratings,entered_by,created) VALUES (?,?,?,?,?,?,?) ON CONFLICT(external_id) DO NOTHING').bind(crypto.randomUUID(),s.externalId,s.installerId,s.completedOn,JSON.stringify(s.ratings),m.id,at).run();assert(r.meta.changes,'That survey reference has already been recorded.',409);return;
 }
 if(action==='crewColors'){
  assert(m.role!=='installer','Installer accounts cannot change crew colors.');
  const colors=parse(z.record(z.string(),z.string().regex(/^#[0-9a-f]{6}$/i)),input.data);
  const installers=(await db.prepare("SELECT id FROM members WHERE role='installer' AND active=1").all()).results.map((v:any)=>v.id);
  assert(Object.keys(colors).every(id=>installers.includes(id)),'Crew colors may only be assigned to active installers.',400);
  await db.prepare('INSERT INTO production.operations_config (id,payload,updated_by,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind(`crew-colors:${m.id}`,JSON.stringify(colors),m.id,at).run();return;
 }
 await db.transaction(async tx=>{
  let j:any,version=0;
  if(action==='create'){
   assert(hasJobEditPermission(m),'Your account needs job editing permission.');const f=parse(fieldsSchema,input.data);
   // Serialize manual customer creation; older duplicate IDs remain readable for reconciliation.
   await tx.prepare('LOCK TABLE jobs IN SHARE ROW EXCLUSIVE MODE').run();
   assert(!(await tx.prepare("SELECT id FROM jobs WHERE payload::jsonb->>'number'=?").bind(f.number).first()),'This customer ID already exists. Open its job file.',409);
   j={...f,id:crypto.randomUUID(),attachments:[],history:[],operations:{},install:'',installerId:null};
   assert(f.stage==='Ordered','New customer jobs must begin in ORD status.',400);
   assert([f.received,f.installed,f.incompleteSince].every(d=>!d||d<=today),'Historical dates cannot be in the future.',400);
  }else{
   const row=await tx.prepare('SELECT payload,version FROM jobs WHERE id=? FOR UPDATE').bind(String(input.jobId||'')).first();assert(row,'Job not found.',404);j=JSON.parse(row.payload);version=row.version;
   j=withCustomerRecord(j,(await tx.prepare('SELECT payload FROM customer_records WHERE job_id=?').bind(j.id).first())?.payload);
   assert(input.version===version,'This job changed. Refresh and try again.',409);
   assert(m.role!=='installer'||installerVisible(m,j),'This job is not assigned to you.');
  }
  const o=j.operations||{};j.operations=o;let history=action;
  const alert=async(recipient:string,message:string)=>{if(!recipient)return;const id=crypto.randomUUID();await tx.prepare("INSERT INTO notifications(id,recipient_id,job_id,message,created,push_status) VALUES(?,?,?,?,?,'pending')").bind(id,recipient,j.id,message,at).run();push.push(id)};
  const notifyReport=async(message:string)=>{
   await alert(j.supervisorId,message);
   if(j.salesRepEmail){const id=crypto.randomUUID();await tx.prepare('INSERT INTO production.operations_email(id,recipient,subject,body,status,created,updated) VALUES(?,?,?,?,?,?,?)').bind(id,j.salesRepEmail,`Production Desk · Job ${j.number}`,message+'\n\nContact the field supervisor for details.','pending',at,at).run();emails.push(id)}
  };
  const installer=async(id:string)=>{const v=await tx.prepare("SELECT id,name FROM members WHERE id=? AND role='installer' AND active=1").bind(id).first();assert(v,'Select an active installer.',400);return v};
  const checkSupervisor=async()=>{const s=await tx.prepare("SELECT id,name FROM members WHERE id=? AND role IN ('admin','supervisor') AND active=1").bind(j.supervisorId).first();assert(s,'Select an active field supervisor or administrator.',400);j.supervisor=s.name};
  const confirmSchedule=async(s:any)=>{const i=await installer(s.installerId);j.install=s.date;j.installPeriod=s.period;j.stopNumber=s.stop;j.installerId=i.id;j.crew=i.name;j.scheduleInstructions=s.additionalInstructions||'';o.pendingSchedule=null;await alert(i.id,`Job #${j.number} added to your calendar for ${s.date} ${s.period}, stop ${s.stop}: ${j.customer}.`)};
  const edit=()=>assert(hasJobEditPermission(m),'Your account needs job editing permission.');
  if(action==='create'){assert(j.product==='Diamond Screens'||!j.screenCount,'Screen quantities require a Diamond Screens account.',400);assert(!(j.product==='Windows'&&j.entryDoorCount>0)&&!(j.product!=='Windows'&&(j.windowCount>0||j.slidingDoors>0))&&!(j.product==='Diamond Screens'&&j.entryDoorCount>0),'Windows/SPD, Entry Doors, and Diamond Screens require separate accounts.',400);await checkSupervisor();history='Customer created manually';}
  else if(action==='edit'){
   edit();const schema=fieldsSchema.omit({number:true,contractAmount:true,amount:true,stage:true,received:true,installed:true,incompleteSince:true,permitReceived:true,permitNumber:true});
   for(const k of ['contractAmount','amount','stage','received','installed','incompleteSince','permitReceived','permitNumber'])assert(input.data[k]===undefined,'Use the protected workflow actions for price, balance, permit and status changes.',400);
   const f=parse(schema,{...j,...input.data});assert(f.product==='Diamond Screens'||!f.screenCount,'Screen quantities require a Diamond Screens account.',400);
   assert(!(f.product==='Windows'&&(f.entryDoorCount||0)>0)&&!(f.product!=='Windows'&&((f.windowCount||0)>0||(f.slidingDoors||0)>0))&&!(f.product==='Diamond Screens'&&(f.entryDoorCount||0)>0),'Windows/SPD, Entry Doors, and Diamond Screens require separate accounts.',400);assert((j.materials||[]).every((v:any)=>allowedMaterials(f.product||'Windows').includes(v.materialType)),'Received materials require a separate account for this account type.',400);Object.assign(j,f);await checkSupervisor();history='Customer and job information updated';
  }else if(action==='payment'){
   edit();const amount=parse(z.number().finite().min(0).multipleOf(.01),input.data.amount),reference=parse(z.string().trim().min(1).max(300),input.data.reference);
   assert(j.amount!=null&&amount<=j.amount,'A payment must not increase the balance. Ask an administrator to reconcile unknown balances.',400);history=`Amount due ${j.amount} → ${amount}. Payment reference: ${reference}`;j.amount=amount;
  }else if(action==='balance'){
   assert(m.role==='admin','Administrator access required.');const amount=parse(z.number().finite().min(0).multipleOf(.01),input.data.amount);const reference=parse(z.string().trim().min(1).max(300),input.data.reference);history=`Balance reconciled ${j.amount??'unknown'} → ${amount}. Source: ${reference}`;j.amount=amount;
  }else if(action==='schedule'){
   edit();const s=parse(scheduleSchema,input.data);assert(s.date>=today,'Choose today or a future date.',400);await installer(s.installerId);await checkSupervisor();assert(j.stage==='Received'&&j.received,'Only an RCVD job can be scheduled.',400);assert(j.permitReceived&&j.permitNumber,'Permit Received and a permit number are required before scheduling.',400);
   for(const a of s.salesPhotos||[]){const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();assert(file?.job_id===j.id&&file?.member_id===m.id&&file?.kind==='photos','Upload sales photos for this job before scheduling.',400);j.attachments=[...(j.attachments||[]).filter((v:any)=>v.key!==a.key),a];o.salesKeys=[...new Set([...(o.salesKeys||[]),a.key])]}
   if((dayDifference(j.received,s.date)??0)>30){assert(j.amount===0&&s.paymentReference,'Beyond 30 days requires a zero amount due and payment reference.',400);o.pendingSchedule={...s,requestedBy:m.name,requestedAt:at};history='Schedule requested beyond 30 days; awaiting FS/Admin approval';await alert(j.supervisorId,`Job #${j.number}: schedule beyond 30 days needs approval.`)}
   else{await confirmSchedule(s);history=`Scheduled ${s.date} ${s.period}, stop ${s.stop}`}
  }else if(action==='approveSchedule'||action==='rejectSchedule'){
   assert(reviewer(m),'Field supervisor or administrator approval required.');assert(o.pendingSchedule,'No schedule request is pending.',409);
   if(action==='approveSchedule'){assert(j.amount===0&&o.pendingSchedule.paymentReference,'Payment in full must be recorded before approval.',400);assert(o.pendingSchedule.date>=today,'Requested date has passed. Schedule again.',400);await confirmSchedule(o.pendingSchedule);history='Schedule beyond 30 days approved'}else{o.pendingSchedule=null;history='Schedule request declined'}
  }else if(action==='receive'){
   edit();const r=input.data.materials?parse(receiveItemsSchema,input.data):(()=>{const legacy=parse(receiveSchema,input.data);return {received:legacy.received,materials:[legacy]}})();assert(r.received<=today,'Materials received date cannot be in the future.',400);assert(r.materials.every(v=>allowedMaterials(j.product||'Windows').includes(v.materialType)),'Windows/SPD, Entry Doors, and Diamond Screens must be received on separate accounts.',400);j.materials=r.materials;j.bay=r.materials.map(v=>v.bay).join(', ');j.brand=r.materials[0].brand;j.materialType=r.materials[0].materialType;if(j.stage==='Ordered'){j.received=r.received;j.stage='Received'}else assert(j.received===r.received,'The original received date cannot be changed.',400);history=`Received materials updated: ${r.materials.map(v=>`${v.materialType}, ${v.brand}, bay ${v.bay}`).join('; ')}`;
  }else if(action==='permit'){
   edit();const p=parse(z.object({received:z.boolean(),number:z.string().trim().max(150),buildingDepartment:z.string().trim().max(200).default('')}),input.data);assert(!p.received||p.number,'Enter the permit number when Permit Received is checked.',400);j.buildingDepartment=p.buildingDepartment;j.permitReceived=p.received;j.permitNumber=p.received?p.number:'';history=p.received?`Permit received: ${p.number}`:'Permit marked not received';
  }else if(action==='start'){
   assert(reviewer(m),'Field supervisor or administrator access required.');assert(j.stage==='Received'&&j.install,'Schedule the RCVD job before moving it to PROD.',400);j.stage='Production';j.installed=today;o.report=null;history='Job moved to PROD; production aging started';
  }else if(action==='status'){
   assert(reviewer(m),'Field supervisor or administrator access required.');assert(!o.report?.pending,'Review the installer submission before changing status.',409);
   const target=parse(z.enum(['Production','InProgress']),input.data.target);
   if(target==='Production'){assert(j.stage==='Received'&&j.install,'Schedule the RCVD job before moving it to PROD.',400);j.stage='Production';j.installed=today;o.report=null;history='Job moved to PROD; production aging started'}
   else{assert(['Production','InProgress'].includes(j.stage),'Only a PROD job can be marked IN PROGRESS.',400);j.stage='InProgress';history='Multi-day installation marked IN PROGRESS'}
  }else if(action==='attach'){
   edit();const a=parse(z.object({key:z.string(),name:z.string().max(255),kind:z.literal('photos')}),input.data);const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();assert(a.key.startsWith(`jobs/${j.id}/photos/`)&&file?.job_id===j.id,'Upload the file before saving it.',400);j.attachments=[...(j.attachments||[]).filter((v:any)=>v.key!==a.key),a];o.salesKeys=[...new Set([...(o.salesKeys||[]),a.key])];history='Sales handoff file added';
  }else if(action==='issue'){
   assert(m.role==='installer','Installer access required.');const text=parse(z.string().trim().min(1).max(4000),input.data.text);o.issues=[{id:crypto.randomUUID(),text,by:m.name,at},...(o.issues||[])];await alert(j.supervisorId,`⚠ Job #${j.number}: ${text}`);history='Installer reported an issue: '+text;
  }else if(action==='report'){
   assert(reviewer(m)||(m.role==='installer'&&j.installerId===m.id),'Only the assigned installer, Field Supervisor or Administrator can submit a report.');
   assert(['Production','InProgress'].includes(j.stage)&&!o.report?.pending&&!o.report?.approved,'A Field Supervisor or Administrator must move the scheduled job to PROD before completion can be submitted.',409);
   const r=parse(reportSchema,{...input.data,jobId:j.id,version});assert(r.installed<=today,'Installation date cannot be in the future.',400);assert(!reportError(r),reportError(r),400);const hashes=new Set();
   for(const a of r.attachments){const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();assert(a.key.startsWith(`jobs/${j.id}/${a.kind}/`)&&file?.job_id===j.id&&file?.kind===a.kind&&file?.member_id===m.id,'An uploaded attachment is missing.',400);if(['front','rear','left','right'].includes(a.kind)){const hash=file?.sha256;assert(hash&&!hashes.has(hash),'Upload four different exterior photos.',400);hashes.add(hash)}}
   const report={...r,installerId:j.installerId||m.id,installerName:j.crew||m.name,submittedBy:m.id,submittedByName:m.name,submittedAt:at,pending:true};
   await tx.prepare('INSERT INTO installer_reports(id,job_id,installer_id,supervisor_id,payload,created) VALUES(?,?,?,?,?,?)').bind(r.id,j.id,j.installerId||m.id,j.supervisorId,JSON.stringify(report),at).run();
   o.report=report;j.attachments=[...(j.attachments||[]),...r.attachments];history=`Installer submitted ${r.status}; awaiting approval`;await notifyReport(`Job #${j.number}: ${r.status} submitted by ${m.name}. Field supervisor review required.`);
  }else if(action==='reviewReport'){
   assert(reviewer(m),'Supervisor approval required.');assert(o.report?.pending,'No report is pending.',409);const approve=parse(z.boolean(),input.data.approve);o.report={...o.report,pending:false,approved:approve,reviewedBy:m.name,reviewedAt:at,confirmed:approve};
   if(approve){assert(!reportError(o.report),reportError(o.report),400);if(o.report.status==='Incomplete')assert(String(j.reorder||'').trim(),'Enter reorder information before approving an INC result.',400);j.stage=o.report.status==='Complete'?'Closed':'Incomplete';if(j.stage==='Incomplete')j.incompleteSince=at;history=`Installer report approved; job moved to ${j.stage==='Closed'?'COMP':'INC'}`}
   else history='Installer report returned for correction';
   await alert(j.installerId,`Job #${j.number}: report ${approve?`approved and moved to ${j.stage==='Closed'?'COMP':'INC'}`:'returned for correction'}.`);
  }else if(action==='confirmStatus'){
   assert(reviewer(m),'Supervisor or administrator access required.');assert(j.stage==='Production'&&o.report?.approved&&!o.report?.confirmed,'Approve an installer report while the job is in production first.',409);assert(!reportError(o.report),reportError(o.report),400);if(o.report.status==='Incomplete')assert(String(j.reorder||'').trim(),'Enter reorder information before approving INC.',400);j.stage=o.report.status==='Complete'?'Closed':'Incomplete';if(j.stage==='Incomplete')j.incompleteSince=at;o.report.confirmed=true;history=`Official status confirmed: ${j.stage}`;
  }else if(action==='request'){
   edit();const r=parse(requestSchema,input.data);const id=crypto.randomUUID();
   if(r.type==='UTI')assert(j.amount===0&&r.paymentReference&&j.received,'UTI requires payment in full, a reference, and receipt date.',400);
   if(r.type==='COLL')assert(r.refused,'Confirm that payment was refused.',400);
   if(r.type==='ACCRF')assert(r.amount!==undefined&&j.contractAmount!=null&&j.amount!=null,'Enter the revised contract price. Existing price and amount due must be known.',400);
   if(r.type==='Service'){assert(r.serviceDate&&r.serviceDate>=today,'Select a future service date.',400);await installer(r.installerId||'')}
   o.requests=[{...r,id,status:'Pending',by:m.name,at},...(o.requests||[])];history=`${r.type} request submitted for administrator approval: ${r.details}`;
  }else if(action==='reviewRequest'){
   assert(m.role==='admin','Administrator approval required.');const r=(o.requests||[]).find((v:any)=>v.id===input.data.id);assert(r&&r.status==='Pending','Request is no longer pending.',409);const approve=parse(z.boolean(),input.data.approve);
   if(approve&&r.type==='UTI'){assert(j.amount===0&&r.paymentReference,'Full payment is required.',400);j.stage='UTI';o.pendingSchedule=null;j.install=''}
   if(approve&&r.type==='COLL'){assert(r.refused,'Refused payment is required.',400);j.stage='COLL';o.pendingSchedule=null;j.install=''}
   if(approve&&r.type==='Service'){assert(r.serviceDate&&r.serviceDate>=today,'The requested service date has passed. Submit a new request.',400);const i=await installer(r.installerId||'');o.services=[...(o.services||[]),{id:r.id,date:r.serviceDate,period:r.period,installerId:i.id,crew:i.name,details:r.details}];j.stage='SVC';await alert(i.id,`Service for job #${j.number}: ${r.serviceDate} ${r.period}. ${r.details}`)}
   if(approve&&r.type==='ACCRF'){assert(j.contractAmount!=null&&j.amount!=null,'Reconcile price and balance first.',400);const delta=Math.round((r.amount-j.contractAmount)*100)/100;assert(j.amount+delta>=0,'This adjustment would create a credit. Reconcile it with the main system first.',400);j.amount=Math.round((j.amount+delta)*100)/100;j.contractAmount=r.amount}
   r.status=approve?'Approved':'Declined';r.reviewedBy=m.name;r.reviewedAt=at;history=`${r.type} ${r.status.toLowerCase()}`;
  }else if(action==='delete'){
   assert(m.role==='admin','Administrator access required.');
   for(const table of ['customer_events','customer_records','installer_reports','job_visits','notifications','attachment_uploads'])await tx.prepare(`DELETE FROM ${table} WHERE job_id=?`).bind(j.id).run();
   await tx.prepare('DELETE FROM jobs WHERE id=?').bind(j.id).run();return;
  }else if(action!=='create')throw new ApiError(400,'Unknown action.');
  j.history=[{at,by:m.name,text:history},...(j.history||[])];
  if(version)await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,j.id).run();
  else await tx.prepare('INSERT INTO jobs(id,payload,version,updated) VALUES(?,?,1,?)').bind(j.id,JSON.stringify(j),at).run();
 });
 for(const id of push)try{await deliverPush(id)}catch{/* Durable in-app alert retained. */}
 for(const id of emails)await deliverOperationEmail(id);
}
export async function deliverOperationEmail(id:string){
 const db=database(),r=await db.prepare('SELECT * FROM production.operations_email WHERE id=?').bind(id).first();if(!r||r.status==='accepted')return;
 let status='not_configured';
 if(env.RESEND_API_KEY&&env.ACCOUNT_EMAIL_FROM){try{const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:`Production Desk <${env.ACCOUNT_EMAIL_FROM}>`,to:[r.recipient],subject:r.subject,text:r.body})});status=response.ok?'accepted':'failed'}catch{status='failed'}}
 await db.prepare('UPDATE production.operations_email SET status=?,updated=? WHERE id=?').bind(status,new Date().toISOString(),id).run();
}
