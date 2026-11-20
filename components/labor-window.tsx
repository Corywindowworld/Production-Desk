'use client';
import {useCallback,useEffect,useState} from 'react';
import {LaborSheet} from './labor-paperwork';
export default function LaborWindow({jobId}:{jobId:string}){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/labor?format=json&jobId='+encodeURIComponent(jobId),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load labor sheet.');setData(d);setError('');}catch(e){setError((e as Error).message);}},[jobId]);
 useEffect(()=>{void load();},[load]);
 return <main style={{maxWidth:1100,margin:'24px auto',padding:24,color:'#17344a',background:'#fff'}}><header><h1 style={{fontSize:20}}>Complete Labor Sheet</h1><button onClick={()=>window.close()}>Close window</button> <a href="/">Return to dashboard</a></header>{error&&<p role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}{data?<LaborSheet standalone j={data.job} me={data.me} profile={data.profile} reload={load}/>:!error&&<p>Loading labor sheet…</p>}<style>{`input,select,textarea,button{font:inherit;padding:8px;border:1px solid #aebdcc;border-radius:6px}table{width:100%;border-collapse:collapse}fieldset{min-width:0;border:0;padding:0}label{display:block;margin:12px 0}button,a{margin:4px}input[type=checkbox]{width:24px;height:24px;vertical-align:middle}td input{width:100%;box-sizing:border-box}textarea{max-width:100%}`}</style></main>;
}
