import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {jobCertificatePdf} from './job-certificate-pdf';
import {displayDate} from './display-date';
import {leadStatements} from './lead-form';
const clean=(v:any)=>String(v??'').replace(/[^\x20-\x7e\n]/g,' ');
export async function paperworkPdf(job:any,sheet:any,kind:'labor'|'lead'){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page=pdf.addPage([612,792]),y=748;
 const line=(text:string,size=10,strong=false)=>{
  const words=clean(text).split(/\s+/);let row='';
  const draw=()=>{if(y<48){page=pdf.addPage([612,792]);y=748;}page.drawText(row,{x:44,y,size,font:strong?bold:font,color:rgb(.08,.12,.18)});y-=size+5;row='';};
  for(const word of words){if(font.widthOfTextAtSize(row+' '+word,size)>520&&row)draw();row+=(row?' ':'')+word;}if(row)draw();
 };
 const signature=async(value:string,label:string)=>{line(label,10,true);if(y<115){page=pdf.addPage([612,792]);y=748;}if(value){const image=await pdf.embedPng(value),s=Math.min(240/image.width,55/image.height);page.drawImage(image,{x:44,y:y-55,width:image.width*s,height:image.height*s});}y-=70;};
 line(kind==='labor'?'Window World Tampa Bay - Approved Labor':'Window World Tampa Bay - Lead Renovation',17,true);
 line(`${job.customer} | Customer ID: ${job.number}`,12,true);line([job.address,job.city,job.state,job.zip].filter(Boolean).join(', '));
 if(kind==='labor'){
  line(`Installer: ${sheet.installerName||sheet.submittedBy} | Contractor: ${sheet.contractorId||"Not recorded"} | Approved: ${displayDate(sheet.approvedAt.slice(0,10))}`);line('Original / Requested / Approved quantities and rates',11,true);
  sheet.lines.forEach((l:any,i:number)=>{const approved=sheet.approvedLines[i];line(`${l.description}${l.extra?' (Extra labor)':''}`,10,true);line(`Contract: ${l.contract} | Requested: ${l.actual} | Approved: ${approved.actual} x $${l.rate.toFixed(2)} = $${(approved.actual*l.rate).toFixed(2)}`);if(l.reason)line('Reason: '+l.reason);});
  line(`Requested: $${sheet.requestedTotal.toFixed(2)} | Chargeback: $${sheet.chargeback.toFixed(2)} | Authorized this visit: $${sheet.approvedTotal.toFixed(2)}`,12,true);
  if(sheet.chargebackReason)line('Chargeback reason: '+sheet.chargebackReason);if(sheet.reviewNote)line('Review notes: '+sheet.reviewNote);
  const previous=(job.operations?.laborSheets||[]).filter((s:any)=>s.status==='Approved'&&s.id!==sheet.id&&s.approvedAt<=sheet.approvedAt).reduce((n:number,s:any)=>n+s.approvedTotal,0);line(`Previously authorized labor: $${previous.toFixed(2)}. This document authorizes this visit only.`);
  line("I agree to perform all work in a professional manner. I understand that I am responsible for all taxes, Worker's Comp and General Liability related to this contract. Upon payment of this job according to my subcontractor agreement with Window World, I hereby waive any worker's lien rights I may have. I guarantee my work for two full years and agree to repair any defects during that period at no additional cost to Window World or Customer.");
  await signature(sheet.installerSignature,`Installer: ${sheet.submittedBy} - ${displayDate(sheet.submittedAt.slice(0,10))}`);await signature(sheet.reviewerSignature,`Approved by: ${sheet.approvedBy}`);
 }else{
  const r=sheet;line(`Renovator: ${r.renovatorName} | Contractor: ${r.renovatorId}`);line(`EPA certification: ${r.epaCertification} | Date: ${displayDate(r.signedAt.slice(0,10))}`);
  leadStatements.forEach((q,i)=>line(`${r.answers[i]?'[X] Yes [ ] No':'[ ] Yes [X] No'}   ${q}`,9));
  line('I certify that I have completed this form truthfully and accurately.');await signature(r.signatureDataUrl,r.renovatorName);
 }
 return pdf.save();
}
export async function completionBatchPdf(id:string,items:any[]){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const coverPages=Math.ceil(items.length/20),covers=Array.from({length:coverPages},()=>pdf.addPage([612,792]));
 let pageNumber=coverPages+1;
 for(let i=0;i<items.length;i++){
  const {job,labor}=items[i],sources=[await jobCertificatePdf(job.operations.report.certificate),await paperworkPdf(job,labor,'labor')];
  if(job.leadRenovationJob)sources.push(await paperworkPdf(job,job.operations.leadRenovation,'lead'));
  const start=pageNumber;
  for(const source of sources){const part=await PDFDocument.load(source);for(const page of await pdf.copyPages(part,part.getPageIndices()))pdf.addPage(page);pageNumber+=part.getPageCount();}
  const cover=covers[Math.floor(i/20)],y=680-(i%20)*29;
  cover.drawText(clean(`${job.number} - ${job.customer}`).slice(0,65),{x:44,y,size:11,font});cover.drawText(`Pages ${start}-${pageNumber-1}`,{x:440,y,size:10,font});
 }
 covers.forEach((page,i)=>{page.drawText('Completion Desk Batch',{x:44,y:748,size:20,font:bold});page.drawText(clean(id),{x:44,y:725,size:9,font});page.drawText(`Approved paperwork - ${items.length} jobs - Index ${i+1}/${covers.length}`,{x:44,y:705,size:11,font});});
 pdf.getPages().forEach((page,i)=>page.drawText(`${i+1} / ${pdf.getPageCount()}`,{x:540,y:22,size:8,font}));
 return pdf.save();
}
