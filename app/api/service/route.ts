import {deliverPush} from '@/lib/push';
import {actor,apiError,sameOrigin,ApiError} from '@/lib/access';
import {serviceData,serviceAction} from '@/lib/service-store';
import {deliverOperationEmail} from '@/lib/operations-store';
import {ZodError} from 'zod';
import {after} from 'next/server';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(r:Request){try{return Response.json(await serviceData(await actor(r),new URL(r.url).searchParams),{headers:{'Cache-Control':'no-store'}})}catch(e){if(e instanceof ZodError)return Response.json({error:e.issues[0]?.message||'Check service dates.'},{status:400});return apiError(e)}}
export async function POST(r:Request){try{sameOrigin(r);const text=await r.text();if(text.length>600000)throw new ApiError(413,'The service form is too large.');const result=await serviceAction(await actor(r),JSON.parse(text));after(async()=>{if(result.emailId)await deliverOperationEmail(result.emailId);for(const id of result.pushIds)await deliverPush(id)});return Response.json(result,{headers:{'Cache-Control':'no-store'}})}catch(e){if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:e instanceof ZodError?e.issues[0]?.message:'Check service form values.'},{status:400});return apiError(e)}}
