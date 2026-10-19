import {actor,apiError,sameOrigin,ApiError} from '@/lib/access';
import {routingSettings,saveWarehouse,previewRoute,applyRoute} from '@/lib/routing/store';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await routingSettings(await actor(request)),{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request),raw=await request.text();if(raw.length>50000)throw new ApiError(413,'Routing request is too large.');const v=JSON.parse(raw);const result=v.action==='warehouse'?await saveWarehouse(m,v.values):v.action==='preview'?await previewRoute(m,v.values):v.action==='apply'?await applyRoute(m,v.id):null;if(!result)throw new ApiError(400,'Unknown routing action.');return Response.json(result,{headers:{'Cache-Control':'no-store'}})}catch(e){if(e instanceof ZodError)return Response.json({error:e.issues[0]?.message||'Check the routing fields.'},{status:400});if(e instanceof SyntaxError)return Response.json({error:'Invalid routing request.'},{status:400});return apiError(e)}}
