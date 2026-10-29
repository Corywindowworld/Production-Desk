import {drawnSignature,readProfileDetails} from './account-profile';
import {z} from 'zod';
import {ApiError} from './access';
export const leadSchema=z.object({answers:z.array(z.boolean()).length(13),signatureDataUrl:drawnSignature,signature:z.string().trim().min(2).max(150),confirmed:z.literal(true),saveSignature:z.boolean().default(true),installerId:z.string().uuid().optional(),epaCertification:z.string().trim().max(100).optional()});
export async function saveLeadRenovation(tx:any,j:any,m:any,input:any,at:string){
 const staff=['admin','supervisor'].includes(m.role);
 if(!staff&&m.role!=='installer')throw new ApiError(403,'Assigned installer or FS/Admin access required.');
 if(!j.leadRenovationJob&&!staff)throw new ApiError(400,'This job is not marked Lead Renovation Job.');
 const parsed=leadSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'Review every answer and confirm your signature.');
 const v=parsed.data,installerId=staff?(v.installerId||j.installerId):m.id;
 if(!installerId)throw new ApiError(400,'Select the installer who performed the work.');
 if(!staff&&v.installerId&&v.installerId!==m.id)throw new ApiError(403,'Only complete your own installer lead form.');
 const member=await tx.prepare("SELECT id,name,role,profile_details,installer_code FROM members WHERE id=? FOR UPDATE").bind(installerId).first();
 if(!member||member.role!=='installer')throw new ApiError(400,'Select a valid installer.');
 const p=readProfileDetails(member.profile_details),epaCertification=staff?(v.epaCertification?.trim()||p.epaCertification||''):(p.epaCertification||'');
 if(!epaCertification.trim())throw new ApiError(400,staff?'Enter the installer EPA Certification # before saving.':'Add your EPA Certification # in your installer profile first.');
 const old=j.operations.leadRenovation;
 if(old)j.operations.leadRenovationHistory=[...(j.operations.leadRenovationHistory||[]),old];
 j.leadRenovationJob=true;
 j.operations.leadRenovation={...v,signature:staff?m.name:v.signature,customerId:j.number,customerName:j.customer,address:j.address,city:j.city||'',state:j.state||'',zip:j.zip||'',renovatorName:p.leadInstallerName||member.name,renovatorId:p.contractorNumber||member.installer_code||'',epaCertification,installerId,signedBy:m.id,signedByName:m.name,signedByRole:m.role,signedByStaff:staff,signedAt:at};
 if(v.saveSignature){
  // A supervisor saves only their own signature; the installer's profile is unchanged.
  const own=staff?await tx.prepare('SELECT profile_details FROM members WHERE id=? FOR UPDATE').bind(m.id).first():member;
  const ownProfile=readProfileDetails(own?.profile_details);
  await tx.prepare('UPDATE members SET profile_details=?::text::jsonb WHERE id=?').bind(JSON.stringify({...ownProfile,savedSignature:staff?m.name:v.signature,savedDrawnSignature:v.signatureDataUrl}),m.id).run();
 }
}
