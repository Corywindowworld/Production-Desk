import {z} from 'zod';
export const qualityInput=z.object({id:z.string().min(1).max(100),score:z.number().finite().min(0).max(100).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001,'Use up to two decimal places.')});
export function qualityTone(score:number|null){return score===null?'unrated':score<3.60?'below':'good'}
export function mayScore(actor:{id:string;role:string},installer:{supervisor_id:string|null;role:string;active:number}){return installer.role==='installer'&&installer.active===1&&installer.supervisor_id===actor.id&&['supervisor','admin'].includes(actor.role)}
