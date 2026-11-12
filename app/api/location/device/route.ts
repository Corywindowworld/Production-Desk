import {apiError,sameOrigin} from '@/lib/access';
import {deviceToken} from '@/lib/location-store';
export async function POST(r:Request){try{sameOrigin(r);return Response.json(await deviceToken(r),{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
