import {actor,apiError,sameOrigin,ApiError} from '@/lib/access';
import {inviteCertificate,publicCertificate,signCertificate} from '@/lib/certificate-links';
import {z} from 'zod';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function GET(request:Request){try{return Response.json(await publicCertificate(new URL(request.url).searchParams.get('token')||''),{headers})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{sameOrigin(request);const raw=await request.text();if(raw.length>500000)throw new ApiError(413,'Signature upload is too large.');const input=JSON.parse(raw);
 if(input.action==='invite'){const m=await actor(request);const base=process.env.APP_URL||new URL(request.url).origin;return Response.json(await inviteCertificate(m,input,base),{headers});}
 return Response.json(await signCertificate(String(input.token||''),input.values),{headers});
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Please complete the required fields and draw your signature.'},{status:400,headers});return apiError(e)}}
