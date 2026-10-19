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
    if (!r.ok) throw Error('Upstream failed');
    return await r.json();
  } catch (error) {if (error instanceof ApiError) throw error; throw new ApiError(503, 'The map service is unavailable. Try again or enter the address manually.');}
}
export async function searchAddresses(q: string) {
  if (process.env.GEOAPIFY_API_KEY) {
    const params = new URLSearchParams({text: q, limit: '6', lang: 'en', filter: 'countrycode:us', apiKey: process.env.GEOAPIFY_API_KEY});
    return geoapifyAddresses(await json(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`));
  }
  const base = serviceUrl(process.env.PHOTON_BASE_URL, 'Address autofill');
  const params = new URLSearchParams({q, limit: '12', lang: 'en'});
  return photonAddresses(await json(`${base}/api/?${params}`, process.env.MAP_SERVICE_TOKEN));
}
export async function drivingMatrix(points: Point[]) {
  if (points.length < 2 || points.length > 9 || points.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) throw new ApiError(400, 'Check the map coordinates for every stop.');
  if (process.env.GEOAPIFY_API_KEY) {
    const locations = points.map(p => ({location: [p.longitude, p.latitude]}));
    const data = await json(`https://api.geoapify.com/v1/routematrix?${new URLSearchParams({apiKey: process.env.GEOAPIFY_API_KEY})}`, undefined, {mode: 'drive', sources: locations, targets: locations});
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
