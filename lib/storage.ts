import {createClient} from '@supabase/supabase-js';
import {database} from '@/db/raw';
let client:ReturnType<typeof createClient>;
export function storage(){
 if(!client){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase Storage is not configured');client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
 return client.storage.from(process.env.SUPABASE_STORAGE_BUCKET||'job-files');
}
export const bucket={async head(key:string){
 const row=await database().prepare("SELECT * FROM attachment_uploads WHERE key=? AND status='ready'").bind(key).first();
 if(!row)return null;
 return {customMetadata:{jobId:row.job_id,kind:row.kind,uploadedBy:row.member_id,sha256:row.sha256},httpMetadata:{contentType:row.content_type}};
}};
