import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'vite';
const pg=new PGlite();
for(const migration of ['001_initial','003_account_permissions','007_customer_records','008_live_operations','014_warehouse'])await pg.exec(readFileSync('supabase/migrations/'+migration+'.sql','utf8'));
const wrap=c=>({query:async(q,args)=>{const r=await c.query(q,args);return {rows:r.rows,changes:r.affectedRows??r.rows.length};},transaction:fn=>c.transaction(tx=>fn(wrap(tx)))});
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('.')}},server:{middlewareMode:true,hmr:false},plugins:[{name:'accounts-warehouse-db',enforce:'pre',resolveId(id){if(id==='@/db/raw'||/\/db\/raw(?:\.ts)?$/.test(id))return '\0feature-db';},load(id){if(id==='\0feature-db')return 'export const database=()=>globalThis.__accountsWarehouseDb';}}]});
const {createDatabase}=await vite.ssrLoadModule('/db/adapter.ts');globalThis.__accountsWarehouseDb=createDatabase(wrap(pg));
const {salesRepData,saveSalesRep}=await vite.ssrLoadModule('/lib/sales-reps.ts');
const {warehouseScheduleData}=await vite.ssrLoadModule('/lib/warehouse-schedule.ts');
const admin={id:'owner',role:'admin',name:'Admin'},warehouse={id:'warehouse',role:'warehouse',name:'Warehouse'};
async function insertJob(id,payload){await pg.query('INSERT INTO production.jobs(id,payload,version,updated) VALUES($1,$2,1,$3)',[id,JSON.stringify({id,number:id,customer:'Test customer',address:'1 Test Street',amount:900,history:[],...payload}),'2026-10-29']);}

test('Accounts sales reps discover imported profiles and save contacts, renames and blank emails across jobs',async()=>{
 await insertJob('rep-job-a',{salesRep:'Directory Rep',salesRepEmail:'old@example.com',salesRepPhone:'8135551234'});
 await insertJob('rep-job-b',{});
 await pg.query('INSERT INTO production.customer_records(job_id,payload) VALUES($1,$2)',['rep-job-b',JSON.stringify({salesRep:'Directory Rep',salesRepPhone:'8135551234',permitNumber:'KEEP'})]);
 const rep=(await salesRepData(admin)).salesReps.find(r=>r.name==='Directory Rep');assert.equal(rep.jobs,2);
 const input={originalId:rep.id,revision:rep.revision,name:'Corrected Rep',phone:'7275559876',email:'correct@example.com'};
 assert.equal((await saveSalesRep(admin,input)).updatedJobs,2);
 for(const id of ['rep-job-a','rep-job-b']){const row=(await pg.query('SELECT payload,version FROM production.jobs WHERE id=$1',[id])).rows[0],j=JSON.parse(row.payload);assert.equal(j.salesRep,'Corrected Rep');assert.equal(j.salesRepEmail,input.email);assert.equal(j.salesRepPhone,'(727)-555-9876');assert.equal(j.amount,900);assert.equal(row.version,2);assert.equal(j.history.length,1);}
 const record=(await pg.query('SELECT payload,version FROM production.customer_records WHERE job_id=$1',['rep-job-b'])).rows[0];assert.equal(record.version,2);assert.equal(JSON.parse(record.payload).permitNumber,'KEEP');assert.equal(JSON.parse(record.payload).salesRep,'Corrected Rep');
 assert.ok(!(await salesRepData(admin)).salesReps.some(r=>r.name==='Directory Rep'));
 await assert.rejects(()=>saveSalesRep(admin,input),e=>e.status===409);
 let current=(await salesRepData(admin)).salesReps.find(r=>r.name==='Corrected Rep');
 await saveSalesRep(admin,{originalId:current.id,revision:current.revision,name:current.name,phone:'',email:''});
 current=(await salesRepData(admin)).salesReps.find(r=>r.id===current.id);assert.equal(current.email,'');assert.equal(current.phone,'');
 const saved=(await pg.query('SELECT payload FROM production.operations_config WHERE id=$1',['sales-rep:corrected rep'])).rows[0].payload;assert.equal(saved.email,'');
 await assert.rejects(()=>saveSalesRep(admin,{name:' corrected  rep ',email:'new@example.com'}),e=>e.status===409);
 await assert.rejects(()=>saveSalesRep(admin,{originalId:current.id,revision:rep.revision,name:current.name,email:'overwrite@example.com'}),e=>e.status===409);
 await assert.rejects(()=>saveSalesRep(admin,{name:'Bad email',email:'invalid'}));
});

