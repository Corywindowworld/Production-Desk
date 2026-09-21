import {readReport} from './read-report';

// Coordinates correspond to the standard Leads Service Notes window, including title bar.
export async function readLeads(file:File,progress:(s:string)=>void){
 if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))return readReport(file,progress);
 if(file.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');
 const bitmap=await createImageBitmap(file);
 const {createWorker,PSM}=await import('tesseract.js');
 const worker=await createWorker('eng',1,{workerPath:'/report-reader/worker.min.js',corePath:'/report-reader',langPath:'/report-reader'});
 try{
  const scale=bitmap.width/702;
  if(bitmap.height<117*scale)throw Error('Include the entire Service Notes window, starting at its title bar.');
  const crop=(x:number,y:number,w:number,h:number,multiplier:number)=>{
   const canvas=document.createElement('canvas');
   canvas.width=w*multiplier;
   canvas.height=h*multiplier;
   const ctx=canvas.getContext('2d')!;
   ctx.fillStyle='white';
   ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(bitmap,x*scale,y*scale,w*scale,h*scale,0,0,canvas.width,canvas.height);
   return {canvas,ctx};
  };
  const read=async(x:number,y:number,w:number,h:number,line=false)=>{
   const {canvas}=crop(x,y,w,h,4);
   await worker.setParameters({tessedit_pageseg_mode:line?PSM.SINGLE_LINE:PSM.SINGLE_BLOCK,tessedit_char_whitelist:''});
   return (await worker.recognize(canvas)).data.text.trim();
  };
  const validDate=(value:string)=>{
   const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
   if(!match)return false;
   const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]);
   const check=new Date(Date.UTC(year,month-1,day));
   return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day;
  };
  // Reading just the date pixels prevents nearby label letters from turning 8 into 3 or 5 into 6.
  // The value is accepted only when at least two independently thresholded passes agree.
  const numericDate=async(x:number,y:number,w:number,h:number)=>{
   if((y+h)*scale>bitmap.height)return '';
   const results:string[]=[];
   for(const threshold of [150,180,210]){
    const {canvas,ctx}=crop(x,y,w,h,8);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){
     const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];
     const value=gray>threshold?255:0;
     pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
    }
    ctx.putImageData(pixels,0,0);
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'0123456789/'});
    results.push((await worker.recognize(canvas)).data.text.replace(/\s/g,''));
   }
   await worker.setParameters({tessedit_char_whitelist:''});
   const counts=new Map<string,number>();
   results.forEach(value=>counts.set(value,(counts.get(value)||0)+1));
   const winner=[...counts].sort((a,b)=>b[1]-a[1])[0];
   return winner&&winner[1]>=2&&validDate(winner[0])?winner[0]:'';
  };
  // The ship date sits against the right edge. Two layout modes read a wider labeled crop,
  // and the date is accepted only when they independently return the same valid value.
  const contextualDate=async(x:number,y:number,w:number,h:number)=>{
   if((y+h)*scale>bitmap.height)return '';
   const {canvas,ctx}=crop(x,y,w,h,8);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   for(let i=0;i<pixels.data.length;i+=4){
    const gray=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;
   }
   ctx.putImageData(pixels,0,0);
   const results:string[]=[];
   for(const mode of [PSM.SINGLE_BLOCK,PSM.SPARSE_TEXT]){
    await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:''});
    const text=(await worker.recognize(canvas)).data.text;
    results.push(text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0]||'');
   }
   return results[0]&&results[0]===results[1]&&validDate(results[0])?results[0]:'';
  };

  progress('Reading Customer ID…');
  const id=await read(8,51,133,17,true);
  progress('Reading name and street address…');
  const contact=await read(8,70,139,47);
  progress('Reading Bay and cross-checking date digits…');
  const bay=await read(312,84,103,19,true);
  const reorder=await numericDate(242,303,65,19);
  const ship=await contextualDate(570,310,128,35);
  progress('Reading remaining account fields…');
  const rest=await readReport(file,progress);
  const lines=contact.split('\n').map(s=>s.trim()).filter(Boolean);
  return [
   id,lines[0]||'',lines[1]||'',lines[2]||'',bay,
   'ReOrd Date: '+(reorder||'UNCONFIRMED — enter from image'),
   'Last Est Ship Date: '+(ship||'UNCONFIRMED — enter from image'),
   rest.replace(/(?:Reorder|ReOrd)\s*Date\s*:?[^\n]*/gi,'')
    .replace(/Last\s+Est(?:imated)?\s+Ship\s*Date\s*:?[^\n]*/gi,'')
    .replace(/Customer\s*(?:ID|TW)\s*#?\s*:?\s*\d+/gi,'Scanned ID (secondary)')
  ].join('\n');
 }finally{
  bitmap.close();
  await worker.terminate();
 }
}
