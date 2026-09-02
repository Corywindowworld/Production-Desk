import {env} from '@/lib/server-env';
import {database} from '@/db/raw';
import {actor,apiError,sameOrigin,ApiError,isOffice} from '@/lib/access';
import {visitJobFor} from '@/lib/job-visit-access';
import {visitSchema} from '@/lib/job-visits';

export async function GET(request:Request){
 try{
  const m=await actor(request);
  if(!isOffice(m)&&m.role!=='supervisor')throw new ApiError(403,'Job visits are available to supervisors and office staff.');
  const jobId=new URL(request.url).searchParams.get('jobId')||'';
  await visitJobFor(m,jobId);
  const rows=await database().prepare('SELECT payload FROM job_visits WHERE job_id=? ORDER BY created DESC').bind(jobId).all();
  return Response.json({visits:rows.results.map((r:any)=>JSON.parse(r.payload)),canCreate:m.role==='supervisor'||m.role==='admin'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}
}
export async function POST(request:Request){
 try{
  sameOrigin(request);const m=await actor(request);
  if(m.role!=='supervisor'&&m.role!=='admin')throw new ApiError(403,'Only field supervisors and administrators can record job visits.');
  const text=await request.text();if(text.length>40000)throw new ApiError(400,'The visit is too large. Shorten your notes.');
  let body;try{body=JSON.parse(text)}catch{throw new ApiError(400,'Invalid visit form.')}
  const parsed=visitSchema.safeParse(body);
  if(!parsed.success)throw new ApiError(400,'Choose a valid visit date and an answer for every check. Attach up to 20 photos.');
  const v=parsed.data,db=database(),job=await visitJobFor(m,v.jobId);
  const previous:any=await db.prepare('SELECT job_id,supervisor_id,payload FROM job_visits WHERE id=?').bind(v.id).first();
  if(previous){if(previous.job_id!==v.jobId||previous.supervisor_id!==m.id)throw new ApiError(409,'This visit identifier is already in use.');return Response.json({visit:JSON.parse(previous.payload)});}
  const keys=new Set<string>();
  for(const photo of v.photos){
   if(!photo.key.startsWith(`jobs/${v.jobId}/visit/`)||keys.has(photo.key))throw new ApiError(400,'Choose distinct photos uploaded for this visit.');
   keys.add(photo.key);const file=await env.BUCKET.head(photo.key);
   if(!file||file.customMetadata?.jobId!==v.jobId||file.customMetadata?.kind!=='visit'||file.customMetadata?.uploadedBy!==m.id||!file.httpMetadata?.contentType?.startsWith('image/'))throw new ApiError(400,'A visit photo is unavailable. Upload it again.');
  }
  const at=new Date().toISOString(),visit={...v,supervisorId:m.id,supervisorName:m.name,submittedAt:at};
  const result=await db.prepare('INSERT INTO job_visits (id,job_id,supervisor_id,payload,created) SELECT ?,?,?,?,? FROM jobs WHERE id=? AND version=? ON CONFLICT DO NOTHING').bind(v.id,v.jobId,m.id,JSON.stringify(visit),at,v.jobId,job.version).run();
  if(!result.meta.changes){const saved:any=await db.prepare('SELECT payload,job_id,supervisor_id FROM job_visits WHERE id=?').bind(v.id).first();if(saved&&saved.job_id===v.jobId&&saved.supervisor_id===m.id)return Response.json({visit:JSON.parse(saved.payload)});throw new ApiError(409,'This job changed while saving. Reopen the job and try again.');}
  return Response.json({visit});
 }catch(e){return apiError(e)}
}
