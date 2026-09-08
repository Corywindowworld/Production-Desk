import {actor,apiError,ApiError,sameOrigin} from '@/lib/access';
import {database} from '@/db/raw';
import {qualityInput} from '@/lib/installer-quality';
export async function GET(request:Request){try{
 const m=await actor(request),db=database();
 if(!['installer','supervisor','admin'].includes(m.role))throw new ApiError(403,'Installer or field supervisor access required.');
 const rows=await db.prepare("SELECT id,name,quality_score,quality_updated_at FROM members WHERE role='installer' AND active=1 AND "+(m.role==='installer'?'id=?':'supervisor_id=?')+' ORDER BY name').bind(m.id).all();
 return Response.json({installers:rows.results.map((row:any)=>({...row,quality_score:row.quality_score===null?null:Number(row.quality_score)}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
export async function POST(request:Request){try{
 sameOrigin(request);const m=await actor(request);
 if(!['supervisor','admin'].includes(m.role))throw new ApiError(403,'Only the assigned field supervisor can set a quality score.');
 const parsed=qualityInput.safeParse(await request.json());if(!parsed.success)throw new ApiError(400,'Enter a score from 0 to 100 with up to two decimal places.');
 const {id,score}=parsed.data,at=new Date().toISOString();
 // Permission and update occur in one statement, including its audit record.
 const result=await database().prepare("WITH changed AS (UPDATE members SET quality_score=?,quality_updated_at=?,quality_updated_by=? WHERE id=? AND role='installer' AND active=1 AND supervisor_id=? RETURNING id), audited AS (INSERT INTO account_audit (id,actor_id,member_id,action,created) SELECT ?,?,id,?,? FROM changed RETURNING member_id) SELECT member_id FROM audited").bind(score,at,m.id,id,m.id,crypto.randomUUID(),m.id,'Installer quality score set to '+score.toFixed(2),at).first();
 if(!result)throw new ApiError(403,'You can only score installers assigned to you.');
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
