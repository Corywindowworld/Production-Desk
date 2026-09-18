import {actor,apiError,sameOrigin} from '@/lib/access';
import {installerProfiles,saveInstallerProfile} from '@/lib/installer-directory';
export async function GET(request:Request){try{return Response.json(await installerProfiles(await actor(request)),{headers:{'Cache-Control':'no-store'}})}catch(e){return apiError(e)}}
export async function POST(request:Request){try{sameOrigin(request);await saveInstallerProfile(await actor(request),await request.json());return Response.json({ok:true})}catch(e){return apiError(e)}}
