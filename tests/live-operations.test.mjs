import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const pg=new PGlite();
for(const file of ['001_initial','002_installer_quality','003_account_permissions','004_account_profiles','005_account_theme','006_more_themes','007_customer_records','008_live_operations','008_live_operations'])await pg.exec(readFileSync(`supabase/migrations/${file}.sql`,'utf8'));
const wrap=c=>({query:async(sql,args)=>{const r=await c.query(sql,args);return {rows:r.rows,changes:r.affectedRows??r.rows.length}},transaction:fn=>c.transaction(tx=>fn(wrap(tx)))});
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('.')}},plugins:[{name:'live-test',enforce:'pre',resolveId(id){if(id==='@/db/raw'||/\/db\/raw(?:\.ts)?$/.test(id))return '\0db';if(/(?:\/|^)server-env(?:\.ts)?$/.test(id)||id==='./server-env')return '\0env';if(id==='./push'||id==='@/lib/push')return '\0push'},load(id){if(id==='\0db')return 'export const database=()=>globalThis.__liveDb';if(id==='\0env')return 'export const env={BUCKET:{head:async key=>({customMetadata:{jobId:globalThis.__jobId,uploadedBy:globalThis.__installerId,sha256:key}})}}';if(id==='\0push')return 'export async function deliverPush(){}'}}],server:{middlewareMode:true,hmr:false}});
const {createDatabase}=await vite.ssrLoadModule('/db/adapter.ts');globalThis.__liveDb=createDatabase(wrap(pg));
const {operation,operationsData}=await vite.ssrLoadModule('/lib/operations-store.ts');
const {localDay,addDays,aging,bonusPeriod,bonusMetrics}=await vite.ssrLoadModule('/lib/operations.ts');
const {requiredReportKinds,reportError}=await vite.ssrLoadModule('/lib/installer-workflow.ts');
const admin={id:'owner',name:'Admin',role:'admin',email:'admin@example.com',active:1};
const fs={id:crypto.randomUUID(),name:'Supervisor',role:'supervisor',can_edit_jobs:1,active:1};
const pa={id:crypto.randomUUID(),name:'Assistant',role:'production_assistant',can_edit_jobs:1,active:1};
const installer={id:crypto.randomUUID(),name:'Installer',role:'installer',active:1};globalThis.__installerId=installer.id;
for(const m of [admin,fs,pa,installer])await pg.query('INSERT INTO production.members(id,name,email,role,active,can_edit_jobs) VALUES($1,$2,$3,$4,1,$5)',[m.id,m.name,m.id+'@example.com',m.role,m.can_edit_jobs||0]);
await pg.query('UPDATE production.members SET supervisor_id=$2 WHERE id=$1',[installer.id,fs.id]);
const today=localDay();let j;
async function reload(){j=(await operationsData(admin)).jobs[0];globalThis.__jobId=j.id;return j}
async function act(m,action,data={}){await operation(m,{action,jobId:j?.id,version:j?.version,data});return reload()}
test('live approvals, persistence, scopes and money',async()=>{
 await act(pa,'create',{number:'LEGACY-1',customer:'Test Customer',address:'123 Test Street',amount:1000,contractAmount:5000,supervisorId:fs.id});assert.equal(j.stage,'Ordered');
 await assert.rejects(()=>act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1}),/permit/i);
 await assert.rejects(()=>act(pa,'receive',{received:today,materials:[{bay:'D-1',brand:'Thermatru',materialType:'Entry Door'}]}),/separate accounts/i);
 await act(pa,'receive',{received:addDays(today,-31),materials:[{bay:'A-12',brand:'Simonton',materialType:'Window'},{bay:'A-13',brand:'CWS',materialType:'SPD'}]});assert.equal(j.stage,'Received');assert.equal(j.materials.length,2);
 await assert.rejects(()=>act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1}),/permit/i);
 await act(pa,'permit',{received:true,number:'PERMIT-100'});
 await assert.rejects(()=>act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1}),/payment/i);
 await act(admin,'payment',{paymentType:'CHK',paymentAmount:1000,reference:'Receipt #1'});
 await act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1,paymentReference:'Receipt #1'});
 assert.equal(j.install,'');assert.ok(j.operations.pendingSchedule);assert.equal((await operationsData(installer)).jobs.length,0);
 await assert.rejects(()=>act(pa,'approveSchedule'),/approval required/);
 await act(fs,'approveSchedule');assert.equal(j.install,today);assert.equal(aging(j,today).aged,true);
 assert.equal((await pg.query("SELECT count(*)::integer AS count FROM production.notifications WHERE recipient_id=$1 AND message LIKE '%added to your calendar%'",[installer.id])).rows[0].count,1);
 const paData=await operationsData(pa);assert.equal(paData.config,null);assert.equal('estimate' in paData.metrics,false);
 const installerData=await operationsData(installer);assert.equal(installerData.jobs[0].amount,undefined);assert.equal(installerData.jobs[0].contractAmount,undefined);
 await act(fs,'start');assert.equal(j.stage,'Production');
 const kinds=['front','rear','left','right','completion'];const attachments=kinds.map(kind=>({key:`jobs/${j.id}/${kind}/${crypto.randomUUID()}`,name:kind+'.jpg',kind}));
 for(const a of attachments)await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status,sha256) VALUES($1,$1,$2,$3,$4,$5,0,'ready',$1)",[a.key,j.id,a.kind,installer.id,a.name]);
 await act(installer,'report',{id:crypto.randomUUID(),status:'Complete',reason:'',notes:'Done',installed:today,attachments});assert.equal(j.stage,'Production');assert.equal(j.operations.report.pending,true);
 assert.equal((await pg.query("SELECT count(*)::integer AS count FROM production.notifications WHERE recipient_id=$1 AND message LIKE '%Field supervisor review required%'",[fs.id])).rows[0].count,1);
 await assert.rejects(()=>act(pa,'reviewReport',{approve:true}),/approval required/);
 await act(fs,'reviewReport',{approve:true});assert.equal(j.stage,'Closed');assert.equal(j.operations.report.confirmed,true);assert.equal(j.scheduleCompletedOn,today);
 await act(fs,'edit',{notes:'New notes'});assert.equal(j.notes,'New notes');
 await assert.rejects(()=>act(fs,'edit',{amount:10}),/protected/);
 await act(fs,'request',{type:'ACCRF',details:'Extra trim',amount:5100});const req=j.operations.requests[0];
 await assert.rejects(()=>act(fs,'reviewRequest',{id:req.id,approve:true}),/Administrator/);
 await act(admin,'reviewRequest',{id:req.id,approve:true});assert.equal(j.contractAmount,5100);assert.equal(j.amount,100);
 await assert.rejects(()=>operation(admin,{action:'edit',jobId:j.id,version:j.version-1,data:{notes:'stale'}}),/changed/);
 assert.ok(j.history.some(h=>h.text.includes('approved')));
 await act(pa,'request',{type:'Service',details:'Adjust lock',serviceDate:addDays(today,2),installerId:installer.id,period:'PM'});let service=j.operations.requests[0];assert.equal(j.operations.services?.length||0,0);assert.equal(service.status,'Pending');
 await assert.rejects(()=>act(fs,'reviewRequest',{id:service.id,approve:true}),/Administrator/);
 await act(admin,'reviewRequest',{id:service.id,approve:true});assert.equal(j.operations.services.length,1);assert.equal(j.stage,'SVC');
 await act(admin,'payment',{paymentType:'CHK',paymentAmount:100,reference:'Final payment'});
 await act(fs,'request',{type:'UTI',details:'Customer unavailable',paymentReference:'Final payment'});
 const uti=j.operations.requests[0];await assert.rejects(()=>act(pa,'reviewRequest',{id:uti.id,approve:true}),/Administrator/);
 await act(admin,'reviewRequest',{id:uti.id,approve:true});assert.equal(j.stage,'UTI');assert.equal(aging(j,today).aged,false);
 const survey={externalId:'guild-survey-1',installerId:installer.id,completedOn:today,ratings:[5,5,5,5]};
 await operation(fs,{action:'survey',data:survey});await assert.rejects(()=>operation(fs,{action:'survey',data:survey}),/already/);
 assert.equal((await operationsData(fs)).metrics.score,4);
 await assert.rejects(()=>operation(installer,{action:'configure',data:{}}),/Administrator/);
 await assert.rejects(()=>operation(installer,{action:'create',data:{}}),/permission/);
 await operation(fs,{action:'crewColors',data:{[installer.id]:'#123abc'}});assert.equal((await operationsData(fs)).crewColors[installer.id],'#123abc');assert.deepEqual((await operationsData(admin)).crewColors,{});
});
test('supervisor status controls and administrator deletion',async()=>{
 await act(pa,'create',{number:'LEGACY-DELETE',customer:'Delete Customer',address:'456 Test Street',amount:0,contractAmount:1000,supervisorId:fs.id});
 await assert.rejects(()=>act(pa,'status',{target:'Production',reason:''}),/supervisor or administrator/i);
 await act(pa,'receive',{received:today,bay:'B-2',brand:'CWS',materialType:'SPD'});await act(pa,'permit',{received:true,number:'PERMIT-200'});await act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:2,additionalInstructions:'Side gate'});
 await act(fs,'status',{target:'Production'});assert.equal(j.stage,'Production');
 await act(fs,'status',{target:'InProgress'});assert.equal(j.stage,'InProgress');assert.equal(aging(j,today).kind,'Production');
 const incKinds=['front','rear','left','right','issue','incomplete'];const incAttachments=incKinds.map(kind=>({key:`jobs/${j.id}/${kind}/${crypto.randomUUID()}`,name:kind+'.jpg',kind}));
 for(const a of incAttachments)await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status,sha256) VALUES($1,$1,$2,$3,$4,$5,0,'ready',$1)",[a.key,j.id,a.kind,installer.id,a.name]);
 await act(installer,'report',{id:crypto.randomUUID(),status:'Incomplete',reason:'Damaged sash',notes:'Return needed',installed:today,attachments:incAttachments});
 await assert.rejects(()=>act(fs,'reviewReport',{approve:true}),/reorder information/i);await act(fs,'edit',{reorder:'Order replacement sash'});await act(fs,'reviewReport',{approve:true});assert.equal(j.stage,'Incomplete');
 const id=j.id;await assert.rejects(()=>act(fs,'delete'),/Administrator/);await act(admin,'delete');
 assert.equal((await pg.query('SELECT id FROM production.jobs WHERE id=$1',[id])).rows.length,0);
});
test('admin override and payment permissions',async()=>{
 await act(pa,'create',{number:'ADMIN-OVERRIDE',customer:'Override test',address:'Test street',amount:1000,contractAmount:1000,supervisorId:fs.id,paymentMethod:'CHK'});
 for(const member of [fs,pa,installer])await assert.rejects(()=>act(member,'adminResult',{target:'Closed',confirmed:true,reason:'Legacy closeout'}),/Administrator|assigned/);
 await assert.rejects(()=>act(admin,'adminResult',{target:'Closed',confirmed:false,reason:'Legacy closeout'}));
 await assert.rejects(()=>act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:'Legacy incomplete'}),/reorder/i);
 for(const member of [fs,pa])await assert.rejects(()=>act(member,'edit',{paymentMethod:'PO'}),/Administrator/);
 await act(fs,'edit',{notes:'No payment change'});assert.equal(j.paymentMethod,'CHK');
 await act(admin,'edit',{paymentMethod:'PO',reorder:'Replacement sash needed'});assert.equal(j.paymentMethod,'PO');
 await act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:'Historical job missing photos'});
 assert.equal(j.stage,'Incomplete');assert.ok(j.incompleteSince);assert.equal(j.attachments.length,0);
 assert.equal(aging(j,today).aged,false);assert.equal(aging(j,today).missing,false);
 await act(admin,'adminResult',{target:'Closed',confirmed:true,reason:'Verified closure in Leads'});
 assert.equal(j.stage,'Closed');assert.equal(j.scheduleCompletedOn,today);
 assert.ok(j.history.some(h=>h.text.includes('Administrator override')&&h.text.includes('Verified closure')));
});
test('excluded jobs do not affect aging or missing-date totals',()=>{
 for(const stage of ['Received','Production','InProgress','Incomplete','PO','COLL','UTI','SVC']){
  const job={stage,paymentMethod:['PO','COLL','UTI','SVC'].includes(stage)?'CHK':'PO',amount:9000,received:'2020-01-01',installed:'2020-01-01',incompleteSince:'2020-01-01'};
  assert.equal(aging(job,today).aged,false);assert.equal(aging(job,today).kind,null);
  const metrics=bonusMetrics([job],[],null,today);assert.equal(metrics.count,0);assert.equal(metrics.amount,0);assert.equal(metrics.unknownDates,0);
 }
});
test('period and aging boundaries',()=>{
 assert.deepEqual(bonusPeriod('2026-09-15'),{start:'2026-08-26',end:'2026-09-29'});
 assert.deepEqual(bonusPeriod('2026-09-30'),{start:'2026-09-30',end:'2026-10-27'});
 assert.equal(aging({stage:'Received',received:addDays(today,-30),install:today},today).aged,false);
 assert.equal(aging({stage:'Received',received:addDays(today,-31),install:today},today).aged,true);
 assert.equal(aging({stage:'Incomplete',incompleteSince:addDays(today,-45)},today).aged,true);
 assert.equal(aging({stage:'UTI',received:addDays(today,-90)},today).aged,false);
 const m=bonusMetrics([],[{completed_on:today,ratings:[5,5,5,5]}],null,today);assert.equal(m.score,4);assert.equal(m.estimate,null);
});
test('completion and incomplete evidence requirements',()=>{
 assert.deepEqual(requiredReportKinds('Complete'),['front','rear','left','right','completion']);
 assert.deepEqual(requiredReportKinds('Incomplete'),['front','rear','left','right','issue','incomplete']);
 const files=kinds=>kinds.map((kind,i)=>({kind,key:'file-'+i}));
 assert.equal(reportError({status:'Complete',reason:'',attachments:files(requiredReportKinds('Complete'))}),'');
 assert.equal(reportError({status:'Incomplete',reason:'Broken glass',attachments:files(requiredReportKinds('Incomplete'))}),'');
 assert.match(reportError({status:'Incomplete',reason:'',attachments:files(requiredReportKinds('Incomplete'))}),/Explain/);
 assert.match(reportError({status:'Incomplete',reason:'Broken glass',attachments:files(['front','rear','left','right','incomplete'])}),/photos of the issue/i);
});
test('FS and Admin submit and approve their own closeout evidence',async()=>{
 for(const [member,result] of [[fs,'Incomplete'],[admin,'Complete']]){
  await act(pa,'create',{number:'STAFF-'+result,customer:'Staff report test',address:'123 Main',amount:0,supervisorId:fs.id,paymentMethod:'AQUA'});
  await act(pa,'receive',{received:today,materials:[{bay:'A1',brand:'CWS',materialType:'Window'},{bay:'A2',brand:'CWS',materialType:'SPD'}]});
  await act(pa,'receive',{received:today,materials:[{bay:'A1',brand:'CWS',materialType:'Window'}]});assert.equal(j.materials.length,1);
  await act(pa,'permit',{received:true,number:'P1',buildingDepartment:'City of Tampa'});
  await act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1});await act(fs,'start');
  const view=(await operationsData(installer)).jobs.find(v=>v.id===j.id);assert.equal(view.buildingDepartment,'City of Tampa');assert.equal(view.paymentMethod,'AQUA');
  const attachments=requiredReportKinds(result).map(kind=>({key:`jobs/${j.id}/${kind}/${crypto.randomUUID()}`,kind,name:kind+'.jpg'}));
  for(const a of attachments)await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status,sha256) VALUES($1,$1,$2,$3,$4,$5,0,'ready',$1)",[a.key,j.id,a.kind,member.id,a.name]);
  const report={id:crypto.randomUUID(),status:result,reason:'Damaged sash',notes:'Recorded by staff',installed:today,attachments};
  await assert.rejects(()=>act(pa,'report',report),/Only the assigned/);
  await assert.rejects(()=>act(member,'report',{...report,attachments:attachments.slice(1)}),/front/i);
  await act(member,'report',report);assert.equal(j.operations.report.submittedBy,member.id);assert.equal(j.operations.report.installerId,installer.id);
  if(result==='Incomplete'){await assert.rejects(()=>act(member,'reviewReport',{approve:true}),/reorder/i);await act(member,'edit',{reorder:'Replacement sash ordered'});}
  await act(member,'reviewReport',{approve:true});assert.equal(j.stage,result==='Complete'?'Closed':'Incomplete');
 }
});
test('GQ imports are permission checked, converted once, deduplicated and conflict-safe',async()=>{
 const {importGuild}=await vite.ssrLoadModule('/lib/report-import-store.ts');
 const rows=[{code:'C999',name:'Imported Crew',supervisor:fs.name,customerId:'1001',completedOn:today,ratings:[4,3,4,4]}];
 await assert.rejects(()=>importGuild(fs,{rows}),/Administrator/);
 assert.deepEqual(await importGuild(admin,{rows}),{created:1,inserted:1,skipped:0});
 assert.deepEqual(await importGuild(admin,{rows}),{created:0,inserted:0,skipped:1});
 const crew=(await pg.query("SELECT * FROM production.members WHERE installer_code='C999'")).rows[0];assert.equal(crew.supervisor_id,fs.id);
 assert.equal((await pg.query('SELECT * FROM production.credentials WHERE member_id=$1',[crew.id])).rows.length,0);
 const survey=(await pg.query("SELECT * FROM production.operations_surveys WHERE external_id LIKE 'gq:C999:%'")).rows[0];assert.deepEqual(survey.ratings,[5,4,5,5]);
 await assert.rejects(()=>importGuild(admin,{rows:[{...rows[0],ratings:[0,0,0,0]}]}),/Conflicting/);
 assert.deepEqual((await pg.query('SELECT ratings FROM production.operations_surveys WHERE id=$1',[survey.id])).rows[0].ratings,[5,4,5,5]);
});
test('bonus payout amounts use the selected category rows, including printed zero',()=>{
 const config={period:'2026-09-29',pool:7667,dollars:[45735,76225,106715,137206],jobs:[6,12,19,25],quality:[3.8,3.75,3.7,3.6,3.5],payouts:{dollars:[3680,3067,2300,1533,767,0],jobs:[1840,1533,1150,767,383,0],quality:[3680,3067,2300,1533,0,0]}};
 const surveys=[{completed_on:'2026-09-01',ratings:[5,5,4,4]}];
 const m=bonusMetrics([],surveys,config,'2026-09-17');assert.equal(m.score,3.5);assert.equal(m.estimate,5520);
 const score=bonusMetrics([],[...surveys,{completed_on:'2026-08-25',ratings:[1,1,1,1]}],config,'2026-09-17');assert.equal(score.score,3.5);assert.equal(score.surveys,1);
});
test.after(async()=>{await vite.close();await pg.close()});

