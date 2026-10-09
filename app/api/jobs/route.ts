import {deliverPush} from '@/lib/push';
import {actor,apiError,canSeeJob,isOffice,jobFor,ApiError,canEditJob,canCreateJobs,hasJobEditPermission} from '@/lib/access';
import { env } from '@/lib/server-env';
import { database } from '@/db/raw';
import { jobSchema as schema, normalizeJob, transitionError, incompleteSince, nextIncompleteSince } from '@/lib/job-workflow';
export async function GET(request:Request){try{const member=await actor(request);if(member.role==='installer')throw new ApiError(403,'Use the installer app.');const r=await database().prepare('SELECT payload, version FROM jobs ORDER BY updated DESC').all();return Response.json({jobs:r.results.map((r:any)=>(() => {const job=normalizeJob(JSON.parse(r.payload));return {...job,incompleteSince:incompleteSince(job),version:r.version,canEdit:canEditJob(member,job),canReassign:isOffice(member)};})()).filter((j:any)=>canSeeJob(member,j)),canCreateJobs:canCreateJobs(member)},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
// The old generic write endpoint could bypass paid scheduling and report approvals.
export async function POST(request:Request){try{await actor(request);return Response.json({error:'This editor has been replaced. Refresh and use the live job file.'},{status:410})}catch(e){return apiError(e)}}
