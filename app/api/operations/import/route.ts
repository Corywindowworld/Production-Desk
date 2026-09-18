import {actor,apiError,sameOrigin,ApiError} from '@/lib/access';
import {importGuild} from '@/lib/report-import-store';
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request);if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');const text=await request.text();if(text.length>1500000)throw new ApiError(400,'Report is too large. Import fewer pages.');return Response.json(await importGuild(m,JSON.parse(text)),{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
