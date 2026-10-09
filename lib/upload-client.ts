'use client';
import {MAX_UPLOAD_BYTES} from './upload-validation';
export async function uploadAttachment(jobId:string,kind:string,file:File){
 if(!file.size||file.size>MAX_UPLOAD_BYTES)throw new Error('Choose a nonempty file up to 15 MB.');
 async function api(body:unknown){const r=await fetch('/api/attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({error:`Upload request failed (HTTP ${r.status}). Please retry.`}));if(!r.ok)throw new Error(data.error||'Upload failed');return data}
 const start=await api({action:'begin',jobId,kind,name:file.name.slice(0,255),size:file.size});
 const form=new FormData();form.append('cacheControl','0');form.append('',file);
 let uploaded:Response;
 try{uploaded=await fetch(start.uploadUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form});}
 catch{throw new Error('The browser could not reach photo storage. Check your connection. If you are on a work network, it may be blocking Supabase uploads.');}
 if(!uploaded.ok){
  const details=await uploaded.json().catch(()=>null);
  const status=Number(details?.statusCode||uploaded.status);
  if(status===413)throw new Error('Photo storage rejected the file size. Choose a file under 15 MB or ask an administrator to repair Photo storage in Account management.');
  if(status===401||status===403)throw new Error('Photo storage rejected this upload. Select the file again; if it repeats, ask an administrator to check Photo storage in Account management.');
  throw new Error(`Photo storage rejected the file (HTTP ${status}). Ask an administrator to check Photo storage in Account management.`);
 }
 return (await api({action:'finish',key:start.key})).attachment;
}
