'use client';
import {useEffect,useState} from 'react';
import {QualityBadge} from '@/components/quality-badge';
export function GuildQualitySummary(){
 const [summary,setSummary]=useState<{average:number|null;rated:number;total:number}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;async function load(){try{const r=await fetch('/api/installer/quality/summary',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);if(active){setSummary(d);setError('')}}catch(e){if(active)setError((e as Error).message)}}load();const refresh=()=>{if(document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[]);
 return <section className="guild-summary" aria-label="Guild Quality Scores overall average"><div><h2>Guild Quality Scores</h2><p>Overall installer average</p>{summary&&<small>{summary.rated} of {summary.total} active installers rated · Unrated scores excluded</small>}<a href="/quality">View quality scores →</a></div>{error?<p role="alert" className="error">{error}</p>:summary?<QualityBadge score={summary.average}/>:<p>Loading average…</p>}</section>
}
