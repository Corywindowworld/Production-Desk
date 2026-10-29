import {actor,sameOrigin,apiError} from '@/lib/access';
import {batchData,batchAction} from '@/lib/completion-batches';
import {ZodError} from 'zod';
export const maxDuration=60;
export async function GET(r:Request){try{const id=new URL(r.url).searchParams.get('id'),data:any=await batchData(await actor(r),id||undefined,new URL(r.url).searchParams.get('layout')==='current');return id?new Response(Buffer.from(data.pdf_base64,'base64'),{headers:{'Content-Type':'application/pdf','Content-Disposition':`${new URL(r.url).searchParams.get('view')==='print'?'inline':'attachment'}; filename="${data.filename}"`,'Cache-Control':'no-store'}}):Response.json(data,{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e)}}
export async function POST(r:Request){try{sameOrigin(r);return Response.json(await batchAction(await actor(r),await r.json()));}catch(e){if(e instanceof ZodError)return Response.json({error:'Select up to 20 jobs with approved paperwork.'},{status:400});return apiError(e)}}
