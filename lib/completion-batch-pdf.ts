import {leadRenovationPdf} from './lead-renovation-pdf';
import {laborFormPdf} from './labor-form-pdf';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {jobCertificatePdf} from './job-certificate-pdf';
const clean=(v:any)=>String(v??'').replace(/[^\x20-\x7e\n]/g,' ');
export async function paperworkPdf(job:any,sheet:any,kind:'labor'|'lead'){return kind==='labor'?laborFormPdf(job,sheet):leadRenovationPdf(sheet);}
export async function completionBatchPdf(id:string,items:any[],created?:string){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const coverPages=Math.ceil(items.length/20),covers=Array.from({length:coverPages},()=>pdf.addPage([612,792]));
 for(let i=0;i<items.length;i++){
  const {job,labor}=items[i],sources=[await jobCertificatePdf(job.operations.report.certificate)];
  if(!labor.omitLabor)sources.push(await paperworkPdf(job,labor,'labor'));
  if(job.leadRenovationJob||job.operations?.leadRenovation?.signatureDataUrl){if(!job.operations?.leadRenovation?.signatureDataUrl)throw Error(job.customer+': Lead Renovation sheet missing.');sources.push(await paperworkPdf(job,job.operations.leadRenovation,'lead'));}
  for(const source of sources){const part=await PDFDocument.load(source);for(const page of await pdf.copyPages(part,part.getPageIndices()))pdf.addPage(page);}
  const cover=covers[Math.floor(i/20)],y=680-(i%20)*29;
  cover.drawText(clean(`${job.number} - ${job.customer}`).slice(0,65),{x:44,y,size:11,font});
 }
 covers.forEach(page=>{page.drawText('Completion Desk Batch',{x:44,y:748,size:20,font:bold});if(created)page.drawText(new Date(created).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'}),{x:44,y:725,size:11,font});page.drawText('Approved paperwork - '+items.length+' jobs',{x:44,y:705,size:11,font});});
 return pdf.save();
}
