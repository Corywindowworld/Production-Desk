import {ApiError} from '@/lib/access';
import {geoapifyAddresses, photonAddresses} from './address';
export type Point = {latitude: number; longitude: number};
function serviceUrl(value: string | undefined, label: string) {
  if (!value) throw new ApiError(503, `${label} is not connected yet. Ask Admin to connect a map service.`);
  let url: URL; try {url = new URL(value);} catch (error) {if (error instanceof ApiError) throw error; throw new ApiError(503, `${label} configuration is invalid.`);}
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ApiError(503, `${label} configuration is invalid.`);
  // Destinations are server environment settings, never supplied by a request.
  return url.toString().replace(/\/$/, '');
}
async function json(url: string, key?: string, body?: unknown) {
  try {
    const r = await fetch(url, {method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers: {...(key ? {Authorization: `Bearer ${key}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)});
    if (r.status === 429) throw new ApiError(429, 'Map service usage limit reached. Try again later; manual address entry is still available.');
    if (!r.ok) {
      // Never log the request URL: hosted-service URLs contain the private API key.
      console.warn('Map service request failed', {provider: new URL(url).hostname, status: r.status});
      if (new URL(url).hostname === 'api.geoapify.com' && [401, 403].includes(r.status)) throw new ApiError(503, 'Geoapify rejected the API key or its access restrictions. Ask Admin to check GEOAPIFY_API_KEY in Vercel and the key restrictions in Geoapify, then redeploy.');
      throw Error('Upstream failed');
    }
    return await r.json();
  } catch (error) {if (error instanceof ApiError) throw error; throw new ApiError(503, 'The map service is unavailable. Try again or enter the address manually.');}
}
export async function searchAddresses(q: string) {
  if (process.env.GEOAPIFY_API_KEY?.trim()) {
    const params = new URLSearchParams({text: q, limit: '6', lang: 'en', filter: 'countrycode:us', apiKey: process.env.GEOAPIFY_API_KEY.trim()});
    return geoapifyAddresses(await json(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`));
  }
  const base = serviceUrl(process.env.PHOTON_BASE_URL, 'Address autofill');
  const params = new URLSearchParams({q, limit: '12', lang: 'en'});
  return photonAddresses(await json(`${base}/api/?${params}`, process.env.MAP_SERVICE_TOKEN));
}
export async function drivingMatrix(points: Point[]) {
  if (points.length < 2 || points.length > 9 || points.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) throw new ApiError(400, 'Check the map coordinates for every stop.');
  if (process.env.GEOAPIFY_API_KEY?.trim()) {
    const locations = points.map(p => ({location: [p.longitude, p.latitude]}));
    const data = await json(`https://api.geoapify.com/v1/routematrix?${new URLSearchParams({apiKey: process.env.GEOAPIFY_API_KEY.trim()})}`, undefined, {mode: 'drive', sources: locations, targets: locations});
    const rows = data?.sources_to_targets;
    if (!Array.isArray(rows) || rows.length !== points.length || rows.some((r: any, i: number) => !Array.isArray(r) || r.length !== points.length || r.some((v: any, j: number) => !v || v.source_index !== i || v.target_index !== j || (v.time !== null && (typeof v.time !== 'number' || !Number.isFinite(v.time) || v.time < 0))))) throw new ApiError(503, 'The road service returned an invalid driving-time matrix.');
    return rows.map((r: any[]) => r.map(v => v.time)) as (number | null)[][];
  }
  const base = serviceUrl(process.env.OSRM_BASE_URL, 'Road routing');
  const coords = points.map(p => `${p.longitude},${p.latitude}`).join(';');
  const data = await json(`${base}/table/v1/driving/${coords}?annotations=duration`, process.env.MAP_SERVICE_TOKEN);
  if (data.code !== 'Ok' || !Array.isArray(data.durations) || data.durations.length !== points.length || data.durations.some((r: any) => !Array.isArray(r) || r.length !== points.length || r.some((v: any) => v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)))) throw new ApiError(503, 'The road service returned an invalid driving-time matrix.');
  return data.durations as (number | null)[][];
}

export async function resolveAddress(address: {address:string;city?:string;state?:string;zip?:string}) {
  const text=[address.address,address.city,address.state,address.zip].filter(Boolean).join(', ');
  let matches;
  if(process.env.GEOAPIFY_API_KEY?.trim()) {
    const params=new URLSearchParams({text,filter:'countrycode:us',limit:'5',apiKey:process.env.GEOAPIFY_API_KEY.trim()});
    matches=geoapifyAddresses(await json(`https://api.geoapify.com/v1/geocode/search?${params}`));
  } else matches=await searchAddresses(text);
  const normalize=(s:string)=>s.toLowerCase().replace(/[.,]/g,'').replace(/\b(street|road|drive|avenue|boulevard|lane|court|place|highway|north|south|east|west)\b/g,v=>({street:'st',road:'rd',drive:'dr',avenue:'ave',boulevard:'blvd',lane:'ln',court:'ct',place:'pl',highway:'hwy',north:'n',south:'s',east:'e',west:'w'}[v]!)).replace(/\s+/g,' ').trim();
  const street=normalize(address.address.split(',')[0].replace(/\s+(?:apt\.?|unit|suite|#)\s*.*$/i,''));
  const valid=matches.filter(a=>normalize(a.street)===street&&(!address.state||a.state.toUpperCase()===address.state.toUpperCase())&&(!address.zip||a.zip.slice(0,5)===address.zip.slice(0,5))&&(!!address.zip||!address.city||normalize(a.city)===normalize(address.city)));
  if(valid.length!==1)throw new ApiError(400,`Could not uniquely locate ${text}. Correct the street address, city, state and ZIP in the job information, then preview again.`);
  return {latitude:valid[0].latitude,longitude:valid[0].longitude};
}
export async function routeGeometry(points: Point[]): Promise<{type:'MultiLineString';coordinates:number[][][]}> {
  let geometry:any;
  if(process.env.GEOAPIFY_API_KEY?.trim()) {
    const params=new URLSearchParams({waypoints:points.map(p=>`${p.latitude},${p.longitude}`).join('|'),mode:'drive',apiKey:process.env.GEOAPIFY_API_KEY.trim()});
    const data=await json(`https://api.geoapify.com/v1/routing?${params}`);geometry=data?.features?.[0]?.geometry;
  } else {
    const base=serviceUrl(process.env.OSRM_BASE_URL,'Road routing');
    const data=await json(`${base}/route/v1/driving/${points.map(p=>`${p.longitude},${p.latitude}`).join(';')}?overview=full&geometries=geojson`,process.env.MAP_SERVICE_TOKEN);
    if(data?.code==='Ok'&&data.routes?.[0]?.geometry?.type==='LineString')geometry={type:'MultiLineString',coordinates:[data.routes[0].geometry.coordinates]};
  }
  if(geometry?.type!=='MultiLineString'||!Array.isArray(geometry.coordinates)||!geometry.coordinates.length||geometry.coordinates.some((line:any)=>!Array.isArray(line)||line.length<2||line.some((p:any)=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)))throw new ApiError(503,'Road route map unavailable.');
  return {type:'MultiLineString',coordinates:geometry.coordinates};
}
