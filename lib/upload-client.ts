'use client';
async function preparePhoto(file:File):Promise<File>{
 if(!/^image\/(jpeg|png|webp)$/i.test(file.type)||file.size<500000)return file;
 try{
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext('2d');if(!context){bitmap.close();return file;}context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
  return blob&&blob.size<file.size?new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified}):file;
 }catch{return file;}
}
const waiters:Array<()=>void>=[];let running=0;
async function slot(){if(running>=2)await new Promise<void>(resolve=>waiters.push(resolve));else running++;}
function release(){const next=waiters.shift();if(next)next();else running--;}
async function api(body:any){const response=await fetch('/api/attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Photo upload failed. Please try again.');return data;}
export async function uploadAttachment(jobId:string,kind:string,original:File){
 await slot();try{
  const file=await preparePhoto(original);
  const start=await api({action:'begin',jobId,kind,name:file.name,size:file.size});
  const response=await fetch(start.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
  if(!response.ok)throw Error('Photo transfer failed. Please select this photo again.');
  const finish=await api({action:'finish',key:start.key});return finish.attachment;
 }finally{release();}
}