test('sales rep directory creates standalone contacts and denies non-admin access',async()=>{
 await saveSalesRep(admin,{name:'New Sales Rep',email:'new@example.com',phone:''});
 assert.equal((await salesRepData(admin)).salesReps.find(r=>r.name==='New Sales Rep').jobs,0);
 for(const role of ['warehouse','installer','production_assistant','supervisor','service_tech']){
  await assert.rejects(()=>salesRepData({...warehouse,role}),e=>e.status===403);
  await assert.rejects(()=>saveSalesRep({...warehouse,role},{name:'Blocked',email:'x@example.com'}),e=>e.status===403);
 }
});

test('warehouse schedule matches multi-day and service calendars and exposes only loading details',async()=>{
 await pg.query("INSERT INTO production.members(id,email,name,role) VALUES('crew','crew@example.com','Current Crew','installer')");
 await insertJob('scheduled',{salesRepEmail:'private@example.com',notes:'PRIVATE NOTES',contractAmount:5000,install:'2026-10-30',installEnd:'2026-11-03',scheduleCompletedOn:'2026-11-02',installPeriod:'AM',installerId:'crew',crew:'Old Crew',stopNumber:2,product:'Windows',windowCount:5,bay:'B12',operations:{pendingSchedule:{date:'2026-11-01'},routing:{'2026-10-30':{installation:{stop:3}}},services:[{id:'service',date:'2026-10-31',period:'PM',installerId:'crew'},{id:'canceled',date:'2026-11-01',cancelled:true}]}});
 const result=await warehouseScheduleData(warehouse,{from:'2026-10-30',to:'2026-11-03'});
 assert.equal(result.readOnly,true);assert.equal(result.appointments.length,3);
 assert.deepEqual(result.appointments.map(a=>a.date),['2026-10-30','2026-10-31','2026-11-02']);
 const first=result.appointments[0];assert.equal(first.stop,3);assert.equal(first.crew,'Current Crew');assert.equal(first.windowCount,5);assert.equal(first.bay,'B12');assert.equal(result.appointments[1].kind,'Service');
 const body=JSON.stringify(result);assert.doesNotMatch(body,/private@example|PRIVATE NOTES|contractAmount|salesRepEmail|"amount"/);
 await assert.rejects(()=>warehouseScheduleData({role:'installer'},{from:'2026-10-30'}),e=>e.status===403);
 await assert.rejects(()=>warehouseScheduleData(warehouse,{from:'2026-11-03',to:'2026-10-30'}),e=>e.status===400);
 await assert.rejects(()=>warehouseScheduleData(warehouse,{from:'2026-10-01',to:'2026-12-01'}),e=>e.status===400);
 await assert.rejects(()=>warehouseScheduleData(warehouse,{from:'not-a-date'}));
});

test('read-only warehouse schedule renders loading data without job mutation controls',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');globalThis.React=React;
 try{const {WarehouseSchedule}=await vite.ssrLoadModule('/components/warehouse-schedule.tsx');const data=await warehouseScheduleData(warehouse,{from:'2026-10-30'}),html=renderToStaticMarkup(React.createElement(WarehouseSchedule,{initialData:data}));assert.match(html,/Outgoing schedule/);assert.match(html,/Read-only/);assert.match(html,/Current Crew/);assert.match(html,/B12/);assert.doesNotMatch(html,/Schedule Work|Save schedule|Update information|\/api\/operations|href="\/\?job=/);}finally{delete globalThis.React;}
});
test.after(async()=>{await vite.close();await pg.close();delete globalThis.__accountsWarehouseDb;});
