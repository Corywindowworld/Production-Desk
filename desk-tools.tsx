'use client';
import {GuildQualitySummary} from '@/components/guild-quality-summary';
import {ScheduledVisits} from '@/components/scheduled-visits';
import {SignOutButton} from '@/components/auth-forms';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
export type TeamMember={id:string;email:string;name:string;role:string;supervisor_id:string|null;installer_code?:string|null;can_edit_jobs?:number;phone?:string;invitation_status?:string;active:number;login_ready?:number;must_change?:number};
async function data(url:string,options?:RequestInit){const response=await fetch(url,options),result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result}
const post=(value:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export function DeskTools({onTeam,onJob}:{onTeam:(members:TeamMember[])=>void;onJob:(id:string)=>void}){
 const [me,setMe]=useState<any>(null),[alerts,setAlerts]=useState<any[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pushEnabled,setPushEnabled]=useState(false);
 async function loadAlerts(){try{setAlerts((await data('/api/notifications')).notifications)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{data('/api/me').then(d=>setMe(d.member)).catch(e=>setError(e.message));data('/api/team').then(d=>onTeam(d.members)).catch(e=>setError(e.message));loadAlerts();const timer=setInterval(loadAlerts,30000);return()=>clearInterval(timer)},[]);
 async function action(id:string,action:string){try{await data('/api/notifications',post({id,action}));await loadAlerts()}catch(e){setError((e as Error).message)}}
 return <section className="desk-tools">{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}{(me?.role==='supervisor'||me?.role==='admin')&&<GuildQualitySummary/>}<div className="supervisor-alerts"><h2>Job alerts {alerts.filter(n=>!n.read_at).length>0&&<span>({alerts.filter(n=>!n.read_at).length} unread)</span>}</h2>{alerts.length===0?<p>No job alerts yet.</p>:alerts.map(n=><div key={n.id} className={'supervisor-alert'+(!n.read_at?' unread':'')}><button onClick={()=>{onJob(n.job_id);action(n.id,'read')}}><strong>{n.message}</strong><span>{n.recipient_name||'Field supervisor'} · {new Date(n.created).toLocaleString()}</span><small>{n.push_status==='sent'?'Push accepted by notification service':n.push_status==='not_enabled'?'Supervisor has not enabled phone notifications':n.push_status==='failed'?'Phone push failed — in-app alert saved':'Push pending'}</small></button>{['failed','pending','not_enabled'].includes(n.push_status)&&<Button variant="outline" onClick={()=>action(n.id,'retry')}>Retry push</Button>}</div>)}</div></section>
}