test('multi-day schedules, permit details and payment permissions persist',async()=>{
 await act(pa,'create',{number:'MULTI',supervisorId:fs.id,customer:'Multi day customer',address:'123 Test',amount:100,permitNumber:'OPT',buildingDepartment:'Tampa',permitExpiration:'2027-01-01'});
 assert.equal(j.permitNumber,'OPT');assert.equal(j.permitExpiration,'2027-01-01');
 await act(pa,'receive',{received:today,materials:[{bay:'A1',brand:'CWS',materialType:'Window'}]});
 await act(pa,'permit',{received:true,number:'OPT',buildingDepartment:'Tampa',expiration:'2027-01-01',buildingDepartmentPhone:'8135551234',privateProvider:true});
 await assert.rejects(()=>act(fs,'payment',{amount:0,paymentType:'CHK'}),/Administrator/i);
 await assert.rejects(()=>act(pa,'payment',{amount:0,paymentType:'CHK'}),/Administrator/i);
 await act(admin,'payment',{paymentAmount:100,paymentType:'FNC',reference:'Paid'});assert.equal(j.paymentMethod,'FNC');
 await assert.rejects(()=>act(fs,'schedule',{date:today,endDate:addDays(today,-1),period:'AM',installerId:installer.id,stop:1}));
 await act(fs,'schedule',{date:today,endDate:addDays(today,3),period:'AM',installerId:installer.id,stop:1});assert.equal(j.installEnd,addDays(today,3));
 const view=(await operationsData(installer)).jobs.find(v=>v.id===j.id);assert.equal(view.installEnd,addDays(today,3));assert.equal(view.privateProvider,true);assert.equal(view.permitExpiration,'2027-01-01');
});
test('installer profile ownership and inactivity are enforced',async()=>{
 const {saveInstallerProfile,installerProfiles}=await vite.ssrLoadModule('/lib/installer-directory.ts');
 const p={id:installer.id,name:'Updated Crew',leadInstallerName:'Lead Name',phone:'8135551234',address:'123 Main',contactEmail:'contact@example.com',emergencyContact:'Contact',emergencyPhone:'8135555678'};
 await saveInstallerProfile(installer,p);const own=await installerProfiles(installer);assert.equal(own.installers.length,1);assert.equal(own.installers[0].leadInstallerName,'Lead Name');
 await assert.rejects(()=>saveInstallerProfile(installer,{...p,inactive:true}),/Only a Field/);
 await assert.rejects(()=>saveInstallerProfile(pa,p),/own installer/);
 await saveInstallerProfile(fs,{...p,inactive:true});assert.equal((await installerProfiles(fs)).installers.find(x=>x.id===installer.id).active,0);
 await reload();await assert.rejects(()=>act(fs,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1}),/installer/i);
 await saveInstallerProfile(admin,{...p,inactive:false});
});
test('survey detail scores preserve zeros and only link unique customer IDs',async()=>{
 const {surveyDetails}=await vite.ssrLoadModule('/lib/survey-details.ts');const survey={external_id:'gq:C123:1001:2026-09-01',ratings:[1,5,5,5]};
 assert.equal(surveyDetails(survey,[]).score,3);assert.equal(surveyDetails(survey,[]).customerId,'1001');
 assert.equal(surveyDetails(survey,[{id:'a',number:'1001'}]).job.id,'a');
 assert.equal(surveyDetails(survey,[{id:'a',number:'1001'},{id:'b',number:'1001'}]).job,null);
});

