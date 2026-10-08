import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const pg=new PGlite();
for(const file of ['001_initial','002_installer_quality','003_account_permissions','004_account_profiles','005_account_theme','006_more_themes','007_customer_records','008_live_operations','008_live_operations','009_tampa_themes','010_bonus_snapshots','011_installer_location','011_installer_location','012_survey_customer_id','013_customer_tracking','013_customer_tracking'])await pg.exec(readFileSync(`supabase/migrations/${file}.sql`,'utf8'));
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
 await act(pa,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1});
 assert.equal(j.install,today);assert.equal(j.amount,1000);assert.equal(j.operations.pendingSchedule,null);assert.equal(aging(j,today).aged,true);
 await act(admin,'payment',{paymentType:'CHK',paymentAmount:1000,reference:'Receipt #1'});
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
 await act(pa,'request',{type:'Service',details:'Adjust lock',serviceDate:addDays(today,2),installerId:installer.id,period:'PM'});assert.equal(j.operations.requests[0].status,'Approved');assert.equal(j.operations.services.length,1);assert.equal(j.stage,'SVC');
 await act(admin,'payment',{paymentType:'CHK',paymentAmount:100,reference:'Final payment'});
 await act(fs,'request',{type:'UTI',details:'Customer unavailable',paymentReference:'Final payment'});
 const uti=j.operations.requests[0];await assert.rejects(()=>act(pa,'reviewRequest',{id:uti.id,approve:true}),/Administrator/);
 await act(admin,'reviewRequest',{id:uti.id,approve:true});assert.equal(j.stage,'UTI');assert.equal(aging(j,today).aged,false);
 const survey={externalId:'guild-survey-1',customerId:j.number,installerId:installer.id,completedOn:today,ratings:[5,5,5,5]};
 await operation(fs,{action:'survey',data:survey});await assert.rejects(()=>operation(fs,{action:'survey',data:survey}),/already/);
 assert.equal((await operationsData(fs)).metrics.score,4);
 const installerQuality=await operationsData(installer);assert.equal(installerQuality.metrics.score,4);assert.equal(installerQuality.surveys.length,1);assert.equal(installerQuality.surveys[0].installer_id,installer.id);
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
 await assert.rejects(()=>act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:''}),/reason|characters/i);
 await assert.rejects(()=>act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:'Legacy incomplete'}),/reorder/i);
 for(const member of [fs])await assert.rejects(()=>act(member,'edit',{paymentMethod:'PO'}),/Administrator/);
 await act(fs,'edit',{notes:'No payment change'});assert.equal(j.paymentMethod,'CHK');
 await act(admin,'edit',{paymentMethod:'PO'});assert.equal(j.paymentMethod,'PO');
 await assert.rejects(()=>act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:'Historical job missing photos',reorder:'Replacement sash needed'}),/reorder date/i);
 await act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:'Historical job missing photos',reorder:'Replacement sash needed',reorderDate:today});
 assert.equal(j.stage,'Incomplete');assert.equal(j.reorder,'Replacement sash needed');assert.equal(j.reorderDate,today);assert.equal(j.incompleteSince,today);assert.equal(j.attachments.length,0);
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
 for(const stage of ['SERV','Service','Collections','Unable To Install']){
  const job={stage,paymentMethod:'CHK',amount:9000,received:'2020-01-01',installed:'2020-01-01',incompleteSince:'2020-01-01'};
  assert.equal(aging(job,today).aged,false);assert.equal(aging(job,today).kind,null);
 }
 const legacyCollection={stage:'Incomplete',status:'COLL',paymentMethod:'CHK',amount:9000,incompleteSince:'2020-01-01'};
 assert.equal(aging(legacyCollection,today).aged,false);assert.equal(bonusMetrics([legacyCollection],[],null,today).count,0);
});
test('administrator COLL selection approves immediately and removes the job from aging',async()=>{
 await act(pa,'create',{number:'ADMIN-COLL',customer:'Collection Customer',address:'789 Test Street',amount:2500,contractAmount:5000,supervisorId:fs.id});
 await act(pa,'receive',{received:addDays(today,-40),materials:[{bay:'C-4',brand:'Simonton',materialType:'Window'}]});
 assert.equal(aging(j,today).aged,true);
 await act(admin,'request',{type:'COLL',details:'Customer refused final payment',refused:true});
 assert.equal(j.stage,'COLL');assert.equal(j.operations.requests[0].status,'Approved');assert.equal(aging(j,today).aged,false);
 const data=await operationsData(admin),saved=data.jobs.find(row=>row.number==='ADMIN-COLL');assert.ok(saved);assert.equal(aging(saved,today).aged,false);
});
test('Tampa themes persist and reorder editing updates INC aging',async()=>{
 for(const theme of ['lightning','buccaneers','creamsicle']){
  await pg.query('UPDATE production.members SET theme=$1 WHERE id=$2',[theme,fs.id]);
  assert.equal((await pg.query('SELECT theme FROM production.members WHERE id=$1',[fs.id])).rows[0].theme,theme);
 }
 await act(pa,'create',{number:'REORDER-EDIT',customer:'Reorder Test',address:'Test Street',amount:100});
 await act(admin,'adminResult',{target:'Incomplete',confirmed:true,reason:'Historical record',reorder:'Sash',reorderDate:today});
 await act(pa,'edit',{reorder:'Replacement sash ordered',reorderDate:addDays(today,-46)});
 assert.equal(j.incompleteSince,addDays(today,-46));assert.equal(j.reorder,'Replacement sash ordered');assert.equal(aging(j,today).aged,true);
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
 assert.deepEqual(await importGuild(admin,{rows}),{created:1,inserted:1,skipped:0,reassigned:0});
 assert.deepEqual(await importGuild(admin,{rows}),{created:0,inserted:0,skipped:1,reassigned:0});
 const crew=(await pg.query("SELECT * FROM production.members WHERE installer_code='C999'")).rows[0];assert.equal(crew.supervisor_id,fs.id);
 assert.equal((await pg.query('SELECT * FROM production.credentials WHERE member_id=$1',[crew.id])).rows.length,0);
 const survey=(await pg.query("SELECT * FROM production.operations_surveys WHERE external_id LIKE 'gq:C999:%'")).rows[0];assert.deepEqual(survey.ratings,[5,4,5,5]);
 const linked=crypto.randomUUID();await pg.query("INSERT INTO production.members(id,name,email,role,installer_code,active) VALUES($1,$2,$3,'installer',NULL,1)",[linked,'Imported Crew','linked@example.com']);await pg.query("INSERT INTO production.credentials(member_id,password_hash,must_change,generation) VALUES($1,'hash',0,1)",[linked]);
 const relinked=await importGuild(admin,{rows:rows.map(r=>({...r,installerId:linked}))});assert.equal(relinked.reassigned,1);assert.equal((await pg.query("SELECT installer_id FROM production.operations_surveys WHERE external_id LIKE 'gq:C999:%'")).rows[0].installer_id,linked);assert.equal((await pg.query('SELECT installer_code FROM production.members WHERE id=$1',[linked])).rows[0].installer_code,'C999');
 await assert.rejects(()=>importGuild(admin,{rows:[{...rows[0],ratings:[0,0,0,0]}]}),/Conflicting/);
 assert.deepEqual((await pg.query('SELECT ratings FROM production.operations_surveys WHERE id=$1',[survey.id])).rows[0].ratings,[5,4,5,5]);
});
test('bonus payout amounts use the selected category rows, including printed zero',()=>{
 const config={period:'2026-09-29',pool:7667,dollars:[45735,76225,106715,137206],jobs:[6,12,19,25],quality:[3.8,3.75,3.7,3.6,3.5],payouts:{dollars:[3680,3067,2300,1533,767,0],jobs:[1840,1533,1150,767,383,0],quality:[3680,3067,2300,1533,0,0]}};
 const surveys=[{completed_on:'2026-09-01',ratings:[5,5,4,4]}];
 const m=bonusMetrics([],surveys,config,'2026-09-17');assert.equal(m.score,3.5);assert.equal(m.estimate,5520);
 const score=bonusMetrics([],[...surveys,{completed_on:'2026-08-25',ratings:[1,1,1,1]}],config,'2026-09-17');assert.equal(score.score,3.5);assert.equal(score.surveys,1);
});
test('admin and PA may correct job amounts; supervisors may not',async()=>{
 await act(admin,'create',{number:'MONEY-CORRECTION',customer:'Money Test',address:'123 Test Street',amount:100,contractAmount:500});
 await act(admin,'edit',{amount:75.25,contractAmount:450});
 assert.equal(j.amount,75.25);assert.equal(j.contractAmount,450);
 assert.ok(j.history[0].text.includes('Balance due 100 → 75.25'));
 await act(pa,'edit',{amount:75.25});assert.equal(j.amount,75.25);
 await assert.rejects(()=>act(fs,'edit',{contractAmount:1}),/Administrator/);
 await assert.rejects(()=>act(admin,'edit',{amount:-1}));
 await act(admin,'edit',{notes:'Keep financial values'});assert.equal(j.amount,75.25);
});
test('Leads parser extracts address, bay and phones; conflicting digits are withheld',async()=>{
 const {parseLeadsCustomerScan}=await vite.ssrLoadModule('/lib/customer-scan.ts');
 const {reconcileLeadsScans}=await vite.ssrLoadModule('/lib/scan-consensus.ts');
 const text='Customer ID#: 506327 Job ID#: 510859\nSullivan, Steven Ph #1:813-765-0556\n4026 Priory Cir Ph #2:813-555-1111\nTampa, FL 33618\nBay:WHB Comp Contractor:C843-BDF Services LLC\nReOrd Date:8/26/2026\nLast Est Ship Date:9/21/2026\nContract Amt: $8,300.00\nBal Due: $0.00';
 const parsed=parseLeadsCustomerScan(text).values;assert.equal(parsed.address,'4026 Priory Cir');assert.equal(parsed.bay,'WHB');assert.equal(parsed.phone2,'(813)-555-1111');
 const same=reconcileLeadsScans([text,text,text]);assert.equal(same.values.number,'506327');assert.equal(same.values.reorderDate,'2026-08-26');
 const conflict=reconcileLeadsScans([text,text.replace('506327','505327'),text]);assert.equal(conflict.values.number,undefined);assert.ok(conflict.warnings.some(w=>w.startsWith('number:')));
});
test('scheduling COMP becomes service, INC remains incomplete, and Other schedules service',async()=>{
 await act(admin,'create',{number:'SERVICE-SCHEDULE',customer:'Service Customer',address:'123 Test Street',amount:0,contractAmount:100});
 await act(admin,'permit',{received:true,number:'P-1'});
 await pg.query("UPDATE production.jobs SET payload=jsonb_set(jsonb_set(payload::jsonb,'{stage}','\"Closed\"'),'{scheduleCompletedOn}',to_jsonb($2::text)) WHERE id=$1",[j.id,today]);await reload();
 const future=addDays(today,3);
 await act(pa,'schedule',{date:future,period:'AM',installerId:installer.id,stop:1});
 assert.equal(j.stage,'SVC');assert.equal(j.scheduleCompletedOn,'');
 const {installAppointments}=await vite.ssrLoadModule('/lib/install-calendar.ts');
 assert.equal(installAppointments(j,[future]).length,1);assert.equal(aging(j,today).aged,false);
 await pg.query("UPDATE production.jobs SET payload=jsonb_set(payload::jsonb,'{stage}','\"Incomplete\"') WHERE id=$1",[j.id]);await reload();
 await act(pa,'schedule',{date:future,period:'PM',installerId:installer.id,stop:1});assert.equal(j.stage,'Incomplete');
 await assert.rejects(()=>act(admin,'request',{type:'Service',details:'Adjust lock',serviceDate:future,installerId:installer.id,period:'AM'}),/Only a COMP/);
 await pg.query("UPDATE production.jobs SET payload=jsonb_set(payload::jsonb,'{stage}','\"Closed\"') WHERE id=$1",[j.id]);await reload();
 await act(fs,'request',{type:'Service',details:'Adjust lock',serviceDate:future,installerId:installer.id,period:'AM'});
 assert.equal(j.stage,'SVC');assert.equal(j.operations.requests[0].status,'Approved');assert.equal(j.operations.services.length,1);assert.equal(j.operations.services[0].date,future);
 const view=await operationsData(installer);assert.equal(view.jobs.find(v=>v.id===j.id).operations.services.length,1);
});
test('month-end snapshot export saves once and exposes history only to reviewers',async()=>{
 const {saveMonthEndBonusSnapshot}=await vite.ssrLoadModule('/lib/operations-store.ts');
 assert.equal((await saveMonthEndBonusSnapshot(new Date('2026-09-29T20:00:00Z'))).saved,false);
 assert.equal((await saveMonthEndBonusSnapshot(new Date('2026-10-01T03:59:00Z'))).saved,true);
 assert.equal((await saveMonthEndBonusSnapshot(new Date('2026-10-01T03:59:30Z'))).saved,false);
 const snapshots=(await operationsData(admin)).bonusSnapshots;assert.equal(snapshots[0].period.end,'2026-09-29');assert.equal(snapshots[0].asOf,'2026-09-30');
 assert.ok((await operationsData(fs)).bonusSnapshots.length);assert.equal((await operationsData(pa)).bonusSnapshots.length,0);
});
test('installer days off persist, stay private and block job and service assignments',async()=>{
 const day='2030-04-08';
 await operation(installer,{action:'dayOff',data:{installerId:installer.id,date:day,off:true}});
 assert.ok((await operationsData(installer)).daysOff.some(r=>r.date===day));
 await assert.rejects(()=>operation(installer,{action:'dayOff',data:{installerId:fs.id,date:day,off:true}}),/own/);
 await act(admin,'create',{number:'DAY-OFF',customer:'Test',address:'123 Main',amount:0});
 await act(admin,'permit',{received:true,number:'P'});
 await assert.rejects(()=>act(pa,'schedule',{date:day,period:'AM',installerId:installer.id,stop:1}),/NOT WORKING/);
 await assert.rejects(()=>act(fs,'schedule',{date:'2030-04-05',endDate:'2030-04-09',period:'AM',installerId:installer.id,stop:1}),/NOT WORKING/);
 await pg.query("UPDATE production.jobs SET payload=jsonb_set(payload::jsonb,'{stage}','\"Closed\"') WHERE id=$1",[j.id]);await reload();
 await assert.rejects(()=>act(admin,'request',{type:'Service',details:'Fix',serviceDate:day,installerId:installer.id,period:'AM'}),/NOT WORKING/);
 await operation(installer,{action:'dayOff',data:{installerId:installer.id,date:day,off:false}});
 await act(pa,'schedule',{date:day,period:'AM',installerId:installer.id,stop:1});
 await assert.rejects(()=>operation(installer,{action:'dayOff',data:{installerId:installer.id,date:day,off:true}}),/already scheduled/);
});
test('PA can schedule unassigned; office roles can assign later without changing date',async()=>{
 await act(pa,'create',{number:'UNASSIGNED-TEST',customer:'Unassigned Test',address:'123 Main',amount:0});
 await act(pa,'permit',{received:true,number:'U1'});
 await act(pa,'schedule',{date:'2031-04-07',period:'AM',installerId:'',stop:1});
 assert.equal(j.installerId,'');assert.equal(j.crew,'Unassigned');assert.equal(j.install,'2031-04-07');
 assert.ok(!(await operationsData(installer)).jobs.some(x=>x.id===j.id));
 await act(fs,'edit',{assignedInstallerId:installer.id});assert.equal(j.installerId,installer.id);assert.equal(j.install,'2031-04-07');
 const {displayDate}=await vite.ssrLoadModule('/lib/display-date.ts');assert.equal(displayDate('2026-10-01'),'10-01-2026');assert.equal(displayDate(''),'');
});


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
 assert.deepEqual(surveyDetails({...survey,ratings:'[5,4,5,5]'},[]).ratings,[4,3,4,4]);assert.equal(surveyDetails({...survey,ratings:null},[]).score,null);
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
 await act(admin,'status',{target:'Received'});assert.equal(j.stage,'Received');assert.equal(j.received,today);assert.equal(j.install,'');
 await act(pa,'schedule',{date:today,period:'AM',time:'09:00',installerId:installer.id,stop:1});
 await act(fs,'start');
 for(const stage of ['Production','InProgress','Incomplete','Closed','COLL','UTI','SVC']){
  await pg.query("UPDATE production.jobs SET payload=(payload::jsonb || jsonb_build_object('stage',$1::text))::text WHERE id=$2",[stage,j.id]);await reload();
  await act(fs,'schedule',{date:today,endDate:addDays(today,5),period:'PM',time:'14:00',installerId:installer.id,stop:2});assert.equal(j.stage,stage==='Closed'?'SVC':stage);assert.equal(j.installTime,'14:00');assert.equal(j.scheduleCompletedOn,'');
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
test('admin cancels production including pending reports and preserves received aging',async()=>{
 await act(pa,'create',{number:'CANCEL-PROD',customer:'Canceled install',address:'1 Main',amount:100,noPermitRequired:true});
 const received=addDays(today,-35);
 await act(pa,'receive',{received,materials:[{bay:'B1',brand:'CWS',materialType:'Window'}]});
 await act(pa,'schedule',{date:today,endDate:addDays(today,4),period:'AM',installerId:installer.id,stop:1});await act(fs,'start');await act(fs,'status',{target:'InProgress'});
 await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||$2::jsonb)::text WHERE id=$1",[j.id,JSON.stringify({operations:{report:{pending:true,status:'Complete',id:'prior'}}})]);await reload();
 await assert.rejects(()=>act(pa,'status',{target:'Received'}),/supervisor or administrator/i);
 await assert.rejects(()=>act(fs,'status',{target:'Received'}),/Administrator/);
 await act(admin,'status',{target:'Received',reason:'Customer canceled appointment'});
 assert.equal(j.stage,'Received');assert.equal(j.received,received);assert.equal(j.installed,'');assert.equal(j.install,'');assert.equal(j.installEnd,'');assert.equal(j.operations.report,null);assert.equal(j.operations.previousReports[0].id,'prior');assert.equal(j.operations.previousReports[0].superseded,true);assert.equal(aging(j,today).aged,true);
 assert.ok(j.history[0].text.includes('Customer canceled appointment'));
 await assert.rejects(()=>act(fs,'reviewReport',{approve:true}),/No report/);
});
test('payments need no reference and remain admin-only',async()=>{
 await act(admin,'create',{number:'PAY-NO-REFERENCE',customer:'Payment',address:'1 Main',amount:100});
 await assert.rejects(()=>act(pa,'payment',{paymentAmount:10,paymentType:'CHK'}),/Administrator/);
 await act(admin,'payment',{paymentAmount:25,paymentType:'CHK'});assert.equal(j.amount,75);assert.ok(!j.history[0].text.includes('undefined'));
 await act(admin,'balance',{amount:70});assert.equal(j.amount,70);
});
test('completion reports work in every assigned status and after a previous approved result',async()=>{
 for(const stage of ['Ordered','Received','Production','InProgress','Incomplete','SVC','COLL','UTI','Closed']){
  await act(pa,'create',{number:'REPORT-ANY-'+stage,customer:'Result test',address:'1 Main',amount:0,assignedInstallerId:installer.id});
  const operations={report:{id:'old-report',status:'Incomplete',approved:true,pending:false},...(stage==='SVC'?{services:[{installerId:installer.id,date:addDays(today,-1)}]}:{})};
  await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||$2::jsonb)::text WHERE id=$1",[j.id,JSON.stringify({stage,operations,...(stage==='SVC'?{installerId:null}:{}),reorder:'Replacement sash',reorderDate:today})]);await reload();
  assert.equal((await operationsData(installer)).jobs.find(x=>x.id===j.id).canReport,true);
  const status=stage==='Incomplete'?'Incomplete':'Complete';
  const kinds=status==='Incomplete'?['front','rear','left','right','issue','incomplete']:['front','rear','left','right','completion'];
  const attachments=kinds.map(kind=>({kind,name:kind+'.jpg',key:`jobs/${j.id}/${kind}/${crypto.randomUUID()}`}));
  for(const a of attachments)await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status,sha256) VALUES($1,$1,$2,$3,$4,$5,0,'ready',$1)",[a.key,j.id,a.kind,installer.id,a.name]);
  const report={id:crypto.randomUUID(),status,reason:'Visit result',notes:'Follow-up',installed:today,attachments};
  await assert.rejects(()=>act({...installer,id:'not-assigned'},'report',report),/assigned/);
  await act(installer,'report',report);assert.equal(j.stage,stage);assert.equal(j.operations.report.pending,true);assert.equal(j.operations.report.installerId,installer.id);assert.equal(j.operations.previousReports[0].id,'old-report');
  await assert.rejects(()=>act(installer,'report',{...report,id:crypto.randomUUID()}),/awaiting/);
  await act(fs,'reviewReport',{approve:true});assert.equal(j.stage,status==='Complete'?'Closed':'Incomplete');
 }
});
test('assigned installers save standalone photos in production and follow-up statuses',async()=>{
 const {canAddJobPhotos}=await vite.ssrLoadModule('/lib/job-photo-access.ts');
 await act(pa,'create',{number:'FOLLOWUP-PHOTOS',customer:'Photos',address:'1 Main',amount:0,assignedInstallerId:installer.id});
 for(const stage of ['Production','InProgress','Incomplete','SVC','COLL','UTI']){
  await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||jsonb_build_object('stage',$2::text))::text WHERE id=$1",[j.id,stage]);await reload();
  const a={key:`jobs/${j.id}/photos/${crypto.randomUUID()}`,name:'followup.jpg',kind:'photos'};
  await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status,sha256) VALUES($1,$1,$2,$3,$4,$5,0,'ready',$1)",[a.key,j.id,a.kind,installer.id,a.name]);
  assert.equal(canAddJobPhotos(installer,j),true);
  await act(installer,'jobPhotos',{attachments:[a]});assert.equal(j.stage,stage);assert.ok(j.attachments.some(x=>x.key===a.key&&x.source==='job'));assert.equal(j.operations.report,undefined);
  await assert.rejects(()=>act(fs,'jobPhotos',{attachments:[a]}),/Upload each photo/);
  assert.equal(canAddJobPhotos({...installer,id:'unassigned'},j),false);
 }
 assert.equal(canAddJobPhotos(installer,{...j,stage:'Closed'}),true);
 assert.equal(canAddJobPhotos(installer,{...j,stage:'Received'}),true);
 assert.equal(canAddJobPhotos(installer,{...j,stage:'SVC',installerId:'other',operations:{services:[{installerId:installer.id,date:today}]}}),true);
 await assert.rejects(()=>act(installer,'jobPhotos',{attachments:[{key:`jobs/${j.id}/photos/${crypto.randomUUID()}`,name:'missing.jpg',kind:'photos'}]}),/Upload each photo/);
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
 await act(pa,'schedule',schedule);assert.equal(j.install,schedule.date);
 await act(admin,'schedule',schedule);assert.equal(j.install,schedule.date);assert.equal(j.operations.pendingSchedule,null);assert.equal(j.stage,'Received');
 assert.match(j.history[0].text,/Scheduled/);
 await act(admin,'balance',{amount:5,reference:'test'});
 await act(admin,'schedule',schedule);assert.equal(j.amount,5);assert.equal(j.install,schedule.date);
 await act(fs,'schedule',{...schedule,date:today});assert.equal(j.install,today);assert.equal(j.amount,5);assert.equal(j.stage,'Received');assert.equal(aging(j,today).aged,true);assert.match(j.history[0].text,/Scheduled/);
 await act(pa,'schedule',schedule);assert.equal(j.install,schedule.date);
 await act(fs,'schedule',{...schedule,adminOverride:false});assert.equal(j.amount,5);
});
test('PO aliases and imported codes exclude Freedom Square balance from all aging metrics',()=>{
 for(const job of [{paymentMethod:'PO'},{paymentMethod:' p.o. '},{paymentMethod:'Purchase Order'},{importSource:{paymentCode:'PO'}}]){
  const record={...job,stage:'Incomplete',amount:51012,incompleteSince:addDays(today,-90)};
  assert.equal(aging(record,today).aged,false);
  const m=bonusMetrics([record],[],null,today);assert.equal(m.amount,0);assert.equal(m.count,0);assert.equal(m.unknownDates,0);
 }
 assert.equal(aging({paymentMethod:'CHK',importSource:{paymentCode:'PO'},stage:'Incomplete',incompleteSince:addDays(today,-90)},today).aged,true);
});

