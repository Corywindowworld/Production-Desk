import {database} from '@/db/raw';
import {ApiError,Member} from './access';
import {currentSession,digest,randomToken} from './auth-session';
import {storedObject} from './stored-data';
import {z} from 'zod';
const FRESH=120000;
export const positionSchema=z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),accuracy:z.number().finite().min(0).max(100000),observedAt:z.number().int().positive()});
export async function locationIdentity(request:Request){
 const bearer=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 let session:any;
 if(bearer)session=await database().prepare("SELECT m.*,s.token_hash,s.restricted,c.must_change FROM production.location_devices d JOIN sessions s ON s.token_hash=d.session_hash JOIN members m ON m.id=d.member_id JOIN credentials c ON c.member_id=m.id WHERE d.token_hash=? AND d.expires>? AND s.expires>? AND s.generation=c.generation AND m.active=1").bind(await digest(bearer),Date.now(),Date.now()).first();
 else session=await currentSession(request);
 if(!session||session.restricted||session.must_change)throw new ApiError(401,'Sign in again.');
 if(session.role!=='installer')throw new ApiError(403,'Installer access required.');
 return session;
}
export async function savePosition(session:any,input:unknown){
 const result=positionSchema.safeParse(input);if(!result.success)throw new ApiError(400,'Invalid location.');const p=result.data,now=Date.now();
 if(p.observedAt>now+60000||p.observedAt<now-300000)throw new ApiError(400,'Location is outdated. Obtain a new reading.');
 await database().transaction(async tx=>{
 const live=await tx.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND member_id=? AND expires>? FOR UPDATE').bind(session.token_hash,session.id,now).first();if(!live)throw new ApiError(401,'Sign in again.');
 await tx.prepare('INSERT INTO production.installer_locations(member_id,session_hash,latitude,longitude,accuracy,observed_at,updated_at,sharing) VALUES(?,?,?,?,?,?,?,true) ON CONFLICT(member_id) DO UPDATE SET session_hash=EXCLUDED.session_hash,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy=EXCLUDED.accuracy,observed_at=EXCLUDED.observed_at,updated_at=EXCLUDED.updated_at,sharing=true WHERE production.installer_locations.observed_at<=EXCLUDED.observed_at').bind(session.id,session.token_hash,p.latitude,p.longitude,p.accuracy,p.observedAt,now).run();
 });
}
export async function stopSharing(memberId:string){
 await database().transaction(async tx=>{
  await tx.prepare('SELECT token_hash FROM sessions WHERE member_id=? ORDER BY token_hash FOR UPDATE').bind(memberId).all();
  await tx.prepare('UPDATE production.installer_locations SET sharing=false WHERE member_id=?').bind(memberId).run();
  await tx.prepare('UPDATE production.location_shares SET revoked=true WHERE member_id=?').bind(memberId).run();
  await tx.prepare('DELETE FROM production.location_devices WHERE member_id=?').bind(memberId).run();
  await tx.prepare('DELETE FROM sessions WHERE member_id=?').bind(memberId).run();
 });
}
export async function deviceToken(request:Request){if(request.headers.has('authorization'))throw new ApiError(403,'Sign in through the app to register a device.');const s=await locationIdentity(request),token=randomToken();
 const session=await database().prepare('SELECT expires FROM sessions WHERE token_hash=?').bind(s.token_hash).first();
 await database().prepare('INSERT INTO production.location_devices(token_hash,member_id,session_hash,expires) VALUES(?,?,?,?)').bind(await digest(token),s.id,s.token_hash,Number(session.expires)).run();return {token,expires:Number(session.expires)};
}
export async function requireLocation(request:Request,m:Member){
 if(m.role!=='installer')return;
 const s=await currentSession(request);const row=await database().prepare('SELECT * FROM production.installer_locations WHERE member_id=?').bind(m.id).first();
 if(!row?.sharing||row.session_hash!==s?.token_hash||Date.now()-Number(row.updated_at)>300000)throw new ApiError(412,'Location sharing must be enabled. Return to the sharing screen.');
}
export async function mapLocations(m:Member){
 if(!['admin','supervisor'].includes(m.role))throw new ApiError(403,'Admin or Field Supervisor access required.');
 const rows=(await database().prepare("SELECT m.id,m.name,l.latitude,l.longitude,l.accuracy,l.observed_at,l.updated_at,l.sharing,EXISTS(SELECT 1 FROM sessions s JOIN credentials c ON c.member_id=s.member_id WHERE s.token_hash=l.session_hash AND s.expires>? AND s.generation=c.generation) AS signed_in FROM members m LEFT JOIN production.installer_locations l ON l.member_id=m.id WHERE m.role='installer' AND m.active=1"+' ORDER BY m.name').bind(Date.now()).all()).results;
 return rows.map((r:any)=>{const status=!r.sharing||!r.signed_in?'Not sharing':Date.now()-Number(r.observed_at)>FRESH?'Stale':'Sharing';return {id:r.id,name:r.name,status,latitude:r.latitude,longitude:r.longitude,accuracy:r.accuracy,observed_at:r.observed_at,stale:status!=='Sharing'}});
}
export async function createShare(m:Member,jobId:string,etaMinutes?:number){
 if(etaMinutes!==undefined&&(!Number.isInteger(etaMinutes)||etaMinutes<5||etaMinutes>240))throw new ApiError(400,'Enter an estimated travel time from 5 to 240 minutes.');
 const row=await database().prepare('SELECT payload FROM jobs WHERE id=?').bind(jobId).first();if(!row)throw new ApiError(404,'Job not found.');const j=storedObject(row.payload);
 const crew=await database().prepare('SELECT supervisor_id,name,profile_details FROM members WHERE id=? AND active=1').bind(j.installerId||'').first();
 if(!(m.role==='admin'||m.role==='supervisor'&&crew?.supervisor_id===m.id||m.role==='installer'&&j.installerId===m.id))throw new ApiError(403,'This job is not assigned to you.');
 if(!j.installerId)throw new ApiError(400,'Assign an installer first.');
 const loc=await database().prepare('SELECT * FROM production.installer_locations WHERE member_id=?').bind(j.installerId).first();if(!loc?.sharing||Date.now()-Number(loc.observed_at)>FRESH)throw new ApiError(409,'Installer needs a fresh location before sharing a customer link.');
 const active=await database().prepare('SELECT s.token_hash FROM sessions s JOIN credentials c ON c.member_id=s.member_id WHERE s.token_hash=? AND s.expires>? AND s.generation=c.generation').bind(loc.session_hash,Date.now()).first();if(!active)throw new ApiError(409,'Installer must sign in and share location first.');
 const token=randomToken(),expires=Date.now()+2*60*60*1000;
 const arrivalAt=etaMinutes?Date.now()+etaMinutes*60000:null,stopNumber=Number.isInteger(j.stopNumber)&&j.stopNumber>0?j.stopNumber:null;
 await database().transaction(async tx=>{await tx.prepare('UPDATE production.location_shares SET revoked=true WHERE member_id=?').bind(j.installerId).run();await tx.prepare('INSERT INTO production.location_shares(token_hash,member_id,job_id,expires,arrival_at,stop_number) VALUES(?,?,?,?,?,?)').bind(await digest(token),j.installerId,jobId,expires,arrivalAt,stopNumber).run();});
 const name=storedObject(crew?.profile_details||{}).leadInstallerName||crew?.name||m.name;
 const greeting=m.role==='installer'?`Hi, this is ${String(name).trim().split(/\s+/)[0]} with Window World. I am on the way to you now!`:`Hi, this is ${m.name}, our team is on the way to you now!`;
 return {token,expires,greeting};
}
export async function revokeShare(m:Member,jobId:string){
 const row=await database().prepare('SELECT payload FROM jobs WHERE id=?').bind(jobId).first();if(!row)throw new ApiError(404,'Job not found.');const j=storedObject(row.payload);
 const crew=await database().prepare('SELECT supervisor_id FROM members WHERE id=? AND active=1').bind(j.installerId||'').first();
 if(!(m.role==='admin'||m.role==='supervisor'&&crew?.supervisor_id===m.id||m.role==='installer'&&j.installerId===m.id))throw new ApiError(403,'Access denied.');
 await database().prepare('UPDATE production.location_shares SET revoked=true WHERE job_id=?').bind(jobId).run();
}
export async function publicLocation(token:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ApiError(404,'Tracking link is unavailable.');
 const r=await database().prepare('SELECT l.latitude,l.longitude,l.accuracy,l.observed_at,l.sharing,l.session_hash,s.member_id,s.expires,s.arrival_at,s.stop_number,m.name,m.profile_details,j.payload FROM production.location_shares s JOIN production.installer_locations l ON l.member_id=s.member_id JOIN jobs j ON j.id=s.job_id JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.revoked=false AND s.expires>? AND m.active=1').bind(await digest(token),Date.now()).first();
 if(!r||storedObject(r.payload).installerId!==r.member_id)throw new ApiError(404,'This trip has ended or the link has expired.');
 const active=await database().prepare('SELECT s.token_hash FROM sessions s JOIN credentials c ON c.member_id=s.member_id WHERE s.token_hash=? AND s.expires>? AND s.generation=c.generation').bind(r.session_hash,Date.now()).first();
 if(!r.sharing||!active)throw new ApiError(404,'Location sharing has stopped.');
 const profile=storedObject(r.profile_details||{});
 return {latitude:r.latitude,longitude:r.longitude,accuracy:r.accuracy,observedAt:Number(r.observed_at),stale:Date.now()-Number(r.observed_at)>FRESH,expires:Number(r.expires),name:profile.leadInstallerName||r.name,photo:profile.photoDataUrl||'',arrivalAt:r.arrival_at==null?null:Number(r.arrival_at),stopNumber:r.stop_number};
}
