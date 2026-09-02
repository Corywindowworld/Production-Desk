import {database} from '@/db/raw';
import {ApiError,isOffice,type Member} from '@/lib/access';

export function canVisitJob(member:Member,job:any){
 return isOffice(member)||(member.role==='supervisor'&&(job.supervisorId===member.id||!!job.install));
}
export async function visitJobFor(member:Member,id:string){
 const row:any=await database().prepare('SELECT payload,version FROM jobs WHERE id=?').bind(id).first();
 if(!row)throw new ApiError(404,'Job not found.');
 const job={...JSON.parse(row.payload),version:row.version};
 if(!canVisitJob(member,job))throw new ApiError(403,'Choose a scheduled job or a job assigned to you.');
 return job;
}
