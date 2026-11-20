'use client';
import {InAppDocumentLink} from './in-app-document-link';
import {printLeadRenovation} from '@/lib/print-lead-renovation';
import {laborMatchesReport} from '@/lib/approval-paperwork';
export function ApprovalPrintButtons({j,report,sheet,onError}:{j:any;report:any;sheet?:any;onError:(message:string)=>void}){
 const sheets=sheet?[sheet]:(j.operations?.laborSheets||[]).filter((s:any)=>s.status==='Approved'&&laborMatchesReport(s,report));
 const lead=sheet?.packetJob?.operations?.leadRenovation?.signatureDataUrl?sheet.packetJob.operations.leadRenovation:j.operations?.leadRenovation;
 return <>{sheets.map((s:any,i:number)=><InAppDocumentLink className="live-button" key={s.id} href={'/api/labor?jobId='+encodeURIComponent(j.id)+'&sheetId='+encodeURIComponent(s.id)}>Print Labor Sheet{sheets.length>1?' '+(i+1):''}</InAppDocumentLink>)}{lead?.signatureDataUrl&&<button type="button" className="live-button" onClick={()=>{try{printLeadRenovation(lead);}catch(e){onError((e as Error).message);}}}>Print Lead Sheet</button>}</>;
}
