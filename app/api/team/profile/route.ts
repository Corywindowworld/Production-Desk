import {actor,ApiError,apiError,sameOrigin} from '@/lib/access';
import {database} from '@/db/raw';
import {canEditAccount} from '@/lib/account-roles';
import {profileInput} from '@/lib/account-profile';
export async function GET(request:Request){try{
 const m=await actor(request);if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');
 const id=new URL(request.url).searchParams.get('id')||m.id;
 const target:any=await database().prepare('SELECT id,name,email,role,phone,active,supervisor_id,installer_code,can_edit_jobs,can_score_all_installers,quality_score,profile_details FROM members WHERE id=?').bind(id).first();
 if(!target)throw new ApiError(404,'Account not found.');
 return Response.json({member:target,canEdit:m.id===target.id||canEditAccount(m,target,target.role),isSelf:m.id===target.id,canManage:canEditAccount(m,target,target.role)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
export async function POST(request:Request){try{
 sameOrigin(request);const m=await actor(request);if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');
 const input=profileInput.safeParse(await request.json());if(!input.success)throw new ApiError(400,'Check profile fields, dates and additional information.');
 const d=input.data,db=database(),target:any=await db.prepare('SELECT id,name,role FROM members WHERE id=?').bind(d.id).first();
 if(!target)throw new ApiError(404,'Account not found.');
 if(m.id!==target.id&&!canEditAccount(m,target,target.role))throw new ApiError(403,'You cannot edit this profile.');
 const at=new Date().toISOString(),statements=[db.prepare('UPDATE members SET name=?,phone=?,profile_details=?::jsonb WHERE id=?').bind(d.name,d.phone,JSON.stringify(d.details),d.id)];
 if(d.name!==target.name){
  statements.push(db.prepare("UPDATE jobs SET payload=(payload::jsonb || jsonb_build_object('crew',?::text))::text,version=version+1,updated=? WHERE payload::jsonb->>'installerId'=?").bind(d.name,at,d.id));
  statements.push(db.prepare("UPDATE jobs SET payload=(payload::jsonb || jsonb_build_object('supervisor',?::text))::text,version=version+1,updated=? WHERE payload::jsonb->>'supervisorId'=?").bind(d.name,at,d.id));
 }
 statements.push(db.prepare('INSERT INTO account_audit (id,actor_id,member_id,action,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),m.id,d.id,'Profile information updated',at));await db.batch(statements);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
