import {createHash,randomBytes} from 'node:crypto';
import {database} from '@/db/raw';
import {ApiError,canSeeJob,type Member} from './access';
import {drawnSignature} from './account-profile';
import {certificateSnapshot,certificateInputSchema,certificateEmailHtml} from './job-certificate';
import {jobCertificatePdfBase64} from './job-certificate-pdf';
import {deliverOperationEmail} from './operations-store';
import {z} from 'zod';
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export const linkKey=(token:string)=>{if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError(404,'This signing link is invalid.');return 'certificate-link:'+createHash('sha256').update(token).digest('hex')};
export function assertUsable(link:any,now=Date.now()){if(!link)throw new ApiError(404,'This signing link is invalid.');if(link.usedAt)throw new ApiError(410,'This certificate has already been signed. Thank you.');if(Date.parse(link.expiresAt)<=now)throw new ApiError(410,'This signing link has expired. Please contact Window World for a new link.');}
const inviteSchema=z.object({jobId:z.string().min(1).max(100),type:z.enum(['Complete','Incomplete']),email:z.string().trim().email(),completedWindows:z.string().trim().max(2000).default(''),installerSignatureDataUrl:drawnSignature});
const esc=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function inviteCertificate(m:Member,input:unknown,base:string){
 if(!['admin','supervisor','production_assistant','office'].includes(m.role))throw new ApiError(403,'Office or field supervisor access required.');
 const v=inviteSchema.parse(input);
 if(v.type==='Incomplete'&&!v.completedWindows)throw new ApiError(400,'List the completed windows and frames.');
 const db=database(),token=randomBytes(32).toString('hex'),id=linkKey(token),at=new Date().toISOString(),emailId=crypto.randomUUID(),expiresAt=new Date(Date.now()+7*86400000).toISOString();
 const url=new URL('/certificate/'+token,base).toString();
 await db.transaction(async tx=>{
 const row=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(v.jobId).first();
 if(!row)throw new ApiError(404,'Job not found.');const j=decode(row.payload);
 if(!canSeeJob(m,j))throw new ApiError(403,'Job access required.');
 const snapshot={id:j.id,number:j.number,customer:j.customer,address:j.address,city:j.city,state:j.state,zip:j.zip,amount:j.amount,contractAmount:j.contractAmount,installerId:m.id,crew:m.name};
 const member=await tx.prepare('SELECT profile_details,installer_code FROM members WHERE id=?').bind(m.id).first();
 const link={jobId:v.jobId,snapshot,type:v.type,email:v.email,completedWindows:v.completedWindows,installerSignatureDataUrl:v.installerSignatureDataUrl,signer:m,member,expiresAt,createdAt:at};
 await tx.prepare('INSERT INTO production.operations_config(id,payload,updated_by,updated) VALUES(?,?,?,?)').bind(id,JSON.stringify(link),m.id,at).run();
 const body='<!doctype html><html><body style="font-family:Arial;background:#f2f6fc;padding:24px"><main style="max-width:600px;margin:auto;background:white;border-radius:24px;padding:28px"><img alt="Window World" width="64" src="https://productiondesk.app/icon-w-circled.png"><h1 style="color:#0033a0">Your installation certificate</h1><p>Hi '+esc(j.customer)+',</p><p>Please review and sign your '+(v.type==='Complete'?'completion':'incompletion')+' certificate for '+esc(j.address)+'. You can complete it on your phone, tablet or computer.</p><p><a style="display:inline-block;background:#0033a0;color:white;padding:16px 24px;border-radius:24px" href="'+esc(url)+'">Review and sign certificate</a></p><p>A PDF copy will be emailed to you after signing. This private link expires in 7 days. Please do not forward it.</p><p>Thank you for choosing Window World!</p></main></body></html>';
 await tx.prepare('INSERT INTO production.operations_email(id,recipient,subject,body,status,created,updated) VALUES(?,?,?,?,?,?,?)').bind(emailId,v.email,'Window World · '+j.customer+' · Please sign your certificate',body,'pending',at,at).run();
 j.history=[{at,by:m.name,text:'Emailed '+v.type.toLowerCase()+' certificate signing invitation to '+v.email},...(j.history||[])];
 await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,v.jobId).run();
 });
 const status=await deliverOperationEmail(emailId);return {ok:status==='accepted',emailStatus:status,expiresAt};
}
export async function publicCertificate(token:string){
 const row=await database().prepare('SELECT payload FROM production.operations_config WHERE id=?').bind(linkKey(token)).first(),link=row?decode(row.payload):null;assertUsable(link);
 const j=link.snapshot;return {type:link.type,customer:j.customer,customerId:String(j.number),address:[j.address,j.city,j.state,j.zip].filter(Boolean).join(', '),amount:j.amount,contractAmount:j.contractAmount,email:link.email,completedWindows:link.completedWindows,preparer:link.signer.name};
}
export async function signCertificate(token:string,input:any){
 const id=linkKey(token),db=database(),at=new Date().toISOString(),emailId=crypto.randomUUID();
 await db.transaction(async tx=>{
 const row=await tx.prepare('SELECT payload FROM production.operations_config WHERE id=? FOR UPDATE').bind(id).first(),link=row?decode(row.payload):null;assertUsable(link);
 const v=certificateInputSchema.parse({...input,type:link.type,customerEmail:link.email,completedWindows:link.completedWindows,installerSignatureDataUrl:link.installerSignatureDataUrl});
 if(link.snapshot.amount!=null&&v.paymentAmount>link.snapshot.amount)throw new ApiError(400,'Amount paid cannot exceed the balance shown.');
 const certificate={...certificateSnapshot(link.snapshot,link.signer,v,link.member,at),signedByStaff:true},pdfBase64=await jobCertificatePdfBase64(certificate);
 const jobRow=await tx.prepare('SELECT payload FROM jobs WHERE id=? FOR UPDATE').bind(link.jobId).first();if(!jobRow)throw new ApiError(410,'This job is no longer available.');
 const j=decode(jobRow.payload);j.operations??={};j.operations.remoteCertificates=[...(j.operations.remoteCertificates||[]),{...certificate,certificateEmailId:emailId}];
 j.history=[{at,by:certificate.homeownerName,text:'Customer signed emailed '+link.type.toLowerCase()+' certificate; saved to Digital Documents. Management review pending.'},...(j.history||[])];
 await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(j),at,link.jobId).run();
 link.usedAt=at;link.certificateId=certificate.id;
 await tx.prepare('UPDATE production.operations_config SET payload=?,updated=? WHERE id=?').bind(JSON.stringify(link),at,id).run();
 const body=JSON.stringify({kind:'job-certificate',certificate,html:certificateEmailHtml(certificate),text:'Your signed Window World certificate is attached.',filename:'Window-World-Certificate-'+String(certificate.customerId).replace(/[^a-z0-9_-]/gi,'-')+'.pdf',pdfBase64});
 await tx.prepare('INSERT INTO production.operations_email(id,recipient,subject,body,status,created,updated) VALUES(?,?,?,?,?,?,?)').bind(emailId,link.email,'Window World · '+certificate.customerName+' · Signed certificate',body,'pending',at,at).run();
 });
 const emailStatus=await deliverOperationEmail(emailId);return {ok:true,emailStatus};
}
