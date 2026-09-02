import { z } from 'zod';

export const paymentMethods = ['Finance', 'Check', 'Credit Card', 'PO'] as const;
export const stages = ['Received', 'Production', 'Closed', 'Incomplete'] as const;
const legacyStages: Record<string, string> = {
  Sold: 'Received', Ordered: 'Received', Scheduled: 'Production',
  Installing: 'Production', 'Punch work': 'Incomplete', Complete: 'Closed',
};
export function normalizeJob<T extends { stage: string }>(job: T): T {
  return { ...job, stage: legacyStages[job.stage] || job.stage };
}
// Aging is derived from the current incomplete period, never from last edit time.
export const boardStages = [...stages, 'Aged Received', 'Aged Incomplete', 'Aged Production'] as const;
type AgingJob = {stage: string; received?: string; install?: string; installed?: string; amount?: number | null; incompleteSince?: string | null; history?: {at: string; text: string}[]};
export function incompleteSince(job: AgingJob): string | null {
  if (job.stage !== 'Incomplete') return null;
  if (job.incompleteSince && Number.isFinite(Date.parse(job.incompleteSince))) return job.incompleteSince;
  // Older records retain their original transition in the newest-first audit history.
  const entry = job.history?.find(h => /Stage: .* → (Incomplete|Punch work)(?: ·|$)/.test(h.text));
  return entry && Number.isFinite(Date.parse(entry.at)) ? entry.at : null;
}
export function incompleteAge(job: AgingJob, now = Date.now()) {
  const since = incompleteSince(job);
  const elapsed = since ? Math.max(0, now - Date.parse(since)) : null;
  return {since, days: elapsed === null ? null : Math.floor(elapsed / 86400000),
    alert: elapsed !== null && elapsed > 30 * 86400000,
    aged: elapsed !== null && elapsed >= 45 * 86400000};
}
export function boardStage(job: AgingJob, now = Date.now()) {
  return jobAging(job, now).category || job.stage;
}
export function jobAging(job: AgingJob, now = Date.now()) {
  const inc = incompleteAge(job, now);
  const kind = job.stage === 'Received' && !job.install ? 'Received' : job.stage === 'Incomplete' ? 'Incomplete' : job.stage === 'Production' ? 'Production' : null;
  const since = kind === 'Received' ? job.received : kind === 'Production' ? job.installed : inc.since;
  const start = since ? Date.parse(since) : NaN;
  const elapsed = Number.isFinite(start) ? Math.max(0, now - start) : null;
  const limit = kind === 'Received' ? 30 : kind === 'Incomplete' ? 45 : 7;
  const days = elapsed === null ? null : Math.floor(elapsed / 86400000);
  const remaining = elapsed === null ? null : Math.max(0, Math.ceil(limit - elapsed / 86400000));
  const aged = !!kind && elapsed !== null && (kind === 'Production' ? elapsed > 7 * 86400000 : elapsed >= limit * 86400000);
  const warning = !aged && kind !== 'Production' && remaining !== null && remaining <= 7;
  const attention = kind === 'Incomplete' && inc.alert;
  const message = aged ? `${days} days · Aged ${kind}` : warning ? `Ages in ${remaining} ${remaining === 1 ? 'day' : 'days'} · ${remaining! <= 3 ? '3-day' : '7-day'} warning` : attention ? `${inc.days} days incomplete · Attention needed` : '';
  return {kind, days, remaining, aged, warning, alert: aged || warning || attention, message, category: aged ? 'Aged ' + kind : null};
}
export function jobTotals(jobs: AgingJob[]) {
  return {count: jobs.length, amount: jobs.reduce((sum,j)=>sum+Math.round((j.amount ?? 0)*100),0)/100, missing:jobs.filter(j=>j.amount == null).length};
}
export function nextIncompleteSince(before: AgingJob | null, stage: string, at: string) {
  return stage !== 'Incomplete' ? null : before?.stage === 'Incomplete' ? incompleteSince(before) : at;
}
const date = z.string().max(10).refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))));
export const jobSchema = z.object({
  id: z.string().uuid(), number: z.string().trim().min(1).max(80),
  customer: z.string().trim().min(1).max(160), address: z.string().max(300), phone: z.string().trim().max(100).default(''), specialNotes: z.string().max(4000).default(''),
  installerId: z.string().uuid().nullable().default(null), supervisorId: z.union([z.string().uuid(),z.literal('owner')]).nullable().default(null), supervisor: z.string().max(100), crew: z.string().max(100), stage: z.enum(stages),
  eta: date, install: date, received: date.default(''), installed: date.default(''), amount: z.number().finite().min(0).max(999999999.99).multipleOf(0.01).nullable().default(null), blocker: z.string().trim().max(1000),
  paymentMethod: z.enum(paymentMethods).nullable().optional(),
  notes: z.string().max(4000), version: z.number().int().min(0),
  attachments: z.array(z.object({key:z.string().max(250), name:z.string().max(255), kind:z.enum(['completion','incomplete','reorder','photos','front','rear','left','right','issue'])})).max(100).default([]),
  history: z.array(z.object({at: z.string(), by: z.string(), text: z.string()})).max(500),
}).superRefine((job, ctx) => {
  if (job.stage === 'Incomplete' && !job.blocker) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['blocker'], message: 'Enter a reason why this job is incomplete.'});
  }
});

export const attachmentLabels = {completion:'Completion certificate', incomplete:'Incomplete certificate', reorder:'Reorder form', photos:'Job photos',front:'Front of house',rear:'Rear of house',left:'Left side of house',right:'Right side of house',issue:'Issue photos'} as const;
export function transitionError(before: string | null, job: {stage:string; attachments:{kind:string}[]}) {
  if (!before && job.stage !== 'Received') return 'New jobs must start in Received.';
  if (before && before !== job.stage) {
    const allowed:Record<string,string[]> = {Received:['Production'],Production:['Closed','Incomplete'],Incomplete:['Production'],Closed:[]};
    if (!allowed[before]?.includes(job.stage)) return 'Use the job action buttons to move through production.';
  }
  const required = job.stage === 'Closed' ? ['completion'] : job.stage === 'Incomplete' ? ['incomplete','reorder','photos'] : [];
  for (const kind of required) if (!job.attachments.some(a=>a.kind===kind) && !(kind==='photos' && ['front','rear','left','right'].every(side=>job.attachments.some(a=>a.kind===side)))) return `Upload ${attachmentLabels[kind as keyof typeof attachmentLabels].toLowerCase()} before saving this job.`;
  return '';
}
