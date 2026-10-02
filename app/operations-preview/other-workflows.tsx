'use client';
import {useState} from 'react';
import type {Job} from './model';

export type OtherRequest={id:string;job:string;type:'UTI'|'COLL'|'Service'|'ACCRF';status:'Pending'|'Scheduled'|'Approved'|'Declined';details:string;requestedBy:string;created:string;serviceDate?:string;period?:string;amount?:number};

export function OtherWorkflows({job,role,date,requests,onAdd,onApprove,onDecline}:{job:Job;role:string;date:string;requests:OtherRequest[];onAdd:(request:OtherRequest)=>void;onApprove:(request:OtherRequest)=>void;onDecline:(request:OtherRequest)=>void}){
 const [active,setActive]=useState<OtherRequest['type']|''>('');
 const admin=role==='Administrator',supervisor=role==='Field Supervisor';
 const existing=requests.filter(request=>request.job===job.id);
 function create(type:OtherRequest['type'],form:HTMLFormElement){const data=new FormData(form),value=(key:string)=>String(data.get(key)||'').trim();onAdd({id:crypto.randomUUID(),job:job.id,type,status:type==='Service'?'Scheduled':'Pending',details:value('details'),requestedBy:role,created:date,serviceDate:value('serviceDate')||undefined,period:value('period')||undefined,amount:value('amount')?Number(value('amount')):undefined});form.reset();setActive('')}
 return <details id="op-other" className="op-disclosure"><summary>Other Requests</summary><p className="op-muted">Request a protected status change, schedule service, or send an ACCRF price request.</p><div className="op-request-options">
  <button onClick={()=>setActive('UTI')} disabled={!supervisor&&!admin}><strong>UTI Request</strong><span>Customer-delayed installation after payment in full</span></button>
  <button onClick={()=>setActive('COLL')} disabled={!supervisor&&!admin}><strong>COLL Request</strong><span>Payment refused; send the job to Collections</span></button>
  <button onClick={()=>setActive('Service')}><strong>Service Request</strong><span>Schedule service work for this project</span></button>
  <button onClick={()=>setActive('ACCRF')}><strong>ACCRF Request</strong><span>Request a price adjustment with Admin approval</span></button>
 </div>
 {active&&<form className="op-form op-request-form" onSubmit={event=>{event.preventDefault();create(active,event.currentTarget)}}><h3>{active} Request</h3>{active==='UTI'&&<label className="op-check"><input name="confirmed" type="checkbox" required/> Payment has been received in full</label>}{active==='COLL'&&<label className="op-check"><input name="confirmed" type="checkbox" required/> Customer refused the required payment</label>}{active==='Service'&&<><label>Service date<input name="serviceDate" type="date" min={date} required/></label><label>Time<select name="period"><option>AM</option><option>PM</option></select></label></>}{active==='ACCRF'&&<label>Requested job price<input name="amount" type="number" min="0" step="0.01" required defaultValue={job.due??''}/></label>}<label>{active==='Service'?'Service instructions':'Reason and supporting information'}<textarea name="details" maxLength={4000} required/></label><button className="op-primary">{active==='Service'?'Schedule service':'Send request'}</button><button type="button" onClick={()=>setActive('')}>Cancel</button></form>}
 {existing.length>0&&<div className="op-request-list"><h3>Request history</h3>{existing.map(request=><article key={request.id}><div><strong>{request.type} · {request.status}</strong><small>{request.created} · {request.requestedBy}</small></div><p>{request.details}</p>{request.serviceDate&&<p>Service: {request.serviceDate} · {request.period}</p>}{request.amount!==undefined&&<p>Requested price: {request.amount.toLocaleString('en-US',{style:'currency',currency:'USD'})}</p>}{admin&&request.status==='Pending'&&<div><button className="op-primary" onClick={()=>onApprove(request)}>Approve</button><button onClick={()=>onDecline(request)}>Decline</button></div>}</article>)}</div>}
 {!supervisor&&!admin&&<small>UTI and COLL requests must be submitted by a Field Supervisor or Administrator.</small>}
 </details>
}
