import {addDays,dayDifference} from './operations';
export const isWorkday=(day:string)=>![0,6].includes(new Date(day+'T12:00:00Z').getUTCDay());
export function remainingWorkdays(day:string,end:string){
 const days=dayDifference(day,end);if(days===null||days<0)return 0;
 const full=Math.floor((days+1)/7);let total=full*5;
 for(let n=full*7;n<=days;n++)if(isWorkday(addDays(day,n)))total++;
 return total;
}
export function installAppointments(j:any,dates:string[]){
 if(!j.install)return [];
 const end=j.installEnd||j.install,multi=end>j.install;
 return dates.filter(d=>d>=j.install&&d<=end&&(!multi||isWorkday(d))&&(!j.scheduleCompletedOn||d<=j.scheduleCompletedOn)).map(d=>({...j,date:d,period:j.installPeriod,time:j.installTime||'',stop:j.stopNumber,multi,daysLeft:multi?remainingWorkdays(d,end):1}));
}
export function hourLabel(time:string){const hour=Number(time.slice(0,2));return `${hour%12||12}:00 ${hour<12?'AM':'PM'}`}
