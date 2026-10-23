'use client';
import {MAX_UPLOAD_BYTES} from './upload-validation';
import {reportUpload} from './upload-progress';
const waiting:Array<()=>void>=[];let active=0;
async function acquire(){if(active>=2)await new Promise<void>(resolve=>waiting.push(resolve));else active++;}
function release(){const next=waiting.shift();if(next)next();else active--;}
async function compress(file:File){if(!/^image\/(jpeg|png|webp)$/i.test(file.type)||file.size<500000)return file;try{const image=await createImageBitmap(file),scale=Math.min(1,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d');if(!ctx){image.close();return file;}ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));return blob&&blob.size<file.size?new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'}):file;}catch{return file;}}
export async function uploadAttachment(jobId:string,kind:string,original:File){
 const id=crypto.randomUUID();let percent=0;const update=(status:string,value=percent)=>{percent=value;reportUpload({id,jobId,name:original.name,percent,status});};
 update('Queued',0);await acquire();
 try{
 update('Preparing',1);const file=await compress(original);
 if(!file.size||file.size>MAX_UPLOAD_BYTES)throw Error('Choose a nonempty file up to 15 MB.');
 async function api(body:unknown){const response=await fetch('/api/attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json().catch(()=>({error:'Upload request failed. Please retry.'}));if(!response.ok)throw Error(result.error||'Upload failed');return result;}
 const start=await api({action:'begin',jobId,kind,name:file.name.slice(0,255),size:file.size});
 const form=new FormData();form.append('cacheControl','0');form.append('',file);
 update('Uploading',5);
 await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',start.uploadUrl);xhr.setRequestHeader('x-upsert','false');xhr.timeout=180000;xhr.upload.onprogress=e=>{if(e.lengthComputable)update('Uploading',Math.min(90,5+Math.round(e.loaded/e.total*85)));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('Photo storage rejected the transfer (HTTP '+xhr.status+'). Please retry.'));xhr.onerror=()=>reject(Error('Photo transfer failed. Check your connection and retry.'));xhr.ontimeout=()=>reject(Error('Photo upload timed out. Please retry.'));xhr.send(form);});
 update('Saving',95);const result=await api({action:'finish',key:start.key});update('Complete',100);return result.attachment;
 }catch(error){update('Failed - select photo to retry');throw error;}finally{release();}
}
