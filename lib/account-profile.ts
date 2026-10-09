import {z} from 'zod';
export const drawnSignature=z.string().max(200000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, 'Draw your signature before saving.');
export const profileDetails=z.object({
 savedDrawnSignature:z.union([drawnSignature,z.literal('')]).optional(),
 epaCertification:z.string().trim().max(100).optional(),savedSignature:z.string().trim().max(150).optional(),
 contractorNumber:z.string().trim().toUpperCase().regex(/^(C[0-9]+)?$/).max(30).optional(),
 photoDataUrl:z.string().max(200000).regex(/^$|^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
 leadInstallerName:z.string().trim().max(150).default(''),contactEmail:z.union([z.string().email(),z.literal('')]).default(''),
 jobTitle:z.string().trim().max(100).default(''),
 startDate:z.string().max(10).refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),'Enter a valid date.').default(''),
 address:z.string().trim().max(500).default(''),
 emergencyContact:z.string().trim().max(150).default(''),
 emergencyPhone:z.string().trim().max(50).default(''),
 skills:z.string().trim().max(2000).default(''),
 notes:z.string().trim().max(5000).default(''),
 additional:z.array(z.object({label:z.string().trim().min(1).max(80),value:z.string().trim().max(500)}).strict()).max(20).default([])
}).strict();
export const profileInput=z.object({id:z.string().min(1).max(100),name:z.string().trim().min(1).max(100),phone:z.string().trim().max(50),details:profileDetails}).strict();

// Earlier JSONB writes could contain JSON strings or arrays of profile fragments.
export function readProfileDetails(value:any):Record<string,any>{
 if(typeof value==='string'){try{return readProfileDetails(JSON.parse(value))}catch{return {}}}
 if(Array.isArray(value))return Object.assign({},...value.map(readProfileDetails));
 return value&&typeof value==='object'?value:{};
}
