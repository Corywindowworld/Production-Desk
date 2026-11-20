import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {formatSillInches} from './marble-sill';

async function loadReorderPhoto(job:any,photo:any){
 const {storage,bucket}=await import('./storage');
 const metadata=await bucket.head(photo.key);
 if(metadata?.customMetadata.jobId!==job.id)throw Error('Reorder photo does not belong to this job.');
 const {data,error}=await storage().download(photo.key);
 if(error||!data)throw Error('Reorder photo could not load: '+photo.name);
 const {reorderPhotoJpeg}=await import('./reorder-photo');
 return reorderPhotoJpeg(new Uint8Array(await data.arrayBuffer()));
}
// Render directly into the batch PDF so the reorder remains printable offline.
export async function reorderFormPdf(job:any,reorder:any,loadPhoto=loadReorderPhoto){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const clean=(v:any)=>String(v??'').replace(/[^\x20-\x7e\n]/g,' ');
 let page:any,y=0;
 const newPage=()=>{page=pdf.addPage([612,792]);y=742;page.drawText('Contractor Reorder Form',{x:44,y,size:18,font:bold});y-=25;page.drawText(clean(job.customer+' | CID #'+job.number).slice(0,90),{x:44,y,size:11,font:bold});y-=24;};
 const line=(value:any,strong=false)=>{
  const size=10,face=strong?bold:font;
  for(const paragraph of clean(value).split('\n')){
   let current='';
   const draw=()=>{if(y<54)newPage();page.drawText(current,{x:44,y,size,font:face});y-=14;current='';};
   for(const word of paragraph.split(/\s+/)){
    // Break unusually long references and descriptions without clipping text.
    for(const char of (current?' ':'')+word){if(face.widthOfTextAtSize(current+char,size)>520)draw();current+=char;}
   }
   draw();
  }
 };
 const field=(label:string,value:any)=>line(label+': '+(value===undefined||value===null||value===''?'None recorded':value));
 newPage();
 field('Customer address',[job.address,job.city,job.state,job.zip].filter(Boolean).join(', '));
 field('Contractor',reorder.contractorName||job.crew||reorder.submittedName);
 field('Contractor ID',reorder.contractorNumber||job.contractorId);
 field('Sales Rep',job.salesRep);
 field('Submitted',reorder.submittedAt);field('Submitted by',reorder.submittedName);
 field('Status',reorder.status);field('Reorder reference',reorder.id);
 line('Reason for reorder',true);line(reorder.reason);
 field('Other work remaining',reorder.remaining||'None');
 field('Charge Back To',(reorder.chargebacks||[]).join(', ')||'None');field('Chargeback notes',reorder.chargebackNote);
 for(const [index,item] of (reorder.items||[]).entries()){
  if(y<180)newPage();y-=8;
  page.drawLine({start:{x:44,y},end:{x:568,y},thickness:.6,color:rgb(.7,.75,.8)});y-=18;
  line('Item '+(index+1)+' | '+item.type+' | Location '+item.window+' | Qty '+item.quantity,true);
  const details:any={orderedSize:'Ordered size',actualSize:'Actual returned size',reorderSize:'Reorder size',serial:'Serial number',position:'Sash position',panelSide:'Panel side',panelOperation:'Panel operation',description:'Description'};
  for(const [key,label] of Object.entries(details))if(item[key])field(label as string,item[key]);
  if(item.windowInstalled)line('Window installed - no return');
  if(item.sameSizeAsOrder)line('Actual size same as order');
  if(item.specialShape){field('Special shape leg heights (ordered / actual / reorder)',[item.orderedLegHeight,item.actualLegHeight,item.reorderLegHeight].map((v:any)=>v||'Not recorded').join(' / '));}
  if(item.type==='Marble Sill'){field('Length (inches)',formatSillInches(item.sillLength));field('Depth (inches)',formatSillInches(item.sillDepth));if(item.sillSplitCount)field('Split piece',item.sillSplitPart+' of '+item.sillSplitCount+'; original length '+formatSillInches(item.sillOriginalLength));}
 }
 y-=8;line('Review and order details',true);
 for(const [key,label] of Object.entries({reviewedBy:'Reviewed by',reviewedAt:'Reviewed on',comment:'Review notes',vendor:'Vendor',reference:'Order reference',orderedDate:'Ordered date',estimatedShipDate:'Estimated ship date',receivedDate:'Received date',bay:'Bay',returnDate:'Return date',managerInitials:'Manager initials'}))field(label,reorder[key]);
 field('Tag returned',reorder.tagReturned?'Yes':'No');
 for(const item of reorder.items||[])for(const photo of item.photos||[]){
  const image=await pdf.embedJpg(await loadPhoto(job,photo));
  newPage();line(item.type+' | Location '+item.window,true);line(photo.name||'Reorder photo');
  const scale=Math.min(524/image.width,(y-50)/image.height);
  page.drawImage(image,{x:44+(524-image.width*scale)/2,y:y-image.height*scale,width:image.width*scale,height:image.height*scale});
 }
 const pages=pdf.getPages();for(let i=0;i<pages.length;i++)pages[i].drawText('Production Desk | Reorder | CID #'+clean(job.number)+' | '+(i+1)+' of '+pages.length,{x:44,y:28,size:8,font});
 return pdf.save();
}
