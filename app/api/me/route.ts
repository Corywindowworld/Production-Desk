import {actor,apiError} from '@/lib/access';
export async function GET(request:Request){try{return Response.json({member:await actor(request)},{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
