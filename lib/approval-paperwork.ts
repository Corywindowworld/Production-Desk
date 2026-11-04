import {reportKey} from './labor';
export const approvedLaborToClear=(j:any)=>(j.operations?.laborSheets||[]).filter((s:any)=>s.status==='Approved'&&!s.approvalDismissed);
export const laborMatchesReport=(sheet:any,report:any)=>!!reportKey(report)&&(sheet.reportKey||reportKey(sheet.packetJob?.operations?.report))===reportKey(report);
