'use client';
import {uploadAttachment} from '@/lib/upload-client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {visitQuestions,visitAnswers,visitSchema,type JobVisit,type VisitInput} from '@/lib/job-visits';

type Draft=Omit<VisitInput,'checks'>&{checks:Record<string,{answer:string;notes:string}>};
function fresh(jobId:string):Draft{
 const now=new Date();
 return {id:crypto.randomUUID(),jobId,visitedOn:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,checks:Object.fromEntries(visitQuestions.map(([key])=>[key,{answer:'',notes:''}])),notes:'',photos:[]};
}
const photoUrl=(key:string)=>'/api/attachments?key='+encodeURIComponent(key);
export function JobVisits({jobId,onBusy,onEditing}:{jobId:string;onBusy:(busy:boolean)=>void;onEditing:(editing:boolean)=>void}){
 const [visits,setVisits]=useState<JobVisit[]>([]),[canCreate,setCanCreate]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false);
 const locked=busy||uploading;
 useEffect(()=>{let active=true;fetch('/api/job-visits?jobId='+encodeURIComponent(jobId),{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(active){setVisits(data.visits);setCanCreate(data.canCreate)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[jobId]);
 useEffect(()=>{onBusy(locked);return()=>onBusy(false)},[locked,onBusy]);
 useEffect(()=>{onEditing(!!draft);return()=>onEditing(false)},[!!draft,onEditing]);
 async function upload(files:FileList|null){
  if(!files||!draft)return;setError('');
  if(files.length+draft.photos.length>20){setError('Attach up to 20 photos per visit.');return;}
  setUploading(true);
  try{for(const file of Array.from(files)){
   if(!file.size||file.size>15*1024*1024)throw Error('Choose nonempty photos smaller than 15 MB each.');
   const data={attachment:await uploadAttachment(jobId,'visit',file)};
   setDraft(current=>current?{...current,photos:[...current.photos,data.attachment]}:current);
  }}catch(e){setError((e as Error).message)}finally{setUploading(false)}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();if(!draft||locked)return;setError('');
  if(!visitSchema.safeParse(draft).success){setError('Choose a valid visit date and an answer for all nine checks.');return;}
  setBusy(true);
  try{const r=await fetch('/api/job-visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});const data=await r.json();if(!r.ok)throw Error(data.error);setVisits(current=>[data.visit,...current.filter(v=>v.id!==data.visit.id)]);setDraft(null);setSuccess('Job visit saved.');}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="job-visits" aria-label="Job visits">
  <div className="visit-heading"><div><h3>Job visits</h3><p>Field supervisor checks, notes, and photos</p></div>{canCreate&&!draft&&<Button type="button" onClick={()=>{setDraft(fresh(jobId));setSuccess('');setError('')}}>New job visit</Button>}</div>
  {loading&&<p role="status">Loading visits…</p>}
  {error&&<p role="alert" className="error">{error}</p>}{success&&<p role="status" className="success-message">{success}</p>}
  {draft&&<form onSubmit={save} className="visit-form"><fieldset disabled={locked}>
   <legend>Job Visit form</legend>
   <label className="visit-field">Visit date<Input type="date" required value={draft.visitedOn} onChange={e=>setDraft({...draft,visitedOn:e.target.value})}/></label>
   <p className="visit-help">Answer every check. Use Not observed when you could not confirm an item.</p>
   {visitQuestions.map(([key,question])=><fieldset className="visit-check" key={key}><legend>{question}</legend>
    <RadioGroup required aria-label={question} value={draft.checks[key].answer} onValueChange={answer=>setDraft({...draft,checks:{...draft.checks,[key]:{...draft.checks[key],answer}}})} className="visit-options">
     {Object.entries(visitAnswers).map(([value,label])=><label key={value} htmlFor={`visit-${key}-${value}`}><RadioGroupItem disabled={locked} id={`visit-${key}-${value}`} value={value}/>{label}</label>)}
    </RadioGroup>
    <label className="visit-field"><span>Details <small>(optional)</small></span><Textarea maxLength={1000} rows={2} aria-label={question+' Details'} value={draft.checks[key].notes} onChange={e=>setDraft({...draft,checks:{...draft.checks,[key]:{...draft.checks[key],notes:e.target.value}}})}/></label>
   </fieldset>)}
   <label className="visit-field">Additional notes / follow-up<Textarea maxLength={4000} rows={3} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
   <div className="report-upload"><label className="visit-field">Visit photos<Input type="file" accept="image/*,.heic,.heif" multiple onChange={e=>{upload(e.target.files);e.target.value=''}}/></label><p className="visit-help">Take or select photos. Up to 20 photos, 15 MB each.</p>
    <div className="visit-photos">{draft.photos.map(photo=><div key={photo.key}><a href={photoUrl(photo.key)} target="_blank" rel="noreferrer"><img src={photoUrl(photo.key)} alt={photo.name}/><span>{photo.name}</span></a><Button type="button" variant="outline" aria-label={'Remove '+photo.name} onClick={()=>setDraft({...draft,photos:draft.photos.filter(p=>p.key!==photo.key)})}>Remove</Button></div>)}</div>
   </div>
  </fieldset>
  {uploading&&<p role="status">Uploading photos…</p>}
  <div className="form-actions"><Button type="button" variant="outline" disabled={locked} onClick={()=>{setDraft(null);setError('')}}>Cancel visit</Button><Button type="submit" disabled={locked}>{busy?'Saving visit…':'Save job visit'}</Button></div></form>}
  {!loading&&!draft&&visits.length===0&&!error&&<p className="visit-help">No job visits recorded yet.</p>}
  {!draft&&visits.map(visit=><details className="saved-visit" key={visit.id}><summary><strong>{new Date(visit.visitedOn+'T12:00:00').toLocaleDateString()}</strong> · {visit.supervisorName}</summary>
   <dl>{visitQuestions.map(([key,question])=><div key={key}><dt>{question}</dt><dd><strong>{visitAnswers[visit.checks[key].answer]}</strong>{visit.checks[key].notes&&<p className="preserve-lines">{visit.checks[key].notes}</p>}</dd></div>)}</dl>
   {visit.notes&&<p className="preserve-lines"><strong>Additional notes / follow-up: </strong>{visit.notes}</p>}
   <div className="visit-photos">{visit.photos.map(photo=><a key={photo.key} href={photoUrl(photo.key)} target="_blank" rel="noreferrer"><img loading="lazy" src={photoUrl(photo.key)} alt={photo.name}/><span>{photo.name}</span></a>)}</div>
   <p className="visit-help">Recorded {new Date(visit.submittedAt).toLocaleString()}</p>
  </details>)}
 </section>
}
