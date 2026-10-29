import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {storedObject} from './stored-data';
import {localDay,optionalDate,dayDifference,addDays} from './operations';
import {installAppointments} from './install-calendar';

export async function warehouseScheduleData(m:Member,range:{from?:string;to?:string}={}){
 if(!['warehouse','admin','supervisor','office','production_assistant'].includes(m.role))throw new ApiError(403,'Warehouse schedule access required.');
 const from=optionalDate.parse(range.from||localDay()),to=optionalDate.parse(range.to||from),length=dayDifference(from,to);
 if(length===null||length<0||length>41)throw new ApiError(400,'Choose a schedule range of up to six weeks.');
 const dates=Array.from({length:length+1},(_,i)=>addDays(from,i)),db=database();
 const rows=(await db.prepare('SELECT j.payload,c.payload AS record FROM jobs j LEFT JOIN customer_records c ON c.job_id=j.id').all()).results;
 const crews=(await db.prepare("SELECT id,name FROM members WHERE role='installer'").all()).results;
 const names=new Map(crews.map((crew:any)=>[crew.id,crew.name]));
 const appointments:any[]=[];
 for(const row of rows){
  const j=storedObject(row.payload),record=row.record?storedObject(row.record):{};
  const base={jobId:j.id,number:j.number,customer:j.customer,address:j.address||'',city:j.city||'',product:j.product||'',windowCount:j.windowCount||0,slidingDoors:j.slidingDoors||0,entryDoorCount:j.entryDoorCount||0,screenCount:j.screenCount||0,bay:j.bay||record.warehouseBay||(j.materials||[]).map((v:any)=>v.bay).filter(Boolean).join(', ')};
  for(const a of installAppointments(j,dates))appointments.push({...base,key:j.id+':installation:'+a.date,date:a.date,kind:j.stage==='SVC'?'Service':'Installation',installerId:j.installerId||'',crew:names.get(j.installerId)||j.crew||'Unassigned',period:a.period||'',time:a.time||'',stop:a.stop||null,daysLeft:a.daysLeft});
  for(const visit of j.operations?.services||[]){
   if(!dates.includes(visit.date)||visit.cancelled||visit.canceled)continue;
   appointments.push({...base,key:j.id+':'+visit.id,date:visit.date,kind:'Service',installerId:visit.installerId||'',crew:names.get(visit.installerId)||visit.crew||'Unassigned',period:visit.period||'',time:visit.time||'',stop:j.operations?.routing?.[visit.date]?.[visit.id]?.stop||visit.stop||null,daysLeft:1});
  }
 }
 appointments.sort((a,b)=>a.date.localeCompare(b.date)||a.crew.localeCompare(b.crew)||(a.stop??999)-(b.stop??999)||(a.time||a.period).localeCompare(b.time||b.period)||String(a.number).localeCompare(String(b.number)));
 return {from,to,readOnly:true,appointments};
}
