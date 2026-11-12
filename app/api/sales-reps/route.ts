import {actor,apiError,sameOrigin,ApiError} from '@/lib/access';
import {salesRepData,saveSalesRep} from '@/lib/sales-reps';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await salesRepData(await actor(request)),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request),body=await request.text();if(body.length>5000)throw new ApiError(413,'Sales rep details are too long.');return Response.json(await saveSalesRep(m,JSON.parse(body)),{headers:{'Cache-Control':'no-store'}});}catch(e){if(e instanceof ZodError)return Response.json({error:e.issues[0]?.message||'Check the sales rep details.'},{status:400});if(e instanceof SyntaxError)return Response.json({error:'The request could not be read.'},{status:400});return apiError(e);}}
