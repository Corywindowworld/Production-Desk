'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {localDay} from '@/lib/operations';
import {JobVisits} from '@/components/job-visits';

type ScheduledJob={canEdit?:boolean;id:string;number:string;customer:string;address:string;phone?:string;install:string;crew:string;supervisor:string;specialNotes?:string;stage:string};
export function ScheduledVisits({job,onSaved}:{job?:ScheduledJob;onSaved?:()=>void}={}){
 const [open,setOpen]=useState(false),[jobs,setJobs]=useState<ScheduledJob[]>([]),[selected,setSelected]=useState<ScheduledJob|null>(null),[query,setQuery]=useState(''),[date,setDate]=useState(localDay()),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false);
 async function show(){setOpen(true);setSelected(job||null);setEditing(false);setError('');if(job)return;setLoading(true);try{const r=await fetch('/api/job-visits/jobs',{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error);setJobs(data.jobs)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 const visible=jobs.filter(j=>(!date||j.install===date)&&[j.customer,j.number,j.address,j.crew,j.supervisor].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <><Button type="button" onClick={show} style={{background:"#0756c9",color:"#fff",padding:"14px 20px",minHeight:48,fontSize:16,fontWeight:700}}>Start Job Visit</Button><Dialog open={open} onOpenChange={value=>{if(busy)return;if(!value&&editing&&!window.confirm("Discard this unsaved job visit?"))return;setOpen(value)}}><DialogContent className="job-dialog" style={{width:"96vw",maxWidth:1000,maxHeight:"92dvh",overflowY:"auto"}}><DialogHeader><DialogTitle>{selected?`Job visit · #${selected.number}`:'Job visits · All scheduled jobs'}</DialogTitle><DialogDescription>{selected?selected.customer:'Choose any scheduled job, including jobs assigned to another supervisor.'}</DialogDescription></DialogHeader>
 {selected?<>
  {!editing&&!job&&<Button type="button" variant="outline" onClick={()=>setSelected(null)}>Back to scheduled jobs</Button>}
  <section className="job-contact"><h3>{selected.customer}</h3><p>Scheduled: {(selected.install?new Date(selected.install+'T12:00:00').toLocaleDateString():'Not scheduled')} · {selected.stage}</p>{selected.address&&<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(selected.address)} target="_blank" rel="noreferrer">{selected.address} ↗ Google Maps</a>}{selected.phone&&<a href={'tel:'+selected.phone.replace(/[^+0-9]/g,'')}>{selected.phone}</a>}<p>Crew: {selected.crew||'Unassigned'} · Assigned supervisor: {selected.supervisor||'Unassigned'}</p></section>
  <>{selected.canEdit&&!editing&&<a className="app-link" href={'/?job='+encodeURIComponent(selected.id)+'&edit=1'}>Update information</a>}</><JobVisits key={selected.id} jobId={selected.id} onBusy={setBusy} onEditing={setEditing} autoStart onSaved={onSaved}/>
 </>:<>
  <label className="visit-field">Search scheduled jobs<Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Customer, job number, address, crew, supervisor"/></label>
  <label className="visit-field">Scheduled date (optional)<Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{date&&<Button type="button" variant="outline" onClick={()=>setDate('')}>Show all dates</Button>}
  {loading?<p role="status">Loading scheduled jobs…</p>:error?<p role="alert" className="error">{error}</p>:<><p className="visit-help">{visible.length} scheduled {visible.length===1?'job':'jobs'}</p><div className="scheduled-visit-jobs">{visible.map(j=><button type="button" key={j.id} onClick={()=>setSelected(j)}><strong>#{j.number} · {j.customer}</strong><span>{new Date(j.install+'T12:00:00').toLocaleDateString()} · {j.stage}</span><span>{j.address||'Address not entered'}</span><small>Crew: {j.crew||'Unassigned'} · Supervisor: {j.supervisor||'Unassigned'}</small></button>)}</div>{visible.length===0&&<p>No scheduled jobs match your search.</p>}</>}
 </>}
 </DialogContent></Dialog></>
}
