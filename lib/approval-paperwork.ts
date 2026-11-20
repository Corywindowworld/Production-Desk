import {reportKey} from './labor';
export const approvedLaborToClear=(j:any)=>(j.operations?.laborSheets||[]).filter((s:any)=>s.status==='Approved'&&!s.approvalDismissed);
export const laborMatchesReport=(sheet:any,report:any)=>!!reportKey(report)&&(sheet.reportKey||reportKey(sheet.packetJob?.operations?.report))===reportKey(report);

export function dismissApprovedLabor(sheet: any, by: string, at: string) {
  sheet.approvalDismissed = true;
  sheet.approvalDismissedAt = at;
  sheet.approvalDismissedBy = by;
}

export function dismissApprovedReport(operations: any, by: string, at: string) {
  operations.report.approvalDismissed = true;
  for (const sheet of operations.laborSheets || []) {
    if (sheet.status === 'Approved' && laborMatchesReport(sheet, operations.report)) dismissApprovedLabor(sheet, by, at);
  }
}

// A collapsed job selects only reviewed paperwork that can be cleared together.
export function clearableJobApprovals(job:any){
 const items:{jobId:string;version:number;kind:'report'|'labor'|'reorder';recordId?:string}[]=[];
 const report=job.operations?.report;
 const includeReport=report?.approved&&!report.pending&&!report.approvalDismissed;
 if(includeReport)items.push({jobId:job.id,version:job.version,kind:'report'});
 for(const sheet of approvedLaborToClear(job))if(!includeReport||!laborMatchesReport(sheet,report))items.push({jobId:job.id,version:job.version,kind:'labor',recordId:sheet.id});
 for(const reorder of job.operations?.reorders||[])if(!reorder.approvalDismissed&&reorder.status!=='Submitted')items.push({jobId:job.id,version:job.version,kind:'reorder',recordId:reorder.id});
 return items;
}
