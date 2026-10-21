import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'vite';
const pg=new PGlite();for(const name of ['001_initial','003_account_permissions','008_live_operations','014_warehouse'])await pg.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
const wrap=c=>({query:async(sql,args)=>{const r=await c.query(sql,args);return {rows:r.rows,changes:r.affectedRows??r.rows.length}},transaction:fn=>c.transaction(tx=>fn(wrap(tx)))});
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('.')}},plugins:[{name:'warehouse-test-db',enforce:'pre',resolveId(id){if(id==='@/db/raw'||/\/db\/raw(?:\.ts)?$/.test(id))return '\0db'},load(id){if(id==='\0db')return 'export const database=()=>globalThis.__warehouseDb'}}]});
const {createDatabase,compileQuery}=await vite.ssrLoadModule('/db/adapter.ts');globalThis.__warehouseDb=createDatabase(wrap(pg));
const {warehouseOperation:op,warehouseData}=await vite.ssrLoadModule('/lib/warehouse-store.ts');
const {parseWarehouseManifest,splitWarehousePO,normalizeWarehouseBarcode,manualWarehouseReference,warehouseImportSchema}=await vite.ssrLoadModule('/lib/warehouse.ts');
const {warehouseSchemaSQL}=await vite.ssrLoadModule('/lib/warehouse-schema.ts');
const admin={id:'owner',role:'admin',name:'Admin',active:1},warehouse={id:crypto.randomUUID(),role:'warehouse',name:'Warehouse',active:1},installer={id:crypto.randomUUID(),role:'installer',name:'Installer',active:1},pa={id:crypto.randomUUID(),role:'production_assistant',name:'PA',active:1},outsider={id:crypto.randomUUID(),role:'installer',name:'Other',active:1};
for(const m of [admin,warehouse,installer,pa,outsider])await pg.query('INSERT INTO production.members(id,email,name,role) VALUES($1,$2,$3,$4)',[m.id,m.id+'@example.com',m.name,m.role]);
const jobId=crypto.randomUUID();await pg.query('INSERT INTO production.jobs(id,payload,updated) VALUES($1,$2,$3)',[jobId,JSON.stringify({id:jobId,number:'686442',customer:'Test customer',product:'Windows',stage:'Ordered',installerId:installer.id,history:[]}),new Date().toISOString()]);
const item={externalId:'%TEST001',po:'073-686442',order:'45687662',aq:'9663995-1-1',description:'Double hung'};
const shipment={action:'import',reference:'TEST-ROUTE',name:'Test shipment',store:'073',items:[item,{...item,externalId:'%TEST002'}]};
const get=async()=> (await warehouseData(warehouse)).items.find(i=>i.external_id==='%TEST001');
test('store and CID remain separate; manifest preserves individual units with the same AQ',()=>{assert.deepEqual(splitWarehousePO('073-686442'),{store:'073',cid:'686442'});const rows=parseWarehouseManifest('GA %TEST001 45687662 073-686442 9663995-1-1 Test One\nGA %TEST002 45687662 073-686442 9663995-1-1 Test Two');assert.equal(rows.length,2);assert.equal(rows[0].aq,rows[1].aq);assert.throws(()=>parseWarehouseManifest('%TEST001 1 073-1 1-1-1 %TEST001 1 073-1 1-1-1'));});
test('Code 39 raw and extended results identify the same item; PO suffixes retain the CID',()=>{assert.equal(normalizeWarehouseBarcode('\x7fPLWG9M3WA8T       '),'%YPLWG9M3WA8T');assert.equal(normalizeWarehouseBarcode('%YPLWG9M3WA8T       '),'%YPLWG9M3WA8T');assert.deepEqual(splitWarehousePO('073-660530-1-8-R'),{store:'073',cid:'660530'});assert.equal(parseWarehouseManifest('%YTEST123 45690433 073-660530-1-8-R 9706621-1-1')[0].po,'073-660530-1-8-R');assert.throws(()=>parseWarehouseManifest('%YGOOD 1 073-1 1-1-1 %YBAD unknown'));});
test('manual items generate a usable shipment reference and validation names missing fields',()=>{const reference=manualWarehouseReference('', '2026-10-20','abcdef123456');assert.equal(reference,'MANUAL-2026-10-20-abcdef12');assert.equal(manualWarehouseReference('MY-DELIVERY','2026-10-20','unused'),'MY-DELIVERY');assert.equal(warehouseImportSchema.parse({...shipment,reference}).reference,reference);const invalid=warehouseImportSchema.safeParse({...shipment,reference:''});assert.equal(invalid.success,false);assert.equal(invalid.error.issues[0].message,'Enter a shipment reference.');});
test('migration can be repeated; schema setup uses equivalent SQL through the adapter',async()=>{await pg.exec(readFileSync('supabase/migrations/014_warehouse.sql','utf8'));const compiled=compileQuery(warehouseSchemaSQL);assert.ok(!compiled.includes('production.production.'),'Setup must not generate a cross-database reference');assert.match(compiled,/REFERENCES production\.jobs\(id\)/);await pg.exec(compiled);const row=await pg.query("SELECT role FROM production.members WHERE id=$1",[warehouse.id]);assert.equal(row.rows[0].role,'warehouse');});
test('receiving and returns use exact inventory identity, protected transitions and audit',async()=>{
 await assert.rejects(op(pa,shipment),/permission/);await assert.rejects(op(installer,shipment),/permission/);
 assert.deepEqual(await op(warehouse,shipment),{added:2,skipped:0});assert.deepEqual(await op(warehouse,shipment),{added:0,skipped:2});
 let i=await get();assert.equal(i.job_id,jobId);assert.equal(i.status,'Expected');assert.equal((await warehouseData(outsider)).items.length,0);assert.equal((await warehouseData(installer)).items.length,2);
 await assert.rejects(op(warehouse,{...shipment,items:[{...item,aq:'999-1-1'}]}),/different account/);
 await assert.rejects(op(warehouse,{...shipment,store:'074'}),/store numbers/);
 await assert.rejects(op(warehouse,{action:'receive',id:i.id,version:i.version}),/bay/);
 await op(warehouse,{action:'receive',id:i.id,version:i.version,bay:'A1'});
 await assert.rejects(op(warehouse,{action:'receive',id:i.id,version:i.version,bay:'A1'}),/changed/);
 i=await get();await assert.rejects(op(outsider,{action:'return',id:i.id,version:i.version,reason:'Wrong size'}),/permission/);
 await assert.rejects(op(installer,{action:'return',id:i.id,version:i.version,reason:'Wrong size'}),/photo/);
 const key=`jobs/${jobId}/warehouse/${crypto.randomUUID()}`;await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status) VALUES($1,$2,$3,'warehouse',$4,'test.jpg',$5,'ready')",[key,'pending/test',jobId,installer.id,Date.now()+10000]);
 await op(installer,{action:'return',id:i.id,version:i.version,reason:'Incorrect fit',photoKey:key});i=await get();assert.equal(i.status,'Return Pending');
 await assert.rejects(op(installer,{action:'confirmReturn',id:i.id,version:i.version,bay:'R1'}),/permission/);
 await op(warehouse,{action:'confirmReturn',id:i.id,version:i.version,bay:'R1'});i=await get();assert.equal(i.status,'Returned');assert.equal(i.bay,'R1');
 const j=JSON.parse((await pg.query('SELECT payload FROM production.jobs WHERE id=$1',[jobId])).rows[0].payload);assert.equal(j.stage,'Ordered');assert.ok(j.history.length>=3);
 assert.ok((await pg.query('SELECT * FROM production.notifications WHERE recipient_id=$1',[pa.id])).rows.length>0);
});
test('missing items block RCVD; photos and barcodes cannot be borrowed from another item',async()=>{
 let i=(await warehouseData(warehouse)).items.find(i=>i.external_id==='%TEST002');await op(warehouse,{action:'missing',id:i.id,version:i.version,reason:'Not on truck'});i=(await warehouseData(warehouse)).items.find(i=>i.external_id==='%TEST002');
 await assert.rejects(op(warehouse,{action:'ready',jobId,confirmed:true,received:'2026-10-20',materials:[{materialType:'Window',brand:'Simonton',bay:'A1'}]}),/Every expected/);
 await op(warehouse,{action:'barcode',id:i.id,version:i.version,barcode:'4568766201'});let other=await get();await assert.rejects(op(warehouse,{action:'barcode',id:other.id,version:other.version,barcode:'4568766201'}),/different item/);
});
test('job receipt requires all usable units; retains the materials format used by existing job files',async()=>{
 const id=crypto.randomUUID();await pg.query('INSERT INTO production.jobs(id,payload,updated) VALUES($1,$2,$3)',[id,JSON.stringify({id,number:'123456',customer:'Ready job',product:'Windows',stage:'Ordered'}),new Date().toISOString()]);
 await op(warehouse,{...shipment,reference:'SECOND',items:[{...item,externalId:'%READY',po:'073-123456'}]});let i=(await warehouseData(warehouse)).items.find(i=>i.external_id==='%READY');await op(warehouse,{action:'receive',id:i.id,version:i.version,bay:'B1'});
 const payload={action:'ready',jobId:id,confirmed:true,received:'2026-10-20',materials:[{materialType:'Window',brand:'Simonton',bay:'B1'}]};
 await assert.rejects(op(warehouse,{...payload,received:'2099-01-01'}),/future/);
 await op(warehouse,payload);const j=JSON.parse((await pg.query('SELECT payload FROM production.jobs WHERE id=$1',[id])).rows[0].payload);assert.equal(j.stage,'Received');assert.equal(j.materials[0].bay,'B1');
});
test('unmatched accounts remain reviewable; manual linking must use the PO CID',async()=>{
 await op(warehouse,{...shipment,reference:'UNMATCHED',items:[{...item,externalId:'%UNKNOWN',po:'073-999999'}]});const i=(await warehouseData(warehouse)).items.find(i=>i.external_id==='%UNKNOWN');assert.equal(i.job_id,null);await assert.rejects(op(warehouse,{action:'link',id:i.id,version:i.version,jobId}),/customer ID/);await op(warehouse,{...shipment,reference:'OTHER-STORE',store:'074',items:[{...item,externalId:'%OTHERSTORE',po:'074-686442'}]});assert.equal((await warehouseData(warehouse)).items.find(i=>i.external_id==='%OTHERSTORE').job_id,null);
});
test('older unlisted returns need assignment and owned evidence; never change the job status',async()=>{
 const key=`jobs/${jobId}/warehouse/${crypto.randomUUID()}`;await pg.query("INSERT INTO production.attachment_uploads(key,staging_key,job_id,kind,member_id,name,expires,status) VALUES($1,$2,$3,'warehouse',$4,'old-return.jpg',$5,'ready')",[key,'pending/unlisted',jobId,installer.id,Date.now()+10000]);
 const input={action:'unlistedReturn',jobId,barcode:'OLD-123',order:'OLD-ORDER',aq:'OLD-AQ',reason:'Unused window from older job',photoKey:key};
 await assert.rejects(op(outsider,input),/permission/);await assert.rejects(op(pa,input),/permission/);
 await op(installer,input);const i=(await warehouseData(warehouse)).items.find(i=>i.external_id==='OLD-123');assert.equal(i.status,'Return Pending');assert.equal(i.job_id,jobId);
 await assert.rejects(op(installer,input),/already in inventory/);
 const j=JSON.parse((await pg.query('SELECT payload FROM production.jobs WHERE id=$1',[jobId])).rows[0].payload);assert.equal(j.stage,'Ordered');
});
test.after(async()=>{await vite.close();await pg.close();delete globalThis.__warehouseDb});

