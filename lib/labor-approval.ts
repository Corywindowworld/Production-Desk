export const staffInitials=(name:string)=>name.trim().split(/\s+/).map(s=>s[0]||'').join('').toUpperCase().slice(0,12);
export function laborPaymentSummary(job:any){
 const report=job.operations?.report||{},c=report.certificate||{};
 const stages:Record<string,string>={Closed:'COMP',Complete:'COMP',Incomplete:'INC',Production:'PROD',Received:'RCVD',Ordered:'ORD',Service:'SVC',SVC:'SVC',PO:'PO',COLL:'COLL',UTI:'UTI',SERV:'SVC'};
 const status=stages[job.stage]||stages[report.status]||stages[c.type]||String(job.stage||'Not recorded');
 const methods:Record<string,string>={Finance:'FNC',Check:'CHK','Credit Card':'CC'};
 const method=methods[c.paymentMethod]||(c.paymentMethod&&c.paymentMethod!=='Paid In Full'?c.paymentMethod:job.paymentMethod)||'Not recorded';
 const paidInFull=c.paymentMethod==='Paid In Full'||typeof c.remainingBalance==='number'&&c.remainingBalance===0||typeof job.amount==='number'&&job.amount===0;
 const paymentAmount=typeof c.paymentAmount==='number'?c.paymentAmount:null;
 return {status,method,paidInFull,paymentAmount,checkNumber:method==='CHK'||method==='Check'?String(c.paymentReference||'').trim():'',label:`${status} ${paidInFull?'PIF':'Balance due'} via ${method}`};
}
