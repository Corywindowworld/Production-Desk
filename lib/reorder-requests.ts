import {z} from 'zod';
import {ApiError} from './access';
import {localDay} from './operations';
export const reorderTypes=['Whole Window','Screen Frame','Sash','Frame','SPD','Entry Door','Other Part'] as const;
export const chargeParties=['Factory','Installer','Sales Rep','Customer','Window World'] as const;
const text=z.string().trim().max(4000).default('');
const validSize=(value:string)=>{const dimensions=value.split(/\s*x\s*/i);return dimensions.length===2&&dimensions.every(d=>{const m=d.trim().match(/^(\d+)(?:\s+(\d+)\/(\d+))?$/);if(!m)return false;const inches=Number(m[1]),num=Number(m[2]||0),den=Number(m[3]||1);return inches<=300&&[1,2,4,8,16].includes(den)&&num<den&&inches+num/den>0;});};
const photo=z.object({key:z.string().max(250),name:z.string().max(255),kind:z.literal('issue')});
const item=z.object({type:z.enum(reorderTypes),window:text,quantity:z.number().int().min(1).max(999),orderedSize:text,actualSize:text,reorderSize:text,serial:text,specialShape:z.boolean().optional(),orderedLegHeight:text,actualLegHeight:text,reorderLegHeight:text,position:text,panelSide:text,panelOperation:text,description:text,photos:z.array(photo).max(20)}).superRefine((v,c)=>{
 if(!v.window)c.addIssue({code:'custom',message:'Enter a window number or location.'});
 if(v.type==='Whole Window'&&![v.orderedSize,v.actualSize,v.reorderSize].every(s=>validSize(s||'')))c.addIssue({code:'custom',message:'Enter ordered, actual and reorder sizes in inches and fractions down to 1/16.'});
 if(['Screen Frame','Sash','Frame'].includes(v.type)&&!v.serial)c.addIssue({code:'custom',message:'Enter the serial number.'});
 if(v.type==='Sash'&&!['Top','Bottom','Left','Right','Middle'].includes(v.position))c.addIssue({code:'custom',message:'Enter sash position.'});
 if(v.type==='Whole Window'&&v.specialShape&&![v.orderedLegHeight,v.actualLegHeight,v.reorderLegHeight].every(s=>validSize((s||'')+' x 1')))c.addIssue({code:'custom',message:'Enter a valid leg height for each special shape size.'});
 if(v.type==='SPD'&&(!['Left','Right'].includes(v.panelSide)||!['Inactive','Active'].includes(v.panelOperation)))c.addIssue({code:'custom',message:'Select patio panel side and Active or Inactive.'});
});
export const reorderSubmission=z.object({id:z.string().uuid().optional(),reason:z.string().trim().min(1).max(4000),remaining:text,acknowledged:z.literal(true),items:z.array(item).min(1).max(50)});
const check=(yes:unknown,msg:string)=>{if(!yes)throw new ApiError(400,msg)};
const read=<T>(schema:z.ZodType<T>,v:unknown):T=>{const p=schema.safeParse(v);if(!p.success)throw new ApiError(400,p.error.issues[0].message);return p.data};
export async function reorderOperation({tx,j,m,data,at,alert,assigned}:any){
 const review=['admin','supervisor'].includes(m.role),o=j.operations;
 check(review||m.role==='installer'&&assigned,'Only assigned installers or FS/Admin can submit reorders.');
 o.reorders ||= [];
 const completeReorder=(r:any)=>{const day=localDay();r.reorderDate=day;j.reorderDate=day;j.reorder=r.reason;if(j.stage==='Production'){j.stage='Incomplete';j.incompleteSince=day;}else if(j.stage==='Incomplete')j.incompleteSince=day;};
 const event=(r:any,message:string)=>{r.events=[...(r.events||[]),{at,by:m.name,message}];r.updatedAt=at;};
 if(data.command==='submit'){
  const v=read(reorderSubmission,data);
  if(m.role==='installer')check(v.items.every(i=>i.photos.length>0),'Installers must upload at least one photo for each reorder item.');
  const old=v.id?o.reorders.find((r:any)=>r.id===v.id):null;
  if(v.id)check(old&&old.status==='Correction requested'&&(review||old.submittedBy===m.id),'Only a returned request can be resubmitted.');
  for(const i of v.items)for(const a of i.photos){
   const file=await tx.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(a.key).first();
   const retained=old?.items?.some((x:any)=>x.photos.some((p:any)=>p.key===a.key));
   check(file?.job_id===j.id&&file?.kind==='issue'&&(file?.member_id===m.id||retained),'Upload photos to this job before submitting.');
   if(!(j.attachments||[]).some((x:any)=>x.key===a.key))j.attachments=[...(j.attachments||[]),{...a,source:'reorder',uploadedBy:m.name,uploadedAt:at}];
  }
  const r={...v,id:old?.id||crypto.randomUUID(),status:'Submitted',submittedBy:m.id,submittedName:m.name,submittedAt:at,events:old?.events||[],revisions:old?[...(old.revisions||[]),{at:old.submittedAt,reason:old.reason,remaining:old.remaining,items:old.items,reviewedBy:old.reviewedBy,reviewedAt:old.reviewedAt,chargebacks:old.chargebacks,chargebackNote:old.chargebackNote,comment:old.comment}]:[]};
  const crewId=m.role==='installer'?m.id:j.installerId;
  const crew=crewId?await tx.prepare("SELECT name,installer_code,profile_details FROM members WHERE id=? AND role='installer'").bind(crewId).first():null;
  Object.assign(r,{contractorName:crew?.name||j.crew||'',contractorNumber:crew?.profile_details?.contractorNumber??(/^C[0-9]+$/i.test(crew?.installer_code||'')?crew.installer_code.toUpperCase():'')});
  if(review){
   const decision=read(z.object({chargebacks:z.array(z.enum(chargeParties)).max(5).default([]),chargebackNote:text}),data);
   check(!decision.chargebacks?.length||!!decision.chargebackNote,'Explain the chargeback decision.');
   Object.assign(r,decision,{status:'Approved',reviewedBy:m.name,reviewedAt:at,reviewAcknowledged:true});
   completeReorder(r);event(r,'Submitted and approved by '+m.name);
  }else event(r,'Submitted for Field Supervisor review');
  if(old)o.reorders=o.reorders.map((x:any)=>x.id===old.id?r:x);else o.reorders.push(r);
  await alert(review?j.installerId:j.supervisorId,`Reorder ${review?'approved':'submitted'} for #${j.number}: ${v.reason}`);
  return review?'Reorder approved; reorder date recorded':'Reorder request submitted';
 }
 check(review,'Field Supervisor or Administrator review required.');
 const r=o.reorders.find((r:any)=>r.id===data.id);check(r,'Reorder request not found.');
 if(data.command==='delete'){
  check(m.role==='admin','Only Administrators can delete reorders.');
  o.deletedReorders=[...(o.deletedReorders||[]),{...r,deletedAt:at,deletedBy:m.id}];
  o.reorders=o.reorders.filter((x:any)=>x.id!==r.id);
  return 'Reorder deleted: '+r.reason;
 }
 if(data.command==='review'){
  check(r.status==='Submitted','This request has already been reviewed.');
  const v=read(z.object({decision:z.enum(['Approved','Correction requested','Declined']),chargebacks:z.array(z.enum(chargeParties)).max(5),chargebackNote:text,comment:text,reviewAcknowledged:z.literal(true)}),data);
  check(!v.chargebacks.length||!!v.chargebackNote,'Explain the chargeback decision.');
  check(v.decision==='Approved'||!!v.comment,'Enter a reason for correction or decline.');
  Object.assign(r,v,{status:v.decision,reviewedBy:m.name,reviewedAt:at});event(r,v.decision+': '+v.comment);
  if(v.decision==='Approved')completeReorder(r);
  await alert(r.submittedBy,`Reorder for #${j.number}: ${v.decision}. ${v.comment}`);
  return 'Reorder '+v.decision.toLowerCase();
 }
 throw new ApiError(400,'Order tracking has been removed.');
}
