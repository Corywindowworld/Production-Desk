import {z} from 'zod';
export const qualityInput=z.object({id:z.string().min(1).max(100),score:z.number().finite().min(0).max(4).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001,'Use up to two decimal places.')});
export function qualityTone(score:number|null){return score===null||!Number.isFinite(score)||score<0||score>4?'unrated':score<3.60?'below':'good'}
export function qualityLabel(score:number|null){return score===null?'Not rated':!Number.isFinite(score)||score<0||score>4?'Review score (0–4.00)':score<3.60?'Poor':score<3.70?'Fair':score<3.80?'Good':'Outstanding'}
