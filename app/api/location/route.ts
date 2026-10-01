import {actor,apiError,sameOrigin} from '@/lib/access';
import {locationIdentity,mapLocations,savePosition,stopSharing} from '@/lib/location-store';
import {sessionCookie,limitedJson} from '@/lib/auth-session';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return Response.json({locations:await mapLocations(await actor(r))},{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
export async function POST(r:Request){try{sameOrigin(r);const s=await locationIdentity(r),body=await limitedJson(r);if(body.action==='stop'){await stopSharing(s.id);return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie('',0)}})}await savePosition(s,body);return Response.json({ok:true})}catch(e){return apiError(e)}}
