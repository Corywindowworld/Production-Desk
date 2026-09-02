import {env} from '@/lib/server-env';
import {z} from 'zod';
import {roleLabels} from '@/lib/account-roles';

export type InvitationStatus='accepted'|'failed'|'not_configured'|'inactive';

export function accountEmailReady(){
 const config=env as any;
 return !!config.APP_URL&&!!config.RESEND_API_KEY&&z.string().email().safeParse(config.ACCOUNT_EMAIL_FROM).success;
}
export async function sendAccountEmail(account:{id:string;email:string;name:string;role:string;active:boolean},temporaryPassword:string):Promise<InvitationStatus>{
 if(!account.active)return 'inactive';
 if(!accountEmailReady())return 'not_configured';
 const config=env as any;
 const loginUrl=config.APP_URL+'/login'+(account.role==='installer'?'?next=%2Finstallers':'');
 const text=`Hello ${account.name},\n\nYour ${roleLabels[account.role]||'Production Desk'} account is ready.\n\nSign in: ${loginUrl}\nEmail: ${account.email}\nTemporary password: ${temporaryPassword}\n\nThis password can be used once and expires in 7 days. You will be asked to choose a new password with at least 8 characters before accessing the app.\n\nIf you need help signing in, contact your Production Desk administrator.\n\nWindow World Tampa Bay`;
 try{
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'account-access-'+crypto.randomUUID()},
   body:JSON.stringify({from:`Production Desk <${config.ACCOUNT_EMAIL_FROM}>`,to:[account.email],subject:'Your Production Desk login details',text}),
  });
  if(!response.ok)return 'failed';
  const result:any=await response.json();return typeof result.id==='string'?'accepted':'failed';
 }catch{return 'failed'}
}
