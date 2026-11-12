import {installAppointments} from '@/lib/install-calendar';
export function crewStops(jobs:any[],crewId:string,day:string){
 const stops:any[]=[];
 for(const j of jobs){
  for(const a of installAppointments(j,[day]))if(j.installerId===crewId)stops.push({id:j.id+':installation',jobId:j.id,kind:'installation',customer:j.customer,number:j.number,address:j.address,city:j.city,state:j.state,zip:j.zip,version:j.version,period:a.period||'AM',time:a.time||'',stop:a.stop||0,location:j.routingLocation||null,serviceMinutes:j.operations?.routing?.[day]?.installation?.serviceMinutes});
  for(const s of j.operations?.services||[])if(s.date===day&&s.installerId===crewId)stops.push({id:j.id+':'+s.id,jobId:j.id,kind:s.id,customer:j.customer,number:j.number,address:j.address,city:j.city,state:j.state,zip:j.zip,version:j.version,period:s.period||'AM',time:s.time||'',stop:s.stop||0,location:j.routingLocation||null,serviceMinutes:j.operations?.routing?.[day]?.[s.id]?.serviceMinutes});
 }
 return stops.sort((a,b)=>String(a.period).localeCompare(String(b.period))||a.stop-b.stop||a.id.localeCompare(b.id));
}
