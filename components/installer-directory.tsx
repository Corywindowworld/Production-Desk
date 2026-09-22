'use client';
import {useEffect,useState} from 'react';
import {formatPhone} from '@/lib/phone';

export function InstallerDirectory({self=false,onSaved}:{self?:boolean;onSaved?:()=>void|Promise<void>}){
 const [data,setData]=useState<any>(null),[draft,setDraft]=useState<any>(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/installers/profile',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setData(d);if(self)setDraft(d.installers.find((i:any)=>i.id===d.selfId))}
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 const editable=data&&(data.canManage||draft?.id===data.selfId);
 return <section className="op-panel">
  <h2>{self?'My installer profile':'Installers'}</h2>
  {error&&<p role="alert" className="op-red">{error}</p>}{message&&<p role="status">{message}</p>}
  {!self&&!draft&&<><input aria-label="Search installers" placeholder="Search crew or lead installer…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="op-installer-directory">{data?.installers.filter((i:any)=>[i.name,i.leadInstallerName,i.installerCode].join(' ').toLowerCase().includes(query.toLowerCase())).map((i:any)=><button className="op-appointment" key={i.id} onClick={()=>{setDraft(i);setMessage('');setError('')}}><strong>{i.name}<small>{i.installerCode} · {i.leadInstallerName||'Lead installer not recorded'}</small></strong><span className={i.active?'':'live-inactive'}>{i.active?'Active':'Inactive'}</span></button>)}</div></>}
  {!self&&draft&&<button className="live-button" onClick={()=>{setDraft(null);setMessage('');setError('')}}>← Back to installers</button>}
  {draft&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const body={id:draft.id,name:draft.name,leadInstallerName:draft.leadInstallerName,phone:draft.phone,address:draft.address,contactEmail:draft.contactEmail,emergencyContact:draft.emergencyContact,emergencyPhone:draft.emergencyPhone,...(data.canManage?{inactive:!draft.active,...(draft.supervisorId?{supervisorId:draft.supervisorId}:{})}:{})};const r=await fetch('/api/installers/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);await load();await onSaved?.();setMessage('Installer profile saved.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
   <h3>{draft.name} {!draft.active&&<span className="live-inactive">Inactive</span>}</h3>
   <fieldset className="op-installer-fields" disabled={!editable||busy}>
    {[['name','Crew name'],['leadInstallerName','Lead installer name'],['phone','Phone number'],['address','Address'],['contactEmail','Contact email address'],['emergencyContact','Emergency contact — name and relationship'],['emergencyPhone','Emergency contact phone']].map(([key,label])=><label key={key}>{label}<input required={key==='name'} type={key==='contactEmail'?'email':key.toLowerCase().includes('phone')?'tel':'text'} value={draft[key]||''} onChange={e=>setDraft({...draft,[key]:key.toLowerCase().includes('phone')?formatPhone(e.target.value):e.target.value})}/></label>)}
    {data.canManage&&<label>Field Supervisor<select required value={draft.supervisorId||''} onChange={e=>setDraft({...draft,supervisorId:e.target.value})}><option value="">Select Field Supervisor…</option>{data.supervisors.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {data.canManage&&<label className="op-check"><input type="checkbox" checked={!draft.active} onChange={e=>setDraft({...draft,active:e.target.checked?0:1})}/>Inactive</label>}
   </fieldset>
   {data.canManage&&<p>Inactive crews retain their job history and scores, but cannot sign in or receive new schedule assignments.</p>}{editable&&<button className="op-primary" disabled={busy}>{busy?'Saving…':'Save installer profile'}</button>}
  </form>}
 </section>
}
