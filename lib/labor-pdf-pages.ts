import {PDFDocument} from 'pdf-lib';

/** Isolate customer paperwork before reading or uploading it to an account. */
export async function splitLaborPdf(bytes:ArrayBuffer|Uint8Array){
 const source=await PDFDocument.load(bytes);
 const pages:Uint8Array[]=[];
 for(let index=0;index<source.getPageCount();index++){
  const single=await PDFDocument.create();
  const [page]=await single.copyPages(source,[index]);
  single.addPage(page);
  pages.push(await single.save());
 }
 return pages;
}
