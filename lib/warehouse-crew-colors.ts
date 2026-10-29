import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {storedObject} from './stored-data';
import {z} from 'zod';
const roles=['warehouse','admin','supervisor','office','production_assistant'];
export function requireWarehouseCalendar(m:Member){if(!roles.includes(m.role))throw new ApiError(403,'Warehouse schedule access required.');}
export async function warehouseCrewColors(m:Member){
 requireWarehouseCalendar(m);const db=database(),team=(await db.prepare("SELECT id,name FROM members WHERE role='installer' AND active=1 ORDER BY name,id").all()).results;
 const row=await db.prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(`crew-colors:${m.id}`).first();
 const saved=row?storedObject(row.payload):{},palette=['#2879c8','#ba4138','#318254','#8054ab','#b47719','#167f86','#b3447a','#6d6634'];
 const colors:Record<string,string>={};team.forEach((crew:any,i:number)=>{colors[crew.id]=typeof saved[crew.id]==='string'&&/^#[0-9a-f]{6}$/i.test(saved[crew.id])?saved[crew.id]:palette[i%palette.length];});
 return {team,crewColors:colors};
}
export async function saveWarehouseCrewColors(m:Member,input:unknown){
 requireWarehouseCalendar(m);const colors=z.record(z.string().max(100),z.string().regex(/^#[0-9a-f]{6}$/i)).parse(input),{team}=await warehouseCrewColors(m);
 if(Object.keys(colors).some(id=>!team.some((c:any)=>c.id===id)))throw new ApiError(400,'Crew colors may only be assigned to active installers.');
 await database().prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated=EXCLUDED.updated').bind(`crew-colors:${m.id}`,JSON.stringify(colors),m.id,new Date().toISOString()).run();
 return {ok:true};
}
