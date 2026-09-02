import postgres from 'postgres';
export function connect(){if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL');return postgres(process.env.DATABASE_URL,{prepare:false,max:1,ssl:process.env.DATABASE_SSL==='disable'?false:'verify-full'})}
