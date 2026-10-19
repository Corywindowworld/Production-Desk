export function resetJobSchedule(j:any, target:string, reason:string, actor:{id:string;name:string;role:string}, at:string){
 if(!['admin','supervisor','production_assistant'].includes(actor.role)) throw Error('PA, Field Supervisor or Administrator access required.');
 if(!reason.trim()) throw Error('Enter a reason for resetting this job.');
 const o=j.operations||(j.operations={});let removed:any;
 if(target==='installation'){
  if(!j.install&&!o.pendingSchedule)throw Error('This job has no installation schedule to remove.');
  removed={date:j.install,endDate:j.installEnd,time:j.installTime,period:j.installPeriod,stop:j.stopNumber,installerId:j.installerId,crew:j.crew,pendingSchedule:o.pendingSchedule};
  o.routing={};
  j.install='';j.installEnd='';j.installTime='';j.installPeriod='';j.stopNumber=0;j.scheduleCompletedOn='';o.pendingSchedule=null;
 }else{
  removed=(o.services||[]).find((s:any)=>s.id===target);
  if(!removed)throw Error('Service appointment no longer exists.');
  if(o.routing?.[removed.date])delete o.routing[removed.date][target];
  o.services=o.services.filter((s:any)=>s.id!==target);
 }
 o.scheduleResets=[{target,reason:reason.trim(),by:actor.name,byId:actor.id,at,schedule:removed},...(o.scheduleResets||[])];
 return {removed,text:`${target==='installation'?'Installation':'Service'} removed from schedule (${removed.date||removed.pendingSchedule?.date||'pending'}). Reset reason: ${reason.trim()}`};
}
