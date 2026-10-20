import {requireLocation} from '@/lib/location-store';
import {actor,apiError,sameOrigin,ApiError} from '@/lib/access';
import {warehouseData,warehouseOperation} from '@/lib/warehouse-store';
import {database} from '@/db/raw';
import {setupWarehouseDatabase} from '@/lib/warehouse-schema';
import {ZodError} from 'zod';
export const runtime='nodejs';
export async function GET(request:Request){let m;try{m=await actor(request);await requireLocation(request,m);return Response.json(await warehouseData(m),{headers:{'Cache-Control':'no-store'}})}catch(e){if((e as any)?.code==='42P01')return Response.json({error:'Warehouse database setup is required. An Admin can complete setup here.',setupRequired:m?.role==='admin'},{status:503});return apiError(e)}}
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request);await requireLocation(request,m);const text=await request.text();if(text.length>2000000)throw new ApiError(413,'Import a smaller shipment.');const input=JSON.parse(text);if(input.action==='setup'){if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');await setupWarehouseDatabase(database());return Response.json({ok:true});}return Response.json(await warehouseOperation(m,input),{headers:{'Cache-Control':'no-store'}})}catch(e){if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'Check the entered values and try again.'},{status:400});return apiError(e)}}