test('PO stored only in customer record is excluded in API totals and job display',async()=>{
 await act(admin,'create',{number:'PO-RECORD',customer:'PO record',address:'123 Main',amount:51012});
 const id=j.id;
 await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||$2::jsonb)::text WHERE id=$1",[id,JSON.stringify({stage:'Incomplete',incompleteSince:addDays(today,-90),paymentMethod:' '})]);
 await pg.query('INSERT INTO production.customer_records(job_id,payload) VALUES($1,$2)',[id,JSON.stringify({paymentMethod:'Purchase Order (PO)'})]);
 const data=await operationsData(admin),record=data.jobs.find(x=>x.id===id);
 assert.equal(record.paymentMethod,'PO');assert.equal(aging(record,today).aged,false);
 assert.equal(data.metrics.amount,bonusMetrics(data.jobs.filter(x=>x.id!==id),[],null,today).amount);
 await act(admin,'edit',{paymentMethod:'CHK'});const changed=(await operationsData(admin)).jobs.find(x=>x.id===id);assert.equal(changed.paymentMethod,'CHK');assert.equal(aging(changed,today).aged,true);
});

test('PA role can create and schedule without legacy edit flag; delivery label reaches installer',async()=>{
 const assistant={...pa,can_edit_jobs:0};
 assert.equal((await operationsData(assistant)).canEdit,true);
 await act(assistant,'create',{number:'DELIVERY-ONLY',customer:'Delivery customer',address:'123 Main',amount:0,deliveryOnly:true});
 assert.equal(j.deliveryOnly,true);
 await act(assistant,'permit',{received:true,number:'P123'});
 await act(assistant,'schedule',{date:today,period:'AM',installerId:installer.id,stop:1});
 const visible=(await operationsData(installer)).jobs.find(x=>x.id===j.id);
 assert.equal(visible.deliveryOnly,true);
 await assert.rejects(()=>act(assistant,'adminResult',{target:'Closed',reason:'test',confirmed:true}),/Admin/i);
 await act(assistant,'edit',{deliveryOnly:false});assert.equal(j.deliveryOnly,false);
});

