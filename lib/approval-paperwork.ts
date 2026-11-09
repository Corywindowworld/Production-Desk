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
