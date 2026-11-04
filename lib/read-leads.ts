import {readReport} from './read-report';
import {parseLeadsCustomerScan} from './customer-scan';
import {reconcileLeadsScans} from './scan-consensus';

// Read labels and their content instead of assuming a 702px window and fixed field locations.
export async function readLeads(file:File,progress:(s:string)=>void){
 if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
  const text=await readReport(file,progress);const result=parseLeadsCustomerScan(text);
  result.warnings.unshift('PDF extraction: verify all IDs, dates and amounts against the original.');return result;
 }
 if(file.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');
 const bitmap=await createImageBitmap(file);let worker:import('tesseract.js').Worker|undefined;
 try{
  const {createWorker,PSM}=await import('tesseract.js');
  worker=await createWorker('eng',1,{workerPath:'/report-reader/worker.min.js',corePath:'/report-reader',langPath:'/report-reader'});
  const texts:string[]=[];
  for(let pass=0;pass<5;pass++){
   progress(`Reading account: pass ${pass+1} of 5…`);
   const customerColumn=pass>=3;const sourceWidth=customerColumn?Math.round(bitmap.width*.41):bitmap.width;const factor=Math.min(4,4800/Math.max(sourceWidth,bitmap.height));
   const canvas=document.createElement('canvas');canvas.width=Math.round(sourceWidth*factor);canvas.height=Math.round(bitmap.height*factor);
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,sourceWidth,bitmap.height,0,0,canvas.width,canvas.height);
   if(pass===2){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];const v=Math.max(0,Math.min(255,(gray-128)*1.35+128));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}ctx.putImageData(pixels,0,0);}
   await worker.setParameters({tessedit_pageseg_mode:pass===1||pass===4?PSM.SPARSE_TEXT:PSM.AUTO,preserve_interword_spaces:'1',user_defined_dpi:'300'});
   texts.push((await worker.recognize(canvas,{rotateAuto:true})).data.text);canvas.width=0;canvas.height=0;
  }
  return reconcileLeadsScans(texts);
 }finally{bitmap.close();if(worker)await worker.terminate();}
}
