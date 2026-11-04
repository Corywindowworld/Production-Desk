import {leadRenovationPdf} from './lead-renovation-pdf';
import {laborFormPdf} from './labor-form-pdf';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {jobCertificatePdf} from './job-certificate-pdf';
const clean=(v:any)=>String(v??'').replace(/[^\x20-\x7e\n]/g,' ');
export async function paperworkPdf(job:any,sheet:any,kind:'labor'|'lead'){return kind==='labor'?laborFormPdf(job,sheet):leadRenovationPdf(sheet);}
export function batchSheetStatus(job:any){const report=job.operations?.report;return report?.certificate?.type==='Complete'?'COMP':report?.certificate?.type==='Incomplete'?'INC':report?.certificate?.type==='Service'?'SVC':report?.status==='Complete'||report?.status==='Completed'||report?.status==='COMP'?'COMP':'INC';}
export function orderedBatchItems(items:any[]){const rank:Record<string,number>={COMP:0,INC:1,SVC:2};return [...items].sort((a,b)=>rank[batchSheetStatus(a.job)]-rank[batchSheetStatus(b.job)]);}
export async function completionBatchPdf(id:string,items:any[],created?:string){
 items=orderedBatchItems(items);
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const coverPages=Math.ceil(items.length/20),covers=Array.from({length:coverPages},()=>pdf.addPage([612,792]));
 for(let i=0;i<items.length;i++){
  const {job,labor}=items[i],sources=[await jobCertificatePdf(job.operations.report.certificate)];
  if(!labor.omitLabor)sources.push(await paperworkPdf(job,labor,'labor'));
  if(job.leadRenovationJob||job.operations?.leadRenovation?.signatureDataUrl){if(!job.operations?.leadRenovation?.signatureDataUrl)throw Error(job.customer+': Lead Renovation sheet missing.');sources.push(await paperworkPdf(job,job.operations.leadRenovation,'lead'));}
  for(const source of sources){const part=await PDFDocument.load(source);for(const page of await pdf.copyPages(part,part.getPageIndices()))pdf.addPage(page);}
  const cover=covers[Math.floor(i/20)],y=651-(i%20)*28;
  const cells=[{text:job.number,x:50,width:56},{text:job.customer,x:118,width:210},{text:job.operations?.report?.certificate?.paymentMethod||'None recorded',x:340,width:152},{text:batchSheetStatus(job),x:504,width:58}];
  for(const cell of cells){const words=clean(cell.text).split(/\s+/),lines:string[]=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,9)>cell.width&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);for(let n=0;n<Math.min(2,lines.length);n++){let text=lines[n];if(n===1&&lines.length>2)text+='...';while(font.widthOfTextAtSize(text,9)>cell.width&&text.length>3)text=text.slice(0,-4)+'...';cover.drawText(text,{x:cell.x,y:y-n*10,size:9,font:cell.x===504?bold:font});}}
  cover.drawLine({start:{x:44,y:y-16},end:{x:568,y:y-16},color:rgb(.85,.89,.93),thickness:.5});
 }
 covers.forEach(page=>{page.drawText('Completion Desk Batch',{x:44,y:748,size:20,font:bold});if(created)page.drawText(new Date(created).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'}),{x:44,y:725,size:11,font});page.drawText('Approved paperwork - '+items.length+' jobs',{x:44,y:705,size:11,font});page.drawRectangle({x:44,y:669,width:524,height:22,color:rgb(.92,.95,.98)});[['CID',50],['Customer',118],['Payment method',340],['Status',504]].forEach(([text,x])=>page.drawText(String(text),{x:Number(x),y:677,size:10,font:bold}));});
 return pdf.save();
}
