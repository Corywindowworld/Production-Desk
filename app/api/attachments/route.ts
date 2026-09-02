import {actor,apiError,jobFor,sameOrigin,ApiError,canEditJob,type Member} from '@/lib/access';
import {visitJobFor} from '@/lib/job-visit-access';
import {database} from '@/db/raw';
import {storage,bucket} from '@/lib/storage';
import {uploadKinds,MAX_UPLOAD_BYTES,fileType} from '@/lib/upload-validation';
import {z} from 'zod';
export const runtime='nodejs';
export const maxDuration=60;
const beginSchema=z.object({action:z.literal('begin'),jobId:z.string().uuid(),kind:z.enum(uploadKinds),name:z.string().min(1).max(255),size:z.number().int().positive().max(MAX_UPLOAD_BYTES)});
const finishSchema=z.object({action:z.literal('finish'),key:z.string().max(250)});
async function uploadAccess(member:Member,jobId:string,kind:string){
 if(kind==='visit'&&member.role!=='supervisor'&&member.role!=='admin')throw new ApiError(403,'Only supervisors and administrators can upload visit photos.');
 const job=kind==='visit'?await visitJobFor(member,jobId):await jobFor(member,jobId);
 if(kind!=='visit'&&member.role!=='installer'&&!canEditJob(member,job))throw new ApiError(403,'You do not have permission to update job attachments.');
 if(member.role==='installer'&&job.stage!=='Production')throw new ApiError(400,'This job is not in Production.');
}
export async function POST(request:Request){try{
 sameOrigin(request);const member=await actor(request),db=database();
 const text=await request.text();if(text.length>4000)throw new ApiError(400,'Invalid upload request.');
 const parsed=z.union([beginSchema,finishSchema]).safeParse(JSON.parse(text));if(!parsed.success)throw new ApiError(400,'Choose a nonempty job photo or document up to 15 MB.');
 const input=parsed.data;
 if(input.action==='begin'){
  await uploadAccess(member,input.jobId,input.kind);
  const pending=await db.prepare("SELECT count(*)::integer AS count FROM attachment_uploads WHERE member_id=? AND status='pending' AND expires>?").bind(member.id,Date.now()).first();
  if(pending.count>=100)throw new ApiError(429,'Too many unfinished uploads. Try again later.');
  const key=`jobs/${input.jobId}/${input.kind}/${crypto.randomUUID()}`,stagingKey='pending/'+crypto.randomUUID();
  await db.prepare('INSERT INTO attachment_uploads (key,staging_key,job_id,kind,member_id,name,expires) VALUES (?,?,?,?,?,?,?)').bind(key,stagingKey,input.jobId,input.kind,member.id,input.name,Date.now()+2*3600000).run();
  const {data,error}=await storage().createSignedUploadUrl(stagingKey,{upsert:false});if(error||!data)throw new Error('Unable to prepare upload');
  return Response.json({key,uploadUrl:data.signedUrl},{headers:{'Cache-Control':'no-store'}});
 }
 const row=await db.prepare('SELECT * FROM attachment_uploads WHERE key=? AND member_id=?').bind(input.key,member.id).first();
 if(!row)throw new ApiError(404,'Upload not found.');
 await uploadAccess(member,row.job_id,row.kind);
 if(row.status==='ready')return Response.json({attachment:{key:row.key,kind:row.kind,name:row.name}});
 if(Number(row.expires)<Date.now())throw new ApiError(410,'Upload expired. Select the file again.');
 const {data,error}=await storage().download(row.staging_key);if(error||!data)throw new ApiError(400,'Upload the file before saving.');
 if(!data.size||data.size>MAX_UPLOAD_BYTES)throw new ApiError(400,'Choose a nonempty file up to 15 MB.');
 const bytes=new Uint8Array(await data.arrayBuffer()),type=fileType(bytes,row.kind);if(!type)throw new ApiError(400,'Upload a JPG, PNG, WebP, GIF, or HEIC image. Paperwork may also be a PDF.');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
 // Publish verified bytes at an immutable path that no upload token can overwrite.
 const uploaded=await storage().upload(row.key,bytes,{contentType:type,upsert:false,cacheControl:'0'});
 if(uploaded.error){
  const final=await storage().download(row.key);if(final.error||!final.data)throw uploaded.error;
  const existing=new Uint8Array(await final.data.arrayBuffer());
  const existingSha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',existing))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(existingSha!==sha)throw new ApiError(409,'Upload changed. Select the file again.');
 }
 await db.prepare("UPDATE attachment_uploads SET status='ready',content_type=?,sha256=?,size_bytes=? WHERE key=? AND member_id=?").bind(type,sha,bytes.length,row.key,member.id).run();
 await storage().remove([row.staging_key]);
 return Response.json({attachment:{key:row.key,kind:row.kind,name:row.name}},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e)}}
export async function GET(request:Request){try{
 const member=await actor(request),key=new URL(request.url).searchParams.get('key')||'';
 if(!/^jobs\/[0-9a-f-]+\/(completion|incomplete|reorder|photos|front|rear|left|right|issue|visit)\/[0-9a-f-]+$/.test(key))throw new ApiError(404,'File not found.');
 if(key.split('/')[2]==='visit'&&member.role==='installer')throw new ApiError(403,'Visit photos are available to supervisors and office staff.');
 if(key.split('/')[2]==='visit')await visitJobFor(member,key.split('/')[1]);else await jobFor(member,key.split('/')[1]);
 if(!await bucket.head(key))throw new ApiError(404,'File not found.');
 const {data,error}=await storage().createSignedUrl(key,60);if(error||!data)throw new ApiError(404,'File not found.');
 return new Response(null,{status:302,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}catch(e){return apiError(e)}}
