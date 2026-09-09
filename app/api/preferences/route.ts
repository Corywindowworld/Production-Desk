import {actor,apiError,ApiError,sameOrigin} from '@/lib/access';
import {database} from '@/db/raw';
import {z} from 'zod';
export async function GET(request:Request){try{const m=await actor(request);const row:any=await database().prepare('SELECT theme FROM members WHERE id=?').bind(m.id).first();return Response.json({theme:row?.theme||'light'},{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{sameOrigin(request);const m=await actor(request);const parsed=z.object({theme:z.enum(['light','dark','gators','fsu','mexico','brazil','cuba','usa'])}).strict().safeParse(await request.json());if(!parsed.success)throw new ApiError(400,'Choose a theme from Appearance.');await database().prepare('UPDATE members SET theme=? WHERE id=?').bind(parsed.data.theme,m.id).run();return Response.json({theme:parsed.data.theme},{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
