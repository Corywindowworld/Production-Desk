import {saveMonthEndBonusSnapshot} from '@/lib/operations-store';

export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret)return Response.json({error:'Automatic bonus closing is not configured.'},{status:503});
 if(request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await saveMonthEndBonusSnapshot())}catch(error){console.error('Bonus snapshot failed',error);return Response.json({error:'Bonus snapshot failed'},{status:500})}
}
