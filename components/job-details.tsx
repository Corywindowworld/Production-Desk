import {PaymentMethod} from '@/components/payment-method';
import {attachmentLabels} from '@/lib/job-workflow';
type JobDetailsData={paymentMethod?:string|null;number:string;customer:string;address:string;phone?:string;stage:string;crew:string;supervisor:string;amount?:number|null;eta?:string;received?:string;install?:string;installed?:string;blocker:string;specialNotes?:string;notes:string;attachments:{key:string;kind:keyof typeof attachmentLabels;name:string}[];history:{at:string;by:string;text:string}[]};
const date=(value?:string)=>value?new Date(value+'T12:00:00').toLocaleDateString():'Not entered';
export function JobDetails({job}:{job:JobDetailsData}){
 return <div className="job-readonly">
  <section className="job-contact"><h3>Location & contact</h3>{job.address?<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(job.address)} target="_blank" rel="noreferrer">{job.address} ↗ Google Maps</a>:<p>Address not entered</p>}{job.phone?<a href={'tel:'+job.phone.replace(/[^+0-9]/g,'')}>{job.phone}</a>:<p>Phone number not entered</p>}</section>
  <PaymentMethod value={job.paymentMethod}/>
  <dl className="job-facts">{[['Job number',job.number],['Customer',job.customer],['Stage',job.stage],['Job value',job.amount==null?'Not entered':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(job.amount)],['Field supervisor',job.supervisor||'Unassigned'],['Installer / crew',job.crew||'Unassigned'],['Materials received',date(job.received)],['Scheduled installation',date(job.install)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {[...(job.stage==='Incomplete'?[['Incomplete reason',job.blocker]]:[]),['Job notes',job.notes]].map(([label,value])=><section className="job-detail-notes" key={label}><h3>{label}</h3><p className="preserve-lines">{value||'None'}</p></section>)}
  <section className="attachments"><h3>Job documents & photos</h3>{job.attachments.length===0?<p>No documents or photos attached.</p>:job.attachments.map(a=><div className="attachment-group" key={a.key}><a href={'/api/attachments?key='+encodeURIComponent(a.key)} target="_blank" rel="noreferrer">{attachmentLabels[a.kind]}: {a.name}</a></div>)}</section>
  {job.history.length>0&&<details className="history"><summary>Update history</summary>{job.history.map((h,i)=><div key={i}><p>{h.text}</p><small>{h.by} · {new Date(h.at).toLocaleString()}</small></div>)}</details>}
 </div>
}
