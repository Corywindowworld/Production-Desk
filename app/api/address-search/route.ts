import {actor,apiError,ApiError,hasJobEditPermission} from '@/lib/access';
export async function GET(request:Request){try{
 const member=await actor(request);if(!hasJobEditPermission(member)||member.role==='installer')throw new ApiError(403,'Job edit permission required.');
 const q=new URL(request.url).searchParams.get('q')?.trim()||'';
 if(q.length<4||q.length>300)return Response.json({suggestions:[]});
 const key=process.env.GOOGLE_PLACES_API_KEY;if(!key)throw new ApiError(503,'Address suggestions are not configured. You can enter the address manually.');
 const response=await fetch('https://places.googleapis.com/v1/places:autocomplete',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'suggestions.placePrediction.text.text'},body:JSON.stringify({input:q,includedRegionCodes:['us'],locationBias:{circle:{center:{latitude:27.95,longitude:-82.46},radius:50000}}}),signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw new ApiError(503,'Address search is unavailable. Check the address manually or try again.');
 const data=await response.json();return Response.json({suggestions:(data.suggestions||[]).map((x:any)=>x.placePrediction?.text?.text).filter(Boolean).slice(0,5)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
