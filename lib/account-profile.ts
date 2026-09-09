import {z} from 'zod';
export const profileDetails=z.object({
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
