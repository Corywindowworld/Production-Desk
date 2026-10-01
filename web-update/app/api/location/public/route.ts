import {apiError} from '@/lib/access';
import {publicLocation} from '@/lib/location-store';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return Response.json(await publicLocation(new URL(r.url).searchParams.get('token')||''),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})}catch(e){const response=apiError(e);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response}}
