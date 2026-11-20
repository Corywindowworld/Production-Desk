import {startScheduledProduction} from '@/lib/operations-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({error:'Automatic production start is not configured.'}, {status:503});
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({error:'Unauthorized'}, {status:401});
  }
  try {
    return Response.json(await startScheduledProduction());
  } catch (error) {
    console.error('Automatic production start failed', error);
    return Response.json({error:'Automatic production start failed'}, {status:500});
  }
}