test('payment amount subtracts exactly and rejects stale or excessive payments',async()=>{
 await act(admin,'create',{number:'PAYMENT-NEW',customer:'Payment',address:'123 Street',supervisorId:fs.id,amount:1000.25});
 await assert.rejects(()=>act(admin,'payment',{amount:200,paymentType:'CC',reference:'Old client'}));
 await assert.rejects(()=>act(admin,'payment',{paymentAmount:1001,paymentType:'CC',reference:'Too much'}));
 await act(admin,'payment',{paymentAmount:200.10,paymentType:'CC',reference:'Receipt'});assert.equal(j.amount,800.15);
 const version=j.version;
 await act(admin,'payment',{paymentAmount:800.15,paymentType:'CHK',reference:'Final'});assert.equal(j.amount,0);
 await assert.rejects(()=>operation(admin,{action:'payment',jobId:j.id,version,data:{paymentAmount:800.15,paymentType:'CHK',reference:'Retry'}}),/changed/);
});
test('any status can be scheduled, hourly slots persist, only admin reverses PROD',async()=>{
 await act(pa,'create',{number:'ANY-STATUS',customer:'Schedule',address:'123 Main',supervisorId:fs.id,amount:0});
 await act(pa,'permit',{received:true,number:'P2'});
 await act(pa,'schedule',{date:today,period:'AM',time:'09:00',installerId:installer.id,stop:1});assert.equal(j.stage,'Ordered');assert.equal(j.installTime,'09:00');
 await act(pa,'receive',{received:today,materials:[{bay:'B1',brand:'CWS',materialType:'Window'}]});await act(fs,'start');
 await assert.rejects(()=>act(fs,'status',{target:'Received'}),/Administrator/i);
 await act(admin,'status',{target:'Received'});assert.equal(j.stage,'Received');assert.equal(j.received,today);
 await act(fs,'start');
 for(const stage of ['Production','InProgress','Incomplete','Closed','COLL','UTI','SVC']){
  await pg.query("UPDATE production.jobs SET payload=(payload::jsonb || jsonb_build_object('stage',$1::text))::text WHERE id=$2",[stage,j.id]);await reload();
  await act(fs,'schedule',{date:today,endDate:addDays(today,5),period:'PM',time:'14:00',installerId:installer.id,stop:2});assert.equal(j.stage,stage);assert.equal(j.installTime,'14:00');assert.equal(j.scheduleCompletedOn,'');
 }
 await assert.rejects(()=>act(fs,'schedule',{date:today,period:'PM',time:'14:30',installerId:installer.id,stop:2}));
});
test('multi-day calendar skips weekends, counts inclusively and cuts off approved completion',async()=>{
 const {installAppointments,remainingWorkdays}=await vite.ssrLoadModule('/lib/install-calendar.ts');
 const job={install:'2026-09-18',installEnd:'2026-09-21',installTime:'09:00'};
 const dates=['2026-09-18','2026-09-19','2026-09-20','2026-09-21'];
 const rows=installAppointments(job,dates);assert.deepEqual(rows.map(x=>x.date),['2026-09-18','2026-09-21']);assert.deepEqual(rows.map(x=>x.daysLeft),[2,1]);
 assert.equal(remainingWorkdays('2026-09-18','2026-09-25'),6);
 assert.equal(installAppointments({...job,scheduleCompletedOn:'2026-09-18'},dates).length,1);
 assert.equal(installAppointments({...job,operations:{report:{pending:true,status:'Complete'}}},dates).length,2);
});
test('stored objects support text and JSONB without silently dropping bad jobs',async()=>{
 const {storedObject}=await vite.ssrLoadModule('/lib/stored-data.ts');
 assert.deepEqual(storedObject('{"number":"100"}'),{number:'100'});
 assert.deepEqual(storedObject({number:'100'}),{number:'100'});
 for(const value of [null,'null','[]','invalid'])assert.throws(()=>storedObject(value));
});
test('invalid bonus settings do not crash jobs or invent a payout',async()=>{
 const id=bonusPeriod(today).end;
 const before=(await pg.query('SELECT * FROM production.operations_config WHERE id=$1',[id])).rows[0];
 try{
  await pg.query('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload',[id,JSON.stringify({period:id,pool:10000}),admin.id,today]);
  const steps=[];const data=await operationsData(admin,step=>steps.push(step));
  assert.ok(data.jobs.length);assert.equal(data.metrics.estimate,null);assert.equal(data.config,null);
  assert.ok(data.warnings.some(w=>w.includes('Bonus settings')));
  assert.ok(steps.includes('jobs-decode'));assert.ok(steps.includes('bonus-metrics'));
  const stored=(await pg.query('SELECT payload FROM production.operations_config WHERE id=$1',[id])).rows[0].payload;
  assert.deepEqual(stored,{period:id,pool:10000});
 }finally{
  if(before)await pg.query('UPDATE production.operations_config SET payload=$2 WHERE id=$1',[id,JSON.stringify(before.payload)]);
  else await pg.query('DELETE FROM production.operations_config WHERE id=$1',[id]);
 }
});
test('only reviewers may confirm a missing aging date, and verified dates cannot be overwritten',async()=>{
 await act(pa,'create',{number:'MISSING-DATE',customer:'Verify date',address:'123 Main',supervisorId:fs.id,amount:100});
 await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||'{\"stage\":\"Incomplete\",\"incompleteSince\":\"\"}'::jsonb)::text WHERE id=$1",[j.id]);await reload();
 await assert.rejects(()=>act(pa,'agingDate',{date:addDays(today,-50),reference:'Leads status audit'}),/supervisor/i);
 await act(fs,'agingDate',{date:addDays(today,-50),reference:'Leads status audit'});assert.equal(aging(j,today).aged,true);
 await assert.rejects(()=>act(admin,'agingDate',{date:today,reference:'New date'}),/unconfirmed/i);
});
test('customer fields, permit flag, received corrections and bulk aging persist',async()=>{
 await act(pa,'create',{number:'BULK-DATE',customer:'Jane Smith',firstName:'Jane',lastName:'Smith',phone2:'(813)-555-1234',phone3:'(813)-555-5678',address:'123 Main',amount:100});
 assert.equal(j.firstName,'Jane');assert.equal(j.phone2,'(813)-555-1234');assert.equal(j.supervisorId,'');
 const materials=[{bay:'A1',brand:'Simonton',materialType:'Window'}];
 await act(pa,'receive',{received:today,materials});
 await assert.rejects(()=>act(pa,'receive',{received:addDays(today,-2),materials}),/input|invalid|check|required/i);
 await act(pa,'receive',{received:addDays(today,-2),materials,reference:'Leads receipt'});assert.equal(j.received,addDays(today,-2));
 await act(pa,'permit',{received:true,number:'P123',customerSuppliedPermit:true});assert.equal(j.customerSuppliedPermit,true);
 const batch={reference:'Verified Leads report',rows:[{id:j.id,version:j.version,key:'received',date:addDays(today,-40)}]};
 await assert.rejects(()=>operation(pa,{action:'agingDates',data:batch}),/supervisor/i);
 await operation(fs,{action:'agingDates',data:batch});await reload();assert.equal(j.received,addDays(today,-40));assert.equal(aging(j,today).aged,true);
 await assert.rejects(()=>operation(fs,{action:'agingDates',data:batch}),/changed|refresh/i);
 assert.match(j.history[0].text,/Verified Leads report/);
});
test('installer supervisor assignment is displayed and propagated to linked jobs',async()=>{
 const {saveInstallerProfile,installerProfiles}=await vite.ssrLoadModule('/lib/installer-directory.ts');
 await act(admin,'create',{number:'CREW-ASSIGN',customer:'Crew Customer',address:'123 Main',amount:0,assignedInstallerId:installer.id});
 assert.equal(j.supervisorId,fs.id);
 const profile=(await installerProfiles(admin)).installers.find(x=>x.id===installer.id);assert.equal(profile.supervisorId,fs.id);
 const p={id:installer.id,name:installer.name,leadInstallerName:'Lead',phone:'',address:'',contactEmail:'',emergencyContact:'',emergencyPhone:'',supervisorId:admin.id};
 await assert.rejects(()=>saveInstallerProfile(installer,p),/supervisor/i);
 await saveInstallerProfile(admin,p);await reload();assert.equal(j.supervisorId,admin.id);
 assert.equal((await installerProfiles(admin)).installers.find(x=>x.id===installer.id).supervisorId,admin.id);
 await assert.rejects(()=>act(fs,'edit',{supervisorId:fs.id}),/installer profile/i);
});

