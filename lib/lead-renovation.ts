import {drawnSignature} from './account-profile';
import {z} from 'zod';
import {ApiError} from './access';
export const leadSchema=z.object({answers:z.array(z.boolean()).length(13),signatureDataUrl:drawnSignature,signature:z.string().trim().min(2).max(150),confirmed:z.literal(true),saveSignature:z.boolean().default(true)});
export async function saveLeadRenovation(tx:any,j:any,m:any,input:any,at:string){
 if(!j.leadRenovationJob)throw new ApiError(400,'This job is not marked Lead Renovation Job.');
 const parsed=leadSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'Review every answer and confirm your signature.');
 const v=parsed.data,member=await tx.prepare('SELECT profile_details,installer_code FROM members WHERE id=? FOR UPDATE').bind(m.id).first(),p=member?.profile_details||{};
 if(!p.epaCertification?.trim())throw new ApiError(400,'Add your EPA Certification # in your installer profile first.');
 const old=j.operations.leadRenovation;
 if(old)j.operations.leadRenovationHistory=[...(j.operations.leadRenovationHistory||[]),old];
 j.operations.leadRenovation={...v,customerId:j.number,customerName:j.customer,address:j.address,city:j.city||'',state:j.state||'',zip:j.zip||'',renovatorName:p.leadInstallerName||m.name,renovatorId:p.contractorNumber||member.installer_code||'',epaCertification:p.epaCertification,signedBy:m.id,signedAt:at};
 if(v.saveSignature)await tx.prepare('UPDATE members SET profile_details=?::jsonb WHERE id=?').bind(JSON.stringify({...p,savedSignature:v.signature,savedDrawnSignature:v.signatureDataUrl}),m.id).run();
}
