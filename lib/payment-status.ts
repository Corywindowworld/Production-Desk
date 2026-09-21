// Explicit current payment methods take precedence over historical import codes.
export function isPurchaseOrder(job:any){
 const raw=String(job.paymentMethod||job.importSource?.paymentCode||'').trim().toUpperCase().replace(/[.\s_-]/g,'');
 return job.stage==='PO'||raw==='PO'||raw==='PURCHASEORDER';
}
export function displayedJobStatus(job:any){return isPurchaseOrder(job)?'PO':job.stage;}
