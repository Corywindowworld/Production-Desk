import {database} from '@/db/raw';
import {actor,apiError,ApiError,isOffice} from '@/lib/access';
import {canVisitJob} from '@/lib/job-visit-access';
export async function GET(request:Request){try{const m=await actor(request);if(!isOffice(m)&&m.role!=='supervisor')throw new ApiError(403,'Office or supervisor access required.');const rows=await database().prepare('SELECT v.payload AS visit,j.payload AS job FROM job_visits v JOIN jobs j ON j.id=v.job_id ORDER BY v.created DESC').all();const visits=rows.results.map((r:any)=>({visit:JSON.parse(r.visit),job:JSON.parse(r.job)})).filter((r:any)=>canVisitJob(m,r.job));return Response.json({visits},{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
