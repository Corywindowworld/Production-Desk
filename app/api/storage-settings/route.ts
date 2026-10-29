import {actor,apiError,ApiError,sameOrigin} from '@/lib/access';
import {inspectStorage} from '@/lib/storage-admin';
export async function GET(request:Request){try{if((await actor(request)).role!=='admin')throw new ApiError(403,'Administrator access required.');return Response.json(await inspectStorage(),{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{sameOrigin(request);if((await actor(request)).role!=='admin')throw new ApiError(403,'Administrator access required.');return Response.json(await inspectStorage(true),{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
