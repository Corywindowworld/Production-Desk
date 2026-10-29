import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {resolve} from 'node:path';
let bucket=null,rejected=false;
globalThis.__testStorageAdmin={
 async getBucket(){return rejected?{error:{statusCode:403,message:'secret should not be shown'}}:bucket?{data:bucket}:{error:{statusCode:404,message:'Bucket not found'}}},
 async createBucket(name,settings){bucket={name,public:settings.public,file_size_limit:settings.fileSizeLimit,allowed_mime_types:settings.allowedMimeTypes};return {data:bucket}},
 async updateBucket(name,settings){return this.createBucket(name,settings)}
};
const vite=await createServer({configFile:false,ssr:{noExternal:['@supabase/supabase-js']},resolve:{alias:{'@':resolve('.')}},plugins:[{name:'storage-admin-test',enforce:'pre',resolveId(id){if(id==='@supabase/supabase-js')return '\0supabase-admin-test'},load(id){if(id==='\0supabase-admin-test')return 'export const createClient=()=>({storage:globalThis.__testStorageAdmin})'}}],server:{middlewareMode:true,hmr:false}});
const {inspectStorage}=await vite.ssrLoadModule('/lib/storage-admin.ts');await vite.close();
test('storage setup creates a missing private bucket and repairs limits without exposing credentials',async()=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const key of keys)delete process.env[key];
  assert.equal((await inspectStorage()).ready,false);
  process.env.SUPABASE_URL='https://project.example';process.env.SUPABASE_SERVICE_ROLE_KEY='private-test-key';
  const missing=await inspectStorage();assert.equal(missing.ready,false);assert.match(missing.message,/not been created/);
  const repaired=await inspectStorage(true);assert.equal(repaired.ready,true);assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,15*1024*1024);
  bucket.public=true;bucket.file_size_limit=1024;bucket.allowed_mime_types=['image/png'];
  assert.equal((await inspectStorage()).ready,false);
  assert.equal((await inspectStorage(true)).ready,true);assert.equal(bucket.allowed_mime_types,null);
  rejected=true;const denied=await inspectStorage(true);assert.equal(denied.ready,false);assert.doesNotMatch(JSON.stringify(denied),/private-test-key|secret should/);
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}}
});
