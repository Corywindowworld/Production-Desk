'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {addDays,localDay} from '@/lib/operations';
import {datesFor,moveCalendar,type ScheduleViewMode} from '@/app/operations-preview/schedule-view';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import '@/app/operations-preview/preview.css';
import './live-operations.css';
import './warehouse-schedule.css';
import {hourLabel} from '@/lib/install-calendar';
import {ClearableSearch} from './clearable-search';

export function WarehouseSchedule({initialData}:{initialData?:any}={}){
 const [day,setDay]=useState(initialData?.from||localDay()),[view,setView]=useState<ScheduleViewMode>('Day'),[data,setData]=useState<any>(initialData||null),[query,setQuery]=useState(''),[crew,setCrew]=useState(''),[loading,setLoading]=useState(!initialData),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [colors,setColors]=useState<Record<string,string>>(initialData?.crewColors||{}),[colorStatus,setColorStatus]=useState(''),[savingColors,setSavingColors]=useState(false);
 const first=useRef(true),dates=datesFor(day,view),from=dates[0],to=dates[dates.length-1];
 useEffect(()=>{
  if(first.current&&initialData){first.current=false;return;}first.current=false;
  const controller=new AbortController();setLoading(true);setError('');
  fetch('/api/warehouse/schedule?'+new URLSearchParams({from,to}),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Schedule could not load.');return d;}).then(d=>{setData(d);setColors(d.crewColors||{});}).catch(e=>{if(e.name!=='AbortError'){setData(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[from,to,refresh,initialData]);
 const appointments=data?.appointments||[],crews=[...new Set<string>(appointments.map((a:any)=>a.crew))].sort(),visible=appointments.filter((a:any)=>(!crew||a.crew===crew)&&[a.customer,a.number,a.address,a.city,a.bay,a.product,a.crew].join(' ').toLowerCase().includes(query.toLowerCase()));
 async function saveColors(){setSavingColors(true);setColorStatus('');try{const r=await fetch('/api/warehouse/schedule/colors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(colors)}),d=await r.json();if(!r.ok)throw Error(d.error||'Crew colors could not save.');setColorStatus('Crew colors saved for future calendar visits.');}catch(e){setColorStatus((e as Error).message);}finally{setSavingColors(false);}}
 return <div className="op live-operations warehouse-calendar"><section className="op-panel" id="warehouse-schedule" aria-label="Warehouse outgoing schedule">
 <div className="op-section-head" style={{gap:12,flexWrap:'wrap'}}><button type="button" className="live-button" aria-label={'Previous '+view.toLowerCase()} onClick={()=>setDay(moveCalendar(day,view,-1))}><ChevronLeft size={20}/></button><h2 style={{flex:1}}>Installation schedule</h2><button type="button" className="live-button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>Refresh</button><button type="button" className="live-button" aria-label={'Next '+view.toLowerCase()} onClick={()=>setDay(moveCalendar(day,view,1))}><ChevronRight size={20}/></button></div>
 <p className="op-muted">Read-only · Scheduled installations and service visits</p>
 <div className="op-schedule-actions"><button type="button" onClick={()=>setDay(localDay())}>Today</button><button type="button" onClick={()=>setDay(addDays(localDay(),1))}>Tomorrow</button><input aria-label="Calendar date" type="date" value={day} onChange={e=>setDay(e.target.value||localDay())}/>{(['Day','Week','Month'] as ScheduleViewMode[]).map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}</div>
 <div className="wh-grid"><label>Installer / crew<select value={crew} onChange={e=>setCrew(e.target.value)}><option value="">All crews</option>{crews.map(name=><option key={name}>{name}</option>)}</select></label><label>Search outgoing jobs<ClearableSearch type="search" value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')} placeholder="CID, customer, address or bay"/></label></div>
 <div className="warehouse-crew-key" aria-label="Crew color key">{(data?.team||[]).map((c:any)=><span key={c.id}><i style={{background:colors[c.id]||'#2879c8'}}/>{c.name}</span>)}</div>
 <details className="live-crew-colors"><summary>Crew calendar colors</summary><div>{(data?.team||[]).map((c:any)=><label key={c.id}><input type="color" aria-label={c.name+' calendar color'} value={colors[c.id]||'#2879c8'} onChange={e=>{setColorStatus('');setColors({...colors,[c.id]:e.target.value});}}/>{c.name}</label>)}</div><button type="button" className="live-button" disabled={savingColors||loading} onClick={saveColors}>{savingColors?'Saving…':'Save my crew colors'}</button>{colorStatus&&<p role="status">{colorStatus}</p>}</details>
 {error&&<p role="alert" className="wh-error">{error}</p>}{loading?<p role="status">Loading schedule…</p>:data&&<div className={'op-calendar-grid '+(view==='Day'?'':view.toLowerCase())}>{dates.map(date=>{const entries=visible.filter((a:any)=>a.date===date).sort((a:any,b:any)=>(a.time||(a.period==='PM'?'12:00':'00:00')).localeCompare(b.time||(b.period==='PM'?'12:00':'00:00'))||(a.stop||1)-(b.stop||1));return <section className="op-calendar-day" key={date}><header><strong>{new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}</strong></header>{entries.map((a:any)=><article className="warehouse-calendar-card crew-colored-job" key={a.key} style={{borderLeftColor:colors[a.installerId]||'#2879c8','--crew-color':colors[a.installerId]||'#2879c8'} as CSSProperties}>
 <b>{a.time?hourLabel(a.time):a.period||'Time not set'} · {a.kind==='Service'?'Service':'Stop '+(a.stop||1)} · {a.crew}</b><span>{a.customer}</span><small>#{a.number} · {a.product}</small><small>{[[a.windowCount,'windows'],[a.slidingDoors,'SPD'],[a.entryDoorCount,'entry doors'],[a.screenCount,'screens']].filter(([n])=>Number(n)>0).map(([n,label])=>n+' '+label).join(' · ')||'Quantities not recorded'}</small><small>Bay: {a.bay||'Not recorded'}</small><small>{a.address}{a.city?', '+a.city:''}</small>{a.daysLeft>1&&<strong className="op-multi-day">MULTI-DAY ({a.daysLeft})</strong>}
 </article>)}{!entries.length&&<small>No appointments.</small>}</section>})}</div>}
 </section></div>;
}
