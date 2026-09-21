import {z} from 'zod';
import {database} from '@/db/raw';
import {ApiError,type Member} from './access';
import {formatPhone} from './phone';
const contact=z.object({id:z.string().min(1),name:z.string().trim().min(1).max(100),leadInstallerName:z.string().trim().max(150),phone:z.string().trim().max(50),address:z.string().trim().max(500),contactEmail:z.union([z.string().email(),z.literal('')]),emergencyContact:z.string().trim().max(150),emergencyPhone:z.string().trim().max(50),supervisorId:z.string().min(1).optional(),inactive:z.boolean().optional()}).strict();
export async function installerProfiles(m:Member){
 const db=database();const rows=await (m.role==='installer'?db.prepare("SELECT id,name,phone,email,active,installer_code,supervisor_id,profile_details FROM members WHERE id=? AND role='installer'").bind(m.id):db.prepare("SELECT id,name,phone,email,active,installer_code,supervisor_id,profile_details FROM members WHERE role='installer' ORDER BY name")).all();
 const supervisors=m.role==='installer'?[]:(await db.prepare("SELECT id,name FROM members WHERE role IN ('admin','supervisor') AND active=1 ORDER BY name").all()).results;
 return {supervisors,installers:rows.results.map((r:any)=>({id:r.id,supervisorId:r.supervisor_id||'',name:r.name,phone:r.phone,active:r.active,installerCode:r.installer_code,leadInstallerName:r.profile_details?.leadInstallerName||'',address:r.profile_details?.address||'',contactEmail:r.profile_details?.contactEmail??(r.email.endsWith('@pending.invalid')?'':r.email),emergencyContact:r.profile_details?.emergencyContact||'',emergencyPhone:r.profile_details?.emergencyPhone||''})),canManage:['admin','supervisor'].includes(m.role),selfId:m.id};
}
export async function saveInstallerProfile(m:Member,input:unknown){
 const p=contact.safeParse(input);if(!p.success)throw new ApiError(400,'Check the installer name, email and contact fields.');const d=p.data,manager=['admin','supervisor'].includes(m.role);
 if(!manager&&!(m.role==='installer'&&m.id===d.id))throw new ApiError(403,'You can only edit your own installer profile.');
 if(d.supervisorId!==undefined&&!manager)throw new ApiError(403,'Only a Field Supervisor or Administrator may change crew assignment.');
 if(d.inactive!==undefined&&!manager)throw new ApiError(403,'Only a Field Supervisor or Administrator may change active status.');
 const db=database(),at=new Date().toISOString();await db.transaction(async tx=>{
  const r=await tx.prepare("SELECT * FROM members WHERE id=? AND role='installer' FOR UPDATE").bind(d.id).first();if(!r)throw new ApiError(404,'Installer not found.');
  if(d.supervisorId!==undefined&&d.supervisorId!==r.supervisor_id){const supervisor=await tx.prepare("SELECT id,name FROM members WHERE id=? AND role IN ('admin','supervisor') AND active=1 FOR SHARE").bind(d.supervisorId).first();if(!supervisor)throw new ApiError(400,'Choose an active Field Supervisor.');await tx.prepare('UPDATE members SET supervisor_id=? WHERE id=?').bind(supervisor.id,d.id).run();await tx.prepare("UPDATE jobs SET payload=(payload::jsonb || jsonb_build_object('supervisorId',?::text,'supervisor',?::text))::text,version=version+1,updated=? WHERE payload::jsonb->>'installerId'=?").bind(supervisor.id,supervisor.name,at,d.id).run();await tx.prepare('INSERT INTO account_audit(id,actor_id,member_id,action,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),m.id,d.id,'Crew Field Supervisor changed to '+supervisor.name,at).run();}
  const details={...r.profile_details,leadInstallerName:d.leadInstallerName,address:d.address,contactEmail:d.contactEmail,emergencyContact:d.emergencyContact,emergencyPhone:formatPhone(d.emergencyPhone)};
  await tx.prepare('UPDATE members SET name=?,phone=?,profile_details=?::jsonb,active=? WHERE id=?').bind(d.name,formatPhone(d.phone),JSON.stringify(details),d.inactive===undefined?r.active:d.inactive?0:1,d.id).run();
  if(d.inactive===true){await tx.prepare('DELETE FROM sessions WHERE member_id=?').bind(d.id).run();await tx.prepare('DELETE FROM push_subscriptions WHERE member_id=?').bind(d.id).run()}
  if(d.name!==r.name)await tx.prepare("UPDATE jobs SET payload=(payload::jsonb || jsonb_build_object('crew',?::text))::text,version=version+1,updated=? WHERE payload::jsonb->>'installerId'=?").bind(d.name,at,d.id).run();
  await tx.prepare('INSERT INTO account_audit(id,actor_id,member_id,action,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),m.id,d.id,'Installer profile updated'+(d.inactive===undefined?'':d.inactive?' · Inactive':' · Active'),at).run();
 });
}