test('legacy null optional fields do not prevent customer edits or change protected values',async()=>{
 await act(admin,'create',{number:'LEGACY-NULL',customer:'Legacy Account',address:'123 Main',amount:null,contractAmount:null});
 const id=j.id;
 const legacy={supervisorId:null,brand:null,materialType:null,phone:null,salesRepEmail:null,reportedUnits:null,permitExpiration:null};
 await pg.query("UPDATE production.jobs SET payload=(payload::jsonb||$2::jsonb)::text WHERE id=$1",[id,JSON.stringify(legacy)]);await reload();
 await act(pa,'edit',{notes:'Customer supplied permit delayed'});
 assert.equal(j.notes,'Customer supplied permit delayed');assert.equal(j.supervisorId,'');assert.equal(j.brand,'');assert.equal(j.phone,'');assert.equal(j.reportedUnits,null);assert.equal(j.amount,null);assert.equal(j.contractAmount,null);assert.equal(j.stage,'Ordered');
 await assert.rejects(()=>act(pa,'edit',{salesRepEmail:'not-an-email'}),/salesRepEmail/);
 await assert.rejects(()=>act(pa,'edit',{customer:null}),/customer/);
 await act(pa,'edit',{amount:0});assert.equal(j.amount,0);
});

test('location permissions, scoped maps, private links and session revocation',async()=>{
 const location=await vite.ssrLoadModule('/lib/location-store.ts');
 const {digest,randomToken,SESSION_COOKIE}=await vite.ssrLoadModule('/lib/auth-session.ts');
 const token=randomToken(),hash=await digest(token),now=Date.now();
 await pg.query('INSERT INTO production.credentials(member_id,must_change,generation) VALUES($1,0,1) ON CONFLICT(member_id) DO UPDATE SET must_change=0,generation=1',[installer.id]);
 await pg.query('INSERT INTO production.sessions(token_hash,member_id,generation,restricted,expires) VALUES($1,$2,1,0,$3)',[hash,installer.id,now+3600000]);
 const req=new Request('https://productiondesk.app/api/location',{headers:{cookie:SESSION_COOKIE+'='+token}});
 await pg.query('UPDATE production.members SET supervisor_id=$2,active=1 WHERE id=$1',[installer.id,fs.id]);
 const identity=await location.locationIdentity(req);assert.equal(identity.id,installer.id);
 await assert.rejects(()=>location.requireLocation(req,installer),/Location sharing/);
 await assert.rejects(()=>location.savePosition(identity,{latitude:91,longitude:0,accuracy:1,observedAt:now}),/Invalid/);
 await assert.rejects(()=>location.savePosition(identity,{latitude:27,longitude:-82,accuracy:1,observedAt:now-600000}),/outdated/);
 await location.savePosition(identity,{latitude:27.9,longitude:-82.5,accuracy:15,observedAt:now});
 await location.requireLocation(req,installer);
 assert.equal((await location.mapLocations(fs)).find(x=>x.id===installer.id).status,'Sharing');
 assert.ok((await location.mapLocations({...fs,id:'different-supervisor'})).some(x=>x.id===installer.id));
 await assert.rejects(()=>location.mapLocations(pa),/Supervisor/);
 await assert.rejects(()=>location.mapLocations(installer),/Supervisor/);
 const device=await location.deviceToken(req);
 const bearer=new Request('https://productiondesk.app/api/location',{headers:{authorization:'Bearer '+device.token}});
 assert.equal((await location.locationIdentity(bearer)).id,installer.id);
 await assert.rejects(()=>location.deviceToken(bearer),/register/);
 const jobId=crypto.randomUUID();
 await pg.query('INSERT INTO production.jobs(id,payload,updated) VALUES($1,$2,$3)',[jobId,JSON.stringify({installerId:installer.id,customer:'Private name',address:'Private address'}),new Date().toISOString()]);
 await assert.rejects(()=>location.createShare(pa,jobId),/assigned/);
 await assert.rejects(()=>location.createShare({...fs,id:'different-supervisor'},jobId),/assigned/);
 const share=await location.createShare(fs,jobId,30);
 assert.equal(share.greeting,'Hi, this is Supervisor, our team is on the way to you now!');
 const visible=await location.publicLocation(share.token);
 assert.deepEqual(Object.keys(visible).sort(),['accuracy','expires','latitude','longitude','observedAt','stale','name','photo','arrivalAt','stopNumber'].sort());
 assert.equal(visible.latitude,27.9);assert.ok(visible.arrivalAt>Date.now()+29*60000);assert.ok(!('payload' in visible));
 await pg.query('UPDATE production.installer_locations SET observed_at=$2 WHERE member_id=$1',[installer.id,now-180000]);
 const stale=await location.publicLocation(share.token);assert.equal(stale.stale,true);assert.equal(stale.latitude,27.9);
 await pg.query('UPDATE production.installer_locations SET observed_at=$2 WHERE member_id=$1',[installer.id,now]);
 await location.revokeShare(installer,jobId);
 await assert.rejects(()=>location.publicLocation(share.token),/ended/);
 const next=await location.createShare(installer,jobId);
 await pg.query('UPDATE production.jobs SET payload=$2 WHERE id=$1',[jobId,JSON.stringify({installerId:'another-crew'})]);
 await assert.rejects(()=>location.publicLocation(next.token),/ended/);
 await pg.query('UPDATE production.jobs SET payload=$2 WHERE id=$1',[jobId,JSON.stringify({installerId:installer.id})]);
 await location.stopSharing(installer.id);
 await assert.rejects(()=>location.locationIdentity(req),/Sign in/);
 await assert.rejects(()=>location.locationIdentity(bearer),/Sign in/);
 await assert.rejects(()=>location.publicLocation(next.token),/ended/);
 const stopped=(await location.mapLocations(admin)).find(x=>x.id===installer.id);assert.equal(stopped.status,'Not sharing');assert.equal(stopped.latitude,27.9);assert.equal(stopped.stale,true);
});

