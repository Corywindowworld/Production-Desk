import {ApiError} from '@/lib/access';
import {photonAddresses} from './address';
export type Point = {latitude: number; longitude: number};
function serviceUrl(value: string | undefined, label: string) {
  if (!value) throw new ApiError(503, `${label} is not connected yet. Ask Admin to connect the self-hosted service.`);
  let url: URL; try {url = new URL(value);} catch {throw new ApiError(503, `${label} configuration is invalid.`);}
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ApiError(503, `${label} configuration is invalid.`);
  // Destinations are server environment settings, never supplied by a request.
  return url.toString().replace(/\/$/, '');
}
async function json(url: string, key?: string) {
  try {
    const r = await fetch(url, {headers: key ? {Authorization: `Bearer ${key}`} : {}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)});
    if (!r.ok) throw Error('Upstream failed');
    return await r.json();
  } catch {throw new ApiError(503, 'The map service is unavailable. Try again or enter the address manually.');}
}
export async function searchAddresses(q: string) {
  const base = serviceUrl(process.env.PHOTON_BASE_URL, 'Address autofill');
  const params = new URLSearchParams({q, limit: '12', lang: 'en'});
  return photonAddresses(await json(`${base}/api/?${params}`, process.env.MAP_SERVICE_TOKEN));
}
export async function drivingMatrix(points: Point[]) {
  const base = serviceUrl(process.env.OSRM_BASE_URL, 'Road routing');
  if (points.length < 2 || points.length > 9 || points.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) throw new ApiError(400, 'Check the map coordinates for every stop.');
  const coords = points.map(p => `${p.longitude},${p.latitude}`).join(';');
  const data = await json(`${base}/table/v1/driving/${coords}?annotations=duration`, process.env.MAP_SERVICE_TOKEN);
  if (data.code !== 'Ok' || !Array.isArray(data.durations) || data.durations.length !== points.length || data.durations.some((r: any) => !Array.isArray(r) || r.length !== points.length || r.some((v: any) => v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)))) throw new ApiError(503, 'The road service returned an invalid driving-time matrix.');
  return data.durations as (number | null)[][];
}