test('receiving search finds the customer directly by CID, PO, AQ, order or address and reports blockers',async()=>{
 const {searchWarehouseJobs,warehouseJobProgress}=await vite.ssrLoadModule('/lib/warehouse-receiving.ts');
 const jobs=[{id:'a',number:'686442',customer:'Tomassini, Arvi',stage:'Ordered',address:'12 Example Road',city:'Seminole'},{id:'b',number:'111',customer:'Closed account',stage:'Closed'}];
 const items=[{job_id:'a',po:'073-686442',aq:'9663995-2-1',manufacturer_order:'45687662',status:'Received',bay:'A1'},{job_id:'a',status:'Damaged',bay:'A1'}];
 for(const key of ['686442','073-686442','Tomassini','9663995','45687662','Example Road'])assert.equal(searchWarehouseJobs(jobs,items,key)[0].id,'a');
 assert.deepEqual(searchWarehouseJobs(jobs,items,''),[]);assert.deepEqual(searchWarehouseJobs(jobs,items,'Closed'),[]);
 let p=warehouseJobProgress(items,'a');assert.equal(p.ready,false);assert.equal(p.received,1);assert.ok(p.blockers.includes('1 damaged'));
 items[1].status='Received';p=warehouseJobProgress(items,'a');assert.equal(p.ready,true);assert.deepEqual(p.bays,['A1']);items[1].bay='';assert.equal(warehouseJobProgress(items,'a').ready,false);assert.equal(warehouseJobProgress([],'a').ready,false);
});

