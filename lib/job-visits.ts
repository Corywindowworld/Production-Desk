import {z} from 'zod';

export const visitQuestions = [
 ['homeownerSpokenTo','Was the homeowner spoken to?'],
 ['crewShirts','Was the crew wearing Window World shirts?'],
 ['yardSign','Was a yard sign in place?'],
 ['damage','Was there damage?'],
 ['reorder','Was there a reorder?'],
 ['headerFlashing','Was header flashing required?'],
 ['trimAndCaulk','Did the trim and caulk look good?'],
 ['dropCloths','Were drop cloths laid out?'],
 ['customerHappy','Was the customer happy with the team?'],
] as const;
export const visitAnswers={yes:'Yes',no:'No',na:'Not applicable',unobserved:'Not observed'} as const;
const check=z.object({answer:z.enum(['yes','no','na','unobserved']),notes:z.string().trim().max(1000)});
export const visitSchema=z.object({
 id:z.string().uuid(),jobId:z.string().uuid(),
 visitedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d),
 checks:z.object({homeownerSpokenTo:check,crewShirts:check,yardSign:check,damage:check,reorder:check,headerFlashing:check,trimAndCaulk:check,dropCloths:check,customerHappy:check}),
 notes:z.string().trim().max(4000),
 photos:z.array(z.object({key:z.string().max(250),kind:z.literal('visit'),name:z.string().min(1).max(255)})).max(20),
});
export type VisitInput=z.infer<typeof visitSchema>;
export type JobVisit=VisitInput&{supervisorId:string;supervisorName:string;submittedAt:string};
