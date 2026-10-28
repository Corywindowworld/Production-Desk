'use client';
import {SignaturePad} from './signature-pad';
import {useState} from 'react';
import {leadStatements} from '@/lib/lead-form';
import {printLeadRenovation} from '@/lib/print-lead-renovation';
export function LeadRenovation({j,me,profile,installers=[],save}:any){
 const record=j.operations?.leadRenovation,staff=['admin','supervisor'].includes(me.role),canComplete=staff||me.role==='installer';
 const [installerId,setInstallerId]=useState(record?.installerId||j.installerId||j.operations?.report?.certificate?.installerId||'');
 const crew=installers.find((i:any)=>i.id===installerId);
 const [answers,setAnswers]=useState<boolean[]>(record?.answers||Array(13).fill(true));
 const [signatureDataUrl,setSignatureDataUrl]=useState((!staff||record?.signedBy===me.id?record?.signatureDataUrl:'')||profile?.savedDrawnSignature||'');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <>
 {record&&<div className="op-section-head"><strong>Lead Renovation — Saved</strong><button className="live-button" type="button" onClick={()=>{try{printLeadRenovation(record)}catch(e){setError((e as Error).message)}}}>Print Lead Reno Sheet</button></div>}
 <details className="op-disclosure" open={!record&&!!j.leadRenovationJob?true:undefined}>
 <summary>Lead Renovation Sheet {record?'— Saved':j.leadRenovationJob?'— Required':'— Add / Complete'}</summary>
 <p>{j.customer} · #{j.number} · {j.address}, {j.city} {j.state} {j.zip}</p>
 {record&&<p>Renovator: {record.renovatorName} · EPA #{record.epaCertification}<br/>{record.signedByStaff?'Completed and signed by FS/Admin: ':'Signed by: '}{record.signedByName||record.signature}</p>}
 {error&&<p role="alert" className="op-red">{error}</p>}{message&&<p role="status">{message}</p>}
 {canComplete?<form className="op-form" onSubmit={async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');setMessage('');
  try{if(!signatureDataUrl)throw Error('Draw your signature before saving.');
   await save('leadRenovation',{answers,signature:staff?me.name:profile?.renovatorName||me.name,signatureDataUrl,confirmed:f.has('confirmed'),saveSignature:f.has('saveSignature'),...(staff?{installerId,epaCertification:String(f.get('epaCertification')||'')}:{})});
   setMessage('Lead sheet saved. Use Print Lead Reno Sheet above to print.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }}><fieldset disabled={busy}>
 {staff?<>
  <p>Complete this record for the installer who performed the work. Your FS/Admin signature and name will be recorded. Saving also marks this account as a Lead Renovation Job.</p>
  <label>Installer / renovator<select required value={installerId} onChange={e=>setInstallerId(e.target.value)}><option value="">Select installer</option>{installers.map((i:any)=><option key={i.id} value={i.id}>{i.name}{i.active?'':' (Inactive)'}</option>)}</select></label>
  <p>Renovator: {crew?.renovatorName||crew?.name||'Select installer'} · Contractor ID: {crew?.renovatorId||'Not recorded'}</p>
  <label>Installer EPA Certification #<input key={installerId} name="epaCertification" required maxLength={100} defaultValue={crew?.epaCertification||(record?.installerId===installerId?record.epaCertification:'')||''}/></label>
 </>:<><p>Renovator: {profile?.renovatorName||me.name} · Renovator ID #: {profile?.renovatorId||'Not recorded'}</p><p>EPA Certification #: {profile?.epaCertification||'Add in your installer profile before signing.'}</p></>}
 <p>Answers start at Yes. Review each answer and change it where necessary before signing.</p>
 {leadStatements.map((t,i)=><div key={t}>{i===0?<h3>EPA Credentials</h3>:i===1?<h3>Determination of Renovation Procedures</h3>:i===2?<h3>Renovation Procedure Check List</h3>:i===12?<h3>Customer Copy</h3>:null}<p>{t}</p>{i===1&&<p className="op-muted">The home and work areas were inspected by a Certified EPA Lead-Safe Renovator. If Yes, answer every checklist item below. If No, you certify that standard installation procedures will not disturb potential lead paint.</p>}<div style={{display:'flex',gap:20}}>{[true,false].map(v=><label key={String(v)} className="op-check lead-large-check"><input type="radio" name={'lead-answer-'+i} checked={answers[i]===v} onChange={()=>setAnswers(a=>a.map((x,n)=>n===i?v:x))}/>{v?'Yes':'No'}</label>)}</div></div>)}
 {staff&&<p><strong>FS/Admin signing this record: {me.name}</strong></p>}
 <SignaturePad label={staff?'FS/Admin signature':'installer signature'} value={signatureDataUrl} onChange={setSignatureDataUrl}/>
 <label className="op-check lead-large-check"><input type="checkbox" name="saveSignature" defaultChecked/>Save my signature for future forms</label>
 <label className="op-check lead-large-check"><input type="checkbox" name="confirmed" required/>I reviewed these answers, certify this form is truthful and accurate, and apply my electronic signature to this job.</label>
 <button className="op-primary">{busy?'Saving…':staff?'Save Lead Sheet':'Sign and save form'}</button>
 </fieldset></form>:!record?<p>Awaiting the assigned installer’s signed form.</p>:null}
 </details></>;
}
