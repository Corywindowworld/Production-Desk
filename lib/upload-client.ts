'use client';
import {MAX_UPLOAD_BYTES} from './upload-validation';
export async function uploadAttachment(jobId:string,kind:string,file:File){
 if(!file.size||file.size>MAX_UPLOAD_BYTES)throw new Error('Choose a nonempty file up to 15 MB.');
 async function api(body:unknown){const r=await fetch('/api/attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Upload failed');return data}
 const start=await api({action:'begin',jobId,kind,name:file.name.slice(0,255),size:file.size});
 const form=new FormData();form.append('cacheControl','0');form.append('',file);
 const uploaded=await fetch(start.uploadUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form});
 if(!uploaded.ok)throw new Error('The file upload failed. Select the file to try again.');
 return (await api({action:'finish',key:start.key})).attachment;
}
