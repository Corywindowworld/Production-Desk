import {actor,apiError,ApiError,sameOrigin} from '@/lib/access';
import {database} from '@/db/raw';
import {qualityInput} from '@/lib/installer-quality';
export async function GET(request:Request){try{
 const m=await actor(request),db=database();
 if(!['installer','supervisor','admin'].includes(m.role))throw new ApiError(403,'Installer or field supervisor access required.');
 const canScoreAll=m.role==='admin'||(m.role==='supervisor'&&m.can_score_all_installers===1);
 const statement=db.prepare("SELECT id,name,supervisor_id,quality_score,quality_updated_at FROM members WHERE role='installer' AND active=1"+(m.role==='installer'?' AND id=?':'')+' ORDER BY name');
 const rows=await (m.role==='installer'?statement.bind(m.id):statement).all();
 return Response.json({canScoreAll,installers:rows.results.map((row:any)=>({...row,canEdit:canScoreAll||(m.role==='supervisor'&&row.supervisor_id===m.id),quality_score:row.quality_score===null?null:Number(row.quality_score)}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
export async function POST(request:Request){try{
 sameOrigin(request);const m=await actor(request);
 if(!['supervisor','admin'].includes(m.role))throw new ApiError(403,'Field supervisor or administrator access required.');
 const parsed=qualityInput.safeParse(await request.json());if(!parsed.success)throw new ApiError(400,'Enter a score from 0 to 4.00 with up to two decimal places.');
 const {id,score}=parsed.data,at=new Date().toISOString();
 const result=await database().prepare("WITH changed AS (UPDATE members AS target SET quality_score=?,quality_updated_at=?,quality_updated_by=? WHERE target.id=? AND target.role='installer' AND target.active=1 AND EXISTS (SELECT 1 FROM members AS writer WHERE writer.id=? AND writer.active=1 AND (writer.role='admin' OR (writer.role='supervisor' AND (writer.can_score_all_installers=1 OR target.supervisor_id=writer.id)))) RETURNING target.id), audited AS (INSERT INTO account_audit (id,actor_id,member_id,action,created) SELECT ?,?,id,?,? FROM changed RETURNING member_id) SELECT member_id FROM audited").bind(score,at,m.id,id,m.id,crypto.randomUUID(),m.id,'Installer quality score set to '+score.toFixed(2),at).first();
 if(!result)throw new ApiError(403,'You do not have permission to score this installer.');
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
