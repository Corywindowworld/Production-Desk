import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {reportImportSchema} from './report-import';
import {localDay} from './operations';
export async function importGuild(m:Member,input:unknown){
 if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');
 const parsed=reportImportSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'Check all survey dates, installer codes and four scores (0–4).');
 const rows=parsed.data.rows;if(rows.some(r=>r.completedOn>localDay()))throw new ApiError(400,'Survey dates cannot be in the future.');
 const result={created:0,inserted:0,skipped:0};const at=new Date().toISOString();
 await database().transaction(async tx=>{
  await tx.prepare('LOCK TABLE members IN SHARE ROW EXCLUSIVE MODE').run();
  const members=(await tx.prepare('SELECT id,name,role,installer_code FROM members').all()).results;const mapped=new Map<string,string>();
  for(const r of rows){
   if(!mapped.has(r.code)){
    const matches=members.filter((v:any)=>v.role==='installer'&&(String(v.installer_code||'').toUpperCase()===r.code||v.name.trim().toLowerCase()===r.name.toLowerCase()));
    if(matches.length>1)throw new ApiError(409,`Multiple installer profiles match ${r.code}. Resolve them in account management first.`);
    if(matches[0]?.installer_code&&String(matches[0].installer_code).toUpperCase()!==r.code)throw new ApiError(409,`Installer name matches another crew code for ${r.code}. Review account management first.`);
    let id=matches[0]?.id;
    if(!id){id=crypto.randomUUID();const supervisors=members.filter((v:any)=>['admin','supervisor'].includes(v.role)&&v.name.trim().toLowerCase()===r.supervisor.toLowerCase());
     await tx.prepare("INSERT INTO members(id,email,name,role,supervisor_id,installer_code,active,invitation_status) VALUES(?,?,?,'installer',?,?,1,'needs_setup')").bind(id,`installer-${id}@pending.invalid`,r.name,supervisors.length===1?supervisors[0].id:null,r.code).run();
     await tx.prepare('INSERT INTO account_audit(id,actor_id,member_id,action,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),m.id,id,'Installer profile created from GQ report; no credentials issued',at).run();result.created++;
    }
    if(matches[0]&&!matches[0].installer_code)await tx.prepare('UPDATE members SET installer_code=? WHERE id=?').bind(r.code,id).run();
    mapped.set(r.code,id);
   }
   const key=`gq:${r.code}:${r.customerId}:${r.completedOn}`,ratings=r.ratings.map(n=>n+1),id=mapped.get(r.code)!;
   const old=await tx.prepare('SELECT installer_id,ratings FROM production.operations_surveys WHERE external_id=?').bind(key).first();
   if(old){if(old.installer_id!==id||JSON.stringify(old.ratings)!==JSON.stringify(ratings))throw new ApiError(409,`Conflicting survey ${key}. Review the existing record before importing.`);result.skipped++;continue}
   await tx.prepare('INSERT INTO production.operations_surveys(id,external_id,installer_id,completed_on,ratings,entered_by,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),key,id,r.completedOn,JSON.stringify(ratings),m.id,at).run();result.inserted++;
  }
 });return result;
}
