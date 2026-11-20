import {laborCustomerId} from './labor';
export function matchingLaborJobs(jobs:any[],cid:string){const id=laborCustomerId(cid);return jobs.filter(j=>String(j.number).trim()===cid.trim()||(id&&laborCustomerId(j.number)===id));}
export function laborImportDisposition(draft:any){
 if(!draft)return 'Draft';
 if(draft.status!=='Draft')return 'Imported';
 const fields=draft.formFields||{};
 if(Object.values(fields).some(v=>Array.isArray(v)?v.length:!!v)||draft.installerSignature)return 'Imported';
 const untouched=(draft.lines||[]).every((l:any)=>!l.reason&&!l.extra&&(l.actual==null||l.actual===0&&l.contract===0||draft.source==='upload'&&l.actual===l.contract));
 return untouched?'Draft':'Imported';
}
