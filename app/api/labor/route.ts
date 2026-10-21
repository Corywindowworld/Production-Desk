import {actor,sameOrigin,apiError,ApiError,jobFor} from '@/lib/access';
import {requireLocation} from '@/lib/location-store';
import {laborAction} from '@/lib/labor-store';
import {ZodError} from 'zod';
export async function POST(r:Request){try{sameOrigin(r);const m=await actor(r);await requireLocation(r,m);return Response.json(await laborAction(m,await r.json()));}catch(e){if(e instanceof ZodError)return Response.json({error:e.issues[0].message},{status:400});return apiError(e)}}

import {paperworkPdf} from '@/lib/completion-batch-pdf';
export async function GET(r:Request){try{const m=await actor(r);await requireLocation(r,m);const u=new URL(r.url),j=await jobFor(m,u.searchParams.get('jobId')||''),s=j.operations?.laborSheets?.find((s:any)=>s.id===u.searchParams.get('sheetId')&&s.status==='Approved');if(!s)throw new ApiError(404,'Approved labor sheet not found.');return new Response(Buffer.from(await paperworkPdf(s.packetJob||j,s,'labor')),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename=approved-labor.pdf','Cache-Control':'no-store'}});}catch(e){return apiError(e)}}
