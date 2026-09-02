import postgres from 'postgres';
import {createDatabase} from './adapter';
let instance:ReturnType<typeof createDatabase>;
export function database(){
 if(!instance){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
  const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:3,idle_timeout:20,connect_timeout:10,ssl:process.env.DATABASE_SSL==='disable'?false:'verify-full'});
  const wrap=(client:any):any=>({query:async(text:string,args:unknown[])=>{const r=await client.unsafe(text,args);return {rows:Array.from(r),changes:r.count}},transaction:async(fn:any)=>client.begin((tx:any)=>fn(wrap(tx)))});
  instance=createDatabase(wrap(sql));
 }
 return instance;
}
