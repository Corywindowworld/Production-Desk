import {saveMonthEndBonusSnapshot} from '@/lib/operations-store';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23',minute:'2-digit'}).formatToParts(new Date());
 const clock=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 if(clock.hour!=='23'||Number(clock.minute)<59)return Response.json({saved:false,reason:'Outside month-end closing window'});
 try{return Response.json(await saveMonthEndBonusSnapshot())}catch(error){console.error('Bonus snapshot failed',error);return Response.json({error:'Bonus snapshot failed'},{status:500})}
}
