// Explicit current payment methods take precedence over historical import codes.
export function resolvedPaymentMethod(job:any,record:any={}){
 const value=[job.paymentMethod,record.paymentMethod,job.importSource?.paymentCode].map(v=>String(v??'').trim()).find(Boolean)||'';
 const normalized=value.toUpperCase().replace(/[.\s_-]/g,'');
 return ['PO','PURCHASEORDER','PURCHASEORDER(PO)'].includes(normalized)?'PO':value;
}
export function isPurchaseOrder(job:any){
 const raw=resolvedPaymentMethod(job).toUpperCase().replace(/[.\s_-]/g,'');
 return job.stage==='PO'||raw==='PO'||raw==='PURCHASEORDER';
}
export function displayedJobStatus(job:any){return isPurchaseOrder(job)?'PO':job.stage;}
