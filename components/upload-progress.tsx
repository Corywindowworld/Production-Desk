'use client';
import {useEffect,useState} from 'react';
import {progressEvent,type UploadProgress} from '@/lib/upload-progress';
export function PhotoUploadProgress({jobId}:{jobId:string}){
 const [items,setItems]=useState<UploadProgress[]>([]);
 useEffect(()=>{setItems([]);const update=(event:Event)=>{const item=(event as CustomEvent<UploadProgress>).detail;if(item.jobId!==jobId)return;setItems(old=>old.some(v=>v.id===item.id)?old.map(v=>v.id===item.id?item:v):[...old,item]);};window.addEventListener(progressEvent,update);return()=>window.removeEventListener(progressEvent,update);},[jobId]);
 if(!items.length)return null;
 const complete=items.filter(v=>v.status==='Complete').length,failed=items.filter(v=>v.status==='Failed').length,percent=Math.round(items.reduce((n,v)=>n+v.percent,0)/items.length);
 return <section aria-label="Photo upload progress" style={{width:'100%',gridColumn:'1/-1',padding:12}}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><span>{complete} of {items.length} photos uploaded{failed ? ' · '+failed+' failed; please retry' : ''}</span><span>{percent}%</span></div><progress aria-label="All queued photos upload progress" max={100} value={percent} style={{display:'block',width:'100%',height:20,accentColor:'#0033a0'}} /></section>;
}
