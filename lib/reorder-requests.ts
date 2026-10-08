import {z} from 'zod';
import {ApiError} from './access';
import {localDay} from './operations';
export const reorderTypes=['Whole Window','Screen Frame','Sash','Frame','SPD','Entry Door','Other Part'] as const;
export const chargeParties=['Factory','Installer','Sales Rep','Customer','Window World'] as const;
const text=z.string().trim().max(4000).default('');
const photo=z.object({key:z.string().max(250),name:z.string().max(255),kind:z.literal('issue')});
const item=z.object({type:z.enum(reorderTypes),window:text,quantity:z.number().int().min(1).max(999),orderedSize:text,actualSize:text,reorderSize:text,serial:text,position:text,description:text,photos:z.array(photo).min(1).max(20)}).superRefine((v,c)=>{
 if(!v.window)c.addIssue({code:'custom',message:'Enter a window number or location.'});
 if(v.type==='Whole Window'&&(!v.orderedSize||!v.actualSize||!v.reorderSize))c.addIssue({code:'custom',message:'Enter ordered, actual and reorder sizes.'});
 if(['Screen Frame','Sash','Frame'].includes(v.type)&&!v.serial)c.addIssue({code:'custom',message:'Enter the serial number.'});
 if(v.type==='Sash'&&!v.position)c.addIssue({code:'custom',message:'Enter sash position.'});
});
export const reorderSubmission=z.object({id:z.string().uuid().optional(),reason:z.string().trim().min(1).max(4000),remaining:text,acknowledged:z.literal(true),items:z.array(item).min(1).max(50)});
const check=(yes:unknown,msg:string)=>{if(!yes)throw new ApiError(400,msg)};
const read=<T>(schema:z.ZodType<T>,v:unknown):T=>{const p=schema.safeParse(v);if(!p.success)throw new ApiError(400,p.error.issues[0].message);return p.data};
export async function reorderOperation({tx,j,m,data,at,alert,assigned}:any){
 const review=['admin','supervisor'].includes(m.role),o=j.operations;
 check(review||m.role==='installer'&&assigned,'Only assigned installers or FS/Admin can submit reorders.');
 o.reorders ||= [];
 const event=(r:any,message:string)=>{r.events=[...(r.events||[]),{at,by:m.name,message}];r.updatedAt=at;};
 if(data.command==='submit'){
  const v=read(reorderSubmission,data);
  const old=v.id?o.reorders.find((r:any)=>r.id===v.id):null;
  if(v.id)check(old&&old.status==='Correction requested'&&(review||old.submittedBy===m.id),'Only a returned request can be resubmitted.');
  for(const i of v.items)for(const a of i.photos){
   const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();
   const retained=old?.items?.some((x:any)=>x.photos.some((p:any)=>p.key===a.key));
   check(file?.job_id===j.id&&file?.kind==='issue'&&(file?.member_id===m.id||retained),'Upload photos to this job before submitting.');
   if(!(j.attachments||[]).some((x:any)=>x.key===a.key))j.attachments=[...(j.attachments||[]),{...a,source:'reorder',uploadedBy:m.name,uploadedAt:at}];
  }
  const r={...v,id:old?.id||crypto.randomUUID(),status:'Submitted',submittedBy:m.id,submittedName:m.name,submittedAt:at,events:old?.events||[],revisions:old?[...(old.revisions||[]),{at:old.submittedAt,reason:old.reason,remaining:old.remaining,items:old.items,reviewedBy:old.reviewedBy,reviewedAt:old.reviewedAt,chargebacks:old.chargebacks,chargebackNote:old.chargebackNote,comment:old.comment}]:[]};
  event(r,'Submitted for Field Supervisor review');
  if(old)o.reorders=o.reorders.map((x:any)=>x.id===old.id?r:x);else o.reorders.push(r);
  await alert(j.supervisorId||(review?m.id:''),`Reorder submitted for #${j.number}: ${v.reason}`);
  return 'Reorder request submitted';
 }
 check(review,'Field Supervisor or Administrator review required.');
 const r=o.reorders.find((r:any)=>r.id===data.id);check(r,'Reorder request not found.');
 if(data.command==='review'){
  check(r.status==='Submitted','This request has already been reviewed.');
  const v=read(z.object({decision:z.enum(['Approved','Correction requested','Declined']),chargebacks:z.array(z.enum(chargeParties)).max(5),chargebackNote:text,comment:text,reviewAcknowledged:z.literal(true)}),data);
  check(!v.chargebacks.length||!!v.chargebackNote,'Explain the chargeback decision.');
  check(v.decision==='Approved'||!!v.comment,'Enter a reason for correction or decline.');
  Object.assign(r,v,{status:v.decision,reviewedBy:m.name,reviewedAt:at});event(r,v.decision+': '+v.comment);
  await alert(r.submittedBy,`Reorder for #${j.number}: ${v.decision}. ${v.comment}`);
  return 'Reorder '+v.decision.toLowerCase();
 }
 check(data.command==='track','Unknown reorder action.');
 const v=read(z.object({status:z.enum(['Ordered','Received','Scheduled','Resolved']),vendor:text,reference:text,orderedDate:text,estimatedShipDate:text,receivedDate:text,bay:text,returnDate:text,managerInitials:text,tagReturned:z.boolean().default(false),notes:text}),data);
 const next:Record<string,string>={Approved:'Ordered',Ordered:'Received',Received:'Scheduled',Scheduled:'Resolved'};
 check(v.status===next[r.status],'Complete the previous reorder step first.');
 const validDate=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 for(const key of ['orderedDate','estimatedShipDate','receivedDate','returnDate'] as const)if(v[key])check(validDate(v[key]!), 'Enter a valid '+key);
 if(v.orderedDate)check(v.orderedDate<=localDay(),'Actual order date cannot be in the future.');
 if(v.receivedDate)check(v.receivedDate<=localDay(),'Received date cannot be in the future.');
 if(v.status==='Ordered')check(!!v.vendor&&!!v.reference&&validDate(v.orderedDate||''),'Enter vendor, order/reference number and actual order date.');
 if(v.status==='Received')check(validDate(v.receivedDate||'')&&!!v.bay,'Enter received date and bay.');
 if(v.status==='Scheduled')check((j.install&&j.install.slice(0,10)>=String(r.receivedDate||'0000'))||(o.services||[]).some((x:any)=>x.date>=String(r.receivedDate||'0000')),'Schedule the return visit using Schedule Work first.');
 if(v.status==='Ordered'&&j.stage==='Incomplete'&&!j.reorderDate){j.reorderDate=v.orderedDate;if(!j.incompleteSince)j.incompleteSince=v.orderedDate;}
 Object.assign(r,Object.fromEntries(Object.entries(v).filter(([key])=>data[key]!==undefined)));event(r,v.status+': '+(v.notes||''));
 return 'Reorder '+v.status.toLowerCase();
}
