import {reorderOperation} from '@/lib/reorder-requests';
import {canAddJobPhotos,jobPhotoKinds} from './job-photo-access';
import {linkedAccountValues} from './linked-account';
import {isPurchaseOrder,resolvedPaymentMethod} from './payment-status';
import {remainingWorkdays,hourLabel,installAppointments} from './install-calendar';
import {storedObject} from './stored-data';
import {database} from '@/db/raw';
import {ApiError,Member,hasJobEditPermission,type DashboardStep} from '@/lib/access';
import {normalizeStoredCustomerFields,fieldsSchema,scheduleSchema,receiveSchema,receiveItemsSchema,allowedMaterials,requestSchema,surveySchema,configSchema,optionalDate,localDay,aging,dayDifference,bonusMetrics,bonusPeriod} from './operations';
import {env} from './server-env';
import {reportSchema,reportError,installerJob} from './installer-workflow';
import {deliverPush} from './push';
import {incompleteSince} from './job-workflow';
import {z} from 'zod';
export const reviewer=(m:Member)=>['admin','supervisor'].includes(m.role);
function normalizedSurvey(row:any){let ratings=row?.ratings;try{if(typeof ratings==='string')ratings=JSON.parse(ratings)}catch{ratings=[]}return {...row,completed_on:String(row?.completed_on||''),ratings:[0,1,2,3].map(i=>typeof ratings?.[i]==='number'&&Number.isFinite(ratings[i])?ratings[i]:null)}}
function withCustomerRecord(j:any,r:any){const record=r==null?{}:storedObject(r);const permitNumber=j.permitNumber??record.permitNumber??'';const permitReceived=j.permitReceived??(['received','issued','approved'].includes(String(record.permitStatus||'').toLowerCase())&&!!permitNumber);return {...j,paymentMethod:resolvedPaymentMethod(j,record),amount:typeof j.amount==='number'&&Number.isFinite(j.amount)?j.amount:null,incompleteSince:j.incompleteSince||incompleteSince(j)||'',salesRep:j.salesRep||record.salesRep||'',salesRepPhone:j.salesRepPhone||record.salesRepPhone||'',bay:j.bay||record.warehouseBay||'',customerEmail:j.customerEmail||record.email||'',permitNumber,permitReceived,buildingDepartment:j.buildingDepartment??record.permitAuthority??'',permitExpiration:j.permitExpiration??record.permitExpiration??'',buildingDepartmentPhone:j.buildingDepartmentPhone??record.buildingDepartmentPhone??'',privateProvider:j.privateProvider??record.privateProvider??false}}
const assert=(yes:unknown,message:string,status=403)=>{if(!yes)throw new ApiError(status,message)};
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const p=schema.safeParse(value);if(!p.success)throw new ApiError(400,p.error.issues[0]?`${p.error.issues[0].path.join('.')||'Form'}: ${p.error.issues[0].message}`:'Check the form.');return p.data};
const choiceKey=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase();
const cleanChoice=(value:string)=>value.trim().replace(/\s+/g,' ');
function choiceName(current:string|undefined,next:string){const clean=cleanChoice(next);if(!current)return clean;const score=(v:string)=>(/[a-z]/.test(v)?1:0)+(/[A-Z]/.test(v)?1:0);return score(clean)>score(current)?clean:current;}
function uniqueChoices(values:any[]){const choices=new Map<string,string>();for(const raw of values)if(typeof raw==='string'&&raw.trim()){const key=choiceKey(raw);choices.set(key,choiceName(choices.get(key),raw));}return [...choices.values()].sort((a,b)=>a.localeCompare(b));}
export function installerVisible(m:Member,j:any,today=localDay()) {return j.installerId===m.id||j.operations?.services?.some((s:any)=>s.installerId===m.id)}
export function publicJob(m:Member,j:any){
 if(m.role!=='installer')return j;
 return {...installerJob(j),serviceCompletionJob:!!j.serviceCompletionJob,inspectionComplete:!!j.inspectionComplete,noPermitRequired:!!j.noPermitRequired,deliveryOnly:!!j.deliveryOnly,phone2:j.phone2||'',phone3:j.phone3||'',customerSuppliedPermit:!!j.customerSuppliedPermit,install:j.installerId===m.id?j.install:'',canReport:installerVisible(m,j),salesRep:j.salesRep,salesRepPhone:j.salesRepPhone,salesRepEmail:j.salesRepEmail,received:j.received,bay:j.bay,city:j.city,state:j.state,zip:j.zip,materials:j.materials||[],product:j.product,windowCount:j.windowCount||0,slidingDoors:j.slidingDoors||0,entryDoorCount:j.entryDoorCount||0,screenCount:j.screenCount||0,buildingDepartment:j.buildingDepartment||'',permitExpiration:j.permitExpiration||'',buildingDepartmentPhone:j.buildingDepartmentPhone||'',privateProvider:!!j.privateProvider,installEnd:j.installerId===m.id?j.installEnd:'',installTime:j.installTime||'',scheduleCompletedOn:j.scheduleCompletedOn||'',brand:j.brand||'',materialType:j.materialType||'',permitReceived:!!j.permitReceived,permitNumber:j.permitNumber||'',instructions:j.instructions,scheduleInstructions:j.scheduleInstructions||'',reorder:j.reorder||'',attachments:(j.attachments||[]).filter((a:any)=>a.kind!=='visit'),operations:{reorders:j.operations?.reorders||[],salesKeys:j.operations?.salesKeys,report:j.operations?.report,services:(j.operations?.services||[]).filter((s:any)=>s.installerId===m.id)}};
}
export async function operationsData(m:Member,onStep:(step:DashboardStep)=>void=()=>{}){
 const db=database(),today=localDay();
 onStep('jobs-query');
 const rows=await db.prepare('SELECT j.payload,j.version,c.payload AS record FROM jobs j LEFT JOIN customer_records c ON c.job_id=j.id ORDER BY j.updated DESC').all();
 onStep('jobs-decode');
 const all=rows.results.map((r:any)=>({...withCustomerRecord(storedObject(r.payload),r.record),version:r.version}));
 onStep('installer-view');
 const jobs=all.filter((j:any)=>m.role!=='installer'||installerVisible(m,j)).map((j:any)=>publicJob(m,j));
 onStep('team');
 const team=m.role==='installer'?[]:(await db.prepare('SELECT id,name,role,active,installer_code FROM members ORDER BY name').all()).results;
 const warnings:string[]=[];
 let surveys:any[]=[],config:any=null,metrics:any=null,crewColors:any={};
 onStep('surveys');
 surveys=m.role==='installer'
  ?(await db.prepare('SELECT * FROM production.operations_surveys WHERE installer_id=? ORDER BY completed_on DESC').bind(m.id).all()).results
  :(await db.prepare('SELECT * FROM production.operations_surveys ORDER BY completed_on DESC').all()).results;
 surveys=surveys.map(normalizedSurvey);
 if(m.role!=='installer'){
  onStep('bonus-settings');
  config=(await db.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(bonusPeriod(today).end).first())?.payload;
  if(config!=null){try{const parsed=configSchema.safeParse(storedObject(config));if(!parsed.success)throw new TypeError('Invalid bonus settings');config=parsed.data;}catch{config=null;warnings.push('Bonus settings need review. The bonus estimate is unavailable. Admin can correct the targets in Settings.');}}
  onStep('bonus-metrics');
  metrics=bonusMetrics(all,surveys,config,today);
  onStep('crew-colors');
  const savedCrewColors=(await db.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(`crew-colors:${m.id}`).first())?.payload;
  if(savedCrewColors!=null){
   try{
    const decoded=storedObject(savedCrewColors);
    crewColors=decoded&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded:{};
   }catch{
    crewColors={};
    warnings.push('Your saved crew colors could not be read. Choose the colors again and save them.');
   }
  }
  if(!reviewer(m)){delete metrics.estimate;config=null;}
 }else metrics=bonusMetrics([],surveys,null,today);
 onStep('settings-history');
 const bonusConfigs=m.role==='admin'?(await db.prepare("SELECT payload FROM production.operations_config WHERE id NOT LIKE 'crew-colors:%' ORDER BY id DESC").all()).results.flatMap((r:any)=>{try{const parsed=configSchema.safeParse(storedObject(r.payload));return parsed.success?[parsed.data]:[]}catch{return []}}):[];
 let bonusSnapshots:any[]=[];if(reviewer(m)){try{bonusSnapshots=(await db.prepare('SELECT payload FROM production.bonus_snapshots ORDER BY period_end DESC').all()).results.map((r:any)=>storedObject(r.payload));}catch{warnings.push('Bonus history is unavailable. Check the bonus snapshot migration.');}}
 const daysOff=(await db.prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'day-off:%'").all()).results.map((r:any)=>storedObject(r.payload)).filter((r:any)=>m.role!=='installer'||r.installerId===m.id);
 const savedDepartments=m.role==='installer'?[]:(await db.prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'building-department:%'").all()).results.map((r:any)=>storedObject(r.payload).name);
 const buildingDepartments=m.role==='installer'?[]:uniqueChoices([...savedDepartments,...all.map((j:any)=>j.buildingDepartment)]);
 const savedCities=m.role==='installer'?[]:(await db.prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'city:%'").all()).results.map((r:any)=>storedObject(r.payload).name);
 const cities=m.role==='installer'?[]:uniqueChoices([...savedCities,...all.map((j:any)=>j.city)]);
 const salesReps:any[]=[];
 if(m.role!=='installer'){
  const saved=(await db.prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'sales-rep:%'").all()).results.map((r:any)=>storedObject(r.payload));
  const byName=new Map<string,any>();
  for(const j of all){if(j.salesRep?.trim()){const name=cleanChoice(j.salesRep),key=choiceKey(name),previous=byName.get(key);byName.set(key,{name:choiceName(previous?.name,name),phone:previous?.phone||j.salesRepPhone||'',email:previous?.email||j.salesRepEmail||''});}}
  for(const rep of saved)if(rep.name){const name=cleanChoice(rep.name),key=choiceKey(name),previous=byName.get(key);byName.set(key,{name:choiceName(previous?.name,name),phone:rep.phone||previous?.phone||'',email:rep.email||previous?.email||''});}
  salesReps.push(...Array.from(byName.values()).sort((a,b)=>a.name.localeCompare(b.name)));
 }
 return {cities,salesReps,buildingDepartments,daysOff,bonusSnapshots,warnings,bonusConfigs,me:m,jobs,team,today,metrics,surveys,config:reviewer(m)?config:null,crewColors,canEdit:hasJobEditPermission(m),canReview:reviewer(m)};
}
// All job changes lock the row and compare versions inside one transaction. Side effects are queued with the change.
export async function operation(m:Member,input:any){
 const db=database(),at=new Date().toISOString(),today=localDay(),push:string[]=[],emails:string[]=[];
 const action=String(input.action||'');
 if(action==='linkAccount'||action==='unlinkAccount'){
  assert(hasJobEditPermission(m),'Job editing permission required.');
  const source=parse(z.string().uuid(),input.jobId),target=parse(z.string().uuid(),input.data?.targetId);
  assert(source!==target,'Choose a different account.',400);
  await db.transaction(async tx=>{
   // Lock both rows in a stable order to prevent cross-link deadlocks.
   const ids=[source,target].sort(), rows:any[]=[];
   for(const id of ids)rows.push(await tx.prepare('SELECT payload,version FROM jobs WHERE id=? FOR UPDATE').bind(id).first());
   assert(rows.every(Boolean),'Account not found. Refresh the job list.',404);
   assert(rows[ids.indexOf(source)].version===input.version,'This job changed. Refresh and try again.',409);
   for(let i=0;i<ids.length;i++){
    const job=storedObject(rows[i].payload),other=ids[1-i];
    const links=new Set<string>(Array.isArray(job.linkedAccountIds)?job.linkedAccountIds:[]);
    if(action==='linkAccount')links.add(other);else links.delete(other);
    if(action==='linkAccount'&&ids[i]===source){
     const sourceRecord=(await tx.prepare('SELECT payload FROM customer_records WHERE job_id=?').bind(target).first())?.payload;
     const from=withCustomerRecord(storedObject(rows[1-i].payload),sourceRecord);
     const copied=linkedAccountValues(from,['admin','production_assistant'].includes(m.role));
     // Validate only copied fields so legacy workflow status codes remain intact.
     for(const [key,value] of Object.entries(copied)){
      const field=(fieldsSchema.shape as any)[key];
      job[key]=parse(field,value===null&&key!=='amount'&&key!=='contractAmount'?undefined:value);
     }
    }
    job.linkedAccountIds=[...links];
    const otherJob=storedObject(rows[1-i].payload);
    job.history=[{at,by:m.name,text:`${action==='linkAccount'?'Linked':'Unlinked'} customer account #${otherJob.number}${action==='linkAccount'&&ids[i]===source?'; copied account information from this account (product and workflow unchanged)':''}`},...(job.history||[])];
    await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job),at,ids[i]).run();
   }
  });return;
 }
 if(action==='dayOff'){
  assert(m.role==='installer'||hasJobEditPermission(m),'Job editing permission required.');
  const v=parse(z.object({installerId:z.string(),date:optionalDate,off:z.boolean()}),input.data);assert(v.date,'Choose a date.',400);assert(m.role!=='installer'||v.installerId===m.id,'You may only change your own days off.');
  await db.transaction(async tx=>{
   const crew=await tx.prepare("SELECT name FROM members WHERE id=? AND role='installer' AND active=1 FOR UPDATE").bind(v.installerId).first();assert(crew,'Select an active installer.',400);
   if(v.off){const jobs=(await tx.prepare('SELECT payload FROM jobs').all()).results.map((r:any)=>storedObject(r.payload));
    assert(!jobs.some((j:any)=>(j.installerId===v.installerId&&installAppointments(j,[v.date!]).length)||(j.operations?.services||[]).some((s:any)=>s.installerId===v.installerId&&s.date===v.date)),'A job is already scheduled on this date. Have the office reschedule it before marking the day off.',409);
   }
   const key=`day-off:${v.installerId}:${v.date}`;
   if(v.off)await tx.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind(key,JSON.stringify({installerId:v.installerId,date:v.date,crew:crew.name}),m.id,at).run();
   else await tx.prepare('DELETE FROM production.operations_config WHERE id=?').bind(key).run();
  });return;
 }
 if(action==='configure'){
  assert(m.role==='admin','Administrator access required.');const c=parse(configSchema,input.data);
  await db.prepare('INSERT INTO production.operations_config (id,payload,updated_by,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind(c.period,JSON.stringify(c),m.id,at).run();return;
 }
 if(action==='editSurvey'){
  assert(m.role==='admin','Administrator access required.');
  const v=parse(z.object({id:z.string().min(1),completedOn:optionalDate,ratings:z.array(z.number().int().min(1).max(5).nullable()).length(4),reason:z.string().trim().min(1).max(1000),expectedDate:z.string(),expectedRatings:z.array(z.number().nullable()).length(4)}),input.data);
  assert(v.completedOn&&v.completedOn<=today,'Enter a valid survey date that is not in the future.',400);
  assert(v.ratings.some(x=>x!==null),'Enter at least one rating.',400);
  await db.transaction(async tx=>{
   const old=await tx.prepare('SELECT * FROM production.operations_surveys WHERE id=? FOR UPDATE').bind(v.id).first();
   assert(old,'Survey not found.',404);
   const previous=normalizedSurvey(old);
   assert(previous.completed_on===v.expectedDate&&JSON.stringify(previous.ratings)===JSON.stringify(v.expectedRatings),'This survey changed. Refresh and review the latest values.',409);
   await tx.prepare('UPDATE production.operations_surveys SET ratings=?::jsonb,completed_on=? WHERE id=?').bind(JSON.stringify(v.ratings),v.completedOn,v.id).run();
   await tx.prepare('INSERT INTO account_audit(id,actor_id,member_id,action,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),m.id,old.installer_id,JSON.stringify({action:'GQ survey edited',surveyId:v.id,reason:v.reason,before:{ratings:previous.ratings,completedOn:previous.completed_on},after:{ratings:v.ratings,completedOn:v.completedOn}}),at).run();
  });return;
 }
 if(action==='survey'){
  assert(reviewer(m),'Field supervisor or administrator access required.');const s=parse(surveySchema,input.data);assert(s.completedOn<=today,'Survey date cannot be in the future.',400);
  assert(await db.prepare("SELECT id FROM members WHERE id=? AND role='installer'").bind(s.installerId).first(),'Select an installer.',400);
  assert(await db.prepare("SELECT id FROM jobs WHERE (payload::jsonb)->>'number'=? LIMIT 1").bind(s.customerId).first(),'No job matches that Customer ID.',400);
  const r=await db.prepare('INSERT INTO production.operations_surveys (id,external_id,customer_id,installer_id,completed_on,ratings,entered_by,created) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(external_id) DO NOTHING').bind(crypto.randomUUID(),s.externalId,s.customerId,s.installerId,s.completedOn,JSON.stringify(s.ratings),m.id,at).run();assert(r.meta.changes,'That survey reference has already been recorded.',409);return;
 }
 if(action==='crewColors'){
  assert(m.role!=='installer','Installer accounts cannot change crew colors.');
  const colors=parse(z.record(z.string(),z.string().regex(/^#[0-9a-f]{6}$/i)),input.data);
  const installers=(await db.prepare("SELECT id FROM members WHERE role='installer' AND active=1").all()).results.map((v:any)=>v.id);
  assert(Object.keys(colors).every(id=>installers.includes(id)),'Crew colors may only be assigned to active installers.',400);
  await db.prepare('INSERT INTO production.operations_config (id,payload,updated_by,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind(`crew-colors:${m.id}`,JSON.stringify(colors),m.id,at).run();return;
 }
 if(action==='agingDates'){
  assert(reviewer(m),'Field Supervisor or Administrator access required.');
  const batch=parse(z.object({reference:z.string().trim().min(1).max(500),rows:z.array(z.object({id:z.string().uuid(),version:z.number().int(),key:z.enum(['received','installed','incompleteSince']),date:optionalDate})).min(1).max(100)}),input.data);
  assert(new Set(batch.rows.map(r=>r.id)).size===batch.rows.length,'Each job may appear only once.',400);
  await db.transaction(async tx=>{
   for(const r of [...batch.rows].sort((a,b)=>a.id.localeCompare(b.id))){
    assert(r.date&&r.date<=today,'Enter valid dates no later than today.',400);
    const row=await tx.prepare('SELECT payload,version FROM jobs WHERE id=? FOR UPDATE').bind(r.id).first();
    assert(row&&row.version===r.version,'A job changed. Refresh the date editor and review your entries before retrying.',409);
    const job=storedObject(row.payload);
    const expected=job.stage==='Received'?'received':['Production','InProgress'].includes(job.stage)?'installed':job.stage==='Incomplete'?'incompleteSince':null;
    assert(r.key===expected&&!isPurchaseOrder(job),'Only the current aging date of an eligible job may be edited here.',400);
    const old=job[r.key];job[r.key]=r.date;if(r.key==='incompleteSince')job.reorderDate=r.date;
    job.history=[{at,by:m.name,text:`Aging date corrected: ${r.key} ${old||'unknown'} → ${r.date}. Source: ${batch.reference}`},...(job.history||[])];
    await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job),at,r.id).run();
   }
  });return;
 }
 if(action==='create'&&input.data.serviceCompletionJob===true){
  assert(hasJobEditPermission(m),'Job editing permission required.');
  const number=parse(z.string().trim().min(1).max(80),input.data.number);
  const existing=await db.prepare("SELECT id,version FROM jobs WHERE payload::jsonb->>'number'=?").bind(number).all();
  assert(existing.results.length<=1,'Multiple accounts match this Customer ID. Open the correct job file.',409);
  if(existing.results.length){const row=existing.results[0];return operation(m,{action:'serviceIntake',jobId:row.id,version:row.version,data:input.data});}
 }
 await db.transaction(async tx=>{
  let j:any,version=0;
  if(action==='create'){
   assert(hasJobEditPermission(m),'Your account needs job editing permission.');
   const requestedLink=parse(z.string().trim().max(80).default(''),input.data.linkedCustomerId);
   let inherited:any={};
   if(requestedLink){
    const matches=(await tx.prepare("SELECT j.payload,c.payload AS record FROM jobs j LEFT JOIN customer_records c ON c.job_id=j.id WHERE j.payload::jsonb->>'number'=?").bind(requestedLink).all()).results;
    assert(matches.length===1,matches.length?'More than one account has that Customer ID. Link the specific job after saving.':'Customer ID not found. Correct it or leave the link field blank.',400);
    inherited=linkedAccountValues(withCustomerRecord(storedObject(matches[0].payload),matches[0].record));
   }
   // Submitted form values win, allowing review and corrections before saving.
   const f=parse(fieldsSchema,normalizeStoredCustomerFields({...inherited,...input.data,...(input.data.serviceCompletionJob===true?{amount:0}: {})}));
   // Serialize manual customer creation; older duplicate IDs remain readable for reconciliation.
   await tx.prepare('LOCK TABLE jobs IN SHARE ROW EXCLUSIVE MODE').run();
   assert(!(await tx.prepare("SELECT id FROM jobs WHERE payload::jsonb->>'number'=?").bind(f.number).first()),'This customer ID already exists. Open its job file.',409);
   j={...f,id:crypto.randomUUID(),attachments:[],history:[],operations:{},install:'',installerId:null};
   const linkedCustomerId=parse(z.string().trim().max(80).default(''),input.data.linkedCustomerId);
   if(linkedCustomerId){
    assert(linkedCustomerId!==f.number,'Link to a different customer ID.',400);
    const matches=(await tx.prepare("SELECT id,payload FROM jobs WHERE payload::jsonb->>'number'=?").bind(linkedCustomerId).all()).results;
    assert(matches.length===1,matches.length?'More than one account has that Customer ID. Link the specific job after saving.':'Customer ID not found. Correct it or leave the link field blank.',400);
    const target=matches[0],other=storedObject(target.payload);
    j.linkedAccountIds=[target.id];other.linkedAccountIds=[...new Set([...(other.linkedAccountIds||[]),j.id])];
    other.history=[{at,by:m.name,text:`Linked customer account #${f.number}`},...(other.history||[])];
    j.history=[{at,by:m.name,text:`Linked customer account #${linkedCustomerId}`}];
    await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(other),at,target.id).run();
   }
   assert(f.stage==='Ordered','New customer jobs must begin in ORD status.',400);
   assert(!f.noPermitRequired||!f.permitReceived,'Choose No Permit Required or Permit Received, not both.',400);assert(!f.permitReceived||!!f.permitNumber,'Enter a permit number when Permit Received is checked.',400);
   if(input.data.materialReceipt){const receipt=parse(receiveItemsSchema,input.data.materialReceipt);assert(receipt.received<=today,'Materials received date cannot be in the future.',400);assert(receipt.materials.every(v=>allowedMaterials(f.product||'Windows').includes(v.materialType)),'Windows/SPD, Entry Doors, and Diamond Screens must be received on separate accounts.',400);Object.assign(j,{received:receipt.received,stage:'Received',materials:receipt.materials,bay:receipt.materials.map(v=>v.bay).join(', '),brand:receipt.materials[0].brand,materialType:receipt.materials[0].materialType});}else{j.received='';}
   if(f.serviceCompletionJob){j.stage='SVC';j.amount=0;j.received='';j.installed='';j.incompleteSince='';j.operations.historicalCompletion=true;}
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
  const installer=async(id:string)=>{const v=await tx.prepare("SELECT id,name FROM members WHERE id=? AND role='installer' AND active=1 FOR UPDATE").bind(id).first();assert(v,'Select an active installer.',400);return v};
  const checkSupervisor=async()=>{if(j.installerId){const crew=await tx.prepare("SELECT supervisor_id FROM members WHERE id=? AND role='installer'").bind(j.installerId).first();assert(crew?.supervisor_id,'Assign a Field Supervisor in the installer profile first.',400);j.supervisorId=crew.supervisor_id;}else if(!j.supervisorId){j.supervisor='';return;}const s=await tx.prepare("SELECT id,name FROM members WHERE id=? AND role IN ('admin','supervisor') AND active=1").bind(j.supervisorId).first();assert(s,'Select an active field supervisor or administrator.',400);j.supervisor=s.name};
  const checkAvailability=async(id:string,start:string,end=start)=>{
   const off=(await tx.prepare("SELECT payload FROM production.operations_config WHERE id LIKE ?").bind(`day-off:${id}:%`).all()).results.map((r:any)=>storedObject(r.payload));
   assert(!off.some((r:any)=>installAppointments({install:start,installEnd:end},[r.date]).length),'This installer is marked NOT WORKING on one of the selected dates. Choose another day or installer.',409);
  };
  const confirmSchedule=async(s:any)=>{
   if(j.stage==='Closed')j.stage='SVC';
   const i=s.installerId?await installer(s.installerId):null;
   if(i){await checkAvailability(i.id,s.date,s.endDate||s.date);j.installerId=i.id;await checkSupervisor();}
   else {j.installerId='';j.supervisorId='';j.supervisor='';}
   j.install=s.date;j.installEnd=s.endDate||s.date;j.installTime=s.time||'';j.scheduleCompletedOn='';j.installPeriod=s.time?(Number(s.time.slice(0,2))<12?'AM':'PM'):s.period;j.stopNumber=s.stop;j.crew=i?.name||'Unassigned';j.scheduleInstructions=s.additionalInstructions||'';if(s.instructions!==undefined)j.instructions=s.instructions;o.pendingSchedule=null;
   if(i&&(s.endDate||s.date)>=today)await alert(i.id,`Job #${j.number} added to your calendar for ${s.date}${s.endDate&&s.endDate!==s.date?' through '+s.endDate:''} ${s.time?hourLabel(s.time):s.period}, stop ${s.stop}: ${j.customer}.`);
  };
  const addService=async(r:any,id:string)=>{assert(j.stage==='Closed','Only a COMP job can move to SVC.',400);const i=await installer(r.installerId||'');await checkAvailability(i.id,r.serviceDate);o.services=[...(o.services||[]),{id,date:r.serviceDate,period:r.period,installerId:i.id,crew:i.name,details:r.details}];j.stage='SVC';o.pendingSchedule=null;await alert(i.id,`Service for job #${j.number}: ${r.serviceDate} ${r.period}. ${r.details}`)};
  const edit=()=>assert(hasJobEditPermission(m),'Your account needs job editing permission.');
  const scheduleJob=async(payload:any)=>{
   edit();const s=parse(scheduleSchema,payload);if(s.installerId){const schedulingCrew=await tx.prepare("SELECT supervisor_id FROM members WHERE id=? AND role='installer' AND active=1").bind(s.installerId).first();assert(schedulingCrew?.supervisor_id,'Assign a Field Supervisor in the installer profile first.',400);const schedulingSupervisor=await tx.prepare("SELECT id FROM members WHERE id=? AND role IN ('admin','supervisor') AND active=1").bind(schedulingCrew.supervisor_id).first();assert(schedulingSupervisor,'Installer needs an active Field Supervisor.',400);}else assert(m.role==='production_assistant','Select an installer. Only Production Assistants can create an unassigned schedule.',400);assert(!s.endDate||s.endDate===s.date||remainingWorkdays(s.date,s.endDate)>0,'Select a multi-day range that includes a weekday.',400);assert(j.serviceCompletionJob||j.noPermitRequired||(j.permitReceived&&j.permitNumber),'Mark No Permit Required, or enter Permit Received and a permit number before scheduling.',400);
   for(const a of s.salesPhotos||[]){const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();assert(file?.job_id===j.id&&file?.member_id===m.id&&file?.kind==='photos','Upload sales photos for this job before scheduling.',400);j.attachments=[...(j.attachments||[]).filter((v:any)=>v.key!==a.key),a];o.salesKeys=[...new Set([...(o.salesKeys||[]),a.key])]}
   await confirmSchedule(s);history=`Scheduled ${s.date}${s.endDate&&s.endDate!==s.date?' through '+s.endDate:''} ${s.time?hourLabel(s.time):s.period}, stop ${s.stop}${(dayDifference(j.received,s.date)??0)>30?'; beyond 30 days received':''}`;
  };
  if(['create','edit'].includes(action)&&input.data.assignedInstallerId){assert(hasJobEditPermission(m),'Job editing permission required.');const id=parse(z.string().uuid(),input.data.assignedInstallerId);const crew=await installer(id);if(j.installerId!==id){if(j.install)await checkAvailability(id,j.install,j.installEnd||j.install);j.installerId=id;j.crew=crew.name;if(j.install)await alert(id,`Job #${j.number} assigned to your calendar for ${j.install}.`);}}
  if(action==='create'){assert(j.product==='Diamond Screens'||!j.screenCount,'Screen quantities require a Diamond Screens account.',400);assert(!(j.product==='Windows'&&j.entryDoorCount>0)&&!(j.product!=='Windows'&&(j.windowCount>0||j.slidingDoors>0))&&!(j.product==='Diamond Screens'&&j.entryDoorCount>0),'Windows/SPD, Entry Doors, and Diamond Screens require separate accounts.',400);await checkSupervisor();history='Customer created manually';}
  else if(action==='serviceIntake'){
   edit();assert(['Closed','SVC'].includes(j.stage),'This ID belongs to an active job. Open its file instead of creating a historical service job.',409);assert(j.amount===0,'This existing account is not paid in full. Review its balance in the job file.',409);j.serviceCompletionJob=true;j.stage='SVC';if(input.data.instructions!==undefined)j.instructions=parse(z.string().max(10000),input.data.instructions);if(input.data.inspectionComplete!==undefined)j.inspectionComplete=parse(z.boolean(),input.data.inspectionComplete);history='Existing completed account opened for service';
  }else if(action==='edit'){
   edit();assert(input.data.supervisorId===undefined||input.data.supervisorId===j.supervisorId,'Change Field Supervisor in the installer profile.',400);assert(['admin','production_assistant'].includes(m.role)||input.data.paymentMethod===undefined||input.data.paymentMethod===(j.paymentMethod||''),'Only an Administrator or Production Assistant may change the payment method.');assert(input.data.serviceCompletionJob===undefined,'Use Service/Completion Job when adding an older account.',400);const schema=fieldsSchema.omit({serviceCompletionJob:true,number:true,stage:true,received:true,installed:true,incompleteSince:true,permitReceived:true,permitNumber:true,noPermitRequired:true});
   for(const k of ['contractAmount','amount'])assert(['admin','production_assistant'].includes(m.role)||input.data[k]===undefined,'Only an Administrator or Production Assistant may edit protected job amounts.');
   const oldMoney={contractAmount:j.contractAmount,amount:j.amount};
   for(const k of ['stage','received','installed','incompleteSince','permitReceived','permitNumber','noPermitRequired'])assert(input.data[k]===undefined,'Use the protected workflow actions for price, balance, permit and status changes.',400);
   const f=parse(schema,{...normalizeStoredCustomerFields(j),...input.data});assert(f.product==='Diamond Screens'||!f.screenCount,'Screen quantities require a Diamond Screens account.',400);
   assert(!(f.product==='Windows'&&(f.entryDoorCount||0)>0)&&!(f.product!=='Windows'&&((f.windowCount||0)>0||(f.slidingDoors||0)>0))&&!(f.product==='Diamond Screens'&&(f.entryDoorCount||0)>0),'Windows/SPD, Entry Doors, and Diamond Screens require separate accounts.',400);assert((j.materials||[]).every((v:any)=>allowedMaterials(f.product||'Windows').includes(v.materialType)),'Received materials require a separate account for this account type.',400);assert(!f.reorderDate||f.reorderDate<=today,'Reorder Date cannot be in the future.',400);const oldReorder=j.reorderDate;Object.assign(j,f);if(j.stage==='Incomplete'&&f.reorderDate)j.incompleteSince=f.reorderDate;if(j.importSource&&['windowCount','slidingDoors','entryDoorCount'].some(k=>k in input.data)&&(j.windowCount+j.slidingDoors+j.entryDoorCount)>0)j.importSource.unitsUnconfirmed=false;await checkSupervisor();history='Customer and job information updated'+(['contractAmount','amount'] as const).filter(k=>oldMoney[k]!==j[k]).map(k=>`; ${k==='amount'?'Balance due':'Job amount'} ${oldMoney[k]??'unknown'} → ${j[k]??'unknown'}`).join('')+(f.reorderDate&&oldReorder!==f.reorderDate?`; Reorder Date ${oldReorder||'not recorded'} → ${f.reorderDate}; INC aging uses this date.`:'');
  }else if(action==='agingDate'){
   assert(reviewer(m),'Field supervisor or administrator access required.');const d=parse(z.object({date:optionalDate,reference:z.string().trim().min(1).max(500)}),input.data);assert(d.date&&d.date<=today,'Enter a verified date no later than today.',400);
   const key=j.stage==='Incomplete'?'incompleteSince':['Production','InProgress'].includes(j.stage)?'installed':j.stage==='Received'?'received':null;
   assert(key&&!j[key],'Only an unconfirmed aging date can be entered here.',400);j[key!]=d.date;history=`Verified ${key}: ${d.date}. Source: ${d.reference}`;
  }else if(action==='payment'){
   assert(m.role==='admin','Only an Administrator may record payments.');const paymentType=parse(z.enum(['FNC','CHK','CC','AQUA','PO']),input.data.paymentType);const amount=parse(z.number().finite().positive().multipleOf(.01),input.data.paymentAmount),reference=parse(z.string().trim().max(300).default(''),input.data.reference);
   assert(j.amount!=null&&amount<=j.amount,'Enter a payment no greater than the balance due. Reconcile an unknown balance first.',400);const remaining=Math.round((j.amount-amount)*100)/100;history=`Payment ${amount}. Amount due ${j.amount} → ${remaining}. Payment type: ${paymentType}.${reference?' Payment reference: '+reference:''}`;j.amount=remaining;j.paymentMethod=paymentType;
  }else if(action==='balance'){
   assert(m.role==='admin','Administrator access required.');const amount=parse(z.number().finite().min(0).multipleOf(.01),input.data.amount);const reference=parse(z.string().trim().max(300).default(''),input.data.reference);history=`Balance reconciled ${j.amount??'unknown'} → ${amount}. ${reference?'Source: '+reference:'Updated by Administrator'}`;j.amount=amount;
  }else if(action==='schedule'){
   await scheduleJob(input.data);
  }else if(action==='approveSchedule'||action==='rejectSchedule'){
   assert(reviewer(m),'Field supervisor or administrator approval required.');assert(o.pendingSchedule,'No schedule request is pending.',409);
   if(action==='approveSchedule'){await confirmSchedule(o.pendingSchedule);history='Schedule beyond 30 days approved'}else{o.pendingSchedule=null;history='Schedule request declined'}
  }else if(action==='receive'){
   edit();const r=input.data.materials?parse(receiveItemsSchema,input.data):(()=>{const legacy=parse(receiveSchema,input.data);return {received:legacy.received,materials:[legacy]}})();assert(r.received<=today,'Materials received date cannot be in the future.',400);assert(r.materials.every(v=>allowedMaterials(j.product||'Windows').includes(v.materialType)),'Windows/SPD, Entry Doors, and Diamond Screens must be received on separate accounts.',400);j.materials=r.materials;j.bay=r.materials.map(v=>v.bay).join(', ');j.brand=r.materials[0].brand;j.materialType=r.materials[0].materialType;if(j.stage==='Ordered'){j.received=r.received;j.stage='Received'}else{if(j.received!==r.received){const reason=parse(z.string().trim().min(1).max(500),input.data.reference);j.history=[{at,by:m.name,text:`Original received date corrected: ${j.received||'unknown'} → ${r.received}. Source: ${reason}`},...(j.history||[])];}j.received=r.received;}history=`Received materials updated: ${r.materials.map(v=>`${v.materialType}, ${v.brand}, bay ${v.bay}`).join('; ')}`;
  }else if(action==='permit'){
   edit();const p=parse(z.object({inspectionComplete:z.boolean().default(false),noPermitRequired:z.boolean().default(false),received:z.boolean(),number:z.string().trim().max(150),buildingDepartment:z.string().trim().max(200).default(''),expiration:optionalDate,buildingDepartmentPhone:z.string().trim().max(50).default(''),privateProvider:z.boolean().default(false),customerSuppliedPermit:z.boolean().default(false)}),input.data);assert(!p.noPermitRequired||!p.received,'Choose No Permit Required or Permit Received, not both.',400);j.inspectionComplete=p.inspectionComplete;j.noPermitRequired=p.noPermitRequired;assert(!p.received||p.number,'Enter the permit number when Permit Received is checked.',400);j.customerSuppliedPermit=p.customerSuppliedPermit;j.permitExpiration=p.expiration;j.buildingDepartmentPhone=p.buildingDepartmentPhone;j.privateProvider=p.privateProvider;j.buildingDepartment=p.buildingDepartment;j.permitReceived=p.received;j.permitNumber=p.number;history=p.noPermitRequired?'No Permit Required':p.received?`Permit received: ${p.number}`:'Permit marked not received';
  }else if(action==='start'){
   assert(reviewer(m),'Field supervisor or administrator access required.');assert(j.stage==='Received'&&j.install,'Schedule the RCVD job before moving it to PROD.',400);j.stage='Production';j.installed=today;o.report=null;history='Job moved to PROD; production aging started';
   }else if(action==='adminResult'){
   assert(m.role==='admin','Administrator access required.');
   const result=parse(z.object({target:z.enum(['Closed','Incomplete']),confirmed:z.literal(true),reason:z.string().trim().min(1).max(1000),reorder:z.string().trim().max(4000).default(''),reorderDate:optionalDate}),input.data);
   const previous=j.stage;
   if(result.target==='Incomplete'){
    const reorder=result.reorder||String(j.reorder||'').trim(),reorderDate=result.reorderDate||j.reorderDate||'';
    assert(reorder,'Enter reorder information before moving to INC.',400);
    assert(reorderDate&&reorderDate<=today,'Enter the actual reorder date before moving to INC.',400);
    j.reorder=reorder;j.reorderDate=reorderDate;
   }
   j.stage=result.target;
   if(j.stage==='Closed')j.scheduleCompletedOn=today;
   else {j.incompleteSince=j.reorderDate;j.scheduleCompletedOn='';}
   if(o.report?.pending)o.report={...o.report,pending:false,approved:false,superseded:true,reviewedBy:m.name,reviewedAt:at};
   o.pendingSchedule=null;
   o.adminResult={target:result.target,by:m.id,name:m.name,at,reason:result.reason,requirementsOverridden:true};
   history=`Administrator override: ${previous} → ${result.target==='Closed'?'COMP':'INC'} without required completion evidence.${result.target==='Incomplete'?` Reorder date: ${j.reorderDate}.`:''} Reason: ${result.reason}`;
   await notifyReport(`Job #${j.number}: Administrator ${m.name} moved this job to ${result.target==='Closed'?'COMP':'INC'}. ${result.reason}`);
   await alert(j.installerId,`Job #${j.number}: Administrator moved this job to ${result.target==='Closed'?'COMP':'INC'}.`);
  }else if(action==='status'){
   assert(reviewer(m),'Field supervisor or administrator access required.');
   const target=parse(z.enum(['Production','InProgress','Received']),input.data.target);
   if(target==='Received'){
    assert(m.role==='admin','Only an Administrator may return a job to RCVD.');
    assert(['Production','InProgress'].includes(j.stage),'Only a PROD or IN PROGRESS job can return to RCVD.',400);
    assert(j.received,'Record a received date first.',400);
    const reason=parse(z.string().trim().max(1000).default(''),input.data.reason);
    const previous=j.stage,dates=j.install?`${j.install} through ${j.installEnd||j.install}`:'none';
    if(o.report)o.previousReports=[...(o.previousReports||[]),{...o.report,pending:false,superseded:true,supersededAt:at,supersededBy:m.name}];
    o.report=null;o.pendingSchedule=null;
    j.stage='Received';j.installed='';j.install='';j.installEnd='';j.installTime='';j.installPeriod='';j.scheduleCompletedOn='';
    history=`Administrator returned ${previous} to RCVD; canceled installation ${dates}; original received date ${j.received} retained.${reason?' Reason: '+reason:''}`;
    await alert(j.installerId,`Job #${j.number}: installation canceled and returned to RCVD.${reason?' '+reason:''}`);
   }
   else if(target==='Production'){assert(!o.report?.pending,'Review the installer submission before changing status.',409);assert(j.stage==='Received'&&j.install,'Schedule the RCVD job before moving it to PROD.',400);j.stage='Production';j.installed=today;o.report=null;history='Job moved to PROD; production aging started'}
   else{assert(!o.report?.pending,'Review the installer submission before changing status.',409);assert(['Production','InProgress'].includes(j.stage),'Only a PROD job can be marked IN PROGRESS.',400);j.stage='InProgress';history='Multi-day installation marked IN PROGRESS'}
  }else if(action==='reorderRequest'){
   history=await reorderOperation({tx,j,m,data:input.data,at,alert,assigned:installerVisible(m,j)});
  }else if(action==='jobPhotos'){
   assert(canAddJobPhotos(m,j,today),'Only an assigned installer, Field Supervisor or Administrator may add photos to this job in its current status.');
   const attachments=parse(z.array(z.object({key:z.string().max(250),name:z.string().min(1).max(255),kind:z.enum(jobPhotoKinds)})).min(1).max(100),input.data.attachments);
   for(const a of attachments){
    const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();
    assert(a.key.startsWith(`jobs/${j.id}/${a.kind}/`)&&file?.job_id===j.id&&file?.kind===a.kind&&file?.member_id===m.id,'Upload each photo to this job before saving it.',400);
   }
   const keys=new Set(attachments.map(a=>a.key));
   j.attachments=[...(j.attachments||[]).filter((a:any)=>!keys.has(a.key)),...attachments.map(a=>({...a,source:'job',uploadedBy:m.name,uploadedAt:at}))];
   history=`Added ${attachments.length} job photo(s) in ${j.stage} status`;
  }else if(action==='attach'){
   edit();const a=parse(z.object({key:z.string(),name:z.string().max(255),kind:z.literal('photos')}),input.data);const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();assert(a.key.startsWith(`jobs/${j.id}/photos/`)&&file?.job_id===j.id,'Upload the file before saving it.',400);j.attachments=[...(j.attachments||[]).filter((v:any)=>v.key!==a.key),a];o.salesKeys=[...new Set([...(o.salesKeys||[]),a.key])];history='Sales handoff file added';
  }else if(action==='issue'){
   assert(m.role==='installer','Installer access required.');const text=parse(z.string().trim().min(1).max(4000),input.data.text);o.issues=[{id:crypto.randomUUID(),text,by:m.name,at},...(o.issues||[])];await alert(j.supervisorId,`⚠ Job #${j.number}: ${text}`);history='Installer reported an issue: '+text;
  }else if(action==='report'){
   assert(reviewer(m)||(m.role==='installer'&&installerVisible(m,j)),'Only the assigned installer, Field Supervisor or Administrator can submit a report.');
   assert(!o.report?.pending,'A report is already awaiting Field Supervisor approval. Wait for it to be reviewed before submitting another result.',409);
   const r=parse(reportSchema,{...input.data,jobId:j.id,version});assert(r.installed<=today,'Installation date cannot be in the future.',400);assert(!reportError(r),reportError(r),400);const hashes=new Set();
   for(const a of r.attachments){const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();assert(a.key.startsWith(`jobs/${j.id}/${a.kind}/`)&&file?.job_id===j.id&&file?.kind===a.kind&&file?.member_id===m.id,'An uploaded attachment is missing.',400);if(['front','rear','left','right'].includes(a.kind)){const hash=file?.sha256;assert(hash&&!hashes.has(hash),'Upload four different exterior photos.',400);hashes.add(hash)}}
   if(o.report)o.previousReports=[...(o.previousReports||[]),o.report];
   const report={...r,installerId:m.role==='installer'?m.id:j.installerId||m.id,installerName:m.role==='installer'?m.name:j.crew||m.name,submittedBy:m.id,submittedByName:m.name,submittedAt:at,pending:true};
   await tx.prepare('INSERT INTO installer_reports(id,job_id,installer_id,supervisor_id,payload,created) VALUES(?,?,?,?,?,?)').bind(r.id,j.id,report.installerId,j.supervisorId,JSON.stringify(report),at).run();
   o.report=report;j.attachments=[...(j.attachments||[]),...r.attachments];history=`Installer submitted ${r.status}; awaiting approval`;await notifyReport(`Job #${j.number}: ${r.status} submitted by ${m.name}. Field supervisor review required.`);
  }else if(action==='reviewReport'){
   assert(reviewer(m),'Supervisor approval required.');assert(o.report?.pending,'No report is pending.',409);const approve=parse(z.boolean(),input.data.approve);o.report={...o.report,pending:false,approved:approve,reviewedBy:m.name,reviewedAt:at,confirmed:approve};
   if(approve){if(o.report.status==='Incomplete'&&input.data.reorder!==undefined){j.reorder=parse(z.string().trim().min(1).max(4000),input.data.reorder);j.reorderDate=parse(optionalDate,input.data.reorderDate);assert(j.reorderDate&&j.reorderDate<=today,'Enter a reorder date no later than today.',400);}assert(!reportError(o.report),reportError(o.report),400);if(o.report.status==='Incomplete')assert(String(j.reorder||'').trim(),'Enter reorder information before approving an INC result.',400);j.stage=o.report.status==='Complete'?'Closed':'Incomplete';if(j.stage==='Closed')j.scheduleCompletedOn=o.report.installed||today;if(j.stage==='Incomplete')j.incompleteSince=j.reorderDate||at;history=`Installer report approved; job moved to ${j.stage==='Closed'?'COMP':'INC'}`}
   else history='Installer report returned for correction';
   await alert(j.installerId,`Job #${j.number}: report ${approve?`approved and moved to ${j.stage==='Closed'?'COMP':'INC'}`:'returned for correction'}.`);
  }else if(action==='confirmStatus'){
   assert(reviewer(m),'Supervisor or administrator access required.');assert(j.stage==='Production'&&o.report?.approved&&!o.report?.confirmed,'Approve an installer report while the job is in production first.',409);assert(!reportError(o.report),reportError(o.report),400);if(o.report.status==='Incomplete')assert(String(j.reorder||'').trim(),'Enter reorder information before approving INC.',400);j.stage=o.report.status==='Complete'?'Closed':'Incomplete';if(j.stage==='Closed')j.scheduleCompletedOn=o.report.installed||today;if(j.stage==='Incomplete')j.incompleteSince=j.reorderDate||at;o.report.confirmed=true;history=`Official status confirmed: ${j.stage}`;
  }else if(action==='request'){
   edit();const r=parse(requestSchema,input.data);const id=crypto.randomUUID();
   if(r.type==='UTI')assert(j.amount===0&&j.received,'UTI requires a $0 balance and receipt date.',400);
   if(r.type==='COLL')assert(r.refused,'Confirm that payment was refused.',400);
   if(r.type==='ACCRF')assert(r.amount!==undefined&&j.contractAmount!=null&&j.amount!=null,'Enter the revised contract price. Existing price and amount due must be known.',400);
   if(r.type==='Service'){assert(j.stage==='Closed','Only a COMP job can move to SVC.',400);assert(r.serviceDate&&r.serviceDate>=today,'Select a future service date.',400);await installer(r.installerId||'')}
   const adminCollection=m.role==='admin'&&r.type==='COLL',serviceRequest=r.type==='Service',immediate=adminCollection||serviceRequest;
   o.requests=[{...r,id,status:immediate?'Approved':'Pending',by:m.name,at,...(immediate?{reviewedBy:m.name,reviewedAt:at}: {})},...(o.requests||[])];
   if(adminCollection){j.stage='COLL';o.pendingSchedule=null;j.install='';history=`COLL approved by Administrator: ${r.details}`}
   else if(serviceRequest){await addService(r,id);history=`Service scheduled and added to calendar: ${r.serviceDate} ${r.period}. ${r.details}`}
   else history=`${r.type} request submitted for administrator approval: ${r.details}`;
  }else if(action==='reviewRequest'){
   assert(m.role==='admin','Administrator approval required.');const r=(o.requests||[]).find((v:any)=>v.id===input.data.id);assert(r&&r.status==='Pending','Request is no longer pending.',409);const approve=parse(z.boolean(),input.data.approve);
   if(approve&&r.type==='UTI'){assert(j.amount===0,'A $0 balance is required.',400);j.stage='UTI';o.pendingSchedule=null;j.install=''}
   if(approve&&r.type==='COLL'){assert(r.refused,'Refused payment is required.',400);j.stage='COLL';o.pendingSchedule=null;j.install=''}
   if(approve&&r.type==='Service'){assert(r.serviceDate&&r.serviceDate>=today,'The requested service date has passed. Submit a new request.',400);await addService(r,r.id)}
   if(approve&&r.type==='ACCRF'){assert(j.contractAmount!=null&&j.amount!=null,'Reconcile price and balance first.',400);const delta=Math.round((r.amount-j.contractAmount)*100)/100;assert(j.amount+delta>=0,'This adjustment would create a credit. Reconcile it with the main system first.',400);j.amount=Math.round((j.amount+delta)*100)/100;j.contractAmount=r.amount}
   r.status=approve?'Approved':'Declined';r.reviewedBy=m.name;r.reviewedAt=at;history=`${r.type} ${r.status.toLowerCase()}`;
  }else if(action==='delete'){
   assert(m.role==='admin','Administrator access required.');
   for(const table of ['customer_events','customer_records','installer_reports','job_visits','notifications','attachment_uploads'])await tx.prepare(`DELETE FROM ${table} WHERE job_id=?`).bind(j.id).run();
   await tx.prepare('DELETE FROM jobs WHERE id=?').bind(j.id).run();return;
  }else if(action!=='create')throw new ApiError(400,'Unknown action.');
  if(['create','edit','serviceIntake'].includes(action)&&input.data.scheduleWork){const previousHistory=history;await scheduleJob(input.data.scheduleWork);history=previousHistory+'; '+history;}
  if(['create','edit'].includes(action)&&j.city?.trim()){const name=cleanChoice(j.city);await tx.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind('city:'+choiceKey(name),JSON.stringify({name}),m.id,at).run();}
  if(['create','edit'].includes(action)&&j.salesRep?.trim()){const rep={name:cleanChoice(j.salesRep),phone:j.salesRepPhone||'',email:j.salesRepEmail||''};await tx.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind('sales-rep:'+choiceKey(rep.name),JSON.stringify(rep),m.id,at).run();}
  if(['create','permit','edit'].includes(action)&&j.buildingDepartment?.trim()){const name=cleanChoice(j.buildingDepartment);await tx.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind('building-department:'+choiceKey(name),JSON.stringify({name}),m.id,at).run();}
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

// Preserve the closing result once; repeated cron invocations cannot overwrite it.
export async function saveMonthEndBonusSnapshot(now=new Date()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 if(day.slice(0,7)===tomorrow.slice(0,7))return {saved:false,reason:'Not the last day of the month'};
 const period=bonusPeriod(day.slice(0,7)+'-01'),db=database();
 return db.transaction(async tx=>{
  const existing=await tx.prepare('SELECT payload FROM production.bonus_snapshots WHERE period_end=?').bind(period.end).first();
  if(existing)return {saved:false,reason:'Already saved',period:period.end};
  const rows=await tx.prepare('SELECT j.payload,c.payload AS record FROM jobs j LEFT JOIN customer_records c ON c.job_id=j.id').all();
  const jobs=rows.results.map((r:any)=>withCustomerRecord(storedObject(r.payload),r.record));
  const surveys=(await tx.prepare('SELECT * FROM production.operations_surveys').all()).results.map(normalizedSurvey);
  const raw=(await tx.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(period.end).first())?.payload;
  const config=raw==null?null:parse(configSchema,storedObject(raw));
  // Use month-end balances/statuses, and the closing month's survey period.
  const metrics=bonusMetrics(jobs,surveys,config,period.end);
  const aged=jobs.filter(j=>aging(j,day).aged);
  metrics.amount=Math.round(aged.reduce((sum,j)=>sum+(j.amount??0),0)*100)/100;
  metrics.count=aged.length;metrics.missing=aged.filter(j=>j.amount==null).length;
  metrics.unknownDates=jobs.filter(j=>aging(j,day).missing).length;
  const index=(value:number,thresholds:number[])=>value===0?0:((n:number)=>n<0?5:n+1)(thresholds.findIndex(n=>value<=n));
  const tiers=config?{dollars:index(metrics.amount,config.dollars),jobs:index(metrics.count,config.jobs),quality:((n:number)=>n<0?5:n)(config.quality.findIndex(n=>metrics.score!==null&&metrics.score>=n))}:null;
  const factor=[1.2,1,.75,.5,.25,0];
  const breakdown=config&&tiers&&metrics.score!==null&&!metrics.missing&&!metrics.unknownDates?{
   dollars:config.payouts?.dollars[tiers.dollars]??config.pool*.4*factor[tiers.dollars],
   jobs:config.payouts?.jobs[tiers.jobs]??config.pool*.2*factor[tiers.jobs],
   quality:config.payouts?.quality[tiers.quality]??config.pool*.4*factor[tiers.quality]
  }:null;
  metrics.estimate=breakdown?Math.round((breakdown.dollars+breakdown.jobs+breakdown.quality)*100)/100:null;
  const payload={period,capturedAt:now.toISOString(),asOf:day,metrics,config,tiers,breakdown};
  const result=await tx.prepare('INSERT INTO production.bonus_snapshots(period_end,payload) VALUES(?,?) ON CONFLICT(period_end) DO NOTHING').bind(period.end,JSON.stringify(payload)).run();
  return {saved:!!result.meta.changes,period:period.end};
 });
}
