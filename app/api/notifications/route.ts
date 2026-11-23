import {actor,apiError,isOffice,sameOrigin,ApiError} from '@/lib/access';import {database} from '@/db/raw';import {deliverPush} from '@/lib/push';
import {unreadJobAlerts} from '@/lib/job-alerts';
export async function GET(request:Request){
 try {
  const member = await actor(request);
  const cutoff = new Date(Date.now()-86400000).toISOString();
  return Response.json({notifications:await unreadJobAlerts(member, cutoff)},{headers:{'Cache-Control':'no-store'}});
 } catch (error) { return apiError(error); }
}
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request);const {id,action,ids}=await request.json();if(action==='clearAll'){if(!Array.isArray(ids)||ids.length>100||!ids.every(v=>typeof v==='string'&&v.length<=100))throw new ApiError(400,'Invalid alert selection.');if(ids.length)await database().prepare('UPDATE notifications SET read_at=? WHERE read_at IS NULL AND id IN ('+ids.map(()=>'?').join(',')+')'+(m.role==='admin'?'':' AND recipient_id=?')).bind(new Date().toISOString(),...ids,...(m.role==='admin'?[]:[m.id])).run();return Response.json({ok:true})}const n:any=await database().prepare('SELECT * FROM notifications WHERE id=?').bind(String(id)).first();if(!n||(!isOffice(m)&&n.recipient_id!==m.id))throw new ApiError(403,'Notification unavailable.');if(action==='retry'){await deliverPush(n.id)}else{await database().prepare('UPDATE notifications SET read_at=? WHERE id=?').bind(new Date().toISOString(),n.id).run()}return Response.json({ok:true})}catch(e){return apiError(e)}}
