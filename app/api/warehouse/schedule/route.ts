import {actor,apiError} from '@/lib/access';
import {warehouseScheduleData} from '@/lib/warehouse-schedule';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const m=await actor(request),url=new URL(request.url);return Response.json(await warehouseScheduleData(m,{from:url.searchParams.get('from')||undefined,to:url.searchParams.get('to')||undefined}),{headers:{'Cache-Control':'no-store'}});}catch(e){if(e instanceof ZodError)return Response.json({error:'Choose valid schedule dates.'},{status:400});return apiError(e);}}
