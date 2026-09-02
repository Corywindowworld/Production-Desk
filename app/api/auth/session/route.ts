import {currentSession} from '@/lib/auth-session';
export async function GET(request:Request){const s=await currentSession(request);return s?Response.json({email:s.email,mustChange:!!s.must_change,role:s.role},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Sign in to continue.'},{status:401})}
