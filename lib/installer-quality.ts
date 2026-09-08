import {z} from 'zod';
export const qualityInput=z.object({id:z.string().min(1).max(100),score:z.number().finite().min(0).max(100).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001,'Use up to two decimal places.')});
export function qualityTone(score:number|null){return score===null?'unrated':score<3.60?'below':'good'}
