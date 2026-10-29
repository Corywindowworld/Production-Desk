'use client';
import {useEffect,useRef,useState} from 'react';
import {addDays,localDay} from '@/lib/operations';
import {displayDate} from '@/lib/display-date';
import {hourLabel} from '@/lib/install-calendar';
import {ClearableSearch} from './clearable-search';

export function WarehouseSchedule({initialData}:{initialData?:any}={}){
 const [day,setDay]=useState(initialData?.from||localDay()),[view,setView]=useState('Day'),[data,setData]=useState<any>(initialData||null),[query,setQuery]=useState(''),[crew,setCrew]=useState(''),[loading,setLoading]=useState(!initialData),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const first=useRef(true),weekday=new Date(day+'T12:00:00Z').getUTCDay(),from=view==='Week'?addDays(day,-weekday):day,to=view==='Week'?addDays(from,6):day;
 useEffect(()=>{
  if(first.current&&initialData){first.current=false;return;}first.current=false;
  const controller=new AbortController();setLoading(true);setError('');
  fetch('/api/warehouse/schedule?'+new URLSearchParams({from,to}),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Schedule could not load.');return d;}).then(setData).catch(e=>{if(e.name!=='AbortError'){setData(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[from,to,refresh,initialData]);
 const appointments=data?.appointments||[],crews=[...new Set<string>(appointments.map((a:any)=>a.crew))].sort(),visible=appointments.filter((a:any)=>(!crew||a.crew===crew)&&[a.customer,a.number,a.address,a.city,a.bay,a.product,a.crew].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <section className="wh-panel" id="warehouse-schedule" aria-label="Warehouse outgoing schedule"><div className="wh-title"><div><h2>Outgoing schedule</h2><p>Read-only · Scheduled installations and service visits</p></div><button type="button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>Refresh schedule</button></div>
 <div className="wh-grid"><label>Schedule date<input type="date" required value={day} onChange={e=>{if(e.target.value)setDay(e.target.value);setCrew('');}}/></label><label>Schedule view<select value={view} onChange={e=>{setView(e.target.value);setCrew('');}}><option>Day</option><option>Week</option></select></label><label>Installer / crew<select value={crew} onChange={e=>setCrew(e.target.value)}><option value="">All crews</option>{crews.map(name=><option key={name}>{name}</option>)}</select></label><label>Search outgoing jobs<ClearableSearch type="search" value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')} placeholder="CID, customer, address or bay"/></label></div>
 <div className="wh-actions"><button type="button" onClick={()=>{setDay(addDays(day,view==='Week'?-7:-1));setCrew('');}}>Previous {view.toLowerCase()}</button><button type="button" onClick={()=>{setDay(localDay());setCrew('');}}>Today</button><button type="button" onClick={()=>{setDay(addDays(day,view==='Week'?7:1));setCrew('');}}>Next {view.toLowerCase()}</button></div>
 {error&&<p role="alert" className="wh-error">{error}</p>}{loading?<p role="status">Loading schedule…</p>:data&&<><p>{displayDate(from)}{to!==from?' – '+displayDate(to):''} · {visible.length} scheduled {visible.length===1?'visit':'visits'}</p><div className="wh-scroll" style={{maxHeight:560}}><table><caption className="sr-only">Outgoing jobs — read-only</caption><thead><tr>{['Date / time','Crew / stop','Customer / CID','Product / quantities','Bay','Address'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map((a:any)=><tr key={a.key}><td>{displayDate(a.date)}<br/>{a.time?hourLabel(a.time):a.period||'Time not set'}<br/><small>{a.kind}{a.daysLeft>1?' · '+a.daysLeft+' workdays left':''}</small></td><td>{a.crew}<br/><small>Stop {a.stop||'not set'}</small></td><td><strong>{a.customer}</strong><br/>#{a.number}</td><td>{a.product}<br/><small>{[[a.windowCount,'windows'],[a.slidingDoors,'SPD'],[a.entryDoorCount,'entry doors'],[a.screenCount,'screens']].filter(([n])=>Number(n)>0).map(([n,label])=>n+' '+label).join(' · ')||'Quantities not recorded'}</small></td><td>{a.bay||'Not recorded'}</td><td>{a.address}<br/>{a.city}</td></tr>)}</tbody></table></div>{!visible.length&&<p>No scheduled jobs match this date and search.</p>}</>}
 </section>;
}
