import {currentSession} from '@/lib/auth-session';
import { database } from '@/db/raw';
export type Member={id:string;email:string;user_id?:string;name:string;role:'admin'|'office'|'production_assistant'|'supervisor'|'installer';supervisor_id?:string;can_edit_jobs?:number;active:number};
export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
export async function actor(request:Request):Promise<Member>{
 const session=await currentSession(request);
 if(!session)throw new ApiError(401,'Sign in with your email and password.');
 if(session.restricted||session.must_change)throw new ApiError(428,'Change your temporary password before accessing the app.');
 const {id,email,name,role,supervisor_id,can_edit_jobs,active}=session;
 return {id,email,name,role,supervisor_id,can_edit_jobs,active};
}
export const isOwner=(m:Member)=>m.id==='owner';
export const canManageAccounts=(m:Member)=>m.role==='admin';
export const isOffice=(m:Member)=>m.role==='admin'||m.role==='office'||m.role==='production_assistant';
export function canSeeJob(m:Member,j:any){return isOffice(m)||m.role==='supervisor'||(m.role==='installer'&&j.installerId===m.id)}
export function requireOffice(m:Member){if(!isOffice(m))throw new ApiError(403,'Office access required.')}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&new URL(origin).origin!==new URL(request.url).origin)throw new ApiError(403,'Invalid request origin.')}
export function apiError(e:unknown){return Response.json({error:e instanceof ApiError?e.message:'Unable to complete this request. Please try again.'},{status:e instanceof ApiError?e.status:500})}
export async function jobFor(m:Member,id:string){const row:any=await database().prepare('SELECT payload,version FROM jobs WHERE id=?').bind(id).first();if(!row)throw new ApiError(404,'Job not found.');const j={...JSON.parse(row.payload),version:row.version};if(!canSeeJob(m,j))throw new ApiError(403,'This job is not assigned to you.');return j}

export const hasJobEditPermission=(m:Member)=>m.role==='admin'||(['office','production_assistant','supervisor'].includes(m.role)&&m.can_edit_jobs===1);
export const canCreateJobs=(m:Member)=>isOffice(m)&&hasJobEditPermission(m);
export const canEditJob=(m:Member,j:any)=>hasJobEditPermission(m)&&(isOffice(m)||(m.role==='supervisor'&&j.supervisorId===m.id));
