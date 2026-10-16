'use client';
import {useEffect,useState} from 'react';
import {progressEvent,type UploadProgress} from '@/lib/upload-progress';
export function PhotoUploadProgress({jobId}:{jobId:string}){
 const [items,setItems]=useState<UploadProgress[]>([]);
 useEffect(()=>{setItems([]);const update=(event:Event)=>{const item=(event as CustomEvent<UploadProgress>).detail;if(item.jobId!==jobId)return;setItems(old=>old.some(v=>v.id===item.id)?old.map(v=>v.id===item.id?item:v):[...old,item]);};window.addEventListener(progressEvent,update);return()=>window.removeEventListener(progressEvent,update);},[jobId]);
 if(!items.length)return null;
 return <section aria-label="Photo upload progress" style={{width:'100%',gridColumn:'1/-1',padding:12}}>{items.map(item=><div key={item.id} style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:14}}><span>{item.name}</span><span>{item.status} {item.percent}%</span></div><progress aria-label={item.name+' upload progress'} max={100} value={item.percent} style={{display:'block',width:'100%',height:20,accentColor:'#0033a0'}} /></div>)}</section>;
}
