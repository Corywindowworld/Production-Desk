'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';

export function TripShare({jobId,serviceVisitId,phone,phone2,phone3}:{jobId:string;serviceVisitId?:string;phone?:string;phone2?:string;phone3?:string}){
 const [url,setUrl]=useState(''),[greeting,setGreeting]=useState(''),[eta,setEta]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[choosing,setChoosing]=useState(false),[recipient,setRecipient]=useState('');
 const numbers=[phone,phone2,phone3].map((value,index)=>({label:`Ph#${index+1}`,display:value||'',number:String(value||'').replace(/[^+\d]/g,'')})).filter((entry,index,all)=>entry.number.replace(/\D/g,'').length>=7&&all.findIndex(other=>other.number.replace(/^\+?1(?=\d{10}$)/,'')===entry.number.replace(/^\+?1(?=\d{10}$)/,''))===index);
 const copyText=greeting+'\n\n'+url;
 function openText(number:string,text:string){
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  window.location.href=`sms:${number}${apple?'&':'?'}body=${encodeURIComponent(text)}`;
 }
 async function send(action:string,number=''){
  setBusy(true);setMessage('');
  try{
   if(action==='start'&&(!eta||Number(eta)<5||Number(eta)>240))throw Error('Enter your approximate travel time (5–240 minutes).');
   const r=await fetch('/api/location/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId,serviceVisitId,action,etaMinutes:Number(eta)})}),d=await r.json();
   if(!r.ok)throw Error(d.error);
   setUrl(d.url||'');setGreeting(d.greeting||'');
   if(action==='end'){setRecipient('');setMessage('Customer tracking ended.');}
   else {
    setRecipient(number);setChoosing(false);
    setMessage('Opening your text message. Review it and tap Send. If Messages did not open, tap Open text message below. Tracking expires in two hours.');
    openText(number,d.greeting+'\n\n'+d.url);
   }
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 function start(){
  if(!eta||Number(eta)<5||Number(eta)>240){setMessage('Enter your approximate travel time (5–240 minutes).');return;}
  if(!numbers.length){setMessage('No customer phone number is saved. Ask the office to add a phone number to this job.');return;}
  if(numbers.length>1)setChoosing(true);else void send('start',numbers[0].number);
 }
 return <details className="op-disclosure"><summary>On My Way · Customer tracking</summary>
  <p>Your customer will see the installer’s name, profile picture, their stop number and an approximate arrival window. Ending the trip stops customer access.</p>
  <label>Estimated travel time (minutes)<input type="number" min="5" max="240" step="1" value={eta} onChange={e=>setEta(e.target.value)} placeholder="For example, 30"/></label>
  <p><button type="button" className="tracking-outline" disabled={busy} onClick={start}>{busy?'Please wait…':'On My Way — create link'}</button> <button type="button" className="tracking-outline" disabled={busy} onClick={()=>send('end')}>Arrived / end tracking</button></p>
  <Dialog open={choosing} onOpenChange={value=>{if(!busy)setChoosing(value)}}><DialogContent><DialogHeader><DialogTitle>Select customer phone number</DialogTitle><DialogDescription>Choose which number to text your arrival message and tracking link.</DialogDescription></DialogHeader>
   {numbers.map(entry=><button type="button" key={entry.number} className="tracking-outline" disabled={busy} onClick={()=>send('start',entry.number)}>{entry.label} · {entry.display}</button>)}
   <button type="button" className="tracking-outline" disabled={busy} onClick={()=>setChoosing(false)}>Cancel</button>
   {message&&<p role="status">{message}</p>}
  </DialogContent></Dialog>
  {url&&<><textarea aria-label="Customer text message" readOnly value={copyText} rows={5}/><p><a href={url} target="_blank" rel="noreferrer">Preview customer tracking</a></p>
   {recipient&&<button type="button" className="tracking-outline" onClick={()=>openText(recipient,copyText)}>Open text message</button>}
   <button type="button" className="tracking-outline" onClick={async()=>{try{await navigator.clipboard.writeText(copyText);setMessage('Message and tracking link copied. Paste into your text message.')}catch{setMessage('Select and copy the message above.')}}}>Copy message & link</button></>}
  <p role="status">{message}</p>
 </details>
}
