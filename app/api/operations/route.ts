import {actor,apiError,sameOrigin,ApiError,type DashboardStep} from '@/lib/access';
import {operationsData,operation,deliverOperationEmail} from '@/lib/operations-store';
import {database} from '@/db/raw';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){let step:DashboardStep='session';try{const member=await actor(request);const data=await operationsData(member,value=>{step=value});step='response';return Response.json(data,{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e,step)}}
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request),input=await request.json();if(input.action==='retryEmail'){if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');await deliverOperationEmail(String(input.id));}else await operation(m,input);return Response.json({ok:true})}catch(e){if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'Check the submitted values.'},{status:400});return apiError(e)}}
