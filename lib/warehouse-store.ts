import {database} from '@/db/raw';
import {ApiError,Member,canSeeJob} from './access';
import {storedObject} from './stored-data';
import {warehouseManagers,warehouseViewers,warehouseItemSchema,warehouseTransition,splitWarehousePO,normalizeWarehouseBarcode} from './warehouse';
import {localDay,receiveItemsSchema,allowedMaterials} from './operations';
import {z} from 'zod';
const allowed=(ok:boolean,message='You do not have permission for this warehouse action.',status=403)=>{if(!ok)throw new ApiError(status,message)};
export async function warehouseData(m:Member){
 allowed(warehouseViewers.includes(m.role));const db=database();
 const jobs=(await db.prepare('SELECT payload FROM jobs').all()).results.map(r=>storedObject(r.payload));
 const accessible=jobs.filter(j=>canSeeJob(m,j));
 const items=(await db.prepare('SELECT * FROM production.warehouse_items ORDER BY updated DESC,id').all()).results.filter(i=>m.role!=='installer'||accessible.some(j=>j.id===i.job_id));
 const ids=new Set(items.map(i=>i.id));
 const events=(await db.prepare('SELECT * FROM production.warehouse_events ORDER BY created DESC,id').all()).results.filter(e=>ids.has(e.item_id));
 return {me:{id:m.id,name:m.name,email:m.email,role:m.role},items,events,shipments:m.role==='installer'?[]:(await db.prepare('SELECT id,reference,name,store,created FROM production.warehouse_shipments ORDER BY created DESC').all()).results,jobs:(m.role==='warehouse'?jobs:accessible).map(j=>({id:j.id,number:j.number,customer:j.customer,stage:j.stage})),canManage:warehouseManagers.includes(m.role)};
}
export async function warehouseOperation(m:Member,input:any){
 allowed(warehouseViewers.includes(m.role));const manage=warehouseManagers.includes(m.role),at=new Date().toISOString(),db=database();
 const action=String(input.action||'');
 if(action==='import'){
  allowed(manage);const v=z.object({reference:z.string().trim().min(1).max(150),name:z.string().trim().min(1).max(180),store:z.string().regex(/^\d+$/).max(10),sourceText:z.string().max(500000).default(''),items:z.array(warehouseItemSchema).min(1).max(5000)}).parse(input);
  allowed(new Set(v.items.map(i=>i.externalId)).size===v.items.length,'Duplicate item IDs in this import.',400);
  allowed(v.items.every(i=>splitWarehousePO(i.po).store===v.store),'Some PO store numbers differ from this shipment. Separate those items before importing.',400);
  return db.transaction(async tx=>{
   await tx.prepare('SELECT pg_advisory_xact_lock(820261020)').first();
   // Serialize shipment imports so re-uploading a manifest cannot create duplicate units.
   await tx.prepare('SELECT pg_advisory_xact_lock(820261020)').first();
   let shipment=await tx.prepare('SELECT * FROM production.warehouse_shipments WHERE reference=?').bind(v.reference).first();
   if(shipment)allowed(shipment.store===v.store,'This reference belongs to another store.',409);
   const id=shipment?.id||crypto.randomUUID();
   if(!shipment)await tx.prepare('INSERT INTO production.warehouse_shipments(id,reference,name,store,created,created_by,source_text) VALUES(?,?,?,?,?,?,?)').bind(id,v.reference,v.name,v.store,at,m.id,v.sourceText).run();
   const jobs=(await tx.prepare('SELECT id,payload FROM jobs').all()).results.map(r=>({id:r.id,...storedObject(r.payload)}));let added=0,skipped=0;
   for(const i of v.items){const old=await tx.prepare('SELECT * FROM production.warehouse_items WHERE external_id=?').bind(i.externalId).first(),po=splitWarehousePO(i.po);
    if(old){allowed(old.store===po.store&&old.cid===po.cid&&old.manufacturer_order===i.order&&old.aq===i.aq&&old.po===i.po,'An item ID already exists with different account/order information. Review the manifest.',409);skipped++;continue;}
    const matches=jobs.filter((j:any)=>String(j.number)===po.cid&&String(j.storeNumber||'073')===po.store),jobId=matches.length===1?matches[0].id:null;
    const itemId=crypto.randomUUID();await tx.prepare('INSERT INTO production.warehouse_items(id,shipment_id,external_id,job_id,cid,store,po,manufacturer_order,aq,description,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(itemId,id,i.externalId,jobId,po.cid,po.store,i.po,i.order,i.aq,i.description,at).run();
    await tx.prepare('INSERT INTO production.warehouse_events(id,item_id,actor_id,actor_name,action,reason,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),itemId,m.id,m.name,'Imported','Expected from manifest; not physically received',at).run();added++;
   }return {added,skipped};
  });
 }
 if(action==='unlistedReturn'){
  allowed(manage||m.role==='installer');const v=z.object({jobId:z.string().uuid(),barcode:z.string().trim().min(1).max(180),order:z.string().trim().min(1).max(100),aq:z.string().trim().min(1).max(100),reason:z.string().trim().min(1).max(2000),photoKey:z.string().min(1).max(250)}).parse(input);
  return db.transaction(async tx=>{
   await tx.prepare('SELECT pg_advisory_xact_lock(820261020)').first();
   await tx.prepare('SELECT pg_advisory_xact_lock(820261020)').first();const row=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(v.jobId).first();allowed(!!row,'Job not found.',404);const job=storedObject(row.payload);allowed(manage||canSeeJob(m,job));
   const code=normalizeWarehouseBarcode(v.barcode);allowed(!(await tx.prepare('SELECT id FROM production.warehouse_items WHERE external_id=? OR barcode=?').bind(code,code).first()),'This barcode is already in inventory. Find that item and submit its return.',409);
   const photo=await tx.prepare("SELECT key FROM attachment_uploads WHERE key=? AND job_id=? AND member_id=? AND status='ready' AND kind='warehouse'").bind(v.photoKey,v.jobId,m.id).first();allowed(!!photo,'Upload a return photo for this job.',400);
   const ref='UNLISTED-RETURNS',existing=await tx.prepare('SELECT id FROM production.warehouse_shipments WHERE reference=?').bind(ref).first(),shipment=existing?.id||crypto.randomUUID(),store=String(job.storeNumber||'073');
   if(!existing)await tx.prepare('INSERT INTO production.warehouse_shipments(id,reference,name,store,created,created_by,source_text) VALUES(?,?,?,?,?,?,?)').bind(shipment,ref,'Returns not on imported manifests','multiple',at,m.id,'').run();
   const id=crypto.randomUUID();await tx.prepare("INSERT INTO production.warehouse_items(id,shipment_id,external_id,job_id,cid,store,po,manufacturer_order,aq,description,status,barcode,updated) VALUES(?,?,?,?,?,?,?,?,?,?,'Return Pending',?,?)").bind(id,shipment,code,v.jobId,String(job.number),store,store+'-'+job.number,v.order,v.aq,'Unlisted return — warehouse must check label and account before accepting.',code,at).run();
   await tx.prepare('INSERT INTO production.warehouse_events(id,item_id,actor_id,actor_name,action,reason,photo_key,created) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,m.id,m.name,'return',v.reason,v.photoKey,at).run();
   const message='Unlisted return pending warehouse review: '+code+' · '+v.reason;job.history=[{at,by:m.name,text:message},...(job.history||[])];await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job),at,job.id).run();
   const recipients=(await tx.prepare("SELECT id FROM members WHERE active=1 AND role IN ('admin','office','production_assistant','warehouse')").all()).results;for(const r of recipients)await tx.prepare('INSERT INTO notifications(id,recipient_id,job_id,message,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),r.id,job.id,message,at).run();return {ok:true};
  });
 }
 if(action==='ready'){
  allowed(manage);const v=z.object({jobId:z.string().uuid(),confirmed:z.literal(true),version:z.number().int().optional(),...receiveItemsSchema.shape}).parse(input);
  return db.transaction(async tx=>{
   await tx.prepare('SELECT pg_advisory_xact_lock(820261020)').first();
   const row=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(v.jobId).first();allowed(!!row,'Job not found.',404);const job=storedObject(row.payload);
   const items=(await tx.prepare('SELECT status,bay FROM production.warehouse_items WHERE job_id=? FOR UPDATE').bind(v.jobId).all()).results;
   allowed(items.length>0&&items.every(i=>i.status==='Received'&&!!i.bay),'Every expected item must be received, usable and assigned a bay.',409);
   allowed(job.stage==='Ordered','Only an ORD job can be marked received here. Other job statuses are preserved.',409);
   allowed(v.received<=localDay(),'Received date cannot be in the future.',400);
   allowed(v.materials.every(i=>allowedMaterials(job.product||'Windows').includes(i.materialType)),'Product types must match this account.',400);
   job.materials=v.materials;job.received=v.received;job.stage='Received';job.bay=v.materials[0].bay;job.brand=v.materials[0].brand;job.materialType=v.materials[0].materialType;
   job.history=[{at,by:m.name,text:'Warehouse confirmed all required products received and usable; marked RCVD'},...(job.history||[])];
   await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job),at,v.jobId).run();return {ok:true};
  });
 }
 const v=z.object({id:z.string().uuid(),version:z.number().int().positive(),reason:z.string().trim().max(2000).default(''),bay:z.string().trim().max(100).default(''),barcode:z.string().trim().max(180).default(''),photoKey:z.string().max(250).default(''),jobId:z.string().uuid().optional()}).parse(input);
 return db.transaction(async tx=>{
   await tx.prepare('SELECT pg_advisory_xact_lock(820261020)').first();
  const item=await tx.prepare('SELECT * FROM production.warehouse_items WHERE id=? FOR UPDATE').bind(v.id).first();allowed(!!item,'Item not found.',404);allowed(item.version===v.version,'This item changed. Refresh before saving.',409);
  let job:any=null;if(item.job_id){const row=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(item.job_id).first();job=row?storedObject(row.payload):null;}
  if(!manage)allowed(action==='return'&&m.role==='installer'&&!!job&&canSeeJob(m,job));
  let status=item.status,bay=item.bay,barcode=item.barcode,jobId=item.job_id;
  if(action==='link'){
   allowed(manage);allowed(!!v.jobId,'Select a matching customer account.',400);
   const target=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(v.jobId).first();allowed(!!target,'Job not found.',404);const j=storedObject(target.payload);allowed(String(j.number)===item.cid&&String(j.storeNumber||'073')===item.store,'The store and customer ID must match the PO customer ID.',400);allowed(!item.job_id,'This item already has an account. Contact Admin to correct the source record.',409);jobId=v.jobId;
  }else if(action==='barcode'){
   allowed(manage);allowed(!!v.barcode,'Scan or enter the barcode.',400);const other=await tx.prepare('SELECT id FROM production.warehouse_items WHERE barcode=? OR external_id=?').bind(normalizeWarehouseBarcode(v.barcode),normalizeWarehouseBarcode(v.barcode)).first();allowed(!other||other.id===item.id,'That barcode already identifies a different item.',409);barcode=normalizeWarehouseBarcode(v.barcode);
  }else if(action==='bay'){
   allowed(manage);allowed(!!v.bay&&!!v.reason,'Enter a bay and a reason for the correction.',400);bay=v.bay;
  }else{
   try{status=warehouseTransition(item.status,action)}catch(e){throw new ApiError(409,(e as Error).message)}
   if(['damage','missing','return'].includes(action))allowed(!!v.reason,'Enter the reason.',400);
   if(['receive','confirmReturn'].includes(action)){allowed(manage);allowed(!!v.bay,'Enter the physical bay location.',400);bay=v.bay;}
   if(action==='return'&&m.role==='installer')allowed(!!v.photoKey,'Add a photo before submitting a return.',400);
  }
  if(v.photoKey){allowed(!!item.job_id,'Link the item to a customer before attaching photos.',400);const photo=await tx.prepare("SELECT key FROM attachment_uploads WHERE key=? AND job_id=? AND member_id=? AND status='ready' AND kind='warehouse'").bind(v.photoKey,item.job_id,m.id).first();allowed(!!photo,'Upload a valid return photo for this job.',400);}
  await tx.prepare('UPDATE production.warehouse_items SET status=?,bay=?,barcode=?,job_id=?,version=version+1,updated=? WHERE id=?').bind(status,bay,barcode,jobId,at,v.id).run();
  await tx.prepare('INSERT INTO production.warehouse_events(id,item_id,actor_id,actor_name,action,reason,photo_key,created) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),v.id,m.id,m.name,action,v.reason+(v.bay?' · Bay '+v.bay:''),v.photoKey||null,at).run();
  if(job){const message=`Warehouse ${action}: ${item.external_id} · ${status}${v.reason?' · '+v.reason:''}${bay?' · Bay '+bay:''}`;job.history=[{at,by:m.name,text:message},...(job.history||[])];await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job),at,job.id).run();
   if(['damage','missing','return'].includes(action)){const recipients=(await tx.prepare("SELECT id FROM members WHERE active=1 AND role IN ('admin','office','production_assistant','warehouse')").all()).results;const ids=new Set(recipients.map(r=>r.id));if(job.supervisorId)ids.add(job.supervisorId);for(const id of ids)await tx.prepare('INSERT INTO notifications(id,recipient_id,job_id,message,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,job.id,message,at).run();}
  }return {ok:true};
 });
}
