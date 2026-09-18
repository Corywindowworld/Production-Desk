// All document recognition runs locally in the browser, with same-origin workers/models.
export async function readReport(file:File,progress:(message:string)=>void){
 if(file.size>20*1024*1024)throw Error('Choose a report smaller than 20 MB.');
 let worker:import('tesseract.js').Worker|undefined;
 const recognize=async(image:any)=>{if(!worker){const {createWorker}=await import('tesseract.js');worker=await createWorker('eng',1,{workerPath:'/report-reader/worker.min.js',corePath:'/report-reader',langPath:'/report-reader',logger:m=>progress(`Reading scan: ${Math.round((m.progress||0)*100)}%`)})}return (await worker.recognize(image)).data.text};
 try{
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){const bitmap=await createImageBitmap(file);try{const scale=Math.min(3,2400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*Math.max(1,scale));canvas.height=Math.round(bitmap.height*Math.max(1,scale));const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return await recognize(canvas);}finally{bitmap.close()}}
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/report-reader/pdf.worker.min.mjs';
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  try{if(pdf.numPages>25)throw Error('Import up to 25 pages at a time.');const pages:string[]=[];
   for(let p=1;p<=pdf.numPages;p++){progress(`Reading page ${p} of ${pdf.numPages}`);const page=await pdf.getPage(p),content=await page.getTextContent();const lines=new Map<number,{x:number;text:string}[]>();
    for(const item of content.items){if(!('str' in item)||!item.str.trim())continue;const y=Math.round(item.transform[5]/3)*3;lines.set(y,[...(lines.get(y)||[]),{x:item.transform[4],text:item.str}])}
    let text=[...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n');
    if(text.trim().length<80){const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport}).promise;text=await recognize(canvas);canvas.width=0;canvas.height=0}
    pages.push(text);page.cleanup();
   }return pages.join('\n');
  }finally{await pdf.destroy()}
 }finally{if(worker)await worker.terminate()}
}
