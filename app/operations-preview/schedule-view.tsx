'use client';
import {ArrowUpRight} from 'lucide-react';
import type {Job} from './model';

export type ScheduleViewMode='Day'|'Week'|'Month';
const addDays=(date:string,count:number)=>new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);
const startOfWeek=(date:string)=>addDays(date,-new Date(date+'T12:00:00Z').getUTCDay());
export const datesFor=(date:string,view:ScheduleViewMode)=>{
 if(view==='Day')return [date];
 if(view==='Week'){const start=startOfWeek(date);return Array.from({length:7},(_,i)=>addDays(start,i))}
 const parsed=new Date(date+'T12:00:00Z'),year=parsed.getUTCFullYear(),month=parsed.getUTCMonth();
 const first=new Date(Date.UTC(year,month,1,12)).toISOString().slice(0,10);
 const length=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
 const start=startOfWeek(first),offset=new Date(first+'T12:00:00Z').getUTCDay();
 return Array.from({length:Math.ceil((offset+length)/7)*7},(_,i)=>addDays(start,i));
};
export const moveCalendar=(date:string,view:ScheduleViewMode,direction:number)=>{
 if(view==='Day')return addDays(date,direction);
 if(view==='Week')return addDays(date,7*direction);
 const parsed=new Date(date+'T12:00:00Z');
 return new Date(Date.UTC(parsed.getUTCFullYear(),parsed.getUTCMonth()+direction,1,12)).toISOString().slice(0,10);
};
const label=(date:string,view:ScheduleViewMode)=>new Intl.DateTimeFormat('en-US',view==='Month'?{weekday:'short',day:'numeric'}:{weekday:'short',month:'short',day:'numeric'}).format(new Date(date+'T12:00:00Z'));

export function ScheduleView({jobs,role,installer,asOf,day,setDay,view,setView,onOpen,onSchedule}:{jobs:Job[];role:string;installer:string;asOf:string;day:string;setDay:(date:string)=>void;view:ScheduleViewMode;setView:(view:ScheduleViewMode)=>void;onOpen:(job:Job)=>void;onSchedule:()=>void}){
 const isInstaller=role==='Installer',mode=isInstaller?'Day':view,dates=datesFor(day,mode);
 const visible=jobs.filter(job=>job.date&&(!isInstaller||(job.crew===installer&&job.scheduleApproval!=='Pending')));
 return <section className="op-panel op-schedule-panel"><div className="op-section-head"><h2>{isInstaller?'My scheduled jobs':'Installation schedule'}</h2>{!isInstaller&&<label>Schedule date<input aria-label="Schedule date" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>}</div>
 <p className="op-muted">{isInstaller?'Your approved appointments for today and tomorrow. Job information is read-only.':'Review a day, complete week, or full month and schedule work into the future.'}</p>
 <div className="op-schedule-actions"><button onClick={()=>setDay(asOf)}>Today</button><button onClick={()=>setDay(addDays(asOf,1))}>Tomorrow</button>{!isInstaller&&<>{(['Day','Week','Month'] as ScheduleViewMode[]).map(item=><button key={item} aria-pressed={view===item} onClick={()=>setView(item)}>{item}</button>)}<button className="op-primary" onClick={onSchedule}>+ Schedule Work</button></>}</div>
 {mode==='Day'?<div>{['Coastal Crew','Bay Crew'].filter(crew=>!isInstaller||crew===installer).map(crew=>{const appointments=visible.filter(job=>job.crew===crew&&job.date===day).sort((a,b)=>a.stop-b.stop);return <div className="op-lane" key={crew}><h3>{crew}</h3>{appointments.map(job=><Appointment key={job.id} job={job} onOpen={onOpen}/>)}{!appointments.length&&<p>No appointments.</p>}</div>})}</div>:<div className={'op-calendar-grid '+(mode==='Month'?'month':'week')}>{dates.map(date=>{const appointments=visible.filter(job=>job.date===date).sort((a,b)=>a.period.localeCompare(b.period)||a.stop-b.stop);return <section className="op-calendar-day" key={date}><header><strong>{label(date,mode)}</strong>{date===asOf&&<span>Today</span>}</header>{appointments.map(job=><button key={job.id} onClick={()=>onOpen(job)} className={job.scheduleApproval==='Pending'?'pending':''}><b>{job.period} · {job.crew}</b><span>{job.customer}</span><small>{job.scheduleApproval==='Pending'?'Approval required':`Stop ${job.stop}`}</small></button>)}{!appointments.length&&<small className="op-calendar-empty">Open</small>}</section>})}</div>}
 </section>
}
function Appointment({job,onOpen}:{job:Job;onOpen:(job:Job)=>void}){return <button className="op-appointment" onClick={()=>onOpen(job)}><b>{job.period} · Stop {job.stop}</b><strong>{job.customer}<small>{job.product} · {job.customerId}</small></strong><span>{job.scheduleApproval==='Pending'?'Approval required':job.field}</span><ArrowUpRight size={16}/></button>}
