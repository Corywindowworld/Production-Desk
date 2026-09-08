import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import bcrypt from 'bcryptjs';
const pg=new PGlite();await pg.exec(readFileSync('supabase/migrations/001_initial.sql','utf8'));
await pg.exec(readFileSync('supabase/migrations/002_installer_quality.sql','utf8'));
await pg.exec(readFileSync('supabase/migrations/003_account_permissions.sql','utf8'));
const wrap=client=>({query:async(sql,args)=>{const r=await client.query(sql,args);return {rows:r.rows,changes:r.affectedRows??r.rows.length}},transaction:fn=>client.transaction(tx=>fn(wrap(tx)))});
const objects=new Map();let uploadSequence=0,signingFailure=false;
const storage={async createSignedUploadUrl(path){if(signingFailure)return {error:new Error('Bucket not found')};return {data:{signedUrl:'https://storage.example/upload/'+path}}},async download(key){return objects.has(key)?{data:objects.get(key)}:{error:new Error('Not found')}},async upload(key,bytes){if(objects.has(key))return {error:new Error('Exists')};objects.set(key,new Blob([bytes]));return {data:{path:key}}},async remove(keys){keys.forEach(k=>objects.delete(k));return {data:[]}},async createSignedUrl(key){return {data:{signedUrl:'https://storage.example/read/'+key}}}};
const env={OWNER_LOGIN_EMAIL:'owner@example.com',OWNER_BOOTSTRAP_PASSWORD_HASH:await bcrypt.hash('TemporaryOwner1!',4)};
globalThis.__migrationEnv=env;globalThis.__migrationStorage=storage;
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('.')}},plugins:[{name:'migration-test',enforce:'pre',resolveId(id){if(id==='@/db/raw'||/\/db\/raw(?:\.ts)?$/.test(id))return '\0db';if(id==='@/lib/server-env'||/\/lib\/server-env(?:\.ts)?$/.test(id))return '\0env';if(id==='@/lib/storage'||/\/lib\/storage(?:\.ts)?$/.test(id))return '\0storage'},load(id){if(id==='\0db')return 'export function database(){return globalThis.__migrationDb}';if(id==='\0env')return 'export const env=globalThis.__migrationEnv';if(id==='\0storage')return 'export const storage=()=>globalThis.__migrationStorage;export const bucket={async head(key){const r=await globalThis.__migrationDb.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status=\'ready\'").bind(key).first();return r?{customMetadata:{jobId:r.job_id,kind:r.kind,uploadedBy:r.member_id,sha256:r.sha256},httpMetadata:{contentType:r.content_type}}:null}}'}}],server:{middlewareMode:true,hmr:false}});
const {createDatabase,compileQuery}=await vite.ssrLoadModule('/db/adapter.ts');const db=createDatabase(wrap(pg));globalThis.__migrationDb=db;
const load=p=>vite.ssrLoadModule('/app/api/'+p+'/route.ts');
const login=await load('auth/login'),change=await load('auth/change-password'),team=await load('team'),jobs=await load('jobs'),installerJobs=await load('installer/jobs'),files=await load('attachments'),reports=await load('installer/reports'),me=await load('me'),reset=await load('team/reset-password');
const {bucket}=await vite.ssrLoadModule('@/lib/storage');env.BUCKET=bucket;
const quality=await load('installer/quality'),removeMember=await load('team/delete'),storageSettings=await load('storage-settings');
const {uploadAttachment}=await vite.ssrLoadModule('/lib/upload-client.ts');
const {qualityTone}=await vite.ssrLoadModule('/lib/installer-quality.ts');
const {apiError,ApiError}=await vite.ssrLoadModule('/lib/access.ts');
await vite.close();
let ip=1;
function req(path,body,cookie=''){return new Request('https://example.com/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',origin:'https://example.com',cookie,'x-vercel-forwarded-for':'192.0.2.'+ip++},body:body?JSON.stringify(body):undefined})}
const cookie=r=>r.headers.get('set-cookie')?.split(';')[0];
async function success(response){assert.equal(response.status,200,await response.clone().text());return response.json()}
async function activate(email,password){const r=await login.POST(req('auth/login',{email,password}));await success(r);const changed=await change.POST(req('auth/change-password',{password:'Permanent-'+email+'1!'},cookie(r)));await success(changed);return cookie(changed)}
test('PostgreSQL transaction rollback and bound values',async()=>{
 assert.equal(compileQuery("SELECT '?' FROM members WHERE email=?"),"SELECT '?' FROM production.members WHERE email=$1");
 await assert.rejects(db.batch([db.prepare("INSERT INTO members(id,email,name,role) VALUES ('rollback','x','x','admin')"),db.prepare("INSERT INTO members(id,email,name,role) VALUES ('rollback','y','y','admin')")]));
 assert.equal(await db.prepare("SELECT id FROM members WHERE id='rollback'").first(),null);
});
test('unexpected errors log only safe diagnostic codes and a matching reference',async()=>{
 const messages=[],original=console.error;
 console.error=(...args)=>messages.push(args);
 try{
  for(const code of ['28P01','SELF_SIGNED_CERT_IN_CHAIN','secret-value','toString']){
   const error=Object.assign(new Error('postgres://user:secret-password@host/db'),{code,query:'secret-query',parameters:['private-email']});
   const response=apiError(error),body=await response.json(),logged=messages.at(-1)[1];
   assert.equal(response.status,500);
   assert.ok(body.error.includes(logged.reference));
   assert.equal(logged.code,['28P01','SELF_SIGNED_CERT_IN_CHAIN'].includes(code)?code:'UNCLASSIFIED');
   assert.doesNotMatch(JSON.stringify([messages,body]),/secret-password|secret-query|private-email|secret-value/);
  }
  const count=messages.length,response=apiError(new ApiError(401,'Sign in with your email and password.'));
  assert.equal(response.status,401);
  assert.equal(messages.length,count);
 }finally{console.error=original}
});
test('native PostgreSQL auth, role permissions, payment methods, signed uploads, reports',async()=>{
 const owner=await activate('owner@example.com','TemporaryOwner1!');
 assert.equal((await login.POST(req('auth/login',{email:'owner@example.com',password:'TemporaryOwner1!'}))).status,401);
 async function member(email,role,supervisorId=null){const r=await success(await team.POST(req('team',{email,name:email,role,supervisorId,active:true},owner)));const row=await db.prepare('SELECT id FROM members WHERE email=?').bind(email).first();return {id:row.id,cookie:await activate(email,r.temporaryPassword)}}
 const supervisor=await member('supervisor@example.com','supervisor'),otherSupervisor=await member('other-supervisor@example.com','supervisor'),installer=await member('installer@example.com','installer',supervisor.id),other=await member('other@example.com','installer',supervisor.id);
 assert.equal(qualityTone(null),'unrated');assert.equal(qualityTone(3.59),'below');assert.equal(qualityTone(3.60),'good');assert.equal(qualityTone(3.61),'good');
 const scoreRequest=(score,id=installer.id)=>({id,score});
 const initial=await success(await quality.GET(req('installer/quality',null,installer.cookie)));
 assert.equal(initial.installers.length,1);assert.equal(initial.installers[0].quality_score,null);
 assert.equal((await quality.POST(req('installer/quality',scoreRequest(4),installer.cookie))).status,403);
 assert.equal((await quality.POST(req('installer/quality',scoreRequest(4),otherSupervisor.cookie))).status,403);
 for(const score of [-1,101,3.601,'4',null])assert.equal((await quality.POST(req('installer/quality',scoreRequest(score),supervisor.cookie))).status,400);
 for(const score of [0,3.59,3.60,4.25]){
  await success(await quality.POST(req('installer/quality',scoreRequest(score),supervisor.cookie)));
  const actual=await success(await quality.GET(req('installer/quality',null,installer.cookie)));
  assert.equal(actual.installers[0].quality_score,score);
 }
 assert.equal((await success(await quality.GET(req('installer/quality',null,otherSupervisor.cookie)))).installers.length,0);
 assert.equal((await db.prepare("SELECT * FROM account_audit WHERE action LIKE 'Installer quality score%'").all()).results.length,4);

 // Administrator access to all installers and explicit cross-supervisor permission.
 await success(await quality.POST(req('installer/quality',scoreRequest(4.5),owner)));
 assert.equal((await success(await quality.GET(req('installer/quality',null,owner)))).installers.length,2);
 assert.equal((await team.POST(req('team',{id:otherSupervisor.id,email:'other-supervisor@example.com',name:'Other supervisor',role:'supervisor',supervisorId:null,active:true,canScoreAllInstallers:true},otherSupervisor.cookie))).status,403);
 const changePermission=async allowed=>{
  await success(await team.POST(req('team',{id:otherSupervisor.id,email:'other-supervisor@example.com',name:'Other supervisor',role:'supervisor',supervisorId:null,active:true,canScoreAllInstallers:allowed},owner)));
  assert.equal((await me.GET(req('me',null,otherSupervisor.cookie))).status,401);
  const response=await login.POST(req('auth/login',{email:'other-supervisor@example.com',password:'Permanent-other-supervisor@example.com1!'}));
  await success(response);otherSupervisor.cookie=cookie(response);
 };
 await changePermission(true);
 const globalScores=await success(await quality.GET(req('installer/quality',null,otherSupervisor.cookie)));
 assert.equal(globalScores.canScoreAll,true);assert.equal(globalScores.installers.length,2);
 await success(await quality.POST(req('installer/quality',scoreRequest(4.1),otherSupervisor.cookie)));
 await changePermission(false);
 assert.equal((await quality.POST(req('installer/quality',scoreRequest(4.2),otherSupervisor.cookie))).status,403);
 assert.equal((await storageSettings.GET(req('storage-settings',null,installer.cookie))).status,403);
 assert.equal((await storageSettings.POST(req('storage-settings',{},supervisor.cookie))).status,403);
 // Owner and self-deletion protection, linked account protection, actual deletion.
 assert.equal((await removeMember.POST(req('team/delete',{id:'owner'},owner))).status,403);
 assert.equal((await removeMember.POST(req('team/delete',{id:supervisor.id},owner))).status,409);
 assert.equal((await removeMember.POST(req('team/delete',{id:other.id},supervisor.cookie))).status,403);
 await success(await removeMember.POST(req('team/delete',{id:other.id},owner)));
 assert.equal(await db.prepare('SELECT id FROM members WHERE id=?').bind(other.id).first(),null);
 assert.equal(await db.prepare('SELECT member_id FROM credentials WHERE member_id=?').bind(other.id).first(),null);
 assert.equal((await me.GET(req('me',null,other.cookie))).status,401);
 // Replace this unassigned installer for existing upload isolation tests below.
 const replacement=await member('replacement@example.com','installer',supervisor.id);
 other.id=replacement.id;other.cookie=replacement.cookie;
 const base={id:crypto.randomUUID(),number:'123',customer:'Test customer',address:'Test street',supervisor:'',crew:'',stage:'Received',installerId:installer.id,supervisorId:supervisor.id,eta:'',install:'2026-09-01',blocker:'',notes:'',version:0,history:[],attachments:[],paymentMethod:'PO'};
 let j=(await success(await jobs.POST(req('jobs',base,owner)))).job;
 assert.equal(j.paymentMethod,'PO');
 assert.equal((await jobs.POST(req('jobs',{...j,paymentMethod:'Cash'},owner))).status,400);
 assert.equal((await jobs.POST(req('jobs',{...j,notes:'Unauthorized'},supervisor.cookie))).status,403);
 const list=await success(await jobs.GET(req('jobs',null,otherSupervisor.cookie)));assert.equal(list.jobs[0].id,j.id);assert.equal(list.jobs[0].canEdit,false);
 j=(await success(await jobs.POST(req('jobs',{...j,stage:'Production'},owner)))).job;
 const projection=await success(await installerJobs.GET(req('installer/jobs',null,installer.cookie)));assert.equal(projection.jobs[0].paymentMethod,'PO');assert.equal('amount' in projection.jobs[0],false);

 assert.equal((await removeMember.POST(req('team/delete',{id:installer.id},owner))).status,409);
 const beforeFailedUpload=(await db.prepare('SELECT * FROM attachment_uploads').all()).results.length;
 signingFailure=true;
 const failedUpload=await files.POST(req('attachments',{action:'begin',jobId:j.id,kind:'front',size:5,name:'x.jpg'},installer.cookie));
 assert.equal(failedUpload.status,503);assert.match((await failedUpload.json()).error,/Account management/);
 assert.equal((await db.prepare('SELECT * FROM attachment_uploads').all()).results.length,beforeFailedUpload);
 signingFailure=false;
 assert.equal((await files.POST(req('attachments',{action:'begin',jobId:j.id,kind:'front',size:5,name:'x.jpg'},other.cookie))).status,403);
 assert.equal((await files.POST(req('attachments',{action:'begin',jobId:j.id,kind:'front',size:16*1024*1024,name:'x.jpg'},installer.cookie))).status,400);
 const evidence=[];
 for(const kind of ['front','rear','left','right','completion']){
  const begin=await success(await files.POST(req('attachments',{action:'begin',jobId:j.id,kind,size:5,name:kind+'.jpg'},installer.cookie)));
  const row=await db.prepare('SELECT * FROM attachment_uploads WHERE key=?').bind(begin.key).first();
  objects.set(row.staging_key,new Blob([new Uint8Array([255,216,255,++uploadSequence,1])]));
  assert.equal((await files.POST(req('attachments',{action:'finish',key:begin.key},other.cookie))).status,404);
  const finish=await success(await files.POST(req('attachments',{action:'finish',key:begin.key},installer.cookie)));evidence.push(finish.attachment);
  assert.equal((await files.GET(req('attachments?key='+encodeURIComponent(begin.key),null,installer.cookie))).status,302);
  assert.equal((await files.GET(req('attachments?key='+encodeURIComponent(begin.key),null,other.cookie))).status,403);
  assert.equal((await files.POST(req('attachments',{action:'finish',key:begin.key},installer.cookie))).status,200);
 }
 const report={id:crypto.randomUUID(),jobId:j.id,version:j.version,status:'Complete',reason:'',notes:'',installed:'2026-09-01',attachments:evidence};
 assert.equal((await reports.POST(req('installer/reports',{...report,attachments:evidence.slice(1)},installer.cookie))).status,400);
 await success(await reports.POST(req('installer/reports',report,installer.cookie)));
 const saved=await db.prepare('SELECT payload FROM jobs WHERE id=?').bind(j.id).first();assert.equal(JSON.parse(saved.payload).stage,'Closed');assert.equal(JSON.parse(saved.payload).paymentMethod,'PO');
 assert.equal((await db.prepare('SELECT * FROM notifications').all()).results.length,1);
 // Installer reassignment exercises PostgreSQL jsonb updates.
 await success(await team.POST(req('team',{id:installer.id,email:'installer@example.com',name:'Installer renamed',role:'installer',supervisorId:otherSupervisor.id,active:true},owner)));
 assert.equal(JSON.parse((await db.prepare('SELECT payload FROM jobs WHERE id=?').bind(j.id).first()).payload).supervisorId,otherSupervisor.id);
 assert.equal((await quality.POST(req('installer/quality',scoreRequest(4),supervisor.cookie))).status,403);
 await success(await quality.POST(req('installer/quality',scoreRequest(4),otherSupervisor.cookie)));
 assert.equal((await me.GET(req('me',null,installer.cookie))).status,401);
 const resetResult=await success(await reset.POST(req('team/reset-password',{id:installer.id},owner)));
 const resetCookie=await activate('installer@example.com',resetResult.temporaryPassword);
 assert.equal((await me.GET(req('me',null,resetCookie))).status,200);
});

