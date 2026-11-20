import {createClient} from '@supabase/supabase-js';
import {MAX_UPLOAD_BYTES} from '@/lib/upload-validation';
export async function inspectStorage(repair=false){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bucket=process.env.SUPABASE_STORAGE_BUCKET?.trim()||'job-files';
 if(!url||!key)return {ready:false,bucket,message:'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the Vercel Production environment, then redeploy.'};
 try{
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let result=await client.storage.getBucket(bucket);
 const missing=result.error&&(String((result.error as any).statusCode)==='404'||(result.error as any).code==='NoSuchBucket'||result.error.message==='Bucket not found');
 if(repair){
  if(result.error&&!missing)return {ready:false,bucket,message:'Storage access was rejected. Check that the Supabase URL and server key belong to the same project, then redeploy.'};
  const settings={public:false,fileSizeLimit:MAX_UPLOAD_BYTES,allowedMimeTypes:null};
  const changed=result.data?await client.storage.updateBucket(bucket,settings):await client.storage.createBucket(bucket,settings);
  if(changed.error)return {ready:false,bucket,message:'Unable to configure photo storage. Check your Supabase server key and storage permissions.'};
  result=await client.storage.getBucket(bucket);
 }
 if(missing&&!repair)return {ready:false,bucket,message:'The photo storage bucket has not been created. Select Set up / repair storage.'};
 if(result.error||!result.data)return {ready:false,bucket,message:'Cannot access photo storage. Check your Supabase server key and project URL.'};
 const data=result.data,ready=!data.public&&(!data.file_size_limit||Number(data.file_size_limit)>=MAX_UPLOAD_BYTES)&&!data.allowed_mime_types?.length;
 return {ready,bucket,message:ready?'Private photo storage is configured for uploads up to 15 MB.':'Storage settings need updating. Select Set up / repair storage to use private storage and support the app’s file types.'};
 }catch{return {ready:false,bucket,message:'Storage could not be reached. Check the Supabase URL, server key and project status.'}}
}
