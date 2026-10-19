import {database} from '@/db/raw';
import {ApiError,hasJobEditPermission,type Member} from '@/lib/access';
import {storedObject} from '@/lib/stored-data';
import {crewStops} from './stops';
import {date} from '@/lib/operations';
import {addressKey} from './address';
import {drivingMatrix} from './providers';
import {optimizeRoute} from './optimizer';
import {z} from 'zod';
const point = z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)});
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const minutes = (s:string) => Number(s.slice(0,2))*60+Number(s.slice(3));
export const warehouseSchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(100),address:z.string().trim().min(5).max(300),latitude:point.shape.latitude,longitude:point.shape.longitude,start:clock,end:clock,loadingMinutes:z.number().int().min(0).max(180),returnToWarehouse:z.boolean(),travelFactor:z.number().min(1).max(3)}).refine(v=>minutes(v.end)>minutes(v.start),'Working day must finish after it starts.');
function access(m:Member){if(!hasJobEditPermission(m)||m.role==='installer')throw new ApiError(403,'Job scheduling permission required.');}
export async function routingSettings(m:Member){access(m);const rows=await database().prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'routing-warehouse:%'").all();return {warehouses:rows.results.map((r:any)=>storedObject(r.payload)),routingConnected:!!(process.env.GEOAPIFY_API_KEY||process.env.OSRM_BASE_URL),addressConnected:!!(process.env.GEOAPIFY_API_KEY||process.env.PHOTON_BASE_URL),canConfigure:m.role==='admin'};}
export async function saveWarehouse(m:Member,input:unknown){if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');const v=warehouseSchema.parse(input),value={...v,id:v.id||crypto.randomUUID()};await database().prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind('routing-warehouse:'+value.id,JSON.stringify(value),m.id,new Date().toISOString()).run();return value;}
async function activeCrew(db:ReturnType<typeof database>,crewId:string,day:string){
 const crew=await db.prepare("SELECT id,name FROM members WHERE id=? AND role='installer' AND active=1 FOR UPDATE").bind(crewId).first();if(!crew)throw new ApiError(400,'Select an active crew.');
 const off=await db.prepare("SELECT payload FROM production.operations_config WHERE id LIKE 'day-off:%'").all();
 if(off.results.some((r:any)=>{const d=storedObject(r.payload);return d.installerId===crewId&&d.date===day&&d.off!==false}))throw new ApiError(409,'This crew is marked not working on that day.');
 return crew;
}
const previewSchema=z.object({warehouseId:z.string().uuid(),crewId:z.string().uuid(),day:date,stops:z.array(z.object({id:z.string().max(200),serviceMinutes:z.number().int().min(5).max(720),location:point.extend({addressKey:z.string().max(700)})})).min(1).max(8)});
export async function previewRoute(m:Member,input:unknown){
 access(m);const v=previewSchema.parse(input),db=database(),crew=await activeCrew(db,v.crewId,v.day);
 const row=await db.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind('routing-warehouse:'+v.warehouseId).first();if(!row)throw new ApiError(400,'Select a saved warehouse.');
 const warehouse=warehouseSchema.parse(storedObject(row.payload)),rows=await db.prepare('SELECT id,payload,version FROM jobs').all(),jobs:any[]=rows.results.map((r:any)=>({...storedObject(r.payload),id:r.id,version:r.version})),stops=crewStops(jobs,v.crewId,v.day);
 if(stops.length!==v.stops.length||new Set(v.stops.map(s=>s.id)).size!==stops.length||stops.some(s=>!v.stops.some(t=>t.id===s.id)))throw new ApiError(409,'The crew’s schedule changed. Refresh and include all scheduled stops.');
 const enriched=stops.map(s=>{const entry=v.stops.find(t=>t.id===s.id)!;if(entry.location.addressKey!==addressKey(s))throw new ApiError(400,'Confirm the map location for '+s.customer+' after editing the address.');return {...s,...entry};});
 const seconds=await drivingMatrix([warehouse,...enriched.map(s=>s.location)]);
 const options={start:minutes(warehouse.start),end:minutes(warehouse.end),loadingMinutes:warehouse.loadingMinutes,returnToWarehouse:warehouse.returnToWarehouse,travelFactor:warehouse.travelFactor};
 const constraints=enriched.map(s=>({id:s.id,serviceMinutes:s.serviceMinutes,windowStart:s.time?minutes(s.time):s.period==='PM'?720:0,windowEnd:s.time?minutes(s.time):s.period==='AM'?719:1439}));
 const result=optimizeRoute(constraints,seconds,options),plan={id:crypto.randomUUID(),createdBy:m.id,createdAt:new Date().toISOString(),expiresAt:Date.now()+30*60000,day:v.day,crewId:v.crewId,crewName:crew.name,warehouse,stops:enriched,result,appliedAt:null as string|null};
 if(result.optimized)await db.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?)').bind('route-plan:'+plan.id,JSON.stringify(plan),m.id,plan.createdAt).run();
 return plan;
}
export async function applyRoute(m:Member,id:string){
 access(m);if(!z.string().uuid().safeParse(id).success)throw new ApiError(400,'Invalid route preview.');const db=database();
 return db.transaction(async tx=>{
  const row=await tx.prepare('SELECT payload FROM production.operations_config WHERE id=? FOR UPDATE').bind('route-plan:'+id).first();if(!row)throw new ApiError(404,'Preview not found.');const plan=storedObject(row.payload);
  if(plan.appliedAt||plan.expiresAt<Date.now())throw new ApiError(409,'This preview was already applied or has expired. Generate a new preview.');
  if(plan.createdBy!==m.id&&m.role!=='admin')throw new ApiError(403,'Apply your own route preview.');
  const warehouseRow=await tx.prepare('SELECT payload FROM production.operations_config WHERE id=? FOR UPDATE').bind('routing-warehouse:'+plan.warehouse.id).first();
  if(!warehouseRow||JSON.stringify(warehouseSchema.parse(storedObject(warehouseRow.payload)))!==JSON.stringify(warehouseSchema.parse(plan.warehouse)))throw new ApiError(409,'Warehouse settings changed. Generate a new preview.');
  // Match scheduling lock order: affected jobs first, then the crew row.
  const ids=[...new Set<string>(plan.stops.map((s:any)=>s.jobId))].sort();
  await tx.prepare('SELECT id FROM jobs WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id FOR UPDATE').bind(...ids).all();
  await activeCrew(tx,plan.crewId,plan.day);
  const rows=await tx.prepare('SELECT id,payload,version FROM jobs').all(),jobs:any[]=rows.results.map((r:any)=>({...storedObject(r.payload),id:r.id,version:r.version})),current=crewStops(jobs,plan.crewId,plan.day);
  if(current.length!==plan.stops.length||current.some(s=>!plan.stops.some((p:any)=>p.id===s.id&&p.version===s.version)))throw new ApiError(409,'The schedule or a job changed after preview. Refresh and optimize again.');
  const changed=new Map<string,any>(),at=new Date().toISOString();
  for(const [index,visit] of plan.result.optimized.visits.entries()){
   const stop=plan.stops.find((s:any)=>s.id===visit.id),j=jobs.find(j=>j.id===stop.jobId)!;j.operations??={};j.operations.routing??={};j.operations.routing[plan.day]??={};
   j.operations.routing[plan.day][stop.kind]={stop:index+1,etaMinutes:visit.start,finishMinutes:visit.finish,serviceMinutes:stop.serviceMinutes,planId:id};
   if(stop.kind==='installation'&&(!j.installEnd||j.installEnd===j.install))j.stopNumber=index+1;
   else if(stop.kind!=='installation'){const service=j.operations.services.find((s:any)=>s.id===stop.kind);service.stop=index+1;}
   j.routingLocation=stop.location;
   if(!changed.has(j.id))j.history=[{at,by:m.name,text:'Optimized route applied for '+plan.day+'. Appointment dates, windows and crew assignment preserved.'},...(j.history||[])];
   changed.set(j.id,j);
  }
  for(const j of changed.values()){const {version,...payload}=j;await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(payload),at,j.id).run();}
  plan.appliedAt=at;await tx.prepare('UPDATE production.operations_config SET payload=?,updated_by=?,updated=? WHERE id=?').bind(JSON.stringify(plan),m.id,at,'route-plan:'+id).run();
  return {ok:true};
 });
}