test('job scan group receives atomically, requires a missing reason and alerts FS Admin PA without marking RCVD',async()=>{
 const fs={id:crypto.randomUUID(),role:'supervisor',name:'FS'};await pg.query('INSERT INTO production.members(id,email,name,role) VALUES($1,$2,$3,$4)',[fs.id,fs.id+'@example.com',fs.name,fs.role]);
 const id=crypto.randomUUID(),at=new Date().toISOString();await pg.query('INSERT INTO production.jobs(id,payload,updated) VALUES($1,$2,$3)',[id,JSON.stringify({id,number:'987654',customer:'Group receiving',stage:'Ordered',product:'Windows',history:[]}),at]);
 const parts=Array.from({length:3},(_,n)=>({externalId:'%GROUP'+n,po:'073-987654',order:'GROUP-ORDER',aq:'GROUP-'+n,description:'Window'}));
 await op(warehouse,{action:'import',reference:'GROUP-TEST',name:'Group test',store:'073',items:parts});
 const rows=(await warehouseData(warehouse)).items.filter(i=>i.job_id===id),versions=rows.map(i=>({id:i.id,version:i.version}));
 const body={action:'receiveJob',jobId:id,bay:'G1',confirmed:true,versions,receivedIds:[rows[0].id,rows[1].id],missingIds:[rows[2].id],pendingIds:[],reason:''};
 await assert.rejects(()=>op(warehouse,body),/reason for the missing/);
 assert.ok((await warehouseData(warehouse)).items.filter(i=>i.job_id===id).every(i=>i.status==='Expected'));
 await assert.rejects(()=>op(installer,{...body,reason:'Not on truck'}),/permission/);
 await assert.rejects(()=>op(warehouse,{...body,missingIds:[],reason:''}),/Review every unscanned/);
 await assert.rejects(()=>op(warehouse,{...body,receivedIds:[rows[0].id,rows[0].id],reason:'Not on truck'}),/only one receiving decision/);
 await op(warehouse,{...body,reason:'Listed on manifest but not on truck'});
 const after=(await warehouseData(warehouse)).items.filter(i=>i.job_id===id);assert.equal(after.filter(i=>i.status==='Received').length,2);assert.equal(after.filter(i=>i.status==='Missing').length,1);
 const job=JSON.parse((await pg.query('SELECT payload FROM production.jobs WHERE id=$1',[id])).rows[0].payload);assert.equal(job.stage,'Ordered');assert.match(job.history[0].text,/not on truck/);
 const alerts=(await pg.query("SELECT recipient_id,message FROM production.notifications WHERE job_id=$1 AND message LIKE 'MISSING WINDOWS%'",[id])).rows;
 for(const member of [admin,pa,fs])assert.ok(alerts.some(a=>a.recipient_id===member.id&&a.message.includes('not on truck')));
 await assert.rejects(()=>op(warehouse,{...body,reason:'Repeat'}),/Inventory changed/);
 assert.equal((await pg.query("SELECT count(*)::int AS count FROM production.notifications WHERE job_id=$1 AND message LIKE 'MISSING WINDOWS%'",[id])).rows[0].count,alerts.length);
 const missing=after.find(i=>i.status==='Missing');await op(warehouse,{...body,versions:after.map(i=>({id:i.id,version:i.version})),receivedIds:[missing.id],missingIds:[],reason:''});
 assert.ok((await warehouseData(warehouse)).items.filter(i=>i.job_id===id).every(i=>i.status==='Received'));
});

test('scan group distinguishes later-delivery items from missing windows',async()=>{
 const {checkReceiveJob}=await vite.ssrLoadModule('/lib/warehouse-scan-session.ts');
 const rows=[{id:crypto.randomUUID(),version:1,status:'Expected'},{id:crypto.randomUUID(),version:1,status:'Expected'}],v={jobId:crypto.randomUUID(),bay:'A',confirmed:true,versions:rows.map(i=>({id:i.id,version:1})),receivedIds:[rows[0].id],missingIds:[],pendingIds:[rows[1].id],reason:''};
 assert.doesNotThrow(()=>checkReceiveJob(rows,v));assert.throws(()=>checkReceiveJob(rows,{...v,pendingIds:[crypto.randomUUID()]}),/selected job/);
 assert.doesNotThrow(()=>checkReceiveJob(rows,{...v,bay:'',receivedIds:[],missingIds:rows.map(i=>i.id),pendingIds:[],reason:'Entire delivery absent'}));
});
