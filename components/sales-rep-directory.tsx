'use client';
import {useEffect,useState} from 'react';
import {formatPhone} from '@/lib/phone';
import {ClearableSearch} from './clearable-search';

type Rep={id:string;name:string;phone:string;email:string;jobs:number;revision:string};
const blank=()=>({name:'',phone:'',email:''});
export function SalesRepDirectory({initialData}:{initialData?:Rep[]}={}){
 const [reps,setReps]=useState<Rep[]>(initialData||[]),[loading,setLoading]=useState(!initialData),[query,setQuery]=useState(''),[editing,setEditing]=useState(false),[selected,setSelected]=useState<Rep|null>(null),[draft,setDraft]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function load(){setLoading(true);try{const r=await fetch('/api/sales-reps',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Sales reps could not load.');setReps(d.salesReps);setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{if(!initialData)void load();},[initialData]);
 function edit(rep:Rep|null){setSelected(rep);setDraft(rep?{name:rep.name,phone:rep.phone,email:rep.email}:blank());setEditing(true);setError('');setMessage('');}
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const r=await fetch('/api/sales-reps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,...(selected?{originalId:selected.id,revision:selected.revision}:{})})}),d=await r.json();
  if(!r.ok)throw Error(d.error||'Sales rep could not save.');
  setEditing(false);setMessage(`${draft.name} saved. ${d.updatedJobs} assigned ${d.updatedJobs===1?'job updated':'jobs updated'}.`);await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const visible=reps.filter(rep=>[rep.name,rep.phone,rep.email].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <section className="account-directory" aria-label="Sales reps"><div className="accounts-header"><div><h2>Sales reps</h2><p>Edit sales rep contact details here. Changes apply to their assigned jobs and future job selections.</p></div><button className="primary-action" disabled={busy} onClick={()=>edit(null)}>+ Add sales rep</button></div>
 <div className="account-filters"><label>Search sales reps<ClearableSearch type="search" value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')} placeholder="Name, phone or email"/></label><button type="button" disabled={busy||loading} onClick={()=>void load()}>Refresh sales reps</button></div>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 {editing&&<form onSubmit={save} className="managed-account" aria-label="Edit sales rep"><fieldset disabled={busy}><legend>{selected?'Edit sales rep':'Add sales rep'}</legend><div className="account-form-grid"><label>Sales rep name<input required maxLength={160} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Sales rep phone<input type="tel" maxLength={50} value={draft.phone} onChange={e=>setDraft({...draft,phone:formatPhone(e.target.value)})}/></label><label>Sales rep email<input type="email" maxLength={254} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label></div><div className="account-modal-actions"><button type="button" onClick={()=>setEditing(false)}>Cancel</button><button className="primary-action">{busy?'Saving…':'Save sales rep'}</button></div></fieldset></form>}
 {loading?<p role="status">Loading sales reps…</p>:<><p>{visible.length} sales {visible.length===1?'rep':'reps'}</p><div className="account-cards">{visible.map(rep=><article className="managed-account" key={rep.id}><h3>{rep.name}</h3><p>{rep.email||'Email not recorded'}</p><p>{formatPhone(rep.phone)||'Phone not recorded'}</p><small>{rep.jobs} assigned {rep.jobs===1?'job':'jobs'}</small><footer><button type="button" disabled={busy} onClick={()=>edit(rep)} aria-label={'Edit sales rep '+rep.name}>Edit sales rep</button></footer></article>)}</div>{!visible.length&&<p>No sales reps match your search.</p>}</>}
 </section>;
}