test('customer creation records optional permit and material intake atomically',async()=>{
 const base={buildingDepartment:'Test County Building',city:'Palmetto',number:'INTAKE-NEW',customer:'Intake Customer',address:'1 Test Lane',amount:0,permitReceived:true,permitNumber:'P-123',privateProvider:true,customerSuppliedPermit:true,materialReceipt:{received:today,materials:[{materialType:'Window',brand:'Simonton',bay:'A1'},{materialType:'SPD',brand:'Plygem',bay:'A2'}]}};
 await operation(pa,{action:'create',data:base});
 const created=(await operationsData(admin)).jobs.find(v=>v.number===base.number);
 assert.ok((await operationsData(pa)).buildingDepartments.includes('Test County Building'));assert.ok((await operationsData(pa)).cities.includes('Palmetto'));assert.deepEqual((await operationsData(installer)).buildingDepartments,[]);assert.equal(created.stage,'Received');assert.equal(created.received,today);assert.equal(created.materials.length,2);assert.equal(created.bay,'A1, A2');assert.equal(created.permitReceived,true);assert.equal(created.privateProvider,true);assert.equal(created.customerSuppliedPermit,true);
 await assert.rejects(()=>operation(pa,{action:'create',data:{...base,number:'BAD-PERMIT',permitNumber:''}}),/permit number/i);
 await assert.rejects(()=>operation(pa,{action:'create',data:{...base,number:'BAD-MATERIAL',materialReceipt:{received:today,materials:[{materialType:'Entry Door',brand:'Thermatru',bay:'D1'}]}}}),/separate accounts/i);
 assert.ok(!(await operationsData(admin)).jobs.some(v=>v.number==='BAD-MATERIAL'||v.number==='BAD-PERMIT'));
});

