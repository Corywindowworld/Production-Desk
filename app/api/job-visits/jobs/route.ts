import {database} from '@/db/raw';
import {actor,apiError,ApiError,isOffice,canEditJob} from '@/lib/access';

export async function GET(request:Request){
 try{
  const member=await actor(request);
  if(member.role!=='supervisor'&&!isOffice(member))throw new ApiError(403,'Supervisor or office access required.');
  const rows=await database().prepare("SELECT payload FROM jobs WHERE COALESCE((payload::jsonb->>'install'),'')<>'' ORDER BY (payload::jsonb->>'install') DESC").all();
  const jobs=rows.results.map((r:any)=>{
   const j=JSON.parse(r.payload);
   return {canEdit:canEditJob(member,j),id:j.id,number:j.number,customer:j.customer,address:j.address,phone:j.phone,install:j.install,crew:j.crew,supervisor:j.supervisor,specialNotes:j.specialNotes,stage:j.stage};
  });
  return Response.json({jobs},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}
}
