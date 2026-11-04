export function warehouseJobProgress(items:any[],jobId:string){
 const rows=items.filter(i=>i.job_id===jobId),received=rows.filter(i=>i.status==='Received'&&!!i.bay?.trim()).length;
 const blockers:string[]=[];const counts=new Map<string,number>();
 for(const row of rows){if(row.status!=='Received')counts.set(row.status,(counts.get(row.status)||0)+1);else if(!row.bay?.trim())counts.set('Missing bay',(counts.get('Missing bay')||0)+1);}
 for(const [status,count] of counts)blockers.push(`${count} ${status.toLowerCase()}`);
 return {total:rows.length,received,ready:rows.length>0&&received===rows.length,blockers,bays:[...new Set<string>(rows.map(i=>String(i.bay||'').trim()).filter(Boolean))]};
}
export function searchWarehouseJobs(jobs:any[],items:any[],query:string){
 const key=query.trim().toLowerCase();if(!key)return [];
 const matched=new Set(items.filter(i=>[i.po,i.cid,i.manufacturer_order,i.aq,i.external_id,i.barcode].some(v=>String(v||'').toLowerCase().includes(key))).map(i=>i.job_id));
 return jobs.filter(j=>j.stage==='Ordered'&&(matched.has(j.id)||[j.number,j.customer,j.address,j.city].some(v=>String(v||'').toLowerCase().includes(key)))).sort((a,b)=>Number(String(b.number)===key)-Number(String(a.number)===key)||a.customer.localeCompare(b.customer));
}
