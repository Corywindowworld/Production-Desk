'use client';
import { useState } from 'react';
import { addDays, addMonths, format, startOfWeek, startOfMonth, endOfWeek, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
type CalendarJob = {id:string;number:string;customer:string;install:string;crew:string;stage:string};
export function JobCalendar<T extends CalendarJob>({jobs,loading,onSelect}:{jobs:T[];loading:boolean;onSelect:(job:T)=>void}) {
 const [view,setView]=useState('month');
 const [date,setDate]=useState(()=>new Date());
 const start=view==='month'?startOfWeek(startOfMonth(date)):view==='week'?startOfWeek(date):date;
 const end=view==='month'?endOfWeek(endOfMonth(date)):view==='week'?endOfWeek(date):date;
 const days=eachDayOfInterval({start,end});
 const title=view==='month'?format(date,'MMMM yyyy'):view==='day'?format(date,'EEEE, MMMM d, yyyy'):`${format(start,'MMM d')} – ${format(end,'MMM d, yyyy')}`;
 const scheduled=jobs.filter(j=>j.install).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
 const move=(n:number)=>setDate(view==='month'?addMonths(startOfMonth(date),n):addDays(date,n*(view==='week'?7:1)));
 return <section className="calendar-section" aria-label="Installation calendar"><div className="board-title"><div><h2>Installation calendar</h2><p>Select a job for address, phone number, and job details.</p></div></div><Tabs value={view} onValueChange={setView}><div className="calendar-toolbar"><TabsList aria-label="Calendar view">{['day','week','month'].map(v=><TabsTrigger value={v} key={v}>{v[0].toUpperCase()+v.slice(1)}</TabsTrigger>)}</TabsList><div className="calendar-navigation"><Button variant="outline" aria-label={'Previous '+view} onClick={()=>move(-1)}><ChevronLeft size={18}/></Button><Button variant="outline" onClick={()=>setDate(new Date())}>Today</Button><Button variant="outline" aria-label={'Next '+view} onClick={()=>move(1)}><ChevronRight size={18}/></Button><Input aria-label="Go to calendar date" type="date" value={format(date,'yyyy-MM-dd')} onChange={e=>{if(e.target.value)setDate(new Date(e.target.value+'T12:00:00'))}}/></div></div><h3 className="calendar-heading" aria-live="polite">{title}</h3>{['day','week','month'].map(v=><TabsContent value={v} key={v}>{loading?<p role="status">Loading scheduled jobs…</p>:<div className="calendar-scroll"><div className={'calendar-grid calendar-'+view}>{view!=='day'&&['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div className="weekday" key={day}>{day}</div>)}{days.map(day=>{const key=format(day,'yyyy-MM-dd');const entries=scheduled.filter(j=>j.install===key);return <div key={key} className={'calendar-day'+(format(day,'yyyy-MM')!==format(date,'yyyy-MM')&&view==='month'?' outside-month':'')+(key===format(new Date(),'yyyy-MM-dd')?' today':'')}><div className="calendar-date"><time dateTime={key}>{format(day,view==='day'?'EEEE, MMM d':'d')}</time><span>{entries.length} {entries.length===1?'job':'jobs'}</span></div>{entries.map(j=><button className="calendar-job" key={j.id} onClick={()=>onSelect(j)}><strong>#{j.number} · {j.customer}</strong><span>{j.crew||'No crew assigned'}</span><small>{j.stage}</small></button>)}{entries.length===0&&view!=='month'&&<p className="calendar-empty">No scheduled jobs</p>}</div>})}</div></div>}</TabsContent>)}</Tabs></section>
}
