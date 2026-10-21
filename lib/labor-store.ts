import {completeLaborRows,standardLaborSheet} from './labor-standard';
import {laborPaymentSummary,staffInitials} from './labor-approval';
import {createHash} from 'node:crypto';
import {matchingLaborJobs,laborImportDisposition} from './labor-import';
import {database} from '@/db/raw';
import {ApiError,canSeeJob,type Member} from './access';
import {drawnSignature,readProfileDetails} from './account-profile';
import {laborLines,laborTotal,reportKey,laborVisitType,laborCustomerId} from './labor';
import {z} from 'zod';
import {blankLaborTemplate,templateDetailsValid} from './labor-template';
const formFields=z.object({stop:z.string().max(20).optional(),stopOf:z.string().max(20).optional(),differences:z.string().max(1500).optional(),miscLabor:z.string().max(1500).optional(),receivedBy:z.string().max(150).optional(),checklistExplanation:z.string().max(1500).optional(),answer0:z.enum(['Yes','No']).optional(),answer1:z.enum(['Yes','No']).optional(),answer2:z.enum(['Yes','No']).optional(),truck:z.array(z.enum(['Yard Signs','Drop Cloth','Trim & Caulk','Parts','Vacuum','Spray Foam'])).max(6).optional()});
function saveFormFields(m:Member,sheet:any,input:any){const fields=formFields.parse(input),old=sheet.formFields||{};if(!['admin','supervisor'].includes(m.role)){fail(JSON.stringify([...(fields.truck||[])].sort())===JSON.stringify([...(old.truck||[])].sort())&&(fields.receivedBy||'')===(old.receivedBy||''),'Only FS/Admin can complete Truck Inspection.',403);fields.truck=old.truck||[];fields.receivedBy=old.receivedBy;}sheet.formFields=fields;}
const office=(m:Member)=>['admin','supervisor','office','production_assistant'].includes(m.role);
const fail=(ok:any,message:string,status=400)=>{if(!ok)throw new ApiError(status,message)};
const object=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export async function laborAction(m:Member,input:any){
 const base=z.object({jobId:z.string().uuid(),version:z.number().int(),action:z.enum(['start','import','draft','submit','review','edit']),sheetId:z.string().uuid().optional()}).parse(input);
 return database().transaction(async tx=>{
  const row=await tx.prepare('SELECT payload,version FROM jobs WHERE id=? FOR UPDATE').bind(base.jobId).first();fail(row,'Job not found.',404);
  const j=object(row.payload);fail(canSeeJob(m,j),'Job access required.',403);fail(row.version===base.version,'This job changed. Refresh before saving.',409);
  j.operations||={};const sheets=(j.operations.laborSheets||[]).map((s:any)=>input.standardLayout===true?standardLaborSheet(s):s);j.operations.laborSheets=sheets;const at=new Date().toISOString();let message='';
  if(base.action==='start'){
   fail(office(m)||m.role==='installer'&&canSeeJob(m,j),'Assigned installer or office access required.',403);
   fail(!sheets.some((s:any)=>['Draft','Submitted','Returned'].includes(s.status)),'A labor sheet is already open for this job. Continue that sheet.',409);
   const kind=z.enum(['Installation','Completion','Service']).parse(input.visitType),template=z.boolean().optional().parse(input.template)===true;
   sheets.push({id:crypto.randomUUID(),status:'Draft',source:'manual',visitType:kind,lines:template?blankLaborTemplate():[],originalLines:[],...(template?{templateVersion:'LS-2500'}:{}),createdAt:at,createdBy:m.name});message=`Blank ${kind.toLowerCase()} labor sheet opened`;
  }else if(base.action==='import'){
   fail(office(m),'Office access required.',403);
   const v=z.object({lines:laborLines,sourceKey:z.string().min(1).max(250),customerId:z.string(),confirmed:z.literal(true).optional(),automatic:z.boolean().default(false),replace:z.boolean().default(false)}).parse(input);
   fail(v.customerId.trim()===String(j.number).trim()||(!!laborCustomerId(v.customerId)&&laborCustomerId(v.customerId)===laborCustomerId(j.number)),'Customer ID must match this job.');
   if(v.automatic){const all=(await tx.prepare('SELECT payload FROM jobs').all()).results.map((r:any)=>object(r.payload));const matches=matchingLaborJobs(all,v.customerId);fail(matches.length===1&&matches[0].id===j.id,'Customer ID matches more than one account. Resolve the duplicate CID before importing.');}
   const source=await tx.prepare("SELECT key FROM attachment_uploads WHERE key=? AND job_id=? AND member_id=? AND kind='labor' AND status='ready'").bind(v.sourceKey,j.id,m.id).first();fail(source,'Upload the original labor PDF to this job first.');
   const importKey=createHash('sha256').update(JSON.stringify({cid:String(j.number).trim(),lines:v.lines.map(l=>[l.description,l.contract,l.rate])})).digest('hex');
   const duplicate=sheets.find((s:any)=>s.source==='upload'&&(s.importKey===importKey||JSON.stringify((s.originalLines||s.lines).map((l:any)=>[l.description,l.contract,l.rate]))===JSON.stringify(v.lines.map(l=>[l.description,l.contract,l.rate]))));
   if(duplicate)return {ok:true,duplicate:true,version:row.version,sheetId:duplicate.id,importStatus:duplicate.status};
   const draft=sheets.find((s:any)=>['Draft','Submitted','Returned'].includes(s.status));
   let status='Draft';
   if(v.automatic){status=laborImportDisposition(draft);if(draft&&status==='Draft')draft.status='Replaced';}
   else{fail(!draft||v.replace,'A labor sheet already exists. Select Replace after reviewing the existing sheet.',409);if(draft){fail(draft.status!=='Submitted','Return the submitted sheet for correction before replacing it.',409);draft.status='Replaced';}}
   sheets.push({id:crypto.randomUUID(),status,source:'upload',standardLayout:true,importKey,visitType:laborVisitType(j),lines:completeLaborRows(v.lines,true).map(l=>({...l,actual:l.scanMissing?null:sheets.some((s:any)=>s.status==='Approved')?null:l.contract,extra:false,reason:''})),sourceKey:v.sourceKey,createdAt:at,createdBy:m.name});message=status==='Imported'?'Labor PDF and contract values attached; current installer work preserved':'Sales-order labor PDF and contract values attached by Customer ID';

  }else{
   const sheet=sheets.find((s:any)=>s.id===base.sheetId);fail(sheet,'Labor sheet not found.',404);if(['draft','submit'].includes(base.action)&&input.template===true&&sheet.source==='manual'&&(!sheet.lines.length||sheet.lines.every((l:any)=>!l.description&&!l.actual&&l.rate==null))){sheet.templateVersion='LS-2500';sheet.lines=blankLaborTemplate();}
   if(base.action==='edit'){
    fail(['admin','supervisor'].includes(m.role),'FS/Admin edit access required.',403);
    fail(sheet.status!=='Replaced','This sheet has been replaced.',409);
    const lines=z.array(z.object({description:z.string().trim().min(1).max(250),contract:z.number().int().min(0).max(10000),rate:z.number().finite().min(0).max(100000).nullable(),actual:z.number().int().min(0).max(10000).nullable(),reason:z.string().max(1500).default(''),extra:z.boolean().default(false)})).min(1).max(100).parse(input.lines);
    const snapshot=structuredClone(sheet);delete snapshot.revisions;
    sheet.revisions=[...(sheet.revisions||[]),{at,by:m.name,sheet:snapshot}];
    const needsReview=['Submitted','Approved'].includes(sheet.status);
    if(needsReview)fail(lines.every(l=>l.actual!==null&&l.rate!==null),'Enter actual units and pay for every submitted labor line.');
    sheet.lines=lines;sheet.originalLines=structuredClone(lines);delete sheet.templateVersion;
    if(input.formFields!==undefined)saveFormFields(m,sheet,input.formFields);
    if(needsReview){sheet.status='Submitted';sheet.requestedTotal=laborTotal(lines);for(const key of ['approvedLines','approvedTotal','approvedAt','approvedBy','reportKey','packetJob','reviewerSignature','approvalSummary'])delete sheet[key];}
    message='Labor sheet edited by FS/Admin'+(needsReview?' — pending management review':'');
   }else if(base.action==='draft'){
    fail(office(m)||m.role==='installer'&&canSeeJob(m,j),'Assigned installer or office access required.',403);
    fail(['Draft','Returned'].includes(sheet.status),'Only an open labor draft can be edited.',409);
    const line=z.object({description:z.string().max(250),contract:z.number().finite().int('Enter whole numbers for labor units.').min(0).max(10000),rate:z.number().finite().min(0).max(100000).nullable(),actual:z.number().finite().int('Enter whole numbers for labor units.').min(0).max(10000).nullable(),reason:z.string().max(1500),extra:z.boolean()});
    const v=z.object({lines:z.array(line).min(1).max(100)}).parse(input),original=sheet.originalLines||sheet.lines;
    if(sheet.source!=='manual'){fail(v.lines.length>=original.length,'Keep every sales-order labor item.');original.forEach((l:any,i:number)=>fail(v.lines[i].description===l.description&&v.lines[i].contract===l.contract&&(v.lines[i].rate===l.rate||l.rate==null&&(v.lines[i].rate===0||['Trip Charge','Miscellaneous Labor'].includes(l.description))),'Sales-order labor details cannot be changed.'));sheet.originalLines=original;}
    if(sheet.templateVersion)fail(templateDetailsValid(v.lines),'Keep the printed labor descriptions and pay rates.');sheet.lines=v.lines;if(input.formFields!==undefined)saveFormFields(m,sheet,input.formFields);message='Labor draft saved';
   }else if(base.action==='submit'){
    fail(office(m)||m.role==='installer'&&canSeeJob(m,j),'Assigned installer or office access required.',403);
    fail(['Draft','Returned'].includes(sheet.status),'This sheet has already been submitted.',409);
    const v=z.object({lines:laborLines,signature:drawnSignature,confirmed:z.literal(true)}).parse(input);
    const original=sheet.originalLines||sheet.lines;fail(v.lines.length>=original.length,'Keep every sales-order labor item.');if(sheet.templateVersion)fail(templateDetailsValid(v.lines),'Keep the printed labor descriptions and pay rates.');if(input.formFields!==undefined)saveFormFields(m,sheet,input.formFields);
    v.lines.forEach((l,i)=>{fail(l.actual!==null,'Enter actual units for every line, including zero.');if(sheet.source==='manual'){l.contract=0;l.extra=false;}else if(i<original.length){const old=original[i];fail(l.description===old.description&&l.contract===old.contract&&(l.rate===old.rate||old.rate==null&&(l.rate===0||['Trip Charge','Miscellaneous Labor'].includes(l.description))),'Contract descriptions, quantities and rates cannot be changed by the installer.');if(l.actual!==l.contract)fail(l.reason,'Explain each quantity change.');}else{fail(l.reason,'Explain extra labor.');l.extra=true;}});
    const crew=await tx.prepare('SELECT name,installer_code,profile_details FROM members WHERE id=?').bind(m.role==='installer'?m.id:j.installerId).first();
    const crewProfile=readProfileDetails(crew?.profile_details);
    Object.assign(sheet,{installerName:crew?.name||j.crew||m.name,contractorId:crewProfile.contractorNumber||crew?.installer_code||'',originalLines:original,lines:v.lines,status:'Submitted',submittedAt:at,submittedBy:m.name,installerSignature:v.signature,requestedTotal:laborTotal(v.lines)});message='Installer labor submitted for FS/Admin review';
   }else{
    fail(['admin','supervisor'].includes(m.role),'FS/Admin approval required.',403);fail(sheet.status==='Submitted','No labor submission is pending.',409);
    const v=z.object({approve:z.boolean(),note:z.string().trim().max(2000),approvedUnits:z.array(z.number().finite().int('Enter whole numbers for labor units.').min(0).max(10000)).max(100).optional(),chargeback:z.number().finite().min(0).max(100000).default(0),chargebackReason:z.string().trim().max(2000).default(''),chargebackTo:z.array(z.enum(['Sales Rep','Contractor','Factory','Warranty'])).max(4).default([]),authorization:z.enum(['complete','other']).optional(),truck:z.array(z.enum(['Yard Signs','Drop Cloth','Trim & Caulk','Parts','Vacuum','Spray Foam'])).max(6).optional(),receivedBy:z.string().trim().max(150).optional()}).parse(input);
    if(!v.approve){fail(v.note,'Explain the correction needed.');Object.assign(sheet,{status:'Returned',reviewNote:v.note});message='Labor returned for correction';}
    else{
     fail(j.operations.report?.approved&&reportKey(j.operations.report),'Approve the completion, incompletion or service certificate first.');
     fail(!sheets.some((s:any)=>s.status==='Approved'&&s.reportKey===reportKey(j.operations.report)),'Labor is already approved for this certificate. Use a new visit certificate for additional labor.',409);
     fail(v.approvedUnits?.length===sheet.lines.length,'Review every requested labor line.');
     const lines=sheet.lines.map((l:any,i:number)=>({...l,actual:v.approvedUnits![i]}));
     fail(lines.every((l:any,i:number)=>l.actual<=sheet.lines[i].actual),'Approved units cannot exceed requested units. Return the sheet for correction.');
     fail(lines.every((l:any,i:number)=>l.actual===sheet.lines[i].actual)||v.note,'Explain adjustments or denied labor.');
     fail(!v.chargeback||v.chargebackReason,'Explain the chargeback.');
     fail(!j.leadRenovationJob||j.operations.leadRenovation?.signatureDataUrl,'Complete the required Lead Renovation sheet before approving labor.');
     const gross=laborTotal(lines);fail(v.chargeback<=gross,'Chargeback cannot exceed this visit’s labor.');
     const profile=readProfileDetails((await tx.prepare('SELECT profile_details FROM members WHERE id=?').bind(m.id).first())?.profile_details);
     fail(profile.savedDrawnSignature,'Save your drawn signature in My Profile before approving labor.');
     sheet.formFields={...(sheet.formFields||{}),...(v.truck!==undefined?{truck:v.truck}:{}),...(v.receivedBy!==undefined?{receivedBy:v.receivedBy}:{})};
     Object.assign(sheet,{approvalSummary:laborPaymentSummary(j),approverInitials:staffInitials(m.name),approverEmployeeNumber:profile.employeeNumber||'',status:'Approved',approvedLines:lines,approvedTotal:Math.round((gross-v.chargeback)*100)/100,chargeback:v.chargeback,chargebackReason:v.chargebackReason,chargebackTo:v.chargebackTo,authorization:v.authorization,reviewNote:v.note,approvedAt:at,approvedBy:m.name,reviewerSignature:profile.savedDrawnSignature,reportKey:reportKey(j.operations.report),packetJob:{id:j.id,number:j.number,customer:j.customer,address:j.address,city:j.city,state:j.state,zip:j.zip,phone:j.phone,phone2:j.phone2,phone3:j.phone3,crew:j.crew,salesRep:j.salesRep,region:j.region,instructions:j.instructions,scheduleInstructions:j.scheduleInstructions,amount:j.amount,stage:j.stage,paymentMethod:j.paymentMethod,leadRenovationJob:!!j.leadRenovationJob,operations:{report:structuredClone(j.operations.report),leadRenovation:structuredClone(j.operations.leadRenovation||null),laborSheets:sheets.filter((s:any)=>s.status==='Approved').map((s:any)=>({id:s.id,status:s.status,approvedTotal:s.approvedTotal,approvedAt:s.approvedAt}))}}});message='Labor approved: $'+sheet.approvedTotal.toFixed(2);
    }
   }
  }
  j.history=[{at,by:m.name,text:message},...(j.history||[])];
  await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,j.id).run();
  if(base.action==='submit'){
   const recipients=(await tx.prepare("SELECT id FROM members WHERE active=1 AND role IN ('admin','supervisor')").all()).results;
   for(const r of recipients)await tx.prepare('INSERT INTO notifications(id,recipient_id,job_id,message,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),r.id,j.id,`${j.customer} (#${j.number}): installer labor ready for review.`,at).run();
  }
  return {ok:true,version:row.version+1,sheetId:sheets.find((s:any)=>['Draft','Submitted','Returned'].includes(s.status))?.id,importStatus:base.action==='import'?sheets[sheets.length-1]?.status:undefined};
 });
}
