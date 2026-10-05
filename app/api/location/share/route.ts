import {actor,apiError,sameOrigin} from '@/lib/access';
import {createShare,revokeShare} from '@/lib/location-store';
import {limitedJson} from '@/lib/auth-session';
export async function POST(r:Request){try{sameOrigin(r);const m=await actor(r),body=await limitedJson(r),jobId=String(body.jobId||'');if(body.action==='end'){await revokeShare(m,jobId);return Response.json({ok:true})}const result=await createShare(m,jobId,body.etaMinutes);return Response.json({url:new URL('/track#'+result.token,r.url).href,expires:result.expires,greeting:result.greeting},{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