test('Leads customer column parses attached phone labels and address',async()=>{
 const {parseLeadsCustomerScan}=await vite.ssrLoadModule('/lib/customer-scan.ts');
 const v=parseLeadsCustomerScan('Customer ID#: 227190\nBozeman, David Phone #1:813-956-3247\n6647 Summer Cove Dr Ph#2:813-295-2895\nRiverview, FL 33578\nProduct: WIND').values;
 assert.equal(v.address,'6647 Summer Cove Dr');assert.equal(v.city,'Riverview');assert.equal(v.phone,'(813)-956-3247');assert.equal(v.phone2,'(813)-295-2895');
});

test('intake scheduling and reusable sales contacts are atomic and permission checked',async()=>{
 const base={number:'SCHEDULE-INTAKE',customer:'Schedule Intake',address:'2 Test Street',amount:100,permitReceived:true,permitNumber:'P2',salesRep:'Rep Example',salesRepPhone:'(813)-555-1234',salesRepEmail:'rep@example.com',scheduleWork:{date:today,period:'AM',installerId:installer.id,stop:1,instructions:'Use side entrance; protect floors.'}};
 await operation(pa,{action:'create',data:base});
 const data=await operationsData(admin),created=data.jobs.find(v=>v.number===base.number);
 assert.equal(created.instructions,'Use side entrance; protect floors.');assert.equal((await operationsData(installer)).jobs.find(v=>v.id===created.id).instructions,created.instructions);assert.equal(created.install,today);assert.equal(created.installerId,installer.id);assert.equal(created.stage,'Ordered');
 assert.deepEqual(data.salesReps.find(v=>v.name==='Rep Example'),{name:'Rep Example',phone:'(813)-555-1234',email:'rep@example.com'});
 assert.deepEqual((await operationsData(installer)).salesReps,[]);
 await assert.rejects(()=>operation(pa,{action:'create',data:{...base,number:'SCHEDULE-NO-PERMIT',permitReceived:false}}),/permit/i);
 assert.ok(!(await operationsData(admin)).jobs.some(v=>v.number==='SCHEDULE-NO-PERMIT'));
 await operation(pa,{action:'create',data:{...base,number:'SCHEDULE-UNASSIGNED',scheduleWork:{...base.scheduleWork,installerId:''}}});
 assert.equal((await operationsData(admin)).jobs.find(v=>v.number==='SCHEDULE-UNASSIGNED').install,today);
 await assert.rejects(()=>operation(fs,{action:'create',data:{...base,number:'FS-UNASSIGNED',scheduleWork:{...base.scheduleWork,installerId:''}}}),/installer/i);
 const {displayBonusDate}=await vite.ssrLoadModule('/lib/display-date.ts');assert.equal(displayBonusDate('2026-09-29'),'September 29 2026');
});

