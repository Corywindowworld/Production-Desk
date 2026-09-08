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
export function apiError(e:unknown){
 if(e instanceof ApiError)return Response.json({error:e.message},{status:e.status});
 const reference=crypto.randomUUID();
 const code=e&&typeof e==='object'&&'code' in e?e.code:undefined;
 const reasons:Record<string,string>={
  '28P01':'Database password authentication failed',
  '28000':'Database authorization failed',
  '42P01':'Database table missing',
  '42703':'Database column missing',
  '42501':'Database permission denied',
  '23505':'Database unique constraint conflict',
  '53300':'Database connection limit reached',
  ENOTFOUND:'Database hostname could not be resolved',
  ECONNREFUSED:'Database connection refused',
  ETIMEDOUT:'Database connection timed out',
  CONNECT_TIMEOUT:'Database connection timed out',
  SELF_SIGNED_CERT_IN_CHAIN:'Database TLS certificate chain is untrusted',
  DEPTH_ZERO_SELF_SIGNED_CERT:'Database TLS certificate is self-signed',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:'Database TLS certificate could not be verified',
  ERR_TLS_CERT_ALTNAME_INVALID:'Database TLS certificate hostname mismatch',
  ERR_INVALID_URL:'Invalid connection URL',
 };
 const known=typeof code==='string'&&Object.hasOwn(reasons,code);
 // Never log raw errors: database errors can contain credentials, queries and user data.
 console.error('Production Desk request failed',{reference,code:known?code:'UNCLASSIFIED',reason:known?reasons[code]:'Unexpected server error'});
 return Response.json({error:`Unable to complete this request. Please try again. Reference: ${reference}`},{status:500,headers:{'Cache-Control':'no-store'}});
}
export async function jobFor(m:Member,id:string){const row:any=await database().prepare('SELECT payload,version FROM jobs WHERE id=?').bind(id).first();if(!row)throw new ApiError(404,'Job not found.');const j={...JSON.parse(row.payload),version:row.version};if(!canSeeJob(m,j))throw new ApiError(403,'This job is not assigned to you.');return j}

export const hasJobEditPermission=(m:Member)=>m.role==='admin'||(['office','production_assistant','supervisor'].includes(m.role)&&m.can_edit_jobs===1);
export const canCreateJobs=(m:Member)=>isOffice(m)&&hasJobEditPermission(m);
export const canEditJob=(m:Member,j:any)=>hasJobEditPermission(m)&&(isOffice(m)||(m.role==='supervisor'&&j.supervisorId===m.id));
