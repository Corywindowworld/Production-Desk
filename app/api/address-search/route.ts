import {actor,apiError,ApiError,hasJobEditPermission} from '@/lib/access';
import {searchAddresses} from '@/lib/routing/providers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const member = await actor(request);
    if (!hasJobEditPermission(member) || member.role === 'installer') throw new ApiError(403, 'Job edit permission required.');
    const q = new URL(request.url).searchParams.get('q')?.trim() || '';
    if (q.length < 4 || q.length > 300) return Response.json({suggestions: []});
    return Response.json({suggestions: await searchAddresses(q)}, {headers: {'Cache-Control': 'no-store'}});
  } catch(e) {return apiError(e);}
}
