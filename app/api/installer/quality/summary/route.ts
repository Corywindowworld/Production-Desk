import {actor,ApiError,apiError} from '@/lib/access';
import {database} from '@/db/raw';
export async function GET(request:Request){try{
 const m=await actor(request);if(!['admin','supervisor'].includes(m.role))throw new ApiError(403,'Field supervisor or administrator access required.');
 const row:any=await database().prepare("SELECT count(*)::integer AS total,count(*) FILTER (WHERE quality_score BETWEEN 0 AND 4)::integer AS rated,round(avg(quality_score) FILTER (WHERE quality_score BETWEEN 0 AND 4),2) AS average FROM members WHERE role='installer' AND active=1").first();
 return Response.json({total:row.total,rated:row.rated,average:row.average===null?null:Number(row.average)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
