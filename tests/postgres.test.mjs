import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import bcrypt from 'bcryptjs';
const pg=new PGlite();await pg.exec(readFileSync('supabase/migrations/001_initial.sql','utf8'));
const wrap=client=>({query:async(sql,args)=>{const r=await client.query(sql,args);return {rows:r.rows,changes:r.affectedRows??r.rows.length}},transaction:fn=>client.transaction(tx=>fn(wrap(tx)))});
const objects=new Map();let uploadSequence=0;
const storage={async createSignedUploadUrl(path){return {data:{signedUrl:'https://storage.example/upload/'+path}}},async download(key){return objects.has(key)?{data:objects.get(key)}:{error:new Error('Not found')}},async upload(key,bytes){if(objects.has(key))return {error:new Error('Exists')};objects.set(key,new Blob([bytes]));return {data:{path:key}}},async remove(keys){keys.forEach(k=>objects.delete(k));return {data:[]}},async createSignedUrl(key){return {data:{signedUrl:'https://storage.example/read/'+key}}}};
const env={OWNER_LOGIN_EMAIL:'owner@example.com',OWNER_BOOTSTRAP_PASSWORD_HASH:await bcrypt.hash('TemporaryOwner1!',4)};
globalThis.__migrationEnv=env;globalThis.__migrationStorage=storage;
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('.')}},plugins:[{name:'migration-test',enforce:'pre',resolveId(id){if(id==='@/db/raw'||/\/db\/raw(?:\.ts)?$/.test(id))return '\0db';if(id==='@/lib/server-env'||/\/lib\/server-env(?:\.ts)?$/.test(id))return '\0env';if(id==='@/lib/storage'||/\/lib\/storage(?:\.ts)?$/.test(id))return '\0storage'},load(id){if(id==='\0db')return 'export function database(){return globalThis.__migrationDb}';if(id==='\0env')return 'export const env=globalThis.__migrationEnv';if(id==='\0storage')return 'export const storage=()=>globalThis.__migrationStorage;export const bucket={async head(key){const r=await globalThis.__migrationDb.prepare("SELECT * FROM attachment_uploads WHERE key=? AND status=\'ready\'").bind(key).first();return r?{customMetadata:{jobId:r.job_id,kind:r.kind,uploadedBy:r.member_id,sha256:r.sha256},httpMetadata:{contentType:r.content_type}}:null}}'}}],server:{middlewareMode:true,hmr:false}});
const {createDatabase,compileQuery}=await vite.ssrLoadModule('/db/adapter.ts');const db=createDatabase(wrap(pg));globalThis.__migrationDb=db;
const load=p=>vite.ssrLoadModule('/app/api/'+p+'/route.ts');
const login=await load('auth/login'),change=await load('auth/change-password'),team=await load('team'),jobs=await load('jobs'),installerJobs=await load('installer/jobs'),files=await load('attachments'),reports=await load('installer/reports'),me=await load('me'),reset=await load('team/reset-password');
const {bucket}=await vite.ssrLoadModule('@/lib/storage');env.BUCKET=bucket;
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
test('native PostgreSQL auth, role permissions, payment methods, signed uploads, reports',async()=>{
 const owner=await activate('owner@example.com','TemporaryOwner1!');
 assert.equal((await login.POST(req('auth/login',{email:'owner@example.com',password:'TemporaryOwner1!'}))).status,401);
 async function member(email,role,supervisorId=null){const r=await success(await team.POST(req('team',{email,name:email,role,supervisorId,active:true},owner)));const row=await db.prepare('SELECT id FROM members WHERE email=?').bind(email).first();return {id:row.id,cookie:await activate(email,r.temporaryPassword)}}
 const supervisor=await member('supervisor@example.com','supervisor'),otherSupervisor=await member('other-supervisor@example.com','supervisor'),installer=await member('installer@example.com','installer',supervisor.id),other=await member('other@example.com','installer',supervisor.id);
 const base={id:crypto.randomUUID(),number:'123',customer:'Test customer',address:'Test street',supervisor:'',crew:'',stage:'Received',installerId:installer.id,supervisorId:supervisor.id,eta:'',install:'2026-09-01',blocker:'',notes:'',version:0,history:[],attachments:[],paymentMethod:'PO'};
 let j=(await success(await jobs.POST(req('jobs',base,owner)))).job;
 assert.equal(j.paymentMethod,'PO');
 assert.equal((await jobs.POST(req('jobs',{...j,paymentMethod:'Cash'},owner))).status,400);
 assert.equal((await jobs.POST(req('jobs',{...j,notes:'Unauthorized'},supervisor.cookie))).status,403);
 const list=await success(await jobs.GET(req('jobs',null,otherSupervisor.cookie)));assert.equal(list.jobs[0].id,j.id);assert.equal(list.jobs[0].canEdit,false);
 j=(await success(await jobs.POST(req('jobs',{...j,stage:'Production'},owner)))).job;
 const projection=await success(await installerJobs.GET(req('installer/jobs',null,installer.cookie)));assert.equal(projection.jobs[0].paymentMethod,'PO');assert.equal('amount' in projection.jobs[0],false);
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
 assert.equal((await me.GET(req('me',null,installer.cookie))).status,401);
 const resetResult=await success(await reset.POST(req('team/reset-password',{id:installer.id},owner)));
 const resetCookie=await activate('installer@example.com',resetResult.temporaryPassword);
 assert.equal((await me.GET(req('me',null,resetCookie))).status,200);
});
test.after(async()=>{await pg.close()});
