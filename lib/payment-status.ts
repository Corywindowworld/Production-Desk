// Explicit current payment methods take precedence over historical import codes.
export function resolvedPaymentMethod(job:any,record:any={}){
 const value=[job.paymentMethod,record.paymentMethod,job.importSource?.paymentCode].map(v=>String(v??'').trim()).find(Boolean)||'';
 const normalized=value.toUpperCase().replace(/[.\s_-]/g,'');
 return ['PO','PURCHASEORDER','PURCHASEORDER(PO)'].includes(normalized)?'PO':value;
}
export function isPurchaseOrder(job:any){
 const raw=resolvedPaymentMethod(job).toUpperCase().replace(/[.\s_-]/g,'');
 return normalizedStatusValue(job.stage)==='PO'||normalizedStatusValue(job.status)==='PO'||raw==='PO'||raw==='PURCHASEORDER';
}

const statusAliases:Record<string,string>={
 ORDERED:'Ordered',ORD:'Ordered',RECEIVED:'Received',RCVD:'Received',
 PRODUCTION:'Production',PROD:'Production',INPROGRESS:'InProgress',
 INCOMPLETE:'Incomplete',INC:'Incomplete',CLOSED:'Closed',COMP:'Closed',
 PO:'PO',PURCHASEORDER:'PO',UTI:'UTI',UNABLETOINSTALL:'UTI',
 COLL:'COLL',COLLECTION:'COLL',COLLECTIONS:'COLL',
 SVC:'SVC',SERV:'SVC',SERVICE:'SVC'
};
function normalizedStatusValue(value:any){
 const raw=String(value??'').trim();
 if(!raw)return '';
 return statusAliases[raw.toUpperCase().replace(/[.\s_-]/g,'')]||raw;
}
export function normalizedJobStatus(job:any){
 if(isPurchaseOrder(job))return 'PO';
 const values=[job.stage,job.status].map(normalizedStatusValue).filter(Boolean);
 return values.find(v=>['PO','UTI','COLL','SVC'].includes(v))||values[0]||'';
}
export function displayedJobStatus(job:any){return normalizedJobStatus(job);}
