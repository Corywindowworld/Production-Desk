import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {reportImportSchema} from './report-import';
import {localDay} from './operations';
export async function importGuild(m:Member,input:unknown){
 if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');
 const parsed=reportImportSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'Check all survey dates, installer codes and four scores (0–4).');
 const rows=parsed.data.rows;if(rows.some(r=>r.completedOn>localDay()))throw new ApiError(400,'Survey dates cannot be in the future.');
 const result={created:0,inserted:0,skipped:0,reassigned:0};const at=new Date().toISOString();
 const nameKey=(value:string)=>value.toLowerCase().replace(/&/g,' and ').replace(/\b(?:incorporated|inc|llc|company|corp|corporation|construction|windows?|doors?|solutions?|services?)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
 const decodedRatings=(value:any)=>{try{const decoded=typeof value==='string'?JSON.parse(value):value;return Array.isArray(decoded)?decoded:null}catch{return null}};
 await database().transaction(async tx=>{
  await tx.prepare('LOCK TABLE members IN SHARE ROW EXCLUSIVE MODE').run();
  const members=(await tx.prepare("SELECT m.id,m.email,m.name,m.role,m.installer_code,m.active,CASE WHEN c.member_id IS NULL THEN 0 ELSE 1 END AS login_ready FROM members m LEFT JOIN credentials c ON c.member_id=m.id").all()).results;const mapped=new Map<string,string>();
  for(const r of rows){
   if(!mapped.has(r.code)){
    const installers=members.filter((v:any)=>v.role==='installer'),byCode=installers.filter((v:any)=>String(v.installer_code||'').toUpperCase()===r.code),byName=installers.filter((v:any)=>nameKey(v.name)===nameKey(r.name));
    let selected:any=r.installerId?installers.find((v:any)=>v.id===r.installerId):null;
    if(r.installerId&&!selected)throw new ApiError(400,`The selected installer account for ${r.code} is no longer available. Preview the report again.`);
    if(!selected){const liveCode=byCode.filter((v:any)=>v.login_ready),liveName=byName.filter((v:any)=>v.login_ready);if(liveCode.length===1)selected=liveCode[0];else if(liveCode.length>1)throw new ApiError(409,`Multiple active login accounts use ${r.code}. Resolve them in account management first.`);else if(liveName.length===1)selected=liveName[0];else if(liveName.length>1)throw new ApiError(409,`Multiple installer accounts match ${r.name}. Select the correct account in the import preview.`);else if(byCode.length===1)selected=byCode[0];else if(byName.length===1)selected=byName[0];else if(byCode.length>1||byName.length>1)throw new ApiError(409,`Multiple installer profiles match ${r.code}. Select the correct account in the import preview.`)}
    if(selected?.installer_code&&String(selected.installer_code).toUpperCase()!==r.code)throw new ApiError(409,`${selected.name} is already assigned to ${selected.installer_code}. Correct the installer ID in Account management before assigning ${r.code}.`);
    let id=selected?.id;
    if(!id){id=crypto.randomUUID();const supervisors=members.filter((v:any)=>['admin','supervisor'].includes(v.role)&&v.name.trim().toLowerCase()===r.supervisor.toLowerCase());
     await tx.prepare("INSERT INTO members(id,email,name,role,supervisor_id,installer_code,active,invitation_status) VALUES(?,?,?,'installer',?,?,1,'needs_setup')").bind(id,`installer-${id}@pending.invalid`,r.name,supervisors.length===1?supervisors[0].id:null,r.code).run();
     await tx.prepare('INSERT INTO account_audit(id,actor_id,member_id,action,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),m.id,id,'Installer profile created from GQ report; no credentials issued',at).run();members.push({id,email:`installer-${id}@pending.invalid`,name:r.name,role:'installer',installer_code:r.code,active:1,login_ready:0});result.created++;
    }else{
     const duplicates=byCode.filter((v:any)=>v.id!==id&&!v.login_ready);
     for(const duplicate of duplicates){const moved=await tx.prepare('UPDATE production.operations_surveys SET installer_id=? WHERE installer_id=?').bind(id,duplicate.id).run();result.reassigned+=moved.meta.changes;await tx.prepare('UPDATE members SET installer_code=NULL,active=0 WHERE id=?').bind(duplicate.id).run();duplicate.installer_code=null;duplicate.active=0;}
     if(!selected.installer_code){await tx.prepare('UPDATE members SET installer_code=? WHERE id=?').bind(r.code,id).run();selected.installer_code=r.code;}
    }
    mapped.set(r.code,id);
   }
   const key=`gq:${r.code}:${r.customerId}:${r.completedOn}`,ratings=r.ratings.map(n=>n+1),id=mapped.get(r.code)!;
   const old=await tx.prepare('SELECT installer_id,ratings FROM production.operations_surveys WHERE external_id=?').bind(key).first();
   if(old){if(JSON.stringify(decodedRatings(old.ratings))!==JSON.stringify(ratings))throw new ApiError(409,`Conflicting survey ${key}. Review the existing record before importing.`);if(old.installer_id!==id){await tx.prepare('UPDATE production.operations_surveys SET installer_id=? WHERE external_id=?').bind(id,key).run();result.reassigned++;}else result.skipped++;continue}
   await tx.prepare('INSERT INTO production.operations_surveys(id,external_id,installer_id,completed_on,ratings,entered_by,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),key,id,r.completedOn,JSON.stringify(ratings),m.id,at).run();result.inserted++;
  }
 });return result;
}
