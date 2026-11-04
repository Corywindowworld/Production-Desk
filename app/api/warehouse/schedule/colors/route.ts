import {actor,apiError,sameOrigin} from '@/lib/access';
import {saveWarehouseCrewColors} from '@/lib/warehouse-crew-colors';
import {ZodError} from 'zod';
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request),text=await request.text();if(text.length>20000)return Response.json({error:'Too many crew colors.'},{status:413});return Response.json(await saveWarehouseCrewColors(m,JSON.parse(text)),{headers:{'Cache-Control':'no-store'}});}catch(e){if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'Choose valid crew colors.'},{status:400});return apiError(e);}}