test('browser upload uses a signed direct transfer and provides useful failure messages',async()=>{
 const original=globalThis.fetch;
 const attachment={key:'jobs/test/photos/test',kind:'photos',name:'test.jpg'};
 try{
  let requests=[];
  globalThis.fetch=async(url,options)=>{
   requests.push([url,options]);
   if(url==='/api/attachments'){
    const body=JSON.parse(options.body);
    return Response.json(body.action==='begin'?{key:attachment.key,uploadUrl:'https://storage.example/signed'}:{attachment});
   }
   assert.equal(options.method,'PUT');assert.ok(options.body instanceof FormData);
   assert.equal(options.body.get('').name,'test.jpg');
   return new Response('',{status:200});
  };
  assert.deepEqual(await uploadAttachment('job','photos',new File([new Uint8Array([255,216,255])],'test.jpg',{type:'image/jpeg'})),attachment);
  assert.equal(requests.length,3);
  globalThis.fetch=async(url)=>url==='/api/attachments'?Response.json({key:attachment.key,uploadUrl:'https://storage.example/signed'}):Response.json({statusCode:'413'},{status:400});
  await assert.rejects(uploadAttachment('job','photos',new File(['x'],'test.jpg')),/file size/);
  globalThis.fetch=async(url)=>{if(url==='/api/attachments')return Response.json({key:attachment.key,uploadUrl:'https://storage.example/signed'});throw Error('Failed to fetch')};
  await assert.rejects(uploadAttachment('job','photos',new File(['x'],'test.jpg')),/browser could not reach/);
 }finally{globalThis.fetch=original}
});
test.after(async()=>{await pg.close()});