test('admin zero-balance late override and historical schedules enforce permissions',async()=>{
 await act(admin,'create',{number:'PAST-OVERRIDE',customer:'Test Past',address:'123 Main',amount:0});
 await act(pa,'receive',{received:addDays(today,-60),materials:[{bay:'A1',brand:'Simonton',materialType:'Window'}]});
 await act(pa,'permit',{received:true,number:'PERMIT'});
 const schedule={date:addDays(today,-10),period:'AM',installerId:installer.id,stop:1,adminOverride:true};
 await assert.rejects(()=>act(pa,'schedule',schedule),/Administrator/);
 await act(admin,'schedule',schedule);assert.equal(j.install,schedule.date);assert.equal(j.operations.pendingSchedule,null);assert.equal(j.stage,'Received');
 assert.match(j.history[0].text,/Admin approved/);
 await act(admin,'balance',{amount:5,reference:'test'});
 await assert.rejects(()=>act(admin,'schedule',schedule),/zero balance/);
});
test('PO aliases and imported codes exclude Freedom Square balance from all aging metrics',()=>{
 for(const job of [{paymentMethod:'PO'},{paymentMethod:' p.o. '},{paymentMethod:'Purchase Order'},{importSource:{paymentCode:'PO'}}]){
  const record={...job,stage:'Incomplete',amount:51012,incompleteSince:addDays(today,-90)};
  assert.equal(aging(record,today).aged,false);
  const m=bonusMetrics([record],[],null,today);assert.equal(m.amount,0);assert.equal(m.count,0);assert.equal(m.unknownDates,0);
 }
 assert.equal(aging({paymentMethod:'CHK',importSource:{paymentCode:'PO'},stage:'Incomplete',incompleteSince:addDays(today,-90)},today).aged,true);
});