test('weekly print includes Sunday through Saturday, scopes dates and escapes customer text',async()=>{
 const {weeklyScheduleHtml}=await vite.ssrLoadModule('/lib/print-schedule.ts');
 const html=weeklyScheduleHtml({day:'2026-10-02',daysOff:[{date:'2026-09-30',crew:'Crew off'}],jobs:[{id:'x',number:'PRINT-1',customer:'<script>bad</script>',install:'2026-09-28',installEnd:'2026-09-29',crew:'Crew A',stage:'Production'},{id:'y',customer:'OUTSIDE WEEK',install:'2026-10-05'}]});
 assert.ok(html.includes('Sep 27, 2026'));assert.ok(html.includes('Oct 3, 2026'));assert.ok(!html.includes('OUTSIDE WEEK'));assert.ok(!html.includes('<script>bad</script>'));assert.equal((html.match(/#PRINT-1/g)||[]).length,2);assert.ok(html.includes('Crew off'));assert.ok(html.includes('size:letter landscape'));assert.ok(html.includes('width:100%'));assert.ok(!html.includes("sheet.style.zoom"));
});

test.after(async()=>{await vite.close();await pg.close()});

test('permit exemption, PA amount edits, and reciprocal customer links',async()=>{
 await act(pa,'create',{number:'NO-PERMIT-A',customer:'Linked Customer',address:'123 Example',amount:100,contractAmount:200,noPermitRequired:true});
 const a=j.id;
 await act(pa,'schedule',{date:today,period:'AM',installerId:'',stop:1});assert.equal(j.install,today);
 await act(pa,'edit',{amount:80,contractAmount:250,paymentMethod:'PO'});assert.equal(j.amount,80);assert.equal(j.contractAmount,250);assert.equal(j.paymentMethod,'PO');assert.equal(j.noPermitRequired,true);
 await assert.rejects(()=>act(pa,'permit',{noPermitRequired:true,received:true,number:'X'}),/not both/);
 await act(pa,'permit',{noPermitRequired:false,received:false,number:''});
 await assert.rejects(()=>act(pa,'schedule',{date:today,period:'AM',installerId:'',stop:1}),/permit/i);
 await act(pa,'create',{number:'NO-PERMIT-B',customer:'Linked Customer',address:'123 Example',amount:50});const b=j.id;
 await act(pa,'linkAccount',{targetId:a});
 let jobs=(await operationsData(pa)).jobs;assert.ok(jobs.find(x=>x.id===a).linkedAccountIds.includes(b));assert.ok(jobs.find(x=>x.id===b).linkedAccountIds.includes(a));
 j=jobs.find(x=>x.id===a);await assert.rejects(()=>act(installer,'linkAccount',{targetId:b}),/permission/);
 await assert.rejects(()=>act(pa,'linkAccount',{targetId:a}),/different/);
 await act(pa,'unlinkAccount',{targetId:b});jobs=(await operationsData(pa)).jobs;
 assert.deepEqual(jobs.find(x=>x.id===a).linkedAccountIds,[]);assert.deepEqual(jobs.find(x=>x.id===b).linkedAccountIds,[]);
});

test('Add Customer links by exact customer ID and rolls back invalid links',async()=>{
 await act(pa,'create',{number:'LINK-PARENT',customer:'Same customer',address:'1 Test',amount:5});const parent=j.id;
 await assert.rejects(()=>act(pa,'create',{number:'LINK-INVALID',customer:'Same customer',address:'1 Test',amount:5,linkedCustomerId:'MISSING'}),/not found/);
 assert.ok(!(await operationsData(pa)).jobs.some(x=>x.number==='LINK-INVALID'));
 await act(pa,'create',{number:'LINK-CHILD',customer:'Same customer',address:'1 Test',amount:10,linkedCustomerId:'LINK-PARENT'});const child=(await operationsData(pa)).jobs.find(x=>x.number==='LINK-CHILD').id;
 const jobs=(await operationsData(pa)).jobs;
 assert.ok(jobs.find(x=>x.id===parent).linkedAccountIds.includes(child));assert.ok(jobs.find(x=>x.id===child).linkedAccountIds.includes(parent));
});
test('linked accounts copy details but preserve destination products, identity and workflow',async()=>{
 await act(admin,'create',{number:'COPY-FROM',customer:'Jane Example',firstName:'Jane',lastName:'Example',address:'88 Example St',phone:'(813)-555-1234',phone2:'(813)-555-1235',city:'Tampa',state:'FL',zip:'33618',amount:450,contractAmount:900,paymentMethod:'CHK',noPermitRequired:true,privateProvider:true,customerSuppliedPermit:true,salesRep:'Rep One',salesRepPhone:'(813)-555-4444',notes:'Call ahead',instructions:'Use side entrance',windowCount:8,product:'Windows'});
 const from=(await operationsData(admin)).jobs.find(x=>x.number==='COPY-FROM');
 await act(pa,'create',{number:'COPY-NEW',product:'Entry Doors',entryDoorCount:2,linkedCustomerId:'COPY-FROM'});
 let to=(await operationsData(pa)).jobs.find(x=>x.number==='COPY-NEW');
 assert.equal(to.address,from.address);assert.equal(to.amount,450);assert.equal(to.customer,from.customer);assert.equal(to.windowCount,0);assert.equal(to.entryDoorCount,2);assert.equal(to.product,'Entry Doors');assert.equal(to.stage,'Ordered');assert.equal(to.noPermitRequired,true);
 await operation(pa,{action:'edit',jobId:to.id,version:to.version,data:{address:'Different',amount:1}});
 to=(await operationsData(pa)).jobs.find(x=>x.id===to.id);
 await operation(pa,{action:'linkAccount',jobId:to.id,version:to.version,data:{targetId:from.id}});
 to=(await operationsData(pa)).jobs.find(x=>x.id===to.id);
 assert.equal(to.address,from.address);assert.equal(to.amount,450);assert.equal(to.paymentMethod,'CHK');assert.equal(to.phone2,from.phone2);assert.equal(to.instructions,from.instructions);assert.equal(to.entryDoorCount,2);assert.equal(to.number,'COPY-NEW');assert.equal(to.install,'');
 await operation(fs,{action:'linkAccount',jobId:to.id,version:to.version,data:{targetId:from.id}});
 const {linkedAccountValues}=await vite.ssrLoadModule('/lib/linked-account.ts');
 const values=linkedAccountValues({...from,materials:[{bay:'A'}],reorder:'product reorder',received:today,installerId:installer.id});
 for(const key of ['number','id','version','product','windowCount','entryDoorCount','materials','reorder','received','installerId','stage','history'])assert.equal(values[key],undefined,key);
 assert.equal(linkedAccountValues(from,false).amount,undefined);
});

test('daily print scopes installs, service visits and days off to selected day',async()=>{
 const {weeklyScheduleHtml}=await vite.ssrLoadModule('/lib/print-schedule.ts');
 const html=weeklyScheduleHtml({daily:true,day:'2026-10-07',daysOff:[{date:'2026-10-07',crew:'OFF TODAY'},{date:'2026-10-08',crew:'OFF TOMORROW'}],jobs:[
 {id:'a',customer:'TODAY INSTALL',stage:'Production',install:'2026-10-06',installEnd:'2026-10-08'},
 {id:'b',customer:'TOMORROW ONLY',stage:'Production',install:'2026-10-08'},
 {id:'c',customer:'SERVICE TODAY',stage:'Incomplete',operations:{services:[{date:'2026-10-07',crew:'Service Crew'}]}}
 ]});
 assert.ok(html.includes('Daily Schedule'));assert.ok(html.includes('@page{size:letter landscape;margin:0}'));assert.ok(html.includes('margin:14mm 14mm 14mm!important'));assert.ok(!html.includes('letter portrait'));assert.equal((html.match(/class="day"/g)||[]).length,1);
 for(const text of ['TODAY INSTALL','SERVICE TODAY','OFF TODAY'])assert.ok(html.includes(text));
 for(const text of ['TOMORROW ONLY','OFF TOMORROW'])assert.ok(!html.includes(text));
});

test('active print view uses the same Day Week and Month dates as the screen',async()=>{
 const {weeklyScheduleHtml}=await vite.ssrLoadModule('/lib/print-schedule.ts');
 const {datesFor}=await vite.ssrLoadModule('/app/operations-preview/schedule-view.tsx');
 for(const view of ['Day','Week','Month']){
  const dates=datesFor('2026-10-08',view);
  const html=weeklyScheduleHtml({view,day:'2026-10-08',jobs:[
   {id:'first',customer:'FIRST VISIBLE',stage:'Production',install:dates[0]},
   {id:'last',customer:'LAST VISIBLE',stage:'Production',install:dates.at(-1)},
   {id:'outside',customer:'OUTSIDE RANGE',stage:'Production',install:'2027-01-01'}
  ]});
  assert.equal((html.match(/class="day"/g)||[]).length,dates.length);
  assert.ok(html.includes('FIRST VISIBLE'));assert.ok(html.includes('LAST VISIBLE'));
  assert.ok(!html.includes('OUTSIDE RANGE'));
 }
});

test('historical service intake defaults to zero balance, schedules, preserves existing account and inspection',async()=>{
 const number='HISTORICAL-SERVICE-1';
 await operation(pa,{action:'create',data:{number,customer:'Old Customer',address:'123 Old Street',serviceCompletionJob:true,inspectionComplete:true,amount:999,contractAmount:5000,scheduleWork:{date:today,period:'AM',installerId:'',stop:1}}});
 let job=(await operationsData(admin)).jobs.find(v=>v.number===number);
 assert.equal(job.stage,'SVC');assert.equal(job.amount,0);assert.equal(job.received,'');assert.equal(job.inspectionComplete,true);assert.equal(job.install,today);assert.equal(aging(job,today).aged,false);
 const originalId=job.id;
 await operation(fs,{action:'create',data:{number,serviceCompletionJob:true,customer:'Do not overwrite',instructions:'Return for adjustment',scheduleWork:{date:addDays(today,2),period:'PM',installerId:installer.id,stop:2}}});
 const matches=(await operationsData(admin)).jobs.filter(v=>v.number===number);
 assert.equal(matches.length,1);job=matches[0];assert.equal(job.id,originalId);assert.equal(job.customer,'Old Customer');assert.equal(job.contractAmount,5000);assert.equal(job.instructions,'Return for adjustment');assert.equal(job.install,addDays(today,2));
 await operation(pa,{action:'permit',jobId:job.id,version:job.version,data:{received:false,number:'',inspectionComplete:true}});
 job=(await operationsData(admin)).jobs.find(v=>v.id===originalId);assert.equal(job.inspectionComplete,true);
 await assert.rejects(()=>operation(installer,{action:'create',data:{number:'DENIED-SERVICE',serviceCompletionJob:true}}),/permission/i);
 await operation(pa,{action:'create',data:{number:'ACTIVE-SERVICE-CONFLICT',customer:'Active',address:'A',amount:null}});
 await assert.rejects(()=>operation(fs,{action:'create',data:{number:'ACTIVE-SERVICE-CONFLICT',serviceCompletionJob:true}}),/active job/i);
});
