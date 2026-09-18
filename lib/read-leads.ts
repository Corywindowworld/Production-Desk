import {readReport} from './read-report';
// Coordinates correspond to the standard Leads Service Notes window, including title bar.
export async function readLeads(file:File,progress:(s:string)=>void){
 if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))return readReport(file,progress);
 if(file.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');
 const bitmap=await createImageBitmap(file);const {createWorker,PSM}=await import('tesseract.js');
 const worker=await createWorker('eng',1,{workerPath:'/report-reader/worker.min.js',corePath:'/report-reader',langPath:'/report-reader'});
 try{
 const scale=bitmap.width/702;
 if(bitmap.height<117*scale)throw Error('Include the entire Service Notes window, starting at its title bar.');
 const read=async(x:number,y:number,w:number,h:number,line=false)=>{const c=document.createElement('canvas');c.width=w*4;c.height=h*4;const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,x*scale,y*scale,w*scale,h*scale,0,0,c.width,c.height);await worker.setParameters({tessedit_pageseg_mode:line?PSM.SINGLE_LINE:PSM.SINGLE_BLOCK});return (await worker.recognize(c)).data.text.trim()};
 progress('Reading Customer ID…');const id=await read(8,51,133,17,true);
 progress('Reading name and street address…');const contact=await read(8,70,139,47);
 progress('Reading remaining account fields…');const rest=await readReport(file,progress);
 const lines=contact.split('\n').map(s=>s.trim()).filter(Boolean);
 return [id,lines[0]||'',lines[1]||'',lines[2]||'',rest.replace(/Customer\s*(?:ID|TW)\s*#?\s*:?\s*\d+/gi,'Scanned ID (secondary)')].join('\n');
 }finally{bitmap.close();await worker.terminate()}
}
