import {addDays,bonusPeriod} from './operations';
/** Target 11:59pm Eastern on the final Tuesday, with a bounded delayed-run window. */
export function bonusClosingDay(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=parts.year+'-'+parts.month+'-'+parts.day;
 const candidate=parts.hour==='23'&&parts.minute==='59'?day:parts.hour==='00'&&Number(parts.minute)<59?addDays(day,-1):null;
 return candidate&&bonusPeriod(candidate).end===candidate?candidate:null;
}
