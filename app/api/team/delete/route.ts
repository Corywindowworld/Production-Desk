import {actor,apiError,ApiError,sameOrigin} from '@/lib/access';
import {canEditAccount} from '@/lib/account-roles';
import {database} from '@/db/raw';
import {z} from 'zod';
export async function POST(request:Request){try{
 sameOrigin(request);const m=await actor(request);
 if(m.role!=='admin')throw new ApiError(403,'Administrator access required.');
 const parsed=z.object({id:z.string().min(1).max(100)}).safeParse(await request.json());if(!parsed.success)throw new ApiError(400,'Choose an account.');
 const db=database(),target:any=await db.prepare('SELECT id,name,role FROM members WHERE id=?').bind(parsed.data.id).first();
 if(!target)throw new ApiError(404,'Account not found.');
 if(target.id===m.id||!canEditAccount(m,target,target.role))throw new ApiError(403,'You cannot delete your own account or this protected account.');
 const result=await db.prepare("WITH removed AS (DELETE FROM members AS target WHERE target.id=? AND target.id<>'owner' AND NOT EXISTS (SELECT 1 FROM members AS linked WHERE linked.supervisor_id=target.id) AND NOT EXISTS (SELECT 1 FROM jobs WHERE payload::jsonb->>'installerId'=target.id OR payload::jsonb->>'supervisorId'=target.id) RETURNING id), credentials_removed AS (DELETE FROM credentials WHERE member_id IN (SELECT id FROM removed)), sessions_removed AS (DELETE FROM sessions WHERE member_id IN (SELECT id FROM removed)), push_removed AS (DELETE FROM push_subscriptions WHERE member_id IN (SELECT id FROM removed)), audited AS (INSERT INTO account_audit (id,actor_id,member_id,action,created) SELECT ?,?,id,?,? FROM removed RETURNING member_id) SELECT member_id FROM audited").bind(target.id,crypto.randomUUID(),m.id,'Account deleted: '+target.name,new Date().toISOString()).first();
 if(!result)throw new ApiError(409,'Reassign this account’s jobs and installers before deleting it. You can deactivate an installer to keep historical assignments.');
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e)}}
