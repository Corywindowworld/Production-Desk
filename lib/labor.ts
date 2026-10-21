import {z} from 'zod';
export const laborLine=z.object({description:z.string().trim().min(1).max(250),contract:z.number().finite().min(0).max(10000),rate:z.number().finite().min(0).max(100000),actual:z.number().finite().min(0).max(10000).nullable().default(null),reason:z.string().trim().max(1500).default(''),extra:z.boolean().default(false)});
export const laborLines=z.array(laborLine).min(1).max(100);
export const laborTotal=(lines:any[])=>Math.round(lines.reduce((total,l)=>total+Math.round((l.actual??0)*l.rate*100),0))/100;
export function parseLaborText(text:string){
 const customerId=text.match(/ID\s*#\s*:?\s*(\d+)/i)?.[1]||text.match(/ID\s*#\s*:[^\n]*\n\s*(\d+)\s+C\d+/i)?.[1]||'';
 const lines:any[]=[];
 for(const line of text.split('\n')){
  const m=line.match(/^\s*(.*?)\s+(?:(\d+(?:\.\d+)?)\s+)?[x×]\s*\$?([\d,]+(?:\.\d+)?)(?:\s|$)/i);
  if(m&&m[1].trim())lines.push({description:m[1].trim(),contract:Number(m[2]||0),rate:Number(m[3].replaceAll(',','')),actual:null,reason:'',extra:false});
 }
 return {customerId,lines};
}
export function laborReady(j:any){
 const o=j.operations||{},r=o.report,l=(o.laborSheets||[]).find((s:any)=>s.status==='Approved'&&s.reportKey===reportKey(r));
 const missing=[];
 if(!r?.approved||!r?.certificate)missing.push('Approved completion / incompletion / service certificate');
 if(!l)missing.push('Approved labor');
 if(j.leadRenovationJob&&!o.leadRenovation?.signatureDataUrl)missing.push('Signed Lead Renovation sheet');
 return {labor:l,missing};
}
export function reportKey(r:any){return r?.certificate?.id||r?.certificate?.signedAt||r?.submittedAt||'';}

export function laborVisitType(j:any):'Installation'|'Completion'|'Service'{return j.stage==='SVC'||j.operations?.report?.certificate?.type==='Service'?'Service':j.stage==='Incomplete'||j.incompleteSince||j.serviceCompletionJob||j.operations?.previousReports?.length?'Completion':'Installation';}
