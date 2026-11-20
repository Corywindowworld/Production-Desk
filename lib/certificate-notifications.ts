import {database} from '@/db/raw';
import {z} from 'zod';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Resolve only the requesting FS/Admin and the assigned FS from active staff records.
export async function certificateStaffRecipients(db:any,requesterId:string,supervisorId?:string){
 const rows=(await db.prepare("SELECT id,email FROM members WHERE active=1 AND role IN ('admin','supervisor') AND (id=? OR id=?) ORDER BY id").bind(requesterId,supervisorId||'').all()).results;
 const valid=rows.filter((r:any)=>z.string().email().safeParse(r.email).success);
 if(!valid.length){const owner=await db.prepare("SELECT id,email FROM members WHERE id='owner' AND role='admin' AND active=1").first();if(owner&&z.string().email().safeParse(owner.email).success)valid.push(owner);}
 return valid.filter((r:any,i:number)=>valid.findIndex((v:any)=>v.email.trim().toLowerCase()===r.email.trim().toLowerCase())===i);
}
export async function queueCertificateStaffEmail(db:any,sourceId:string,recipients:any[],subject:string,body:string,at:string){
 const ids:string[]=[];
 for(const recipient of recipients){const id='certificate-notice:'+sourceId+':'+recipient.id;await db.prepare('INSERT INTO production.operations_email(id,recipient,subject,body,status,created,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,recipient.email,subject,body,'pending',at,at).run();ids.push(id);}
 return ids;
}
// Called after provider acceptance, including a retry of a previously failed invitation.
export async function queueCertificateSentConfirmation(email:any){
 let pkg:any;try{pkg=typeof email.body==='string'?JSON.parse(email.body):email.body;}catch{return [];}
 if(pkg?.kind!=='certificate-invite'||!pkg.staffNotice)return [];
 const db=database(),n=pkg.staffNotice,recipients=await certificateStaffRecipients(db,n.requesterId,n.supervisorId);
 const body='<!doctype html><html><body style="font-family:Arial"><h1>Certificate signing request sent</h1><p>The '+esc(n.type==='Complete'?'completion':'incompletion')+' certificate signing request for '+esc(n.customer)+' (CID #'+esc(n.number)+') was accepted for delivery to '+esc(email.recipient)+'.</p><p>Address: '+esc(n.address)+'</p><p>Requested by: '+esc(n.requesterName)+'</p><p>The customer has not signed yet. You will receive a separate email with the signed certificate when they finish.</p></body></html>';
 return queueCertificateStaffEmail(db,email.id,recipients,'Production Desk · '+n.customer+' · Certificate signing request sent',body,new Date().toISOString());
}
