'use client';
import {ClearableSearch} from "@/components/clearable-search";

import {useState} from 'react';
import {completionBatchFilename} from '@/lib/completion-batch-name';

export function PreviousBatches({batches}:{batches:any[]}){
 const [query,setQuery]=useState(''),[date,setDate]=useState('');
 const searching=!!(query.trim()||date);
 const results=searching?batches.filter(b=>{
   const day=new Date(b.created).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
   return b.sent_at&&(!date||day===date)&&[b.id,b.created_by,b.sent_by,completionBatchFilename(b.created)].join(' ').toLowerCase().includes(query.trim().toLowerCase());
 }):[];
 return <details style={{marginTop:24}}><summary>Find previous batches</summary>
   <p>Search sent batches by batch date, filename, or the person who prepared or sent them.</p>
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
     <label>Batch date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>Search previous batches<ClearableSearch onClear={() => setQuery("")} type="search" placeholder="Filename or staff name" value={query} onChange={e=>setQuery(e.target.value)}/></label>
     {searching&&<button type="button" className="live-button" onClick={()=>{setDate('');setQuery('')}}>Clear search</button>}
   </div>
   {searching&&<div style={{maxHeight:360,overflowY:'auto'}}>
     {!results.length&&<p>No sent batches match this search.</p>}
     {results.map(b=><div key={b.id} style={{padding:14,borderBottom:'1px solid #ccd6df'}}>
       <strong>{completionBatchFilename(b.created)}</strong>
       <p>Prepared by {b.created_by} · Sent by {b.sent_by} on {new Date(b.sent_at).toLocaleString('en-US',{timeZone:'America/New_York'})}</p>
       <a className="live-button" target="_blank" rel="noopener noreferrer" href={'/api/completion-batches?id='+encodeURIComponent(b.id)+'&view=print'}>View / Print PDF</a>{' '}
       <a className="live-button" href={'/api/completion-batches?id='+encodeURIComponent(b.id)}>Download PDF</a>
     </div>)}
   </div>}
 </details>;
}
